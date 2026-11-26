package com.example.floodguard.core.notifications

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.example.floodguard.BuildConfig
import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.local.NotificationBindingStore
import com.example.floodguard.data.local.NotificationInstallationIdentity
import com.example.floodguard.data.local.NotificationInstallationStore
import com.example.floodguard.data.local.SessionManager
import com.example.floodguard.data.repository.NotificationBindingCoordinator
import com.example.floodguard.data.repository.NotificationBindingRetryDeferredException
import com.example.floodguard.data.repository.NotificationDeviceApiException
import com.example.floodguard.data.repository.NotificationDeviceRepository
import com.example.floodguard.data.repository.ObsoleteNotificationSessionException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class NotificationDevicePhase {
    DISABLED,
    REGISTERING,
    BOUND,
    WAITING_TO_RETRY,
    ERROR
}

data class NotificationDeviceRuntimeState(
    val phase: NotificationDevicePhase = NotificationDevicePhase.DISABLED,
    val generation: Long? = null,
    val revision: Long? = null,
    val pushEligible: Boolean = false,
    val errorCode: String? = null
)

class NotificationDeviceRuntime private constructor(context: Context) {

    companion object {
        @Volatile
        private var instance: NotificationDeviceRuntime? = null

        fun get(context: Context): NotificationDeviceRuntime =
            instance ?: synchronized(this) {
                instance ?: NotificationDeviceRuntime(
                    context.applicationContext
                ).also {
                    instance = it
                }
            }
    }

    private val appContext = context.applicationContext
    private val sessionManager = SessionManager(appContext)
    private val installationStore = NotificationInstallationStore(appContext)
    private val bindingStore = NotificationBindingStore(sessionManager)

    private val coordinator = NotificationBindingCoordinator(
        sessionManager = sessionManager,
        bindingStore = bindingStore,
        repository = NotificationDeviceRepository.create()
    )

    private val scope = CoroutineScope(
        SupervisorJob() + Dispatchers.Main.immediate
    )

    private val mutableState =
        MutableStateFlow(NotificationDeviceRuntimeState())

    val state = mutableState.asStateFlow()

    private var isForeground = false

    private val warningLocation = ResidentFloodLocationRuntime(
        context = appContext,
        sessionManager = sessionManager,
        bindingStore = bindingStore,
        scope = scope
    )

    val locationState = warningLocation.state

    private var started = false
    private var cachedIdentity: NotificationInstallationIdentity? = null

    // Các biến dưới đây chỉ được thao tác trên Main dispatcher.
    private val inProgress = mutableSetOf<Long>()
    private val refreshRequested = mutableSetOf<Long>()
    private val loggingOut = mutableSetOf<Long>()

    private var successfulPermission: Pair<Long, String>? = null
    private var successfulToken: Pair<Long, String?>? = null
    private var localRetry: Pair<Long, Long>? = null

    @Synchronized
    fun start() {
        if (started) return
        started = true

        scope.launch {
            try {
                // Khởi tạo registration một lần cho phiên cũ nếu cần.
                sessionManager.getSessionSnapshot()

                sessionManager.authenticatedSessionFlow.collect { session ->
                    warningLocation.stop()
                    successfulPermission = null
                    successfulToken = null
                    localRetry = null

                    if (
                        session == null ||
                        session.user.role != "resident" ||
                        session.user.id.isNullOrBlank()
                    ) {
                        publish(NotificationDeviceRuntimeState())
                    } else {
                        enqueue(session)
                    }
                }
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                publish(
                    NotificationDeviceRuntimeState(
                        phase = NotificationDevicePhase.ERROR,
                        errorCode = "SESSION_STORAGE_ERROR"
                    )
                )
            }
        }
    }

    fun onResume() {
        isForeground = true
        start()

        scope.launch {
            try {
                val session = sessionManager.getSessionSnapshot()
                    ?: return@launch

                if (
                    session.user.role == "resident" &&
                    !session.user.id.isNullOrBlank()
                ) {
                    enqueue(session)
                }
                startLocationFor(session)
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                debugLog("resume_session_read_failed")
            }
        }
    }

