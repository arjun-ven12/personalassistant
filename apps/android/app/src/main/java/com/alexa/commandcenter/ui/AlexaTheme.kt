package com.alexa.commandcenter.ui

import androidx.compose.material3.darkColorScheme
import androidx.compose.ui.graphics.Color

internal val AlexaBackground = Color(0xFF090A0E)
internal val AlexaSurface = Color(0xFF12141D)
internal val AlexaElevatedSurface = Color(0xFF171A25)
internal val AlexaBorder = Color(0xFF3A3F4D)
internal val AlexaPrimary = Color(0xFF9DB6FF)
internal val AlexaContent = Color(0xFFF3F5FA)
internal val AlexaMutedContent = Color(0xFFB8BECC)
internal val AlexaGreen = Color(0xFF64DDA7)
internal val AlexaAmber = Color(0xFFFFC766)
internal val AlexaRed = Color(0xFFFF7C88)

internal val AlexaDarkColorScheme = darkColorScheme(
  primary = AlexaPrimary,
  onPrimary = Color(0xFF090A0E),
  primaryContainer = Color(0xFF26385F),
  onPrimaryContainer = Color(0xFFE8EEFF),
  secondary = Color(0xFFB9C7EC),
  onSecondary = Color(0xFF12141D),
  secondaryContainer = Color(0xFF293249),
  onSecondaryContainer = AlexaContent,
  tertiary = AlexaGreen,
  onTertiary = Color(0xFF07140E),
  background = AlexaBackground,
  onBackground = AlexaContent,
  surface = AlexaSurface,
  onSurface = AlexaContent,
  surfaceVariant = AlexaElevatedSurface,
  onSurfaceVariant = AlexaMutedContent,
  error = AlexaRed,
  onError = Color(0xFF190306),
  outline = Color(0xFF858C9C),
  outlineVariant = AlexaBorder,
  inverseSurface = AlexaContent,
  inverseOnSurface = AlexaBackground,
  inversePrimary = Color(0xFF36558F),
  scrim = Color.Black,
)
