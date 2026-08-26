import AVFoundation
import Darwin
import Foundation

private func emit(_ value: [String: Any]) {
  guard JSONSerialization.isValidJSONObject(value),
        let data = try? JSONSerialization.data(withJSONObject: value),
        let line = String(data: data, encoding: .utf8) else { return }
  print(line)
  fflush(stdout)
}

private final class WhisperAudioCapture: NSObject {
  private static let outputSampleRate = 16_000
  private static let maxUtteranceSamples = outputSampleRate * 20
  private static let preRollSamples = outputSampleRate / 3

  private let audioEngine = AVAudioEngine()
  private let outputDirectory: URL
  private var tapInstalled = false
  private var audioBufferCount = 0
  private var speechDetected = false
  private var completing = false
  private var lastSpeechAt: TimeInterval = 0
  private var noiseFloor: Float = 0
  private var noiseSamples = 0
  private var consecutiveSpeechBuffers = 0
  private var candidateSpeechSamples = 0
  private var preRoll: [Int16] = []
  private var utterance: [Int16] = []

  init?(outputDirectory: URL) {
    self.outputDirectory = outputDirectory
    super.init()
    do {
      try FileManager.default.createDirectory(
        at: outputDirectory,
        withIntermediateDirectories: true,
        attributes: [.posixPermissions: 0o700]
      )
    } catch {
      return nil
    }
  }

  func begin() {
    AVCaptureDevice.requestAccess(for: .audio) { granted in
      guard granted else {
        emit(["type": "error", "code": "MIC_PERMISSION_DENIED"])
        return
      }
      DispatchQueue.main.async { self.startCapture() }
    }
  }

  private func startCapture() {
    stopCapture(reset: true)
    let input = audioEngine.inputNode
    // Use macOS voice processing when it is available. This keeps ambient noise
    // and speaker bleed out of the local VAD before Whisper sees an utterance.
    try? input.setVoiceProcessingEnabled(true)
    let format = input.outputFormat(forBus: 0)
    guard format.sampleRate > 0, format.channelCount > 0 else {
      emit(["type": "error", "code": "STT_AUDIO_CAPTURE_ERROR"])
      return
    }
    input.installTap(onBus: 0, bufferSize: 1_024, format: format) { [weak self] buffer, _ in
      guard let self, !self.completing else { return }
      let level = self.measureAudioLevel(buffer)
      self.emitAudioLevel(level)
      let samples = self.resampleToMono16k(buffer)
      self.observeVoiceActivity(level, samples: samples)
    }
    tapInstalled = true
    audioEngine.prepare()
    do {
      try audioEngine.start()
      emit(["type": "ready", "providerId": "whisper_cpp"])
    } catch {
      emit(["type": "error", "code": "STT_AUDIO_CAPTURE_ERROR"])
      stopCapture(reset: true)
    }
  }

  private func measureAudioLevel(_ buffer: AVAudioPCMBuffer) -> Float {
    guard let channels = buffer.floatChannelData else { return 0 }
    let frameCount = Int(buffer.frameLength)
    let channelCount = Int(buffer.format.channelCount)
    guard frameCount > 0, channelCount > 0 else { return 0 }
    var sum: Float = 0
    for channel in 0..<channelCount {
      for frame in 0..<frameCount {
        let sample = channels[channel][frame]
        sum += sample * sample
      }
    }
    let rms = sqrt(sum / Float(frameCount * channelCount))
    let decibels = rms > 0 ? 20 * log10(rms) : -80
    return min(1, max(0, (decibels + 60) / 60))
  }

  private func resampleToMono16k(_ buffer: AVAudioPCMBuffer) -> [Int16] {
    guard let channels = buffer.floatChannelData else { return [] }
    let sourceFrames = Int(buffer.frameLength)
    let channelCount = Int(buffer.format.channelCount)
    let sourceRate = buffer.format.sampleRate
    guard sourceFrames > 1, channelCount > 0, sourceRate > 0 else { return [] }
    let outputFrames = max(1, Int((Double(sourceFrames) * Double(Self.outputSampleRate) / sourceRate).rounded()))
    let ratio = sourceRate / Double(Self.outputSampleRate)
    var output: [Int16] = []
    output.reserveCapacity(outputFrames)
    for index in 0..<outputFrames {
      let position = min(Double(sourceFrames - 1), Double(index) * ratio)
      let lower = Int(position)
      let upper = min(sourceFrames - 1, lower + 1)
      let fraction = Float(position - Double(lower))
      var mono: Float = 0
      for channel in 0..<channelCount {
        let first = channels[channel][lower]
        let second = channels[channel][upper]
        mono += first + ((second - first) * fraction)
      }
      mono /= Float(channelCount)
      output.append(Int16(max(-1, min(1, mono)) * Float(Int16.max)))
    }
    return output
  }

  private func emitAudioLevel(_ level: Float) {
    audioBufferCount += 1
    guard audioBufferCount % 10 == 0 else { return }
    emit(["type": "audioLevel", "level": Double(level)])
  }