    fun refreshLocation() {
        if (!isForeground) return

        warningLocation.stop()

        scope.launch {
            try {
                val session = sessionManager.getSessionSnapshot()
                    ?: return@launch

                if (
                    session.user.role != "resident" ||
                    session.user.id.isNullOrBlank()
                ) {
                    return@launch
                }

                enqueue(session)
                startLocationFor(session)
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                debugLog("location_refresh_failed")
            }
        }
    }

    fun onPause() {
        isForeground = false
        warningLocation.stop()
    }

    private suspend fun startLocationFor(
        session: AuthenticatedSessionSnapshot
    ) {
        fun bindingReady(): Boolean =
            isForeground &&
                    session.generation !in loggingOut &&
                    mutableState.value.phase == NotificationDevicePhase.BOUND &&
                    mutableState.value.generation == session.generation

        if (!bindingReady()) return
        if (!sessionManager.isCurrentSession(session)) return

        val identity = loadIdentity()
        val binding = bindingStore.getConfirmed(session) ?: return

        if (!sessionManager.isCurrentSession(session)) return
        if (!bindingReady()) return

        warningLocation.start(session, identity, binding)
    }

    private fun enqueue(session: AuthenticatedSessionSnapshot) {
        val generation = session.generation
        if (generation in loggingOut) return

        if (!inProgress.add(generation)) {
            refreshRequested.add(generation)
            return
        }

        scope.launch {
            try {
                if (!sessionManager.isCurrentSession(session)) {
                    return@launch
                }

                val permission = readNotificationPermission()

                val fcmToken = FcmTokenReader.read(appContext)

                if (
                    !sessionManager.isCurrentSession(session) ||
                    generation in loggingOut
                ) {
                    return@launch
                }

                if (
                    mutableState.value.phase == NotificationDevicePhase.BOUND &&
                    successfulPermission == (generation to permission) &&
                    successfulToken == (generation to fcmToken)
                ) {
                    return@launch
                }

                val retry = localRetry
                if (
                    retry != null &&
                    retry.first == generation &&
                    SystemClock.elapsedRealtime() < retry.second
                ) {
                    publishFor(
                        session,
                        NotificationDeviceRuntimeState(
                            phase = NotificationDevicePhase.WAITING_TO_RETRY,
                            generation = generation,
                            errorCode = "LOCAL_RETRY_DELAY"
                        )
                    )
                    return@launch
                }

                publishFor(
                    session,
                    NotificationDeviceRuntimeState(
                        phase = NotificationDevicePhase.REGISTERING,
                        generation = generation
                    )
                )

                val identity = loadIdentity()

                if (
                    !sessionManager.isCurrentSession(session) ||
                    generation in loggingOut
                ) {
                    return@launch
                }

                val result = coordinator.synchronize(
                    session = session,
                    identity = identity,
                    fcmToken = fcmToken,
                    notificationPermission = permission
                )

                if (
                    !sessionManager.isCurrentSession(session) ||
                    generation in loggingOut
                ) {
                    return@launch
                }

                val synced = result.getOrNull()

                if (synced != null) {
                    localRetry = null

                    successfulPermission =
                        if (synced.requestedStateApplied) {
                            generation to permission
                        } else {
                            null
                        }

                    successfulToken =
                        if (synced.requestedStateApplied) {
                            generation to fcmToken
                        } else {
                            null
                        }

                    publishFor(
                        session,
                        NotificationDeviceRuntimeState(
                            phase = NotificationDevicePhase.BOUND,
                            generation = generation,
                            revision = synced.device.revision,
                            pushEligible = synced.device.pushEligible
                        )
                    )

                    startLocationFor(session)

                    if (
                        !synced.requestedStateApplied ||
                        readNotificationPermission() != permission
                    ) {
                        refreshRequested.add(generation)
                    }
                } else {
                    val error = result.exceptionOrNull()

                    when (error) {
                        is ObsoleteNotificationSessionException -> Unit

                        is NotificationBindingRetryDeferredException ->
                            publishFor(
                                session,
                                NotificationDeviceRuntimeState(
                                    phase =
                                        NotificationDevicePhase.WAITING_TO_RETRY,
                                    generation = generation,
                                    errorCode = "RETRY_DEFERRED"
                                )
                            )

                        else -> {
                            val apiError =
                                error as? NotificationDeviceApiException

                            if (apiError == null) {
                                localRetry = generation to (
                                        SystemClock.elapsedRealtime() + 60_000L
                                        )
                            }

                            publishFor(
                                session,
                                NotificationDeviceRuntimeState(
                                    phase = NotificationDevicePhase.ERROR,
                                    generation = generation,
                                    errorCode = apiError?.errorCode
                                        ?: apiError?.let {
                                            "HTTP_${it.httpStatus}"
                                        }
                                        ?: "DEVICE_SYNC_FAILED"
                                )
                            )
                        }
                    }
                }
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                localRetry = generation to (
                        SystemClock.elapsedRealtime() + 60_000L
                        )

                publishFor(
                    session,
                    NotificationDeviceRuntimeState(
                        phase = NotificationDevicePhase.ERROR,
                        generation = generation,
                        errorCode = "INSTALLATION_OR_STORAGE_ERROR"
                    )
                )
            } finally {
                inProgress.remove(generation)

                if (
                    refreshRequested.remove(generation) &&
                    generation !in loggingOut
                ) {
                    enqueue(session)
                }
            }
        }
    }

