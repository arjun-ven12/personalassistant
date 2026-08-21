const normalizeSpeech = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9' ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const isLikelyPlaybackEcho = (transcript: string, spokenText: string) => {
  const candidate = normalizeSpeech(transcript);
  const playback = normalizeSpeech(spokenText);
  if (!candidate || !playback) return false;
  if (playback.includes(candidate)) return true;

  const candidateTokens = candidate.split(" ").filter(Boolean);
  const playbackTokens = new Set(playback.split(" ").filter(Boolean));
  if (candidateTokens.length === 1)
    return candidate.length >= 4 && playbackTokens.has(candidate);

  const matchingTokens = candidateTokens.filter((token) => playbackTokens.has(token)).length;
  return matchingTokens / candidateTokens.length >= 0.75;
};
