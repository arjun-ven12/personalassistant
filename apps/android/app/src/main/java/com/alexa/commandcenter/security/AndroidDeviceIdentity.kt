package com.alexa.commandcenter.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.alexa.commandcenter.model.PublicKeyJwk
import com.alexa.commandcenter.model.SignedEnvelope
import com.google.gson.JsonElement
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.Signature
import java.time.Instant
import java.util.Base64
import java.util.UUID

class AndroidDeviceIdentity(private val alias: String = "alexa.android.device.ed25519.v1") {
  private val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

  fun publicKey(): PublicKeyJwk {
    val keyPair = keyPair()
    val encoded = keyPair.public.encoded
    val raw = encoded.copyOfRange(encoded.size - 32, encoded.size)
    return PublicKeyJwk(x = Base64.getUrlEncoder().withoutPadding().encodeToString(raw))
  }

  fun fingerprint(): String {
    val key = publicKey()
    val canonical = "{\"crv\":\"Ed25519\",\"kty\":\"OKP\",\"x\":\"${key.x}\"}"
    val digest = MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray())
    return "SHA256:${Base64.getUrlEncoder().withoutPadding().encodeToString(digest)}"
  }

  fun signEnvelope(deviceId: String, payload: Map<String, JsonElement>): SignedEnvelope {
    val issuedAt = Instant.now()
    val unsigned = UnsignedEnvelope(
      commandId = UUID.randomUUID().toString(),
      deviceId = deviceId,
      issuedAt = issuedAt.toString(),
      expiresAt = issuedAt.plusSeconds(60).toString(),
      nonce = UUID.randomUUID().toString(),
      payload = payload,
    )
    val signer = Signature.getInstance("Ed25519")
    signer.initSign(keyPair().private)
    signer.update(CanonicalJson.value(unsigned.toMap()).toByteArray())
    return SignedEnvelope(
      commandId = unsigned.commandId,
      deviceId = unsigned.deviceId,
      issuedAt = unsigned.issuedAt,
      expiresAt = unsigned.expiresAt,
      nonce = unsigned.nonce,
      payload = unsigned.payload,
      signature = Base64.getUrlEncoder().withoutPadding().encodeToString(signer.sign()),
    )
  }

  fun delete() {
    if (keyStore.containsAlias(alias)) keyStore.deleteEntry(alias)
  }

  private fun keyPair(): java.security.KeyPair {
    val existing = keyStore.getEntry(alias, null) as? KeyStore.PrivateKeyEntry
    if (existing != null) return java.security.KeyPair(existing.certificate.publicKey, existing.privateKey)
    val generator = KeyPairGenerator.getInstance("Ed25519", "AndroidKeyStore")
    generator.initialize(
      KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
        .setUserAuthenticationRequired(false)
        .build(),
    )
    return generator.generateKeyPair()
  }

  private data class UnsignedEnvelope(
    val commandId: String,
    val deviceId: String,
    val issuedAt: String,
    val expiresAt: String,
    val nonce: String,
    val payload: Map<String, JsonElement>,
  ) {
    fun toMap() = mapOf(
      "commandId" to commandId,
      "deviceId" to deviceId,
      "issuedAt" to issuedAt,
      "expiresAt" to expiresAt,
      "nonce" to nonce,
      "payload" to payload,
      "signatureAlgorithm" to "Ed25519",
      "protocolVersion" to "1",
    )
  }
}

private object CanonicalJson {
  fun value(value: Any?): String = when (value) {
    null -> "null"
    is String -> "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""
    is Boolean, is Number -> value.toString()
    is JsonElement -> value(value.asJsonObjectOrNull())
    is Map<*, *> -> value.entries.sortedBy { it.key.toString() }
      .joinToString(prefix = "{", postfix = "}") { "${value(it.key.toString())}:${value(it.value)}" }
    is Iterable<*> -> value.joinToString(prefix = "[", postfix = "]") { value(it) }
    else -> error("Signed payload contains an unsupported value.")
  }

  private fun JsonElement.asJsonObjectOrNull(): Any? = when {
    isJsonNull -> null
    isJsonPrimitive -> when {
      asJsonPrimitive.isBoolean -> asBoolean
      asJsonPrimitive.isNumber -> asNumber
      else -> asString
    }
    isJsonArray -> asJsonArray.map { it.asJsonObjectOrNull() }
    else -> asJsonObject.entrySet().associate { it.key to it.value.asJsonObjectOrNull() }
  }
}
