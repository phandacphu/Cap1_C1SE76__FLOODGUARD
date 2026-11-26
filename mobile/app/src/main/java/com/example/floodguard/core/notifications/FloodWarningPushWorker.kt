package com.example.floodguard.core.notifications

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.Operation
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.example.floodguard.BuildConfig
import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.local.NotificationBindingStore
import com.example.floodguard.data.local.NotificationInstallationStore
import com.example.floodguard.data.local.SavedNotificationBinding
import com.example.floodguard.data.local.SessionManager
import com.example.floodguard.data.repository.FloodLocationV2ApiException
import com.example.floodguard.data.repository.ObsoleteNotificationSessionException
import com.google.gson.Gson
import java.io.IOException
import java.security.MessageDigest
import java.time.Instant
import java.util.Base64
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withTimeoutOrNull
import retrofit2.HttpException

class FloodWarningPushWorker(
    context: Context,
    parameters: WorkerParameters
) : CoroutineWorker(context, parameters) {

    companion object {
        private val allowedDecisions = setOf(
            FloodWarningPushCheck.ALLOW_GENERAL,
            FloodWarningPushCheck.ALLOW_NEAR,
            FloodWarningPushCheck.ALLOW_INSIDE
        )

        fun enqueue(
            context: Context,
            session: AuthenticatedSessionSnapshot,
            binding: SavedNotificationBinding,
            push: FloodWarningV2Push
        ): Operation {
            val envelope = FloodWarningPushWorkEnvelope.capture(
                session, binding, push
            )

            val identity = Gson().toJson(
                listOf(
                    session.generation,
                    session.registrationId,
                    push.bindingId,
                    push.eventId
                )
            )

            val hash = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(
                    MessageDigest.getInstance("SHA-256").digest(
                        identity.toByteArray(Charsets.UTF_8)
                    )
                )

            val builder =
                OneTimeWorkRequestBuilder<FloodWarningPushWorker>()
                    .setInputData(envelope.toWorkData())
                    .setBackoffCriteria(
                        BackoffPolicy.EXPONENTIAL,
                        60,
                        TimeUnit.SECONDS
                    )

            // Control được phép chạy offline để hủy local notification.
            if (!push.isDeactivation) {
                builder.setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
            }

            return WorkManager.getInstance(context.applicationContext)
                .enqueueUniqueWork(
                    "flood-v2-push-$hash",
                    ExistingWorkPolicy.KEEP,
                    builder.build()
                )
        }
    }

    override suspend fun doWork(): Result {
        return try {
            process()
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            retryOrFinish(error)
        }
    }

    private suspend fun process(): Result {
        val envelope = FloodWarningPushWorkEnvelope
            .fromWorkData(inputData)
            .getOrNull()
            ?: return finish("INVALID_INPUT")

        val sessionManager = SessionManager(applicationContext)
        val bindingStore = NotificationBindingStore(sessionManager)

        val session = sessionManager.getSessionSnapshot()
            ?: return finish("NO_SESSION")

        val binding = bindingStore.getConfirmed(session)

        if (!envelope.matches(session, binding)) {
            return finish("OBSOLETE_CONTEXT")
        }

        val push = envelope.push
        val receipts = FloodWarningPushReceiptStore(sessionManager)
        val notifications =
            FloodWarningLocalNotifications(applicationContext)

        if (push.isDeactivation) {
            val decision = receipts.recordDeactivation(session, push)

            if (decision == FloodWarningPushDecision.CONTROL_RECORDED) {
                if (
                    cancelIfCurrent(
                        sessionManager,
                        bindingStore,
                        session,
                        envelope,
                        notifications
                    )
                ) {
                    FloodWarningRefreshSignal.invalidate()
                }
            }

            return finish("CONTROL_PROCESSED")
        }

        val identity = NotificationInstallationStore(applicationContext)
            .getOrCreate()

        if (identity.installationId != push.installationId) {
            return finish("WRONG_INSTALLATION")
        }

        val preflight = FloodWarningPushPreflight(
            sessionManager = sessionManager,
            isLocationUsable = ::locationUsable
        )

        val preparedResult = withTimeoutOrNull(30_000L) {
            preflight.prepare(session, identity, push)
        } ?: return retryOrFinish(null)

        val error = preparedResult.exceptionOrNull()

        if (error != null) {
            if (error is HttpException && error.code() == 404) {
                if (
                    cancelIfCurrent(
                        sessionManager,
                        bindingStore,
                        session,
                        envelope,
                        notifications
                    )
                ) {
                    FloodWarningRefreshSignal.invalidate()
                }
                return finish("DETAIL_NOT_FOUND")
            }

            return retryOrFinish(error)
        }

        val prepared = preparedResult.getOrThrow()

        if (prepared.decision == FloodWarningPushCheck.ALERT_INACTIVE) {
            if (receipts.recordInactiveFromApi(session, push.alertId)) {
                if (
                    cancelIfCurrent(
                        sessionManager,
                        bindingStore,
                        session,
                        envelope,
                        notifications
                    )
                ) {
                    FloodWarningRefreshSignal.invalidate()
                }
            }

            return finish("ALERT_INACTIVE")
        }

        if (prepared.decision !in allowedDecisions) {
            return finish("PREFLIGHT_REJECTED")
        }

        val alert = prepared.alert
            ?: return finish("DETAIL_MISSING")

        if (!notifications.canPost()) {
            return finish("NOTIFICATIONS_DISABLED")
        }

        val claim = receipts.claimForDisplay(session, push)

        if (claim != FloodWarningPushDecision.CLAIMED) {
            return finish("RECEIPT_REJECTED")
        }

        val posted = receipts.postClaimedIfCurrent(
            session = session,
            push = push,
            canPost = { currentBinding ->
                envelope.matches(session, currentBinding) &&
                        notifications.canPost() &&
                        FloodWarningPushPolicy.check(
                            push = push,
                            installationId = currentBinding.installationId,
                            bindingId = currentBinding.bindingId,
                            alert = alert,
                            evaluation = prepared.evaluation,
                            latestSequence = currentBinding.sequence,
                            locationUsable = locationUsable(),
                            now = Instant.now()
                        ) in allowedDecisions
            },
            post = {
                notifications.postVerified(session, push, alert)
            }
        )

        if (posted) {
            FloodWarningRefreshSignal.invalidate()
        }

        // Không gọi retry sau khi đã claim để tự phát bù.
        return finish(
            if (posted) "LOCAL_POST_ACCEPTED" else "LOCAL_POST_SKIPPED"
        )
    }

    private suspend fun cancelIfCurrent(
        sessionManager: SessionManager,
        bindingStore: NotificationBindingStore,
        session: AuthenticatedSessionSnapshot,
        envelope: FloodWarningPushWorkEnvelope,
        notifications: FloodWarningLocalNotifications
    ): Boolean =
        sessionManager.editForCurrentSession(session) { preferences ->
            val binding = bindingStore.readConfirmed(preferences)

            if (!envelope.matches(session, binding)) {
                false
            } else {
                notifications.cancelAlert(
                    session, envelope.push.alertId
                )
                true
            }
        } ?: false

    private fun locationUsable(): Boolean {
        val permissionGranted =
            ContextCompat.checkSelfPermission(
                applicationContext,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED ||
                    ContextCompat.checkSelfPermission(
                        applicationContext,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    ) == PackageManager.PERMISSION_GRANTED

        if (!permissionGranted) return false

        val locationManager = applicationContext
            .getSystemService(LocationManager::class.java)
            ?: return false

        if (!LocationManagerCompat.isLocationEnabled(locationManager)) {
            return false
        }

        val connectivity = applicationContext
            .getSystemService(ConnectivityManager::class.java)
            ?: return false

        val network = connectivity.activeNetwork ?: return false
        val capabilities =
            connectivity.getNetworkCapabilities(network) ?: return false

        return capabilities.hasCapability(
            NetworkCapabilities.NET_CAPABILITY_INTERNET
        ) && capabilities.hasCapability(
            NetworkCapabilities.NET_CAPABILITY_VALIDATED
        )
    }

    private fun retryOrFinish(error: Throwable?): Result {
        if (error is ObsoleteNotificationSessionException) {
            return finish("OBSOLETE_CONTEXT")
        }

        val status = when (error) {
            is HttpException -> error.code()
            is FloodLocationV2ApiException -> error.httpStatus
            else -> null
        }

        val transient =
            error == null ||
                    error is IOException ||
                    status == 408 ||
                    status == 429 ||
                    (status != null && status in 500..599)

        return if (transient && runAttemptCount < 3) {
            debugLog("RETRY_SCHEDULED")
            Result.retry()
        } else {
            finish("PROCESSING_STOPPED")
        }
    }

    private fun finish(code: String): Result {
        debugLog(code)
        return Result.success()
    }

    private fun debugLog(code: String) {
        if (BuildConfig.DEBUG) {
            Log.i("FloodWarningPush", "result=$code")
        }
    }
}