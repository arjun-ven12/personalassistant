package com.alexa.commandcenter.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.alexa.commandcenter.model.PublicKeyJwk
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.util.Base64

class AndroidBiometricIdentity(
  private val alias: String = "alexa.android.biometric.ed25519.v1",
) {
  private val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

  fun publicKey(): PublicKeyJwk {
    val encoded = keyEntry().certificate.publicKey.encoded
    require(encoded.size >= 32) { "Android Keystore returned an invalid biometric public key." }
    return PublicKeyJwk(
      x = Base64.getUrlEncoder().withoutPadding().encodeToString(encoded.copyOfRange(encoded.size - 32, encoded.size)),
    )
  }

  fun signatureForPrompt(): Signature = Signature.getInstance("Ed25519").apply {
    initSign(keyEntry().privateKey)
  }

  fun signAuthenticated(signature: Signature, value: String): String {
    signature.update(value.toByteArray(Charsets.UTF_8))
    return Base64.getUrlEncoder().withoutPadding().encodeToString(signature.sign())
  }

  fun rotate(): PublicKeyJwk {
    if (keyStore.containsAlias(alias)) keyStore.deleteEntry(alias)
    return publicKey()
  }

  private fun keyEntry(): KeyStore.PrivateKeyEntry {
    (keyStore.getEntry(alias, null) as? KeyStore.PrivateKeyEntry)?.let { return it }
    val generator = KeyPairGenerator.getInstance("Ed25519", "AndroidKeyStore")
    generator.initialize(
      KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
        .setDigests(KeyProperties.DIGEST_NONE)
        .setUserAuthenticationRequired(true)
        .setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
        .setInvalidatedByBiometricEnrollment(true)
        .build(),
    )
    generator.generateKeyPair()
    return keyStore.getEntry(alias, null) as KeyStore.PrivateKeyEntry
  }
}
