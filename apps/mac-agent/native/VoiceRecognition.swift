import AVFoundation
import Darwin
import Foundation
import Speech

private func emit(_ value: [String: Any]) {
  guard JSONSerialization.isValidJSONObject(value),
        let data = try? JSONSerialization.data(withJSONObject: value),
        let line = String(data: data, encoding: .utf8) else { return }
  print(line)
  fflush(stdout)
}

private final class NativeVoiceRecognition: NSObject {
  private let audioEngine = AVAudioEngine()
  private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
  private var request: SFSpeechAudioBufferRecognitionRequest?
  private var task: SFSpeechRecognitionTask?
  private var audioConverter: AVAudioConverter?
  private var recognitionFormat: AVAudioFormat?
  private var recognitionGeneration: UUID?
  private var audioBufferCount = 0
  private var tapInstalled = false
  private var speechDetected = false
  private var finishingUtterance = false
  private var lastSpeechAt: TimeInterval = 0
  private var speechStartedAt: TimeInterval = 0
  private var noiseFloor: Float = 0
  private var noiseSamples = 0
  private var consecutiveSpeechBuffers = 0
  private var preferOnDeviceRecognition = true
  private var latestRecognizedText = ""
  private var finalTranscriptEmitted = false
  private var transcriptEndpointWorkItem: DispatchWorkItem?

  func begin() {
    AVCaptureDevice.requestAccess(for: .audio) { granted in
      guard granted else {
        emit(["type": "error", "code": "MIC_PERMISSION_DENIED"])
        return
      }
      SFSpeechRecognizer.requestAuthorization { status in
        DispatchQueue.main.async {
          guard status == .authorized else {
            emit(["type": "error", "code": "STT_PERMISSION_DENIED"])
            return
          }
          self.startRecognition()
        }
      }
    }
  }

  private func startRecognition() {
    guard let recognizer, recognizer.isAvailable else {
      emit(["type": "error", "code": "STT_PROVIDER_UNAVAILABLE"])
      return
    }
    stopRecognition()
    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    request.taskHint = .dictation
    request.contextualStrings = ["Alexa", "Luna", "Gemma", "OpenAI", "Ollama"]
    let usingOnDeviceRecognition =
      preferOnDeviceRecognition && recognizer.supportsOnDeviceRecognition
    request.requiresOnDeviceRecognition = usingOnDeviceRecognition
    self.request = request
    let input = audioEngine.inputNode
    let format = input.outputFormat(forBus: 0)
    guard let recognitionFormat = AVAudioFormat(
      commonFormat: .pcmFormatFloat32,
      sampleRate: 16_000,
      channels: 1,
      interleaved: false
    ), let converter = AVAudioConverter(from: format, to: recognitionFormat) else {
      emit(["type": "error", "code": "STT_AUDIO_CAPTURE_ERROR"])
      return
    }
    self.recognitionFormat = recognitionFormat
    self.audioConverter = converter
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
      guard let self, !self.finishingUtterance else { return }
      let level = self.measureAudioLevel(buffer)
      self.emitAudioLevel(level)
      self.observeVoiceActivity(level)
      guard let recognitionBuffer = self.convertForRecognition(buffer) else { return }
      request.append(recognitionBuffer)
    }
    tapInstalled = true
    audioEngine.prepare()
    do {
      try audioEngine.start()
    } catch {
      emit(["type": "error", "code": "STT_AUDIO_CAPTURE_ERROR"])
      stopRecognition()
      return
    }
    emit(["type": "ready", "onDevice": usingOnDeviceRecognition])
    let generation = UUID()
    recognitionGeneration = generation
    task = recognizer.recognitionTask(with: request) { [weak self] result, error in
      guard let self, self.recognitionGeneration == generation else { return }
      if let result {
        let text = result.bestTranscription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.isEmpty {
          if text != self.latestRecognizedText {
            self.latestRecognizedText = text
            self.markSpeechDetected()
            self.scheduleTranscriptEndpoint(for: text)
            if !result.isFinal {
              emit(["type": "interim", "text": text])
            }
          }
        }
        if result.isFinal {
          self.emitFinalTranscriptAndRestart(text)
          return
        }
      }
      if let error = error as NSError? {
        if self.finishingUtterance && !self.latestRecognizedText.isEmpty {
          self.emitFinalTranscriptAndRestart(self.latestRecognizedText)
          return
        }
        if usingOnDeviceRecognition &&
            ((error.domain == "kLSRErrorDomain" && error.code == 201) ||
             (error.domain == "kAFAssistantErrorDomain" && error.code == 1101)) {
          self.preferOnDeviceRecognition = false
          self.restartRecognition()
          return
        }
        if error.domain == "kAFAssistantErrorDomain" &&
            [1100, 1101, 1107, 1110].contains(error.code) {
          self.restartRecognition()
          return
        }
        let code =
          error.domain == "kLSRErrorDomain" && error.code == 201
            ? "STT_DICTATION_DISABLED"
            : "STT_RECOGNITION_FAILED"
        emit([
          "type": "error",
          "code": code,
          "diagnosticDomain": String(error.domain.prefix(120)),
          "diagnosticCode": error.code
        ])
        self.stopRecognition()
      }
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

  private func convertForRecognition(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
    guard let converter = audioConverter,
          let recognitionFormat,
          buffer.format.sampleRate > 0 else { return nil }
    let ratio = recognitionFormat.sampleRate / buffer.format.sampleRate
    let capacity = AVAudioFrameCount(ceil(Double(buffer.frameLength) * ratio)) + 1
    guard let output = AVAudioPCMBuffer(
      pcmFormat: recognitionFormat,
      frameCapacity: capacity
    ) else { return nil }
    var suppliedInput = false
    var conversionError: NSError?
    let status = converter.convert(to: output, error: &conversionError) { _, inputStatus in
      if suppliedInput {
        inputStatus.pointee = .noDataNow
        return nil
      }
      suppliedInput = true
      inputStatus.pointee = .haveData
      return buffer
    }
    guard conversionError == nil,
          status != .error,
          output.frameLength > 0 else { return nil }
    return output
  }

  private func emitAudioLevel(_ level: Float) {
    audioBufferCount += 1
    guard audioBufferCount % 10 == 0 else { return }
    emit(["type": "audioLevel", "level": Double(level)])
  }

  private func observeVoiceActivity(_ level: Float) {
    let now = ProcessInfo.processInfo.systemUptime

    // Calibrate briefly against the current microphone rather than treating a
    // fixed normalized level as speech. The old 8% threshold could classify
    // steady room noise as speech and therefore never close the utterance.
    if !speechDetected && noiseSamples < 24 {
      noiseFloor = ((noiseFloor * Float(noiseSamples)) + level) / Float(noiseSamples + 1)
      noiseSamples += 1
    } else if !speechDetected {
      noiseFloor = (noiseFloor * 0.98) + (min(level, noiseFloor + 0.02) * 0.02)
    }

    let speechThreshold = min(0.24, max(0.055, noiseFloor + 0.035))
    if level >= speechThreshold {
      consecutiveSpeechBuffers += 1
      if consecutiveSpeechBuffers >= 3 {
        markSpeechDetected(at: now)
      }
      return
    }
    consecutiveSpeechBuffers = 0
    guard speechDetected,
          !finishingUtterance,
          now - speechStartedAt >= 0.25,
          now - lastSpeechAt >= 1.15 else { return }
    finishingUtterance = true
    DispatchQueue.main.async { [weak self] in
      self?.finishUtterance()
    }
  }

  private func markSpeechDetected(at timestamp: TimeInterval = ProcessInfo.processInfo.systemUptime) {
    if !speechDetected {
      speechDetected = true
      speechStartedAt = timestamp
    }
    lastSpeechAt = timestamp
  }

  private func scheduleTranscriptEndpoint(for text: String) {
    transcriptEndpointWorkItem?.cancel()
    let workItem = DispatchWorkItem { [weak self] in
      guard let self,
            self.recognitionGeneration != nil,
            !self.finalTranscriptEmitted,
            self.latestRecognizedText == text,
            !self.finishingUtterance else { return }
      self.finishingUtterance = true
      self.finishUtterance()
    }
    transcriptEndpointWorkItem = workItem
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.35, execute: workItem)
  }

