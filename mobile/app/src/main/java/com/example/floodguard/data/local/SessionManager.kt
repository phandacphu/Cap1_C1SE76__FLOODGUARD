package com.example.floodguard.data.local

import android.content.Context
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.example.floodguard.data.remote.dto.rescue.SosSmsCredential
import com.example.floodguard.data.model.SosSubmission
import com.example.floodguard.data.model.SosSubmissionCodec
import com.example.floodguard.data.model.SosSubmissionPhase
import com.example.floodguard.data.model.SosCachedLocation
import com.example.floodguard.data.remote.dto.rescue.CreateSosRequest
import com.google.gson.Gson
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.CancellationException
import java.util.UUID

private val Context.dataStore by preferencesDataStore(
    name = "floodguard_session"
)

data class SessionUser(
    val id: String? = null,
    val fullName: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val role: String? = null
)

data class SosSmsSessionKey(
    val userId: String,
    val sessionId: String
)

class SessionManager(
    private val context: Context
) {
    private val gson = Gson()

    companion object {
        private val ACCESS_TOKEN =
            stringPreferencesKey("access_token")

        private val IS_LOGGED_IN =
            booleanPreferencesKey("is_logged_in")

        private val USER_ID =
            stringPreferencesKey("user_id")

        private val USER_FULL_NAME =
            stringPreferencesKey("user_full_name")

        private val USER_EMAIL =
            stringPreferencesKey("user_email")

        private val USER_PHONE =
            stringPreferencesKey("user_phone")

        private val USER_ROLE =
            stringPreferencesKey("user_role")

        private val SOS_SMS_SESSION_ID =
            stringPreferencesKey("sos_sms_session_id")

        private val SOS_SMS_CREDENTIAL =
            stringPreferencesKey("sos_sms_credential")

        private val SOS_SMS_LOGIN_PENDING =
            booleanPreferencesKey("sos_sms_login_pending")

        private val SOS_PENDING_SUBMISSION =
            stringPreferencesKey("sos_pending_submission")

        private val SOS_LAST_LOCATION =
            stringPreferencesKey("sos_last_location")
    }

    suspend fun saveToken(token: String) {
        context.dataStore.edit { preferences ->
            clearSosSmsState(preferences)

            // Chờ lưu xong thông tin tài khoản mới cho chuẩn bị SMS.
            preferences[SOS_SMS_LOGIN_PENDING] = true

            preferences[SOS_SMS_SESSION_ID] =
                UUID.randomUUID().toString()

            preferences[ACCESS_TOKEN] = token
            preferences[IS_LOGGED_IN] = true
        }
    }

    val tokenFlow: Flow<String?> =
        context.dataStore.data.map { preferences ->
            preferences[ACCESS_TOKEN]
        }

    suspend fun getToken(): String? =
        tokenFlow.first()

    val isLoggedInFlow: Flow<Boolean> =
        context.dataStore.data.map { preferences ->
            preferences[IS_LOGGED_IN] ?: false
        }

    suspend fun isLoggedIn(): Boolean {
        val preferences = context.dataStore.data.first()

        return preferences[IS_LOGGED_IN] == true &&
                !preferences[ACCESS_TOKEN].isNullOrBlank()
    }

    suspend fun saveUser(user: SessionUser) {
        context.dataStore.edit { preferences ->
            val accountChanged =
                preferences[USER_ID] != user.id ||
                        preferences[USER_ROLE] != user.role

            if (accountChanged) {
                clearSosSmsState(preferences)

                preferences[SOS_SMS_SESSION_ID] =
                    UUID.randomUUID().toString()
            }

            if (user.id != null) {
                preferences[USER_ID] = user.id
            } else {
                preferences.remove(USER_ID)
            }

            if (user.fullName != null) {
                preferences[USER_FULL_NAME] = user.fullName
            } else {
                preferences.remove(USER_FULL_NAME)
            }

            if (user.email != null) {
                preferences[USER_EMAIL] = user.email
            } else {
                preferences.remove(USER_EMAIL)
            }

            if (user.phone != null) {
                preferences[USER_PHONE] = user.phone
            } else {
                preferences.remove(USER_PHONE)
            }

            if (user.role != null) {
                preferences[USER_ROLE] = user.role
            } else {
                preferences.remove(USER_ROLE)
            }

            preferences[SOS_SMS_LOGIN_PENDING] = false
        }
    }

    val userFlow: Flow<SessionUser> =
        context.dataStore.data.map { preferences ->
            SessionUser(
                id = preferences[USER_ID],
                fullName = preferences[USER_FULL_NAME],
                email = preferences[USER_EMAIL],
                phone = preferences[USER_PHONE],
                role = preferences[USER_ROLE]
            )
        }

    suspend fun getUser(): SessionUser =
        userFlow.first()

    suspend fun clearSession() {
        context.dataStore.edit { preferences ->
            clearSosSmsState(preferences)

            preferences.remove(ACCESS_TOKEN)
            preferences.remove(IS_LOGGED_IN)
            preferences.remove(USER_ID)
            preferences.remove(USER_FULL_NAME)
            preferences.remove(USER_EMAIL)
            preferences.remove(USER_PHONE)
            preferences.remove(USER_ROLE)
        }
    }

    val sosSmsSessionFlow: Flow<SosSmsSessionKey?> =
        context.dataStore.data
            .map { preferences ->
                val userId = preferences[USER_ID]
                    ?.takeIf { it.isNotBlank() }
                    ?: return@map null

                val sessionId = preferences[SOS_SMS_SESSION_ID]
                    ?.takeIf { it.isNotBlank() }
                    ?: return@map null

                val key = SosSmsSessionKey(
                    userId = userId,
                    sessionId = sessionId
                )

                key.takeIf {
                    matchesSosSmsSession(preferences, it)
                }
            }
            .onStart {
                getSosSmsSessionKey()
            }
            .distinctUntilChanged()

    suspend fun getSosSmsAccessToken(
        sessionKey: SosSmsSessionKey
    ): String? {
        val preferences = context.dataStore.data.first()

        return if (
            matchesSosSmsSession(preferences, sessionKey)
        ) {
            preferences[ACCESS_TOKEN]
        } else {
            null
        }
    }

    suspend fun getSosSmsSessionKey(): SosSmsSessionKey? {
        var result: SosSmsSessionKey? = null

        context.dataStore.edit { preferences ->
            val userId = preferences[USER_ID]

            if (
                preferences[SOS_SMS_LOGIN_PENDING] == true ||
                preferences[IS_LOGGED_IN] != true ||
                preferences[ACCESS_TOKEN].isNullOrBlank() ||
                userId.isNullOrBlank() ||
                !preferences[USER_ROLE].equals(
                    "resident",
                    ignoreCase = true
                )
            ) {
                return@edit
            }

            // Hỗ trợ tài khoản đã đăng nhập trước khi có tính năng SMS.
            val sessionId =
                preferences[SOS_SMS_SESSION_ID]
                    ?: UUID.randomUUID().toString().also {
                        preferences[SOS_SMS_SESSION_ID] = it
                    }

            result = SosSmsSessionKey(
                userId = userId,
                sessionId = sessionId
            )
        }

        return result
    }

    suspend fun saveSosSmsCredential(
        sessionKey: SosSmsSessionKey,
        credential: SosSmsCredential
    ): Boolean {
        require(credential.isValid()) {
            "Dữ liệu mã SMS SOS không hợp lệ."
        }

        var saved = false

        context.dataStore.edit { preferences ->
            if (matchesSosSmsSession(preferences, sessionKey)) {
                preferences[SOS_SMS_CREDENTIAL] =
                    gson.toJson(credential)

                saved = true
            }
        }

        return saved
    }

    suspend fun getSosSmsCredential(
        sessionKey: SosSmsSessionKey
    ): SosSmsCredential? {
        val preferences = context.dataStore.data.first()

        if (!matchesSosSmsSession(preferences, sessionKey)) {
            return null
        }

        val json =
            preferences[SOS_SMS_CREDENTIAL] ?: return null

        return runCatching {
            gson.fromJson(
                json,
                SosSmsCredential::class.java
            )?.takeIf {
                it.isValid()
            }
        }.getOrNull()
    }

    suspend fun clearSosSmsCredential(
        sessionKey: SosSmsSessionKey
    ) {
        context.dataStore.edit { preferences ->
            if (matchesSosSmsSession(preferences, sessionKey)) {
                preferences.remove(SOS_SMS_CREDENTIAL)
            }
        }
    }

    suspend fun getSosSubmission(
        sessionKey: SosSmsSessionKey
    ): SosSubmission? {
        val preferences = context.dataStore.data.first()

        check(matchesSosSmsSession(preferences, sessionKey)) {
            "Phiên đăng nhập đã thay đổi. Hãy mở lại SOS."
        }

        val json =
            preferences[SOS_PENDING_SUBMISSION] ?: return null

        return decodeSosSubmission(json)
    }

    // Chỉ gọi từ thao tác xác nhận gửi của người dùng.
    // Khôi phục màn hình/reconnect chỉ gọi getSosSubmission().
    suspend fun getOrCreateSosSubmission(
        sessionKey: SosSmsSessionKey,
        request: CreateSosRequest,
        capturedAtMillis: Long?,
        smsCredential: SosSmsCredential?
    ): SosSubmission {
        var result: SosSubmission? = null

        context.dataStore.edit { preferences ->
            check(matchesSosSmsSession(preferences, sessionKey)) {
                "Phiên đăng nhập đã thay đổi. Hãy mở lại SOS."
            }

            val existing = preferences[SOS_PENDING_SUBMISSION]

            if (existing != null) {
                result = decodeSosSubmission(existing)
                return@edit
            }

            val created = SosSubmissionCodec.newSubmission(
                request = request,
                capturedAtMillis = capturedAtMillis,
                smsCredential = smsCredential
            )

            preferences[SOS_PENDING_SUBMISSION] =
                gson.toJson(created)

            result = created
        }

        return checkNotNull(result) {
            "Chưa lưu được bản gửi SOS."
        }
    }

    suspend fun updateSosSubmissionPhase(
        sessionKey: SosSmsSessionKey,
        clientRequestId: String,
        phase: SosSubmissionPhase,
        expectedRevision: Long? = null
    ): SosSubmission {
        var result: SosSubmission? = null

        context.dataStore.edit { preferences ->
            check(
                matchesSosSmsSession(preferences, sessionKey)
            ) {
                "Phiên đăng nhập đã thay đổi. Hãy mở lại SOS."
            }

            val json = checkNotNull(
                preferences[SOS_PENDING_SUBMISSION]
            ) {
                "Không tìm thấy bản gửi SOS đã lưu. " +
                        "Hãy đối chiếu lại."
            }

            val saved = decodeSosSubmission(json)

            check(
                saved.request.clientRequestId == clientRequestId
            ) {
                "Bản gửi SOS đã thay đổi. Hãy đối chiếu lại."
            }

            check(
                expectedRevision == null ||
                        saved.revision == expectedRevision
            ) {
                "Bản SOS đã có thao tác mới hơn. " +
                        "Hãy mở lại màn hình để đối chiếu."
            }

            val updated = saved.withPhase(phase)

            preferences[SOS_PENDING_SUBMISSION] =
                gson.toJson(updated)

            result = updated
        }

        return checkNotNull(result) {
            "Chưa cập nhật được trạng thái bản gửi SOS."
        }
    }

    // Chỉ gọi sau khi đã nhận diện SOS trên Backend.
    suspend fun clearConfirmedSosSubmission(
        sessionKey: SosSmsSessionKey,
        clientRequestId: String
    ): Boolean =
        removeSosSubmission(
            sessionKey = sessionKey,
            clientRequestId = clientRequestId,
            onlyUnsent = false
        )

    // Chỉ dùng khi người dùng chủ động bỏ bản chưa gửi
    // hoặc bản đã bị từ chối rõ ràng.
    suspend fun discardUnsentSosSubmission(
        sessionKey: SosSmsSessionKey,
        clientRequestId: String
    ): Boolean =
        removeSosSubmission(
            sessionKey = sessionKey,
            clientRequestId = clientRequestId,
            onlyUnsent = true
        )

    private suspend fun removeSosSubmission(
        sessionKey: SosSmsSessionKey,
        clientRequestId: String,
        onlyUnsent: Boolean
    ): Boolean {
        var removed = false

        context.dataStore.edit { preferences ->
            check(matchesSosSmsSession(preferences, sessionKey)) {
                "Phiên đăng nhập đã thay đổi. Hãy mở lại SOS."
            }

            val json =
                preferences[SOS_PENDING_SUBMISSION] ?: return@edit

            val saved = decodeSosSubmission(json)

            if (saved.request.clientRequestId != clientRequestId) {
                return@edit
            }

            if (onlyUnsent) {
                check(
                    saved.phase in setOf(
                        SosSubmissionPhase.PREPARED,
                        SosSubmissionPhase.REJECTED
                    )
                ) {
                    "SOS có thể đã được gửi. Cần đối chiếu " +
                            "trước khi bỏ bản gửi."
                }
            }

            preferences.remove(SOS_PENDING_SUBMISSION)
            removed = true
        }

        return removed
    }

    private fun decodeSosSubmission(
        json: String
    ): SosSubmission {
        return try {
            val saved = checkNotNull(
                gson.fromJson(
                    json,
                    SosSubmission::class.java
                )
            )

            SosSubmissionCodec.validateRequest(saved.request)
            requireNotNull(saved.phase)
            require(saved.revision >= 0L)

            val capturedAt = saved.capturedAtMillis
            require(capturedAt == null || capturedAt > 0L)

            val credential = saved.smsCredential
            require(credential == null || credential.isValid())

            saved
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            // Giữ dữ liệu lỗi để kiểm tra.
            // Không coi như người dùng chưa từng gửi SOS.
            throw IllegalStateException(
                "Bản gửi SOS đã lưu không hợp lệ. " +
                        "Không tự tạo yêu cầu mới; hãy kiểm tra lại."
            )
        }
    }

    suspend fun getSosLastLocation(
        sessionKey: SosSmsSessionKey
    ): SosCachedLocation? {
        val preferences = context.dataStore.data.first()

        check(matchesSosSmsSession(preferences, sessionKey)) {
            "Phiên đăng nhập đã thay đổi. Hãy mở lại SOS."
        }

        val json =
            preferences[SOS_LAST_LOCATION] ?: return null

        return decodeSosLastLocation(json)
    }

    suspend fun saveSosLastLocation(
        sessionKey: SosSmsSessionKey,
        location: SosCachedLocation,
        fromCache: Boolean = false
    ): SosCachedLocation {
        require(location.isValid()) {
            "Vị trí SOS không hợp lệ. " +
                    "Không thay bằng tọa độ mặc định."
        }

        val candidate = normalizeSosLastLocation(location)
        var result: SosCachedLocation? = null

        context.dataStore.edit { preferences ->
            check(matchesSosSmsSession(preferences, sessionKey)) {
                "Phiên đăng nhập đã thay đổi. Hãy mở lại SOS."
            }

            val existing = preferences[SOS_LAST_LOCATION]
                ?.let { decodeSosLastLocation(it) }

            val candidateTime = candidate.capturedAtMillis
            val existingTime = existing?.capturedAtMillis

            // Nếu đang dùng mẫu cache của thiết bị, giữ mẫu
            // đã lưu khi mẫu đó có thời điểm mới hơn.
            val keepExisting =
                fromCache &&
                        existing != null &&
                        (
                                candidateTime == null ||
                                        (
                                                existingTime != null &&
                                                        candidateTime <= existingTime
                                                )
                                )

            val chosen = if (keepExisting) {
                checkNotNull(existing)
            } else {
                candidate
            }

            preferences[SOS_LAST_LOCATION] =
                gson.toJson(chosen)

            result = chosen
        }

        return checkNotNull(result)
    }

    private fun normalizeSosLastLocation(
        location: SosCachedLocation
    ): SosCachedLocation =
        location.copy(
            accuracyMeters = location.accuracyMeters
                ?.takeIf { it.isFinite() && it >= 0f }
        )

    private fun decodeSosLastLocation(
        json: String
    ): SosCachedLocation? {
        return try {
            gson.fromJson(
                json,
                SosCachedLocation::class.java
            )
                ?.takeIf { it.isValid() }
                ?.let { normalizeSosLastLocation(it) }
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            null
        }
    }

    private fun matchesSosSmsSession(
        preferences: Preferences,
        sessionKey: SosSmsSessionKey
    ): Boolean =
        preferences[SOS_SMS_LOGIN_PENDING] != true &&
                preferences[IS_LOGGED_IN] == true &&
                !preferences[ACCESS_TOKEN].isNullOrBlank() &&
                preferences[USER_ID] == sessionKey.userId &&
                preferences[SOS_SMS_SESSION_ID] ==
                sessionKey.sessionId &&
                preferences[USER_ROLE].equals(
                    "resident",
                    ignoreCase = true
                )

    private fun clearSosSmsState(
        preferences: MutablePreferences
    ) {
        preferences.remove(SOS_SMS_CREDENTIAL)
        preferences.remove(SOS_SMS_SESSION_ID)
        preferences.remove(SOS_SMS_LOGIN_PENDING)
        preferences.remove(SOS_PENDING_SUBMISSION)
        preferences.remove(SOS_LAST_LOCATION)
    }
}