  private func observeVoiceActivity(_ level: Float, samples: [Int16]) {
    let now = ProcessInfo.processInfo.systemUptime
    if !speechDetected && noiseSamples < 24 {
      noiseFloor = ((noiseFloor * Float(noiseSamples)) + level) / Float(noiseSamples + 1)
      noiseSamples += 1
    } else if !speechDetected {
      noiseFloor = (noiseFloor * 0.98) + (min(level, noiseFloor + 0.02) * 0.02)
    }

    // A visible audio level is not itself evidence of speech. Keep a meaningful
    // margin over the learned room floor and require a sustained voiced segment.
    let speechThreshold = min(0.28, max(0.075, noiseFloor + 0.05))
    if level >= speechThreshold {
      consecutiveSpeechBuffers += 1
      candidateSpeechSamples += samples.count
      // Reject short keyboard/click transients before they become Whisper jobs.
      if candidateSpeechSamples >= (Self.outputSampleRate * 2) / 5 && !speechDetected {
        speechDetected = true
        utterance = preRoll
      }
      if speechDetected {
        utterance.append(contentsOf: samples)
        lastSpeechAt = now
        if utterance.count >= Self.maxUtteranceSamples {
          completeUtterance()
        }
      } else {
        appendPreRoll(samples)
      }
      return
    }

    consecutiveSpeechBuffers = 0
    if speechDetected {
      utterance.append(contentsOf: samples)
      if now - lastSpeechAt >= 0.75 {
        completeUtterance()
      }
    } else {
      candidateSpeechSamples = 0
      appendPreRoll(samples)
    }
  }

  private func appendPreRoll(_ samples: [Int16]) {
    preRoll.append(contentsOf: samples)
    if preRoll.count > Self.preRollSamples {
      preRoll.removeFirst(preRoll.count - Self.preRollSamples)
    }
  }

  private func completeUtterance() {
    guard !completing, utterance.count >= (Self.outputSampleRate * 2) / 5 else { return }
    completing = true
    audioEngine.stop()
    if tapInstalled {
      audioEngine.inputNode.removeTap(onBus: 0)
      tapInstalled = false
    }
    let samples = utterance
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self else { return }
      guard let file = self.writeWave(samples) else {
        emit(["type": "error", "code": "STT_AUDIO_CAPTURE_ERROR"])
        DispatchQueue.main.async { self.startCapture() }
        return
      }
      emit(["type": "utterance", "path": file.path])
      DispatchQueue.main.async { self.startCapture() }
    }
  }

  private func writeWave(_ samples: [Int16]) -> URL? {
    let url = outputDirectory.appendingPathComponent("utterance-\(UUID().uuidString).wav")
    let dataSize = UInt32(samples.count * MemoryLayout<Int16>.size)
    var data = Data()
    data.append("RIFF".data(using: .ascii)!)
    data.appendLE(UInt32(36) + dataSize)
    data.append("WAVEfmt ".data(using: .ascii)!)
    data.appendLE(UInt32(16))
    data.appendLE(UInt16(1))
    data.appendLE(UInt16(1))
    data.appendLE(UInt32(Self.outputSampleRate))
    data.appendLE(UInt32(Self.outputSampleRate * 2))
    data.appendLE(UInt16(2))
    data.appendLE(UInt16(16))
    data.append("data".data(using: .ascii)!)
    data.appendLE(dataSize)
    samples.withUnsafeBufferPointer { data.append(Data(buffer: $0)) }
    do {
      try data.write(to: url, options: .atomic)
      try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
      return url
    } catch {
      return nil
    }
  }

  private func stopCapture(reset: Bool) {
    audioEngine.stop()
    if tapInstalled {
      audioEngine.inputNode.removeTap(onBus: 0)
      tapInstalled = false
    }
    guard reset else { return }
    audioBufferCount = 0
    speechDetected = false
    completing = false
    lastSpeechAt = 0
    noiseFloor = 0
    noiseSamples = 0
    consecutiveSpeechBuffers = 0
    candidateSpeechSamples = 0
    preRoll = []
    utterance = []
  }
}

private extension Data {
  mutating func appendLE<T: FixedWidthInteger>(_ value: T) {
    var littleEndian = value.littleEndian
    Swift.withUnsafeBytes(of: &littleEndian) { append(contentsOf: $0) }
  }
}

private let outputDirectory: URL? = {
  guard let marker = CommandLine.arguments.firstIndex(of: "--audio-dir"),
        CommandLine.arguments.indices.contains(marker + 1) else { return nil }
  return URL(fileURLWithPath: CommandLine.arguments[marker + 1], isDirectory: true)
}()

private let parentProcessId: pid_t? = {
  guard let marker = CommandLine.arguments.firstIndex(of: "--parent-pid"),
        CommandLine.arguments.indices.contains(marker + 1),
        let value = Int32(CommandLine.arguments[marker + 1]), value > 1 else { return nil }
  return value
}()

guard let outputDirectory, let capture = WhisperAudioCapture(outputDirectory: outputDirectory) else {
  emit(["type": "error", "code": "STT_PROVIDER_UNAVAILABLE"])
  exit(EXIT_FAILURE)
}
emit(["type": "process", "pid": ProcessInfo.processInfo.processIdentifier])
capture.begin()
if let parentProcessId {
  Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
    if kill(parentProcessId, 0) != 0 && errno == ESRCH {
      exit(EXIT_SUCCESS)
    }
  }
}
RunLoop.main.run()
