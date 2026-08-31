package com.alexa.commandcenter.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.alexa.commandcenter.MainActivity
import com.alexa.commandcenter.R
import com.alexa.commandcenter.model.CommandCenterSnapshot
import com.alexa.commandcenter.security.AndroidSecureValues
import com.google.gson.Gson

data class MondayOsWidgetApproval(
  val id: String,
  val summary: String,
  val risk: String,
)

data class MondayOsWidgetSnapshot(
  val activeAgents: Int,
  val dormantAgents: Int,
  val approvals: List<MondayOsWidgetApproval>,
  val updatedAt: Long,
) {
  companion object {
    fun from(snapshot: CommandCenterSnapshot, now: Long = System.currentTimeMillis()) =
      MondayOsWidgetSnapshot(
        activeAgents = snapshot.workforce?.summary?.active ?: 0,
        dormantAgents = snapshot.workforce?.summary?.dormant ?: 0,
        approvals = snapshot.approvals
          .asSequence()
          .filter { it.status == "PENDING" }
          .take(MAX_APPROVALS)
          .map { MondayOsWidgetApproval(it.id, it.humanSummary.take(100), it.riskLevel) }
          .toList(),
        updatedAt = now,
      )

    const val MAX_APPROVALS = 3
  }
}

class MondayOsWidgetStore(context: Context, private val gson: Gson = Gson()) {
  private val values = AndroidSecureValues(context, "monday.widget.secure")

  fun save(snapshot: MondayOsWidgetSnapshot) = values.write(SNAPSHOT_KEY, gson.toJson(snapshot))

  fun read(): MondayOsWidgetSnapshot? = runCatching {
    values.read(SNAPSHOT_KEY)?.let { gson.fromJson(it, MondayOsWidgetSnapshot::class.java) }
  }.getOrNull()

  fun clear() = values.remove(SNAPSHOT_KEY)

  private companion object { const val SNAPSHOT_KEY = "executive_snapshot" }
}

class MondayOsWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    appWidgetIds.forEach { update(context, appWidgetManager, it) }
  }

  companion object {
    fun updateAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val component = ComponentName(context, MondayOsWidgetProvider::class.java)
      val ids = manager.getAppWidgetIds(component)
      ids.forEach { update(context, manager, it) }
    }

    private fun update(context: Context, manager: AppWidgetManager, widgetId: Int) {
      val snapshot = MondayOsWidgetStore(context).read()
      val approvalItems = RemoteViews.RemoteCollectionItems.Builder()
        .setHasStableIds(true)
        .setViewTypeCount(1)
      snapshot?.approvals.orEmpty().take(MondayOsWidgetSnapshot.MAX_APPROVALS).forEach { approval ->
        approvalItems.addItem(
          approval.id.hashCode().toLong(),
          RemoteViews(context.packageName, R.layout.monday_os_widget_approval).apply {
            setTextViewText(R.id.widget_approval_summary, approval.summary)
            setTextViewText(R.id.widget_approval_risk, approval.risk.uppercase())
            setOnClickFillInIntent(
              R.id.widget_approval_row,
              Intent().apply {
                action = MainActivity.ACTION_OPEN_APPROVAL
                putExtra(MainActivity.EXTRA_APPROVAL_ID, approval.id)
              },
            )
          },
        )
      }
      val views = RemoteViews(context.packageName, R.layout.monday_os_widget).apply {
        setTextViewText(R.id.widget_active_count, (snapshot?.activeAgents ?: 0).toString())
        setTextViewText(R.id.widget_dormant_count, (snapshot?.dormantAgents ?: 0).toString())
        setRemoteAdapter(R.id.widget_approval_list, approvalItems.build())
        setEmptyView(R.id.widget_approval_list, R.id.widget_approval_empty)
        setOnClickPendingIntent(
          R.id.widget_mic,
          PendingIntent.getActivity(
            context,
            widgetId,
            Intent(context, MainActivity::class.java).apply {
              action = MainActivity.ACTION_OPEN_VOICE
              flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
          ),
        )
        setPendingIntentTemplate(
          R.id.widget_approval_list,
          PendingIntent.getActivity(
            context,
            widgetId + 10_000,
            Intent(context, MainActivity::class.java).apply {
              action = MainActivity.ACTION_OPEN_APPROVAL
              flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
          ),
        )
      }
      manager.updateAppWidget(widgetId, views)
    }
  }
}
