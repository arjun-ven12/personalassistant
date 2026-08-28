package com.alexa.commandcenter.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.alexa.commandcenter.model.PublicKeyJwk
import com.alexa.commandcenter.model.SignedEnvelope
import com.google.gson.JsonElement
import java.security.KeyFactory
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.X509EncodedKeySpec
import java.math.BigDecimal
import java.time.Instant
import java.util.Base64
import java.util.UUID

class AndroidDeviceIdentity(
  private val secureValues: SecureValues,
  private val alias: String = "alexa.android.device.ed25519.v1",
) {
  private val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

  fun publicKey(): PublicKeyJwk {
    val encoded = keyPair().public.encoded
    require(encoded.size >= 32) { "Android Keystore returned an invalid Ed25519 public key." }
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
    val signature = Base64.getUrlEncoder().withoutPadding().encodeToString(signer.sign())
    return SignedEnvelope(
      commandId = unsigned.commandId,
      deviceId = unsigned.deviceId,
      issuedAt = unsigned.issuedAt,
      expiresAt = unsigned.expiresAt,
      nonce = unsigned.nonce,
      payload = unsigned.payload,
      signature = signature,
    )
  }

  fun delete() {
    if (keyStore.containsAlias(alias)) keyStore.deleteEntry(alias)
    secureValues.remove(SOFTWARE_PRIVATE_KEY)
    secureValues.remove(SOFTWARE_PUBLIC_KEY)
  }

  private fun keyPair(): KeyPair {
    softwareKeyPair()?.let { return it }

    val existing = keyStore.getEntry(alias, null) as? KeyStore.PrivateKeyEntry
    if (existing != null) {
      val pair = KeyPair(existing.certificate.publicKey, existing.privateKey)
      if (isValidEd25519Pair(pair)) return pair
      keyStore.deleteEntry(alias)
    }

    val generator = KeyPairGenerator.getInstance("Ed25519", "AndroidKeyStore")
    generator.initialize(
      KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
        .setDigests(KeyProperties.DIGEST_NONE)
        .setUserAuthenticationRequired(false)
        .build(),
    )
    val hardwarePair = generator.generateKeyPair()
    if (isValidEd25519Pair(hardwarePair)) return hardwarePair

    keyStore.deleteEntry(alias)
    return KeyPairGenerator.getInstance("Ed25519").generateKeyPair().also { pair ->
      check(isValidEd25519Pair(pair)) { "No valid Ed25519 provider is available on this device." }
      secureValues.write(SOFTWARE_PRIVATE_KEY, Base64.getEncoder().encodeToString(pair.private.encoded))
      secureValues.write(SOFTWARE_PUBLIC_KEY, Base64.getEncoder().encodeToString(pair.public.encoded))
    }
  }

  private fun softwareKeyPair(): KeyPair? {
    val privateEncoded = secureValues.read(SOFTWARE_PRIVATE_KEY) ?: return null
    val publicEncoded = secureValues.read(SOFTWARE_PUBLIC_KEY) ?: return null
    return runCatching {
      val factory = KeyFactory.getInstance("Ed25519")
      KeyPair(
        factory.generatePublic(X509EncodedKeySpec(Base64.getDecoder().decode(publicEncoded))),
        factory.generatePrivate(PKCS8EncodedKeySpec(Base64.getDecoder().decode(privateEncoded))),
      )
    }.getOrElse {
      secureValues.remove(SOFTWARE_PRIVATE_KEY)
      secureValues.remove(SOFTWARE_PUBLIC_KEY)
      null
    }
  }

  private fun isValidEd25519Pair(pair: KeyPair): Boolean = runCatching {
    val challenge = "alexa-android-ed25519-self-test".toByteArray()
    val signer = Signature.getInstance("Ed25519").apply {
      initSign(pair.private)
      update(challenge)
    }
    val signature = signer.sign()
    signature.size == ED25519_SIGNATURE_BYTES && Signature.getInstance("Ed25519").run {
      initVerify(pair.public)
      update(challenge)
      verify(signature)
    }
  }.getOrDefault(false)

  private companion object {
    const val SOFTWARE_PRIVATE_KEY = "device_ed25519_private_pkcs8"
    const val SOFTWARE_PUBLIC_KEY = "device_ed25519_public_x509"
    const val ED25519_SIGNATURE_BYTES = 64
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

internal object CanonicalJson {
  fun value(value: Any?): String = when (value) {
    null -> "null"
    is String -> "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""
    is Boolean -> value.toString()
    is Number -> canonicalNumber(value)
    is JsonElement -> value(value.asJsonObjectOrNull())
    is Map<*, *> -> value.entries.sortedBy { it.key.toString() }
      .joinToString(separator = ",", prefix = "{", postfix = "}") { "${value(it.key.toString())}:${value(it.value)}" }
    is Iterable<*> -> value.joinToString(separator = ",", prefix = "[", postfix = "]") { value(it) }
    else -> error("Signed payload contains an unsupported value.")
  }

  private fun canonicalNumber(value: Number): String = runCatching {
    // JSON.parse turns 1.0 into the JavaScript number 1, then JSON.stringify
    // emits "1". Match that canonical form before signing Android envelopes.
    BigDecimal(value.toString()).stripTrailingZeros().toPlainString()
  }.getOrElse {
    error("Signed payload contains a non-finite number.")
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
