package com.alexa.commandcenter.security

import com.google.gson.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

class CanonicalJsonTest {
  @Test
  fun `matches compact sorted backend canonical JSON`() {
    val canonical = CanonicalJson.value(
      mapOf(
        "signatureAlgorithm" to "Ed25519",
        "payload" to mapOf("operation" to JsonPrimitive("system_summary")),
        "commandId" to "command",
        "values" to listOf("a", "b"),
      ),
    )

    assertEquals(
      "{\"commandId\":\"command\",\"payload\":{\"operation\":\"system_summary\"},\"signatureAlgorithm\":\"Ed25519\",\"values\":[\"a\",\"b\"]}",
      canonical,
    )
  }
}
