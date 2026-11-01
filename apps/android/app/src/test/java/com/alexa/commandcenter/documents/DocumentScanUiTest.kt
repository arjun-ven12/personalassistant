package com.alexa.commandcenter.documents

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudUpload
import androidx.compose.material.icons.outlined.PhoneAndroid
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.activity.ComponentActivity
import androidx.compose.ui.unit.dp
import com.alexa.commandcenter.ui.AlexaDarkColorScheme
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], qualifiers = "w360dp-h800dp-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class DocumentScanUiTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    @Test fun savingOnPhoneIsDefaultAndChoosingAthenaOnlyChangesDestination() {
        var destination = false
        var saved = false
        compose.setContent {
            MaterialTheme(colorScheme = AlexaDarkColorScheme) {
                var athena by remember { mutableStateOf(false) }
                Column(Modifier.padding(20.dp)) {
                    SaveDestination(!athena, Icons.Outlined.PhoneAndroid, "On this phone", "Create a PDF offline", true) { athena = false; destination = false }
                    SaveDestination(athena, Icons.Outlined.CloudUpload, "In Athena", "Upload privately", true) { athena = true; destination = true }
                    ScanFooter(if (athena) "Save to Athena" else "Create searchable PDF", true, "Explicit save required") { saved = true }
                }
            }
        }
        compose.onNodeWithText("On this phone").assertIsSelected()
        compose.onNodeWithText("In Athena").performClick()
        compose.onNodeWithText("In Athena").assertIsSelected()
        compose.onNodeWithText("Save to Athena").assertIsDisplayed()
        assertTrue(destination); assertFalse(saved)
        compose.onNodeWithText("Save to Athena").performClick()
        assertTrue(saved)
    }
    @Test fun pageOrderHasAccessibleBoundaries() {
        var moved = -1
        var rotated = false
        compose.setContent { MaterialTheme(colorScheme = AlexaDarkColorScheme) {
            Column { PageEditToolbar(0, 3, true, { moved = it }, { rotated = true }, {}, {}, {}, {}) }
        } }
        compose.onNodeWithContentDescription("Move page earlier").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Move page later").performClick()
        assertEquals(1, moved)
        compose.onNodeWithText("Rotate").performClick(); assertTrue(rotated)
    }
    @Test fun busyPrimaryActionCannotStartDuplicateProcessing() {
        var calls = 0
        compose.setContent { MaterialTheme { ScanFooter("Create searchable PDF", false, "Reading your pages") { calls++ } } }
        compose.onNodeWithText("Create searchable PDF").assertIsNotEnabled().performClick()
        assertEquals(0, calls)
    }
    @Test fun renderLibraryAtPhoneWidth() {
        compose.setContent { MaterialTheme(colorScheme = AlexaDarkColorScheme) {
            Surface(Modifier.fillMaxSize()) { Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                DocumentHeader("Documents", "Scan, save, find it again.", {})
                ScanHero(true) {}
                Text("Your library", style = MaterialTheme.typography.titleLarge)
                DocumentSearch("", {}, "Search text, titles or tags")
                CollectionFilters("All") {}
                DocumentEmpty("Make room for less paper.", "Scans saved to Athena appear here.")
            } }
        } }
        compose.onNodeWithText("Scan a document").assertIsDisplayed()
        screenshot("library")
    }
    @Test fun renderFocusedReviewAndReadablePageControls() {
        val bitmap = Bitmap.createBitmap(600, 800, Bitmap.Config.ARGB_8888).apply {
            eraseColor(Color.WHITE)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(30, 40, 60); textSize = 28f }
            val canvas = Canvas(this); canvas.drawText("Project notes", 50f, 90f, paint)
            paint.textSize = 17f
            listOf("A clearer way to keep your ideas.", "Capture the page. Make every word searchable.", "Keep the original. Find it again later.").forEachIndexed { i, text -> canvas.drawText(text, 50f, 160f + i * 50f, paint) }
        }
        compose.setContent { MaterialTheme(colorScheme = AlexaDarkColorScheme) {
            Scaffold(bottomBar = { ScanFooter("Continue", true, "3 pages · Originals preserved") {} }) { padding ->
                Column(Modifier.padding(padding).padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    DocumentHeader("Review your pages", "Documents", {})
                    ScanSteps(0)
                    Text("Page 1 of 3", style = MaterialTheme.typography.titleMedium)
                    ScanPaper(bitmap, "Page 1", Modifier.weight(1f))
                    PageEditToolbar(0, 3, true, {}, {}, {}, {}, {}, {})
                    ScanPageStrip(3, 0, true, mapOf(0 to bitmap, 1 to bitmap, 2 to bitmap)) {}
                }
            }
        } }
        compose.onNodeWithText("Continue").assertIsDisplayed()
        compose.onNodeWithText("Crop").assertIsDisplayed()
        screenshot("review")
    }
    @Test fun cropDragIsBoundedAndOnlyCommitsAfterApply() {
        var applied: com.alexa.commandcenter.model.DocumentCrop? = null
        val image = Bitmap.createBitmap(400, 600, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.WHITE) }
        compose.setContent { MaterialTheme(colorScheme = AlexaDarkColorScheme) { DocumentCropEditor(image, null, {}) { applied = it } } }
        compose.onNodeWithContentDescription("Full page before cropping").performTouchInput {
            down(androidx.compose.ui.geometry.Offset(2f, 2f))
            moveBy(androidx.compose.ui.geometry.Offset(30f, 35f))
            moveBy(androidx.compose.ui.geometry.Offset(25f, 30f))
            up()
        }
        assertNull(applied)
        compose.onNodeWithText("Apply crop").performClick()
        assertNotNull(applied)
        assertTrue(applied!!.left > 0.0 && applied!!.top > 0.0)
        assertTrue(applied!!.right - applied!!.left >= 0.05 && applied!!.bottom - applied!!.top >= 0.05)
        assertEquals(1.0, applied!!.right, 0.0)
        assertEquals(1.0, applied!!.bottom, 0.0)
    }
    @Test fun cancellingCropDoesNotCommitAnyEdit() {
        var applied = false
        var cancelled = false
        val image = Bitmap.createBitmap(400, 600, Bitmap.Config.ARGB_8888)
        compose.setContent { MaterialTheme { DocumentCropEditor(image, null, { cancelled = true }) { applied = true } } }
        compose.onNodeWithContentDescription("Cancel crop").performClick()
        assertTrue(cancelled); assertFalse(applied)
    }
    private fun screenshot(name: String) {
        compose.waitForIdle()
        val output = File("build/reports/scan-ui/$name.png").apply { parentFile?.mkdirs() }
        compose.runOnIdle {
            val view = compose.activity.window.decorView
            val image = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
            view.draw(Canvas(image))
            output.outputStream().use { image.compress(Bitmap.CompressFormat.PNG, 100, it) }
            image.recycle()
        }
    }
}
