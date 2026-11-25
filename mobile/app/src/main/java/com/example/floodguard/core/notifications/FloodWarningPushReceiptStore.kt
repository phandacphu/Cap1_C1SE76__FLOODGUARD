package com.example.floodguard.core.notifications

import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.stringSetPreferencesKey
import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.local.NotificationBindingStore
import com.example.floodguard.data.local.SessionManager
import com.example.floodguard.data.local.SavedNotificationBinding
import com.google.gson.Gson
import java.security.MessageDigest

enum class FloodWarningPushDecision {
    CLAIMED,
    DUPLICATE,
    NEAR_SUPPRESSED,
    ALERT_INACTIVE,
    WRONG_TARGET,
    OBSOLETE_SESSION,
    CONTROL_ONLY,
    CONTROL_RECORDED
}

class FloodWarningPushReceiptStore(
    private val sessionManager: SessionManager
) {
    private val bindingStore = NotificationBindingStore(sessionManager)

    companion object {
        // Không đưa các key này vào hàm clear session/binding.
        private val EVENTS =
            stringSetPreferencesKey("warning_v2_display_decisions")
        private val POST_ATTEMPTS =
            stringSetPreferencesKey("warning_v2_post_attempts")
        private val INSIDE_ALERTS =
            stringSetPreferencesKey("warning_v2_inside_alerts")
        private val INACTIVE_ALERTS =
            stringSetPreferencesKey("warning_v2_inactive_alerts")

        private val gson = Gson()

        private fun fingerprint(
            domain: String,
            accountId: String,
            id: String
        ): String {
            val bytes = gson.toJson(
                listOf(domain, accountId, id)
            ).toByteArray(Charsets.UTF_8)

            val digest = MessageDigest.getInstance("SHA-256")
                .digest(bytes)

            val alphabet = "0123456789abcdef"

            return buildString(digest.size * 2) {
                digest.forEach { byte ->
                    val value = byte.toInt() and 0xff
                    append(alphabet[value ushr 4])
                    append(alphabet[value and 0x0f])
                }
            }
        }
    }

    /**
     * Chỉ gọi sau khi đã xác minh detail đang active và,
     * với near/inside, evaluation hiện tại còn hợp lệ.
     *
     * CLAIMED là đã ghi quyết định hiển thị.
     * Không phải bằng chứng NotificationManager hay điện thoại đã hiện.
     */
    suspend fun claimForDisplay(
        session: AuthenticatedSessionSnapshot,
        push: FloodWarningV2Push
    ): FloodWarningPushDecision =
        withCurrentTarget(session, push) { preferences, accountId ->
            if (push.isDeactivation) {
                return@withCurrentTarget FloodWarningPushDecision.CONTROL_ONLY
            }

            val eventKey = fingerprint(
                "event", accountId, push.eventId
            )
            val alertKey = fingerprint(
                "alert", accountId, push.alertId
            )

            if (alertKey in preferences[INACTIVE_ALERTS].orEmpty()) {
                return@withCurrentTarget FloodWarningPushDecision.ALERT_INACTIVE
            }

            if (eventKey in preferences[EVENTS].orEmpty()) {
                return@withCurrentTarget FloodWarningPushDecision.DUPLICATE
            }

            if (
                push.kind == FloodWarningV2PushKind.NEAR &&
                alertKey in preferences[INSIDE_ALERTS].orEmpty()
            ) {
                return@withCurrentTarget FloodWarningPushDecision.NEAR_SUPPRESSED
            }

            preferences[EVENTS] =
                preferences[EVENTS].orEmpty() + eventKey

            if (push.kind == FloodWarningV2PushKind.INSIDE) {
                preferences[INSIDE_ALERTS] =
                    preferences[INSIDE_ALERTS].orEmpty() + alertKey
            }

            FloodWarningPushDecision.CLAIMED
        }

    /**
     * Control chỉ hủy/đồng bộ, không đi qua claim hiển thị.
     * Receiver vẫn phải hủy local notification theo alertId.
     */
    suspend fun recordDeactivation(
        session: AuthenticatedSessionSnapshot,
        push: FloodWarningV2Push
    ): FloodWarningPushDecision {
        require(push.isDeactivation)

        return withCurrentTarget(session, push) { preferences, accountId ->
            val alertKey = fingerprint(
                "alert", accountId, push.alertId
            )

            preferences[INACTIVE_ALERTS] =
                preferences[INACTIVE_ALERTS].orEmpty() + alertKey

            FloodWarningPushDecision.CONTROL_RECORDED
        }
    }

    /**
     * Dùng khi GET detail/list xác nhận bản tin đã inactive.
     * Không phụ thuộc quyền GPS hoặc binding thiết bị.
     */
    suspend fun recordInactiveFromApi(
        session: AuthenticatedSessionSnapshot,
        alertId: String
    ): Boolean {
        require(alertId.isNotBlank())

        val accountId = session.user.id
        if (
            session.user.role != "resident" ||
            accountId.isNullOrBlank()
        ) {
            return false
        }

        return sessionManager.editForCurrentSession(session) { preferences ->
            val alertKey = fingerprint("alert", accountId, alertId)

            preferences[INACTIVE_ALERTS] =
                preferences[INACTIVE_ALERTS].orEmpty() + alertKey

            true
        } ?: false
    }

    /**
     * Chỉ gọi sau khi claimForDisplay() trả CLAIMED.
     *
     * Kiểm tra phiên/binding, trạng thái inactive và thao tác post
     * cùng trong giao dịch DataStore để không xen logout/đổi binding.
     *
     * Hai callback phải đồng bộ, không gọi lại DataStore.
     */
    internal suspend fun postClaimedIfCurrent(
        session: AuthenticatedSessionSnapshot,
        push: FloodWarningV2Push,
        canPost: (SavedNotificationBinding) -> Boolean,
        post: () -> Boolean
    ): Boolean {
        val accountId = session.user.id

        if (
            session.user.role != "resident" ||
            accountId.isNullOrBlank() ||
            push.isDeactivation
        ) {
            return false
        }

        return sessionManager.editForCurrentSession(session) { preferences ->
            val binding = bindingStore.readConfirmed(preferences)
                ?: return@editForCurrentSession false

            if (
                binding.installationId != push.installationId ||
                binding.bindingId != push.bindingId
            ) {
                return@editForCurrentSession false
            }

            val eventKey = fingerprint("event", accountId, push.eventId)
            val alertKey = fingerprint("alert", accountId, push.alertId)

            if (
                eventKey !in preferences[EVENTS].orEmpty() ||
                eventKey in preferences[POST_ATTEMPTS].orEmpty() ||
                alertKey in preferences[INACTIVE_ALERTS].orEmpty()
            ) {
                return@editForCurrentSession false
            }

            if (
                push.kind == FloodWarningV2PushKind.NEAR &&
                alertKey in preferences[INSIDE_ALERTS].orEmpty()
            ) {
                return@editForCurrentSession false
            }

            // Worker sẽ kiểm tra lại quyền, GPS, sequence và validUntil ở đây.
            if (!canPost(binding)) {
                return@editForCurrentSession false
            }

            preferences[POST_ATTEMPTS] =
                preferences[POST_ATTEMPTS].orEmpty() + eventKey

            post()
        } ?: false
    }

    private suspend fun withCurrentTarget(
        session: AuthenticatedSessionSnapshot,
        push: FloodWarningV2Push,
        block: (
            MutablePreferences,
            String
        ) -> FloodWarningPushDecision
    ): FloodWarningPushDecision {
        val accountId = session.user.id

        if (
            session.user.role != "resident" ||
            accountId.isNullOrBlank()
        ) {
            return FloodWarningPushDecision.OBSOLETE_SESSION
        }

        // Kiểm tra phiên, đọc binding và ghi receipt
        // cùng một giao dịch DataStore.
        return sessionManager.editForCurrentSession(session) { preferences ->
            val binding = bindingStore.readConfirmed(preferences)

            if (
                binding == null ||
                binding.installationId != push.installationId ||
                binding.bindingId != push.bindingId
            ) {
                FloodWarningPushDecision.WRONG_TARGET
            } else {
                block(preferences, accountId)
            }
        } ?: FloodWarningPushDecision.OBSOLETE_SESSION
    }
}