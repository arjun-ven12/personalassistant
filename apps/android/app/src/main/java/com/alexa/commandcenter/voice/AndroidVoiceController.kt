package com.alexa.commandcenter.voice

import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale
import java.util.UUID

data class RecognizedSpeech(
  val transcript: String,
  val confidence: Double,
  val language: String,
)

sealed interface VoiceCaptureEvent {
  data object Ready : VoiceCaptureEvent
  data object Recording : VoiceCaptureEvent
  data object Processing : VoiceCaptureEvent
  data class Result(val speech: RecognizedSpeech) : VoiceCaptureEvent
  data class Failure(val message: String) : VoiceCaptureEvent
  data object Cancelled : VoiceCaptureEvent
}

class AndroidVoiceController(context: Context) : RecognitionListener, TextToSpeech.OnInitListener {
  private val appContext = context.applicationContext
  private val mainHandler = Handler(Looper.getMainLooper())
  private val audioManager = appContext.getSystemService(AudioManager::class.java)
  private val recognitionAvailable = SpeechRecognizer.isRecognitionAvailable(appContext)
  private val recognizer = if (recognitionAvailable) SpeechRecognizer.createSpeechRecognizer(appContext) else null
  private val tts = TextToSpeech(appContext, this)
  private var captureListener: ((VoiceCaptureEvent) -> Unit)? = null
  private var speechListener: ((Boolean, String?) -> Unit)? = null
  private var ttsReady = false
  private var captureFocus: AudioFocusRequest? = null
  private var speechFocus: AudioFocusRequest? = null
  private val timeout = Runnable {
    recognizer?.stopListening()
    captureListener?.invoke(VoiceCaptureEvent.Processing)
  }

  init {
    recognizer?.setRecognitionListener(this)
    tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
      override fun onStart(utteranceId: String?) = Unit
      override fun onDone(utteranceId: String?) {
        mainHandler.post {
          releaseSpeechFocus()
          speechListener?.invoke(false, null)
          speechListener = null
        }
      }
      @Deprecated("Deprecated by Android")
      override fun onError(utteranceId: String?) {
        mainHandler.post {
          releaseSpeechFocus()
          speechListener?.invoke(false, "Speech output was interrupted.")
          speechListener = null
        }
      }
    })
  }

  fun startCapture(listener: (VoiceCaptureEvent) -> Unit) {
    stopSpeaking()
    captureListener = listener
    if (!recognitionAvailable || recognizer == null) {
      listener(VoiceCaptureEvent.Failure("Speech recognition is unavailable on this device."))
      return
    }
    captureFocus = focusRequest(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE).also {
      if (audioManager.requestAudioFocus(it) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
        listener(VoiceCaptureEvent.Failure("The microphone is currently unavailable."))
        return
      }
    }
    listener(VoiceCaptureEvent.Ready)
    recognizer.startListening(
      Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag())
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
        putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, false)
      },
    )
    mainHandler.postDelayed(timeout, MAX_CAPTURE_MS)
  }

  fun stopCapture() {
    mainHandler.removeCallbacks(timeout)
    captureListener?.invoke(VoiceCaptureEvent.Processing)
    recognizer?.stopListening()
  }

  fun cancelCapture() {
    mainHandler.removeCallbacks(timeout)
    recognizer?.cancel()
    releaseCaptureFocus()
    captureListener?.invoke(VoiceCaptureEvent.Cancelled)
    captureListener = null
  }

  fun speak(text: String, listener: (Boolean, String?) -> Unit) {
    stopSpeaking()
    speechListener = listener
    if (!ttsReady) {
      listener(false, "Speech output is unavailable.")
      return
    }
    speechFocus = focusRequest(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK).also {
      if (audioManager.requestAudioFocus(it) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
        listener(false, "Audio output is currently unavailable.")
        return
      }
    }
    listener(true, null)
    val result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, UUID.randomUUID().toString())
    if (result == TextToSpeech.ERROR) {
      releaseSpeechFocus()
      listener(false, "Alexa could not start speech output.")
    }
  }

  fun stopSpeaking() {
    if (tts.isSpeaking) tts.stop()
    releaseSpeechFocus()
    speechListener?.invoke(false, null)
    speechListener = null
  }

  fun release() {
    mainHandler.removeCallbacks(timeout)
    recognizer?.cancel()
    recognizer?.destroy()
    tts.stop()
    tts.shutdown()
    releaseCaptureFocus()
    releaseSpeechFocus()
  }

  override fun onInit(status: Int) {
    ttsReady = status == TextToSpeech.SUCCESS && tts.setLanguage(Locale.getDefault()) >= TextToSpeech.LANG_AVAILABLE
  }

  override fun onReadyForSpeech(params: Bundle?) {
    captureListener?.invoke(VoiceCaptureEvent.Recording)
  }

  override fun onBeginningOfSpeech() = Unit
  override fun onRmsChanged(rmsdB: Float) = Unit
  override fun onBufferReceived(buffer: ByteArray?) = Unit
  override fun onEndOfSpeech() {
    mainHandler.removeCallbacks(timeout)
    captureListener?.invoke(VoiceCaptureEvent.Processing)
  }

  override fun onError(error: Int) {
    mainHandler.removeCallbacks(timeout)
    releaseCaptureFocus()
    val message = when (error) {
      SpeechRecognizer.ERROR_NO_MATCH -> "I couldn't hear a clear phrase."
      SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech was detected."
      SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Speech recognition needs a working network connection."
      SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Speech recognition is busy. Try again shortly."
      SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission is required."
      SpeechRecognizer.ERROR_AUDIO -> "The microphone could not be used."
      else -> "Speech recognition could not complete."
    }
    captureListener?.invoke(VoiceCaptureEvent.Failure(message))
    captureListener = null
  }

  override fun onResults(results: Bundle?) {
    mainHandler.removeCallbacks(timeout)
    releaseCaptureFocus()
    val candidates = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
    val confidence = results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)?.firstOrNull()?.toDouble()
      ?.takeIf { it >= 0.0 } ?: 0.7
    val transcript = candidates.firstOrNull()?.trim().orEmpty()
    if (transcript.isBlank()) captureListener?.invoke(VoiceCaptureEvent.Failure("No transcript was produced."))
    else captureListener?.invoke(
      VoiceCaptureEvent.Result(
        RecognizedSpeech(transcript, confidence.coerceIn(0.0, 1.0), Locale.getDefault().toLanguageTag()),
      ),
    )
    captureListener = null
  }

  override fun onPartialResults(partialResults: Bundle?) = Unit
  override fun onEvent(eventType: Int, params: Bundle?) = Unit

  private fun focusRequest(gain: Int) = AudioFocusRequest.Builder(gain)
    .setAudioAttributes(
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build(),
    )
    .setOnAudioFocusChangeListener { change ->
      if (
        change == AudioManager.AUDIOFOCUS_LOSS ||
        change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT ||
        change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK
      ) {
        cancelCapture()
        stopSpeaking()
      }
    }
    .build()

  private fun releaseCaptureFocus() {
    captureFocus?.let(audioManager::abandonAudioFocusRequest)
    captureFocus = null
  }

  private fun releaseSpeechFocus() {
    speechFocus?.let(audioManager::abandonAudioFocusRequest)
    speechFocus = null
  }

  private companion object {
    const val MAX_CAPTURE_MS = 45_000L
  }
}
