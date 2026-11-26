package com.example.floodguard.core.notifications

import android.util.Log
import androidx.work.Operation
import com.example.floodguard.BuildConfig
import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.local.NotificationBindingStore
import com.example.floodguard.data.local.SavedNotificationBinding
import com.example.floodguard.data.local.SessionManager
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull

class FloodGuardMessagingService : FirebaseMessagingService() {

    @Suppress("OVERRIDE_DEPRECATION")
    override fun onNewToken(token: String) {
        // SDK giữ token. Worker đọc lại token hiện tại khi thực thi.
        // Không ghi token vào log hoặc dữ liệu WorkManager.
        enqueueForCurrent { session, binding ->
            NotificationDeviceTokenWorker.enqueue(
                applicationContext,
                session,
                binding
            )
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        if (message.notification != null) {
            debugLog("NOT_DATA_ONLY")
            return
        }

        val push = FloodWarningV2Push.parse(message.data)
            .getOrNull()

        if (push == null) {
            debugLog("INVALID_PAYLOAD")
            return
        }

        enqueueForCurrent(
            accepts = { binding ->
                binding.installationId == push.installationId &&
                        binding.bindingId == push.bindingId
            }
        ) { session, binding ->
            FloodWarningPushWorker.enqueue(
                applicationContext,
                session,
                binding,
                push
            )
        }
    }

    /**
     * Chỉ đọc trạng thái local và đưa tác vụ vào WorkManager.
     * Không gọi Backend trong callback FCM.
     */
    private fun enqueueForCurrent(
        accepts: (SavedNotificationBinding) -> Boolean = { true },
        enqueue: (
            AuthenticatedSessionSnapshot,
            SavedNotificationBinding
        ) -> Operation
    ) {
        try {
            val operation = runBlocking {
                withTimeoutOrNull(2_000L) {
                    val sessionManager = SessionManager(applicationContext)
                    val session = sessionManager.getSessionSnapshot()
                        ?: return@withTimeoutOrNull null

                    if (
                        session.user.role != "resident" ||
                        session.user.id.isNullOrBlank()
                    ) {
                        return@withTimeoutOrNull null
                    }

                    val binding = NotificationBindingStore(sessionManager)
                        .getConfirmed(session)
                        ?: return@withTimeoutOrNull null

                    if (!accepts(binding)) {
                        return@withTimeoutOrNull null
                    }

                    enqueue(session, binding)
                }
            }

            if (operation == null) {
                debugLog("NO_MATCHING_CONTEXT")
                return
            }

            operation.result.get(1_500L, TimeUnit.MILLISECONDS)
            debugLog("WORK_ENQUEUED")
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
            debugLog("ENQUEUE_UNCONFIRMED")
        } catch (_: Exception) {
            debugLog("ENQUEUE_UNCONFIRMED")
        }
    }

    private fun debugLog(code: String) {
        if (BuildConfig.DEBUG) {
            Log.i("FloodGuardFCM", "result=$code")
        }
    }
}