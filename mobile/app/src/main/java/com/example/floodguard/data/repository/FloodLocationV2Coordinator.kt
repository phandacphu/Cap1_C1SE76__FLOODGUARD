package com.example.floodguard.data.repository

import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.local.NotificationBindingStore
import com.example.floodguard.data.local.NotificationInstallationIdentity
import com.example.floodguard.data.local.SavedNotificationBinding
import com.example.floodguard.data.model.FloodLocationUnavailableReason
import com.example.floodguard.data.model.FloodLocationV2Evaluation
import com.example.floodguard.data.model.FloodLocationV2Fix
import com.example.floodguard.data.model.FloodLocationV2Upload
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class ObsoleteFloodLocationContextException :
    Exception("Phiên, binding hoặc mẫu vị trí đã thay đổi.")

class FloodLocationV2Coordinator(
    private val bindingStore: NotificationBindingStore,
    private val repository: FloodLocationV2Repository,
    private val clockMillis: () -> Long = { System.currentTimeMillis() }
) {
    companion object {
        // Các thao tác vị trí phải tuần tự, kể cả khi vô tình tạo nhiều instance.
        private val requestMutex = Mutex()
    }

    suspend fun uploadAvailable(
        session: AuthenticatedSessionSnapshot,
        identity: NotificationInstallationIdentity,
        binding: SavedNotificationBinding,
        fix: FloodLocationV2Fix
    ): Result<FloodLocationV2Evaluation> = execute {
        requestMutex.withLock {
            requireCurrentBinding(session, identity, binding)

            // Kiểm tra sau khi lấy mutex để không gửi mẫu đã hết hạn khi chờ.
            val now = clockMillis()
            require(
                fix.capturedAtEpochMillis <= now &&
                        now - fix.capturedAtEpochMillis <= 60_000L
            ) {
                "Cần lấy mẫu GPS mới."
            }

            uploadNewSample(session, identity, binding) { sequence ->
                FloodLocationV2Upload.available(sequence, fix)
            }
        }
    }

    suspend fun uploadUnavailable(
        session: AuthenticatedSessionSnapshot,
        identity: NotificationInstallationIdentity,
        binding: SavedNotificationBinding,
        reason: FloodLocationUnavailableReason
    ): Result<FloodLocationV2Evaluation> = execute {
        requestMutex.withLock {
            uploadNewSample(session, identity, binding) { sequence ->
                FloodLocationV2Upload.unavailable(sequence, reason)
            }
        }
    }

    suspend fun getEvaluation(
        session: AuthenticatedSessionSnapshot,
        identity: NotificationInstallationIdentity,
        binding: SavedNotificationBinding
    ): Result<FloodLocationV2Evaluation> = execute {
        requestMutex.withLock {
            val current = requireCurrentBinding(
                session, identity, binding
            )

            val evaluation = repository.getEvaluation(
                session,
                identity,
                current,
                minimumSequence = current.sequence
            ).getOrThrow()

            requireCurrentEvaluation(
                session, identity, binding, evaluation
            )

            evaluation
        }
    }

    private suspend fun uploadNewSample(
        session: AuthenticatedSessionSnapshot,
        identity: NotificationInstallationIdentity,
        binding: SavedNotificationBinding,
        createBody: (Long) -> FloodLocationV2Upload
    ): FloodLocationV2Evaluation {
        val current = requireCurrentBinding(
            session, identity, binding
        )

        // Lưu sequence trước HTTP. Không hoàn tác khi timeout/cancel.
        val sequence = bindingStore.nextLocationSequence(
            session,
            identity.installationId,
            current.bindingId
        ) ?: throw ObsoleteFloodLocationContextException()

        val body = createBody(sequence)

        // Phiên/binding có thể thay đổi trong lúc ghi DataStore.
        val allocated = requireCurrentBinding(
            session, identity, binding
        )

        if (allocated.sequence != sequence) {
            throw ObsoleteFloodLocationContextException()
        }

        val evaluation = repository.uploadLocation(
            session,
            identity,
            allocated,
            body
        ).getOrThrow()

        requireCurrentEvaluation(
            session, identity, binding, evaluation
        )

        return evaluation
    }

    private suspend fun requireCurrentBinding(
        session: AuthenticatedSessionSnapshot,
        identity: NotificationInstallationIdentity,
        expected: SavedNotificationBinding
    ): SavedNotificationBinding {
        // getConfirmed() đã kiểm tra generation/registration/account/token.
        val current = bindingStore.getConfirmed(session)
            ?: throw ObsoleteFloodLocationContextException()

        if (
            expected.installationId != identity.installationId ||
            current.installationId != identity.installationId ||
            current.bindingId != expected.bindingId
        ) {
            throw ObsoleteFloodLocationContextException()
        }

        return current
    }

    private suspend fun requireCurrentEvaluation(
        session: AuthenticatedSessionSnapshot,
        identity: NotificationInstallationIdentity,
        binding: SavedNotificationBinding,
        evaluation: FloodLocationV2Evaluation
    ) {
        val current = requireCurrentBinding(
            session, identity, binding
        )

        val sequenceMatches =
            if (current.sequence == 0L) {
                evaluation.sequence == null
            } else {
                evaluation.sequence == current.sequence
            }

        if (
            evaluation.installationId != current.installationId ||
            evaluation.bindingId != current.bindingId ||
            !sequenceMatches
        ) {
            throw ObsoleteFloodLocationContextException()
        }
    }

    private suspend fun <T> execute(
        block: suspend () -> T
    ): Result<T> = try {
        Result.success(block())
    } catch (error: CancellationException) {
        throw error
    } catch (error: Exception) {
        Result.failure(error)
    }
}