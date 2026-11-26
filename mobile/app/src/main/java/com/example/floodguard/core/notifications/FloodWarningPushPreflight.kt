package com.example.floodguard.core.notifications

import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.local.NotificationBindingStore
import com.example.floodguard.data.local.NotificationInstallationIdentity
import com.example.floodguard.data.local.SavedNotificationBinding
import com.example.floodguard.data.local.SessionManager
import com.example.floodguard.data.model.FloodLocationV2Evaluation
import com.example.floodguard.data.repository.FloodLocationV2Repository
import com.example.floodguard.data.repository.FloodWarningV2
import com.example.floodguard.data.repository.ObsoleteNotificationSessionException
import java.time.Instant
import kotlinx.coroutines.CancellationException

class PreparedFloodWarningPush(
    val decision: FloodWarningPushCheck,
    val alert: FloodWarningV2?,
    val evaluation: FloodLocationV2Evaluation? = null
) {
    override fun toString(): String =
        "PreparedFloodWarningPush(decision=$decision)"
}

class FloodWarningPushPreflight(
    private val sessionManager: SessionManager,

    private val isLocationUsable: () -> Boolean = { false },

    private val readAlert: suspend (
        AuthenticatedSessionSnapshot,
        String
    ) -> Result<FloodWarningV2> = { session, alertId ->
        FloodWarningPushRepositoryFactory.create(session)
            .getAlert(alertId)
    },

    private val readEvaluation: suspend (
        AuthenticatedSessionSnapshot,
        NotificationInstallationIdentity,
        SavedNotificationBinding
    ) -> Result<FloodLocationV2Evaluation> = { session, identity, binding ->
        FloodLocationV2Repository.create().getEvaluation(
            session,
            identity,
            binding,
            minimumSequence = binding.sequence
        )
    },

    private val clock: () -> Instant = { Instant.now() }
) {
    private val bindingStore = NotificationBindingStore(sessionManager)

    suspend fun prepare(
        session: AuthenticatedSessionSnapshot,
        identity: NotificationInstallationIdentity,
        push: FloodWarningV2Push
    ): Result<PreparedFloodWarningPush> {
        return try {
            val initialBinding = requireCurrentBinding(
                session, identity
            )

            if (
                push.installationId != initialBinding.installationId ||
                push.bindingId != initialBinding.bindingId
            ) {
                return Result.success(
                    PreparedFloodWarningPush(
                        FloodWarningPushCheck.WRONG_TARGET,
                        null
                    )
                )
            }

            if (push.isDeactivation) {
                return Result.success(
                    PreparedFloodWarningPush(
                        FloodWarningPushCheck.CONTROL_ONLY,
                        null
                    )
                )
            }

            // Đọc đúng ID, dùng JWT đã chụp của session.
            val detailResult = readAlert(session, push.alertId)

            var currentBinding = requireCurrentBinding(
                session,
                identity,
                initialBinding.bindingId
            )

            // 404/offline/lỗi API không được chuyển sang bản tin khác.
            val alert = detailResult.getOrThrow()

            val evaluationResult =
                if (
                    alert.id == push.alertId &&
                    alert.status == "active" &&
                    push.requiresLocationEvaluation &&
                    currentBinding.sequence > 0L &&
                    isLocationUsable()
                ) {
                    readEvaluation(session, identity, currentBinding)
                } else {
                    null
                }

            // GPS/token/session có thể thay đổi trong lúc chờ API.
            currentBinding = requireCurrentBinding(
                session,
                identity,
                initialBinding.bindingId
            )

            val evaluation = evaluationResult?.getOrThrow()

            val decision = FloodWarningPushPolicy.check(
                push = push,
                installationId = currentBinding.installationId,
                bindingId = currentBinding.bindingId,
                alert = alert,
                evaluation = evaluation,
                latestSequence = currentBinding.sequence,
                locationUsable = isLocationUsable(),
                now = clock()
            )

            Result.success(
                PreparedFloodWarningPush(decision, alert, evaluation)
            )
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Result.failure(error)
        }
    }

    private suspend fun requireCurrentBinding(
        session: AuthenticatedSessionSnapshot,
        identity: NotificationInstallationIdentity,
        expectedBindingId: String? = null
    ): SavedNotificationBinding {
        if (
            session.user.role != "resident" ||
            session.user.id.isNullOrBlank()
        ) {
            throw ObsoleteNotificationSessionException()
        }

        val binding = bindingStore.getConfirmed(session)
            ?: throw ObsoleteNotificationSessionException()

        if (
            binding.installationId != identity.installationId ||
            (
                    expectedBindingId != null &&
                            binding.bindingId != expectedBindingId
                    )
        ) {
            throw ObsoleteNotificationSessionException()
        }

        return binding
    }
}