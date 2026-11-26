package com.example.floodguard.core.notifications

import com.example.floodguard.data.model.FloodLocationV2Evaluation
import com.example.floodguard.data.model.FloodLocationV2Status
import com.example.floodguard.data.repository.FloodWarningV2
import java.time.Instant

enum class FloodWarningPushCheck {
    WRONG_TARGET,
    CONTROL_ONLY,
    DETAIL_REQUIRED,
    WRONG_ALERT,
    ALERT_INACTIVE,
    ALLOW_GENERAL,
    EVALUATION_REQUIRED,
    LOCATION_UNVERIFIED,
    ALLOW_NEAR,
    ALLOW_INSIDE
}

object FloodWarningPushPolicy {
    /**
     * alert/evaluation phải đến từ API mới đọc thành công.
     * Không dùng push.createdAt làm thời điểm đo GPS.
     *
     * Caller vẫn phải kiểm tra generation và claim receipt
     * ngay trước khi tạo local notification.
     */
    fun check(
        push: FloodWarningV2Push,
        installationId: String,
        bindingId: String,
        alert: FloodWarningV2?,
        evaluation: FloodLocationV2Evaluation? = null,
        latestSequence: Long = 0L,
        locationUsable: Boolean = false,
        now: Instant = Instant.now()
    ): FloodWarningPushCheck {
        if (
            push.installationId != installationId ||
            push.bindingId != bindingId
        ) {
            return FloodWarningPushCheck.WRONG_TARGET
        }

        if (push.isDeactivation) {
            return FloodWarningPushCheck.CONTROL_ONLY
        }

        if (alert == null) {
            return FloodWarningPushCheck.DETAIL_REQUIRED
        }

        if (alert.id != push.alertId) {
            return FloodWarningPushCheck.WRONG_ALERT
        }

        if (alert.status != "active") {
            return FloodWarningPushCheck.ALERT_INACTIVE
        }

        // Bản tin chung không phụ thuộc GPS.
        if (push.kind == FloodWarningV2PushKind.GENERAL) {
            return FloodWarningPushCheck.ALLOW_GENERAL
        }

        if (!locationUsable || latestSequence <= 0L) {
            return FloodWarningPushCheck.LOCATION_UNVERIFIED
        }

        if (evaluation == null) {
            return FloodWarningPushCheck.EVALUATION_REQUIRED
        }

        if (
            evaluation.installationId != installationId ||
            evaluation.bindingId != bindingId ||
            evaluation.sequence != latestSequence ||
            push.alertId !in evaluation.activeAlertIds
        ) {
            return FloodWarningPushCheck.LOCATION_UNVERIFIED
        }

        val current = evaluation.forDisplayAt(now)

        return when {
            push.kind == FloodWarningV2PushKind.NEAR &&
                    current.status == FloodLocationV2Status.NEAR ->
                FloodWarningPushCheck.ALLOW_NEAR

            push.kind == FloodWarningV2PushKind.INSIDE &&
                    current.status == FloodLocationV2Status.INSIDE ->
                FloodWarningPushCheck.ALLOW_INSIDE

            else -> FloodWarningPushCheck.LOCATION_UNVERIFIED
        }
    }
}