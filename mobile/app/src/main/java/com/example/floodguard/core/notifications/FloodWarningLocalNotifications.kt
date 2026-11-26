package com.example.floodguard.core.notifications

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.example.floodguard.MainActivity
import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.repository.FloodWarningV2
import java.security.MessageDigest
import java.util.Base64

class FloodWarningLocalNotifications(context: Context) {
    private val appContext = context.applicationContext
    private val manager =
        appContext.getSystemService(NotificationManager::class.java)

    companion object {
        const val CHANNEL_ID = "flood_warning_v2"

        const val OPEN_ACTION =
            "com.example.floodguard.OPEN_WARNING_V2"

        const val EXTRA_ALERT_ID = "warning_v2_alert_id"
        const val EXTRA_GENERATION = "warning_v2_generation"
        const val EXTRA_REGISTRATION = "warning_v2_registration"
        const val EXTRA_INSTALLATION = "warning_v2_installation"
        const val EXTRA_BINDING = "warning_v2_binding"

        private const val NOTIFICATION_ID = 0

        private fun fingerprint(value: String): String =
            Base64.getUrlEncoder().withoutPadding().encodeToString(
                MessageDigest.getInstance("SHA-256").digest(
                    value.toByteArray(Charsets.UTF_8)
                )
            )

        private fun accountPrefix(accountId: String): String =
            "flood-v2:${fingerprint(accountId)}:"

        private fun tag(
            accountId: String,
            alertId: String,
            kind: FloodWarningV2PushKind
        ): String =
            accountPrefix(accountId) +
                    fingerprint(alertId) +
                    ":${kind.wireValue}"
    }

    fun ensureChannel() {
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Cảnh báo lũ",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description =
                    "Bản tin cảnh báo lũ và thông tin theo vị trí."
            }
        )
    }

    fun canPost(): Boolean {
        ensureChannel()

        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(
                appContext,
                Manifest.permission.POST_NOTIFICATIONS
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            return false
        }

        if (
            !NotificationManagerCompat.from(appContext)
                .areNotificationsEnabled()
        ) {
            return false
        }

        return manager.getNotificationChannel(CHANNEL_ID)
            ?.importance != NotificationManager.IMPORTANCE_NONE
    }

    /**
     * Chỉ gọi sau preflight, claim receipt và kiểm tra lại phiên/binding.
     * true chỉ có nghĩa đã gọi notify thành công, không chứng minh
     * người dùng đã thấy hoặc điện thoại đã phát âm thanh.
     */
    @SuppressLint("MissingPermission")
    fun postVerified(
        session: AuthenticatedSessionSnapshot,
        push: FloodWarningV2Push,
        alert: FloodWarningV2
    ): Boolean {
        val accountId = session.user.id

        if (
            session.user.role != "resident" ||
            accountId.isNullOrBlank() ||
            push.isDeactivation ||
            alert.id != push.alertId ||
            alert.status != "active"
        ) {
            return false
        }

        if (!canPost()) return false

        val uri = Uri.Builder()
            .scheme("floodguard")
            .authority("warning")
            .appendPath(alert.id)
            .appendQueryParameter(
                "generation", session.generation.toString()
            )
            .appendQueryParameter(
                "registration", session.registrationId
            )
            .appendQueryParameter("kind", push.kind.wireValue)
            .build()

        val intent = Intent(appContext, MainActivity::class.java)
            .setAction(OPEN_ACTION)
            .setData(uri)
            .addFlags(
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
            )
            .putExtra(EXTRA_ALERT_ID, alert.id)
            .putExtra(EXTRA_GENERATION, session.generation)
            .putExtra(EXTRA_REGISTRATION, session.registrationId)
            .putExtra(EXTRA_INSTALLATION, push.installationId)
            .putExtra(EXTRA_BINDING, push.bindingId)

        val pendingIntent = PendingIntent.getActivity(
            appContext,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or
                    PendingIntent.FLAG_IMMUTABLE
        )

        val categoryText = when (push.kind) {
            FloodWarningV2PushKind.GENERAL -> "Bản tin chung"
            FloodWarningV2PushKind.NEAR -> "Gần vùng được công bố"
            FloodWarningV2PushKind.INSIDE -> "Trong vùng được công bố"
            FloodWarningV2PushKind.DEACTIVATED -> return false
        }

        // Dùng nội dung mới đọc từ API, không dùng nội dung push cũ.
        val notification = NotificationCompat.Builder(
            appContext, CHANNEL_ID
        )
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(alert.title)
            .setContentText(alert.content)
            .setStyle(
                NotificationCompat.BigTextStyle()
                    .bigText(alert.content)
            )
            .setSubText(categoryText)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .build()

        return try {
            manager.notify(
                tag(accountId, alert.id, push.kind),
                NOTIFICATION_ID,
                notification
            )
            true
        } catch (_: SecurityException) {
            false
        }
    }

    fun cancelAlert(
        session: AuthenticatedSessionSnapshot,
        alertId: String
    ) {
        val accountId = session.user.id ?: return

        FloodWarningV2PushKind.entries
            .filterNot { it == FloodWarningV2PushKind.DEACTIVATED }
            .forEach { kind ->
                manager.cancel(
                    tag(accountId, alertId, kind),
                    NOTIFICATION_ID
                )
            }
    }

    fun cancelAccount(session: AuthenticatedSessionSnapshot) {
        val accountId = session.user.id ?: return
        val prefix = accountPrefix(accountId)

        manager.activeNotifications
            .filter { it.tag?.startsWith(prefix) == true }
            .forEach {
                manager.cancel(it.tag, it.id)
            }
    }
}