  private func finishUtterance() {
    audioEngine.stop()
    if tapInstalled {
      audioEngine.inputNode.removeTap(onBus: 0)
      tapInstalled = false
    }
    request?.endAudio()
    let generation = recognitionGeneration
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
      guard let self,
            self.recognitionGeneration == generation,
            self.finishingUtterance,
            !self.latestRecognizedText.isEmpty else { return }
      self.emitFinalTranscriptAndRestart(self.latestRecognizedText)
    }
  }

  private func emitFinalTranscriptAndRestart(_ text: String) {
    let finalText = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !finalText.isEmpty, !finalTranscriptEmitted else { return }
    finalTranscriptEmitted = true
    transcriptEndpointWorkItem?.cancel()
    transcriptEndpointWorkItem = nil
    emit(["type": "final", "text": finalText])
    restartRecognition()
  }

  private func restartRecognition() {
    guard recognitionGeneration != nil else { return }
    recognitionGeneration = nil
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { [weak self] in
      self?.startRecognition()
    }
  }

  private func stopRecognition() {
    audioEngine.stop()
    if tapInstalled {
      audioEngine.inputNode.removeTap(onBus: 0)
      tapInstalled = false
    }
    request?.endAudio()
    task?.cancel()
    request = nil
    task = nil
    audioConverter = nil
    recognitionFormat = nil
    recognitionGeneration = nil
    audioBufferCount = 0
    speechDetected = false
    finishingUtterance = false
    lastSpeechAt = 0
    speechStartedAt = 0
    noiseFloor = 0
    noiseSamples = 0
    consecutiveSpeechBuffers = 0
    latestRecognizedText = ""
    finalTranscriptEmitted = false
    transcriptEndpointWorkItem?.cancel()
    transcriptEndpointWorkItem = nil
  }
}

private let recognition = NativeVoiceRecognition()
private let parentProcessId: pid_t? = {
  guard let marker = CommandLine.arguments.firstIndex(of: "--parent-pid"),
        CommandLine.arguments.indices.contains(marker + 1),
        let value = Int32(CommandLine.arguments[marker + 1]),
        value > 1 else { return nil }
  return value
}()

emit(["type": "process", "pid": ProcessInfo.processInfo.processIdentifier])
recognition.begin()
if let parentProcessId {
  Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
    if kill(parentProcessId, 0) != 0 && errno == ESRCH {
      exit(EXIT_SUCCESS)
    }
  }
}
RunLoop.main.run()
