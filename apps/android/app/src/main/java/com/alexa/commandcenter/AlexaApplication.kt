package com.alexa.commandcenter

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions

class AlexaApplication : Application() {
  override fun onCreate() {
    super.onCreate()
    createNotificationChannels()
    if (
      BuildConfig.FCM_PROJECT_ID.isNotBlank() &&
      BuildConfig.FCM_APPLICATION_ID.isNotBlank() &&
      BuildConfig.FCM_API_KEY.isNotBlank() &&
      BuildConfig.FCM_SENDER_ID.isNotBlank() &&
      FirebaseApp.getApps(this).isEmpty()
    ) {
      FirebaseApp.initializeApp(
        this,
        FirebaseOptions.Builder()
          .setProjectId(BuildConfig.FCM_PROJECT_ID)
          .setApplicationId(BuildConfig.FCM_APPLICATION_ID)
          .setApiKey(BuildConfig.FCM_API_KEY)
          .setGcmSenderId(BuildConfig.FCM_SENDER_ID)
          .build(),
      )
    }
  }

  private fun createNotificationChannels() {
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannels(
      listOf(
        NotificationChannel(
          "executive_urgent",
          "Urgent executive attention",
          NotificationManager.IMPORTANCE_HIGH,
        ).apply {
          description = "Approvals, security events, and blocked executive work"
          lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
        },
        NotificationChannel(
          "executive_updates",
          "Executive updates",
          NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
          description = "Objective, workflow, budget, and experiment updates"
          lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
        },
      ),
    )
  }
}
