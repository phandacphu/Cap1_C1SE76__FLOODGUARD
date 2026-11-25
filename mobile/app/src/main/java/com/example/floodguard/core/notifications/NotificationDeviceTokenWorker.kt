package com.example.floodguard.core.notifications

import android.content.Context
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.Operation
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.example.floodguard.BuildConfig
import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.local.NotificationBindingStore
import com.example.floodguard.data.local.NotificationInstallationStore
import com.example.floodguard.data.local.SavedNotificationBinding
import com.example.floodguard.data.local.SessionManager
import com.example.floodguard.data.repository.NotificationBindingCoordinator
import com.example.floodguard.data.repository.NotificationBindingRetryDeferredException
import com.example.floodguard.data.repository.NotificationDeviceApiException
import com.example.floodguard.data.repository.NotificationDeviceRepository
import com.example.floodguard.data.repository.ObsoleteNotificationSessionException
import java.io.IOException
import java.security.MessageDigest
import java.util.Base64
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException

class NotificationDeviceTokenWorker(
    context: Context,
    parameters: WorkerParameters
) : CoroutineWorker(context, parameters) {

    companion object {
        private const val GENERATION = "device_generation"
        private const val REGISTRATION = "device_registration"
        private const val INSTALLATION = "device_installation"
        private const val BINDING = "device_binding"

        fun enqueue(
            context: Context,
            session: AuthenticatedSessionSnapshot,
            binding: SavedNotificationBinding
        ): Operation {
            val uniqueIdentity =
                "${session.generation}:${session.registrationId}:${binding.bindingId}"

            val hash = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(
                    MessageDigest.getInstance("SHA-256").digest(
                        uniqueIdentity.toByteArray(Charsets.UTF_8)
                    )
                )

            val request =
                OneTimeWorkRequestBuilder<NotificationDeviceTokenWorker>()
                    .setInputData(
                        workDataOf(
                            GENERATION to session.generation,
                            REGISTRATION to session.registrationId,
                            INSTALLATION to binding.installationId,
                            BINDING to binding.bindingId
                        )
                    )
                    .setConstraints(
                        Constraints.Builder()
                            .setRequiredNetworkType(NetworkType.CONNECTED)
                            .build()
                    )
                    .setBackoffCriteria(
                        BackoffPolicy.EXPONENTIAL,
                        60,
                        TimeUnit.SECONDS
                    )
                    .build()

            // Callback mới đến khi tác vụ cũ đang chạy vẫn có lượt xử lý sau.
            return WorkManager.getInstance(context.applicationContext)
                .enqueueUniqueWork(
                    "flood-v2-token-$hash",
                    ExistingWorkPolicy.APPEND_OR_REPLACE,
                    request
                )
        }
    }

    override suspend fun doWork(): Result {
        return try {
            synchronizeToken()
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            retryOrFinish(error)
        }
    }

    private suspend fun synchronizeToken(): Result {
        val sessionManager = SessionManager(applicationContext)
        val bindingStore = NotificationBindingStore(sessionManager)

        val session = sessionManager.getSessionSnapshot()
            ?: return finish("NO_SESSION")

        if (!matches(session, bindingStore.getConfirmed(session))) {
            return finish("OBSOLETE_CONTEXT")
        }

        // Lấy giá trị hiện tại từ SDK, không lưu raw token trong WorkData.
        val token = FcmTokenReader.read(applicationContext)
            ?: return finish("FIREBASE_NOT_CONFIGURED")

        val identity = NotificationInstallationStore(applicationContext)
            .getOrCreate()

        val current = bindingStore.getConfirmed(session)

        if (
            !matches(session, current) ||
            identity.installationId != inputData.getString(INSTALLATION)
        ) {
            return finish("OBSOLETE_CONTEXT")
        }

        val permission =
            if (FloodWarningLocalNotifications(applicationContext).canPost()) {
                "granted"
            } else {
                "denied"
            }

        val coordinator = NotificationBindingCoordinator(
            sessionManager,
            bindingStore,
            NotificationDeviceRepository.create()
        )

        val result = coordinator.synchronize(
            session = session,
            identity = identity,
            fcmToken = token,
            notificationPermission = permission
        )

        val synced = result.getOrNull()
            ?: return retryOrFinish(result.exceptionOrNull())

        if (!sessionManager.isCurrentSession(session)) {
            return finish("OBSOLETE_CONTEXT")
        }

        if (!synced.requestedStateApplied) {
            return retryOrFinish(null)
        }

        if (BuildConfig.DEBUG) {
            Log.i(
                "NotificationToken",
                "result=BOUND; generation=${session.generation}; " +
                        "revision=${synced.device.revision}; " +
                        "pushEligible=${synced.device.pushEligible}"
            )
        }

        return Result.success()
    }

    private fun matches(
        session: AuthenticatedSessionSnapshot,
        binding: SavedNotificationBinding?
    ): Boolean =
        session.user.role == "resident" &&
                session.generation == inputData.getLong(GENERATION, -1L) &&
                session.registrationId == inputData.getString(REGISTRATION) &&
                binding != null &&
                binding.installationId == inputData.getString(INSTALLATION) &&
                binding.bindingId == inputData.getString(BINDING)

    private fun retryOrFinish(error: Throwable?): Result {
        if (error is ObsoleteNotificationSessionException) {
            return finish("OBSOLETE_CONTEXT")
        }

        val status = (error as? NotificationDeviceApiException)?.httpStatus

        val transient =
            error == null ||
                    error is IOException ||
                    error is NotificationBindingRetryDeferredException ||
                    status == 408 ||
                    status == 429 ||
                    (status != null && status in 500..599)

        return if (transient && runAttemptCount < 3) {
            Result.retry()
        } else {
            finish("TOKEN_SYNC_STOPPED")
        }
    }

    private fun finish(code: String): Result {
        if (BuildConfig.DEBUG) {
            Log.i("NotificationToken", "result=$code")
        }
        return Result.success()
    }
}