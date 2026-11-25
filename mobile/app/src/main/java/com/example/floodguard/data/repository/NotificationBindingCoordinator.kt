package com.example.floodguard.data.repository

import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.local.NotificationBindingStore
import com.example.floodguard.data.local.NotificationInstallationIdentity
import com.example.floodguard.data.local.SessionManager
import com.example.floodguard.data.remote.api.NotificationDeviceRegistration
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

data class NotificationBindingSyncResult(
    val device: ConfirmedNotificationDevice,
    val requestedStateApplied: Boolean
)

class ObsoleteNotificationSessionException :
    IllegalStateException("Thao tác thiết bị thuộc phiên đã kết thúc.")

class NotificationBindingCoordinator(
    private val sessionManager: SessionManager,
    private val bindingStore: NotificationBindingStore,
    private val repository: NotificationDeviceRepository
) {
    companion object {
        // Dùng chung trong process, kể cả khi có nhiều instance.
        private val requestMutex = Mutex()
    }

    /*
     * Đầu vào phải được bộ quản lý phiên chốt cho phiên hiện tại.
     * Không gọi trực tiếp từ callback Firebase chưa kiểm tra phiên.
     *
     * Nếu có body pending, chỉ hoàn tất đúng body đó.
     * Không tự thay token/quyền hoặc expectedRevision trong lần retry.
     */
    suspend fun synchronize(
        session: AuthenticatedSessionSnapshot,
        identity: NotificationInstallationIdentity,
        fcmToken: String?,
        notificationPermission: String
    ): Result<NotificationBindingSyncResult> {
        return try {
            val result = requestMutex.withLock {
                requireCurrent(session)
                bindingStore.getBlockingFailure(session)?.let {
                    throw it
                }

                val retryAt =
                    bindingStore.getNextRegistrationAttemptAt(session)

                if (retryAt > System.currentTimeMillis()) {
                    throw NotificationBindingRetryDeferredException(
                        retryAtMillis = retryAt
                    )
                }
                requireCurrent(session)
                require(session.user.role == "resident")
                require(!session.user.id.isNullOrBlank())

                // Kiểm tra đầu vào trước khi gọi mạng.
                NotificationDeviceRegistration(
                    fcmToken = fcmToken,
                    notificationPermission = notificationPermission,
                    registrationId = session.registrationId,
                    expectedBindingId = null,
                    expectedRevision = 0
                ).toJson()

                val pending = bindingStore.getPending(session)
                requireCurrent(session)

                val registration = if (pending != null) {
                    check(
                        pending.installationId == identity.installationId
                    ) {
                        "Installation không khớp thao tác đang chờ."
                    }

                    pending.registration
                } else {
                    val installationResult = recordRequestOutcome(session) {
                        repository.getInstallation(
                            session = session,
                            identity = identity
                        )
                    }

                    requireCurrent(session)
                    val installation = installationResult.getOrThrow()

                    val request = NotificationDeviceRegistration(
                        fcmToken = fcmToken,
                        notificationPermission = notificationPermission,
                        registrationId = session.registrationId,
                        expectedBindingId = installation.bindingId,
                        expectedRevision = installation.revision
                    )

                    val saved = bindingStore.savePending(
                        session = session,
                        installationId = identity.installationId,
                        registration = request
                    )

                    if (!saved) {
                        throw ObsoleteNotificationSessionException()
                    }

                    request
                }

                requireCurrent(session)

                val response = recordRequestOutcome(session) {
                    repository.register(
                        session = session,
                        identity = identity,
                        registration = registration
                    )
                }

                if (!sessionManager.isCurrentSession(session)) {
                    // Nếu đã nhận được binding của thao tác cũ,
                    // thử hủy đúng binding đó bằng JWT đã chốt.
                    response.getOrNull()?.let { device ->
                        cleanupObsoleteBinding(session, identity, device)
                    }
                    throw ObsoleteNotificationSessionException()
                }

                val device = response.getOrThrow()

                val confirmed = bindingStore.confirm(
                    session = session,
                    installationId = identity.installationId,
                    registration = registration,
                    device = device
                )

                if (!confirmed) {
                    if (!sessionManager.isCurrentSession(session)) {
                        cleanupObsoleteBinding(session, identity, device)
                    }
                    throw ObsoleteNotificationSessionException()
                }

                NotificationBindingSyncResult(
                    device = device,
                    requestedStateApplied =
                        registration.fcmToken == fcmToken &&
                                registration.notificationPermission ==
                                notificationPermission
                )
            }

            Result.success(result)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            // Giữ pending để đối chiếu/retry nguyên thao tác.
            // Không tự GET revision mới rồi gửi lại sau lỗi.
            Result.failure(error)
        }
    }

    suspend fun logout(
        session: AuthenticatedSessionSnapshot,
        identity: NotificationInstallationIdentity?
    ): Result<NotificationLogoutResult> {
        return try {
            val ended = bindingStore.endSession(session)
                ?: throw ObsoleteNotificationSessionException()

            val binding = ended.binding

            if (binding == null) {
                return Result.success(
                    NotificationLogoutResult(
                        remoteStatus =
                            NotificationRemoteLogoutStatus.NOT_ATTEMPTED
                    )
                )
            }

            if (
                identity == null ||
                identity.installationId != binding.installationId
            ) {
                return Result.success(
                    NotificationLogoutResult(
                        remoteStatus =
                            NotificationRemoteLogoutStatus.FAILED,
                        errorCode = "LOCAL_INSTALLATION_UNAVAILABLE"
                    )
                )
            }

            val remoteResult = withContext(NonCancellable) {
                withTimeoutOrNull(10_000L) {
                    repository.deleteBinding(
                        session = session,
                        identity = identity,
                        bindingId = binding.bindingId
                    )
                }
            }

            if (remoteResult != null && remoteResult.isSuccess) {
                Result.success(
                    NotificationLogoutResult(
                        remoteStatus =
                            NotificationRemoteLogoutStatus.UNBOUND
                    )
                )
            } else {
                val apiError = remoteResult
                    ?.exceptionOrNull() as? NotificationDeviceApiException

                Result.success(
                    NotificationLogoutResult(
                        remoteStatus =
                            NotificationRemoteLogoutStatus.FAILED,
                        errorCode = apiError?.errorCode
                    )
                )
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Result.failure(error)
        }
    }

    private suspend fun <T> recordRequestOutcome(
        session: AuthenticatedSessionSnapshot,
        request: suspend () -> Result<T>
    ): Result<T> {
        val result = request()

        val error = result.exceptionOrNull()
                as? NotificationDeviceApiException

        if (error != null) {
            bindingStore.recordRegistrationFailure(
                session = session,
                httpStatus = error.httpStatus,
                errorCode = error.errorCode,
                retryAfterMillis = error.retryAfterMillis
            )
        }

        return result
    }

    private suspend fun requireCurrent(
        session: AuthenticatedSessionSnapshot
    ) {
        if (!sessionManager.isCurrentSession(session)) {
            throw ObsoleteNotificationSessionException()
        }
    }

    private suspend fun cleanupObsoleteBinding(
        session: AuthenticatedSessionSnapshot,
        identity: NotificationInstallationIdentity,
        device: ConfirmedNotificationDevice
    ) {
        withContext(NonCancellable) {
            withTimeoutOrNull(5_000L) {
                repository.deleteBinding(
                    session = session,
                    identity = identity,
                    bindingId = device.bindingId
                )
            }
        }
    }
}

class NotificationBindingRetryDeferredException(
    val retryAtMillis: Long
) : IllegalStateException("Chưa đến thời điểm thử lại đăng ký thiết bị.")

enum class NotificationRemoteLogoutStatus {
    NOT_ATTEMPTED,
    UNBOUND,
    FAILED
}

data class NotificationLogoutResult(
    val remoteStatus: NotificationRemoteLogoutStatus,
    val errorCode: String? = null
)