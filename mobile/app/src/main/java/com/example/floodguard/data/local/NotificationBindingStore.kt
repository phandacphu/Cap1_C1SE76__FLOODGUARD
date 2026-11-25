package com.example.floodguard.data.local

import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import com.example.floodguard.data.remote.api.NotificationDeviceRegistration
import com.example.floodguard.data.repository.ConfirmedNotificationDevice
import com.example.floodguard.data.repository.NotificationDeviceApiException
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser

data class SavedNotificationBinding(
    val installationId: String,
    val bindingId: String,
    val revision: Long,
    val sequence: Long
)

class PendingDeviceRegistration(
    val installationId: String,
    val registration: NotificationDeviceRegistration
) {
    override fun toString(): String =
        "PendingDeviceRegistration(redacted)"
}

class NotificationBindingStore(
    private val sessionManager: SessionManager
) {
    companion object {
        private val INSTALLATION_ID =
            stringPreferencesKey("notification_binding_installation")
        private val BINDING_ID =
            stringPreferencesKey("notification_binding_id")
        private val REVISION =
            longPreferencesKey("notification_binding_revision")
        private val SEQUENCE =
            longPreferencesKey("notification_location_sequence")

        private val PENDING_INSTALLATION_ID =
            stringPreferencesKey("notification_pending_installation")
        private val PENDING_BODY =
            stringPreferencesKey("notification_pending_registration")
        private val BLOCKED_HTTP =
            longPreferencesKey("notification_registration_blocked_http")
        private val BLOCKED_CODE =
            stringPreferencesKey("notification_registration_blocked_code")
        private val NEXT_RETRY_AT =
            longPreferencesKey("notification_registration_retry_at")

        internal fun clear(preferences: MutablePreferences) {
            preferences.remove(INSTALLATION_ID)
            preferences.remove(BINDING_ID)
            preferences.remove(REVISION)
            preferences.remove(SEQUENCE)
            preferences.remove(PENDING_INSTALLATION_ID)
            preferences.remove(PENDING_BODY)
            preferences.remove(BLOCKED_HTTP)
            preferences.remove(BLOCKED_CODE)
            preferences.remove(NEXT_RETRY_AT)
        }
    }

    suspend fun endSession(
        session: AuthenticatedSessionSnapshot
    ): NotificationLogoutSnapshot? =
        sessionManager.endCurrentSession(session) { preferences ->
            NotificationLogoutSnapshot(
                binding = readConfirmed(preferences)
            )
        }

    suspend fun getConfirmed(
        session: AuthenticatedSessionSnapshot
    ): SavedNotificationBinding? =
        sessionManager.readForCurrentSession(session) {
            readConfirmed(it)
        }

    suspend fun getPending(
        session: AuthenticatedSessionSnapshot
    ): PendingDeviceRegistration? =
        sessionManager.readForCurrentSession(session) { preferences ->
            val raw = preferences[PENDING_BODY]
                ?: return@readForCurrentSession null

            val installationId = requireNotNull(
                preferences[PENDING_INSTALLATION_ID]
            )

            val registration = decodeRegistration(raw)
            require(registration.registrationId == session.registrationId)

            PendingDeviceRegistration(
                installationId = installationId,
                registration = registration
            )
        }

    /*
     * Phải lưu trước khi gửi PUT.
     * Không ghi đè body chưa được xác nhận bằng token/quyền mới.
     */
    suspend fun savePending(
        session: AuthenticatedSessionSnapshot,
        installationId: String,
        registration: NotificationDeviceRegistration
    ): Boolean {
        require(installationId.isNotBlank())
        require(registration.registrationId == session.registrationId)

        val body = registration.toJson()

        return sessionManager.editForCurrentSession(session) { preferences ->
            val existing = preferences[PENDING_BODY]

            if (existing != null) {
                check(
                    preferences[PENDING_INSTALLATION_ID] == installationId &&
                            decodeRegistration(existing).toJson() == body
                ) {
                    "Còn thao tác đăng ký chưa được đối chiếu."
                }
            } else {
                check(preferences[PENDING_INSTALLATION_ID] == null)
                preferences[PENDING_INSTALLATION_ID] = installationId
                preferences[PENDING_BODY] = body.toString()
            }

            true
        } ?: false
    }

    /*
     * Chỉ xác nhận đúng body đã lưu và đúng phiên hiện tại.
     * Binding giữ nguyên thì sequence giữ nguyên.
     */
    suspend fun confirm(
        session: AuthenticatedSessionSnapshot,
        installationId: String,
        registration: NotificationDeviceRegistration,
        device: ConfirmedNotificationDevice
    ): Boolean {
        require(registration.registrationId == session.registrationId)
        require(device.installationId == installationId)
        require(device.bindingId.isNotBlank())
        require(device.revision > 0)
        require(device.revision >= registration.expectedRevision)
        require(
            device.notificationPermission ==
                    registration.notificationPermission
        )

        val expectedBody = registration.toJson()

        return sessionManager.editForCurrentSession(session) { preferences ->
            val raw = preferences[PENDING_BODY]
                ?: return@editForCurrentSession false

            if (
                preferences[PENDING_INSTALLATION_ID] != installationId ||
                decodeRegistration(raw).toJson() != expectedBody
            ) {
                return@editForCurrentSession false
            }

            val previous = readConfirmed(preferences)
            val sameBinding =
                previous?.installationId == installationId &&
                        previous.bindingId == device.bindingId

            if (
                sameBinding &&
                device.revision < requireNotNull(previous).revision
            ) {
                return@editForCurrentSession false
            }

            val sequence = if (sameBinding) {
                requireNotNull(previous).sequence
            } else {
                0L
            }

            preferences[INSTALLATION_ID] = installationId
            preferences[BINDING_ID] = device.bindingId
            preferences[REVISION] = device.revision
            preferences[SEQUENCE] = sequence

            preferences.remove(PENDING_INSTALLATION_ID)
            preferences.remove(PENDING_BODY)
            preferences.remove(NEXT_RETRY_AT)

            true
        } ?: false
    }

    /*
     * Dành cho mẫu GPS MỚI.
     * Retry mẫu cũ phải dùng sequence/body đã chốt, không gọi lại hàm này.
     */
    suspend fun nextLocationSequence(
        session: AuthenticatedSessionSnapshot,
        installationId: String,
        bindingId: String
    ): Long? =
        sessionManager.editForCurrentSession(session) { preferences ->
            val confirmed = readConfirmed(preferences)
                ?: return@editForCurrentSession null

            if (
                confirmed.installationId != installationId ||
                confirmed.bindingId != bindingId
            ) {
                return@editForCurrentSession null
            }

            val next = Math.addExact(confirmed.sequence, 1L)
            check(next <= 9_007_199_254_740_991L) {
                "Sequence vị trí vượt giới hạn."
            }
            preferences[SEQUENCE] = next
            next
        }

    internal fun readConfirmed(
        preferences: Preferences
    ): SavedNotificationBinding? {
        val installationId = preferences[INSTALLATION_ID]
        val bindingId = preferences[BINDING_ID]
        val revision = preferences[REVISION]
        val sequence = preferences[SEQUENCE]

        if (
            installationId == null &&
            bindingId == null &&
            revision == null &&
            sequence == null
        ) {
            return null
        }

        require(!installationId.isNullOrBlank())
        require(!bindingId.isNullOrBlank())
        require(revision != null && revision > 0)
        require(sequence != null && sequence >= 0)

        return SavedNotificationBinding(
            installationId = installationId,
            bindingId = bindingId,
            revision = revision,
            sequence = sequence
        )
    }

    private fun decodeRegistration(
        raw: String
    ): NotificationDeviceRegistration {
        val json = JsonParser.parseString(raw).asJsonObject

        val registration = Gson().fromJson(
            json,
            NotificationDeviceRegistration::class.java
        )

        // Kiểm tra đủ sáu trường và không tự bù dữ liệu bị thiếu.
        require(registration.toJson() == json)

        return registration
    }
    suspend fun getBlockingFailure(
        session: AuthenticatedSessionSnapshot
    ): NotificationDeviceApiException? =
        sessionManager.readForCurrentSession(session) { preferences ->
            val status = preferences[BLOCKED_HTTP]
                ?: return@readForCurrentSession null

            NotificationDeviceApiException(
                httpStatus = status.toInt(),
                errorCode = preferences[BLOCKED_CODE]
            )
        }

    suspend fun getNextRegistrationAttemptAt(
        session: AuthenticatedSessionSnapshot
    ): Long =
        sessionManager.readForCurrentSession(session) {
            it[NEXT_RETRY_AT] ?: 0L
        } ?: 0L

    suspend fun recordRegistrationFailure(
        session: AuthenticatedSessionSnapshot,
        httpStatus: Int,
        errorCode: String?,
        retryAfterMillis: Long?
    ) {
        sessionManager.editForCurrentSession(session) { preferences ->
            val requiresResolution =
                httpStatus in 400..499 &&
                        httpStatus !in setOf(408, 429)

            if (requiresResolution) {
                preferences[BLOCKED_HTTP] = httpStatus.toLong()

                if (errorCode == null) {
                    preferences.remove(BLOCKED_CODE)
                } else {
                    preferences[BLOCKED_CODE] = errorCode
                }
            } else {
                val now = System.currentTimeMillis()
                val delay = (retryAfterMillis ?: 60_000L)
                    .coerceAtLeast(0L)

                preferences[NEXT_RETRY_AT] =
                    now + delay.coerceAtMost(Long.MAX_VALUE - now)
            }
        }
    }
}

data class NotificationLogoutSnapshot(
    val binding: SavedNotificationBinding?
)