    suspend fun logout(
        session: AuthenticatedSessionSnapshot
    ): Result<Unit> = withContext(
        Dispatchers.Main.immediate + NonCancellable
    ) {
        if (!sessionManager.isCurrentSession(session)) {
            return@withContext Result.failure<Unit>(
                ObsoleteNotificationSessionException()
            )
        }

        loggingOut.add(session.generation)
        warningLocation.stop()
        FloodWarningOpenInbox.discardGeneration(session.generation)
        successfulPermission = null
        successfulToken = null
        localRetry = null
        publish(NotificationDeviceRuntimeState())

        try {
            val identity = try {
                loadIdentity()
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                null
            }

            val result = coordinator.logout(
                session = session,
                identity = identity,
                onLocalSessionEnded = {
                    FloodWarningLocalNotifications(appContext)
                        .cancelAccount(session)
                }
            )

            result.fold(
                onSuccess = { outcome ->
                    debugLog(
                        "logout_remote=${outcome.remoteStatus.name}"
                    )

                    // Không để callback logout cũ điều hướng phiên mới.
                    if (sessionManager.isLoggedIn()) {
                        Result.failure<Unit>(
                            ObsoleteNotificationSessionException()
                        )
                    } else {
                        Result.success(Unit)
                    }
                },
                onFailure = {
                    Result.failure(it)
                }
            )
        } finally {
            loggingOut.remove(session.generation)
        }
    }

    private suspend fun loadIdentity(): NotificationInstallationIdentity {
        cachedIdentity?.let { return it }

        return installationStore.getOrCreate().also {
            cachedIdentity = it
        }
    }

    private fun readNotificationPermission(): String =
        if (FloodWarningLocalNotifications(appContext).canPost()) {
            "granted"
        } else {
            "denied"
        }

    private suspend fun publishFor(
        session: AuthenticatedSessionSnapshot,
        value: NotificationDeviceRuntimeState
    ) {
        if (
            sessionManager.isCurrentSession(session) &&
            session.generation !in loggingOut
        ) {
            publish(value)
        }
    }

    private fun publish(value: NotificationDeviceRuntimeState) {
        mutableState.value = value

        val safeCode = value.errorCode
            ?.takeIf { it.matches(Regex("[A-Z][A-Z0-9_]{0,79}")) }
            ?: "none"

        debugLog(
            "phase=${value.phase}; " +
                    "generation=${value.generation}; " +
                    "revision=${value.revision}; " +
                    "pushEligible=${value.pushEligible}; " +
                    "code=$safeCode"
        )
    }

    private fun debugLog(message: String) {
        if (BuildConfig.DEBUG) {
            Log.i("NotificationBinding", message)
        }
    }
}