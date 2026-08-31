package com.alexa.commandcenter.ui

import androidx.compose.ui.graphics.luminance
import org.junit.Assert.assertTrue
import org.junit.Test

class AlexaThemeTest {
  @Test
  fun `dark surfaces use light default text and icon colors`() {
    val scheme = AlexaDarkColorScheme

    assertTrue(contrast(scheme.onBackground.luminance(), scheme.background.luminance()) >= 4.5f)
    assertTrue(contrast(scheme.onSurface.luminance(), scheme.surface.luminance()) >= 4.5f)
    assertTrue(contrast(scheme.onSurfaceVariant.luminance(), scheme.surfaceVariant.luminance()) >= 4.5f)
    assertTrue(scheme.onBackground.luminance() > 0.5f)
    assertTrue(scheme.onSurface.luminance() > 0.5f)
    assertTrue(scheme.onSurfaceVariant.luminance() > 0.35f)
  }

  private fun contrast(first: Float, second: Float): Float {
    val lighter = maxOf(first, second)
    val darker = minOf(first, second)
    return (lighter + 0.05f) / (darker + 0.05f)
  }
}
