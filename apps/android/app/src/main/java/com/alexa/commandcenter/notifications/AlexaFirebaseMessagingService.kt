package com.alexa.commandcenter.notifications

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.alexa.commandcenter.MainActivity
import com.alexa.commandcenter.security.AndroidSecureValues
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class AlexaFirebaseMessagingService : FirebaseMessagingService() {
  override fun onNewToken(token: String) {
    PushTokenStore(AndroidSecureValues(this)).save(token)
  }

  override fun onMessageReceived(message: RemoteMessage) {
    val validated = ExecutiveNotificationPolicy.parse(message.data) ?: return
    val target = validated.target
    ExecutiveRefreshEvents.publish(target)
    if (
      android.os.Build.VERSION.SDK_INT >= 33 &&
      ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) return

    val intent = Intent(this, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
      putExtra(EXTRA_OBJECT_KIND, target.kind)
      putExtra(EXTRA_OBJECT_ID, target.objectId)
      putExtra(EXTRA_EVENT_ID, target.eventId)
    }
    val pendingIntent = PendingIntent.getActivity(
      this,
      target.objectId.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val channel = ExecutiveNotificationPolicy.channel(validated.severity)
    val publicVersion = NotificationCompat.Builder(this, channel)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle(ExecutiveNotificationPolicy.PUBLIC_TITLE)
      .setContentText(ExecutiveNotificationPolicy.PUBLIC_TEXT)
      .build()
    val notification = NotificationCompat.Builder(this, channel)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle(validated.title)
      .setContentText("Open Alexa to review the current state.")
      .setContentIntent(pendingIntent)
      .setAutoCancel(true)
      .setCategory(if (validated.type == "APPROVAL_REQUIRED") NotificationCompat.CATEGORY_REMINDER else NotificationCompat.CATEGORY_STATUS)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setPublicVersion(publicVersion)
      .setPriority(if (ExecutiveNotificationPolicy.usesHighTransportPriority(validated.severity)) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
      .build()
    getSystemService(NotificationManager::class.java).notify(target.eventId?.hashCode() ?: target.objectId.hashCode(), notification)
  }

  companion object {
    const val EXTRA_OBJECT_KIND = "alexa.notification.objectKind"
    const val EXTRA_OBJECT_ID = "alexa.notification.objectId"
    const val EXTRA_EVENT_ID = "alexa.notification.eventId"
  }
}
