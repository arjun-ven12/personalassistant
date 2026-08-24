import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.cwd();
const binary = path.resolve(process.env.DESKTOP_STT_WHISPER_BINARY_PATH ?? path.join(root, ".local/whisper.cpp/build/bin/whisper-server"));
const model = path.resolve(process.env.DESKTOP_STT_WHISPER_MODEL_PATH ?? path.join(root, ".local/whisper.cpp/models/ggml-base.en.bin"));
const modelVersion = process.env.DESKTOP_STT_WHISPER_MODEL_VERSION ?? path.basename(model, ".bin");
const threads = Math.min(4, Math.max(1, Number(process.env.DESKTOP_STT_WHISPER_THREADS ?? 4)));
const noSpeechThreshold = Math.min(0.6, Math.max(0, Number(process.env.DESKTOP_STT_WHISPER_NO_SPEECH_THRESHOLD ?? 0.25)));
const phrases = [
  "Alexa, what time is it?",
  "Open VS Code.",
  "Explain this error.",
  "What am I looking at?",
  "Pause.",
  "Stop listening.",
  "Shut up.",
  "Open the personal assistant project.",
  "Open the workflows page.",
  "Show me my pending approvals.",
  "Explain the highlighted code in simple terms.",
  "What model is Alexa using right now?",
  "Summarize the last conversation in three bullet points.",
  "Create a reminder for tomorrow morning to review the deployment plan.",
  "Why did the validation run fail after the second workflow step?",
  "Find the active task that is waiting for my approval.",
  "Open Chrome and search for the documentation for this error.",
  "Tell me which application is currently in focus.",
  "Please explain the difference between the current provider and the local fallback.",
  "Read back the most important thing that needs my attention today.",
];

const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim();

const wordErrorRate = (expected, actual) => {
  const source = normalize(expected).split(" ").filter(Boolean);
  const target = normalize(actual).split(" ").filter(Boolean);
  const table = Array.from({ length: source.length + 1 }, (_, row) => [row]);
  for (let column = 1; column <= target.length; column += 1) table[0][column] = column;
  for (let row = 1; row <= source.length; row += 1) {
    for (let column = 1; column <= target.length; column += 1) {
      table[row][column] = Math.min(
        table[row - 1][column] + 1,
        table[row][column - 1] + 1,
        table[row - 1][column - 1] + (source[row - 1] === target[column - 1] ? 0 : 1),
      );
    }
  }
  return source.length === 0 ? 0 : table[source.length][target.length] / source.length;
};

const reserveLoopbackPort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    server.close((error) => {
      if (error || !address || typeof address === "string") reject(error ?? new Error("Unable to reserve a loopback port."));
      else resolve(address.port);
    });
  });
});

const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: "ignore" });
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code ?? "no status"}.`)));
});

const quantile = (values, fraction) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
};

const sampleProcess = (pid) => new Promise((resolve) => {
  const process = spawn("/bin/ps", ["-o", "%cpu=", "-o", "rss=", "-p", String(pid)]);
  let output = "";
  process.stdout.on("data", (chunk) => { output += chunk; });
  process.once("exit", () => {
    const [cpu = "0", rss = "0"] = output.trim().split(/\s+/);
    resolve({ cpuPercent: Number(cpu), rssMb: Number(rss) / 1024 });
  });
});

const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "alexa-whisper-benchmark-"));
const port = await reserveLoopbackPort();
const requestPath = `/benchmark-${crypto.randomUUID()}`;
const server = spawn(binary, [
  "--model", model,
  "--language", "en",
  "--threads", String(threads),
  "--processors", "1",
  "--no-speech-thold", String(noSpeechThreshold),
  "--host", "127.0.0.1",
  "--port", String(port),
  "--request-path", requestPath,
], { stdio: "ignore" });

try {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}${requestPath}/health`)).ok) break;
    } catch {
      // The model is still loading.
    }
    if (attempt === 99) throw new Error("whisper.cpp did not become ready.");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const results = [];
  const processSamples = [];
  for (const [index, phrase] of phrases.entries()) {
    const aiff = path.join(temporaryDirectory, `${index}.aiff`);
    const wav = path.join(temporaryDirectory, `${index}.wav`);
    await run("/usr/bin/say", ["-r", "175", "-o", aiff, phrase]);
    await run("/usr/bin/afconvert", ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1", aiff, wav]);
    const form = new FormData();
    form.append("file", new Blob([await readFile(wav)], { type: "audio/wav" }), "utterance.wav");
    form.append("language", "en");
    form.append("response_format", "json");
    const startedAt = performance.now();
    const response = await fetch(`http://127.0.0.1:${port}${requestPath}/inference`, { method: "POST", body: form });
    const latencyMs = Math.round(performance.now() - startedAt);
    if (!response.ok) throw new Error(`whisper.cpp inference failed for benchmark case ${index + 1}.`);
    const transcript = String((await response.json()).text ?? "").trim();
    results.push({ phrase, transcript, latencyMs, wordErrorRate: wordErrorRate(phrase, transcript) });
    processSamples.push(await sampleProcess(server.pid));
  }
  const latencies = results.map((result) => result.latencyMs);
  const accuracy = 1 - results.reduce((total, result) => total + result.wordErrorRate, 0) / results.length;
  const summary = {
    provider: "whisper.cpp",
    model: modelVersion,
    noSpeechThreshold,
    fixtureType: "macOS synthesized speech; repeat with real microphone commands before changing models",
    commands: results.length,
    accuracy: Number(accuracy.toFixed(4)),
    speechEndToFinalMs: {
      average: Math.round(latencies.reduce((total, value) => total + value, 0) / latencies.length),
      p50: quantile(latencies, 0.5),
      p95: quantile(latencies, 0.95),
    },
    process: {
      averageCpuPercent: Number((processSamples.reduce((total, sample) => total + sample.cpuPercent, 0) / processSamples.length).toFixed(1)),
      peakRssMb: Number(Math.max(...processSamples.map((sample) => sample.rssMb)).toFixed(1)),
    },
    results,
  };
  console.log(JSON.stringify(summary, null, 2));
} finally {
  server.kill("SIGTERM");
  await rm(temporaryDirectory, { recursive: true, force: true });
}
