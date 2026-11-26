package com.example.floodguard.data.local

import android.content.Context
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.example.floodguard.data.model.SosCachedLocation
import com.example.floodguard.data.model.SosSubmission
import com.example.floodguard.data.model.SosSubmissionCodec
import com.example.floodguard.data.model.SosSubmissionPhase
import com.example.floodguard.data.remote.dto.rescue.CreateSosRequest
import com.example.floodguard.data.remote.dto.rescue.SosSmsCredential
import com.google.gson.Gson
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
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

class AuthenticatedSessionSnapshot internal constructor(
    val generation: Long,
    val registrationId: String,
    val user: SessionUser,
    internal val accessToken: String
) {
    internal val authorization: String
        get() = "Bearer $accessToken"

    override fun toString(): String =
        "AuthenticatedSessionSnapshot(redacted)"
}

data class SosSmsSessionKey(
    val userId: String,
    val sessionId: String
)

class SessionManager(
    private val context: Context
) {
    private val gson = Gson()

    companion object {
        private val ACCESS_TOKEN = stringPreferencesKey("access_token")
        private val IS_LOGGED_IN = booleanPreferencesKey("is_logged_in")

        private val USER_ID = stringPreferencesKey("user_id")
        private val USER_FULL_NAME = stringPreferencesKey("user_full_name")
        private val USER_EMAIL = stringPreferencesKey("user_email")
        private val USER_PHONE = stringPreferencesKey("user_phone")
        private val USER_ROLE = stringPreferencesKey("user_role")

        private val SESSION_GENERATION =
            longPreferencesKey("session_generation")

        private val REGISTRATION_ID =
            stringPreferencesKey("notification_registration_id")

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

    val tokenFlow: Flow<String?> =
        context.dataStore.data.map { it[ACCESS_TOKEN] }

    val isLoggedInFlow: Flow<Boolean> =
        context.dataStore.data.map {
            it[IS_LOGGED_IN] == true &&
                    !it[ACCESS_TOKEN].isNullOrBlank()
        }

    val userFlow: Flow<SessionUser> =
        context.dataStore.data.map { readUser(it) }

    val authenticatedSessionFlow: Flow<AuthenticatedSessionSnapshot?> =
        context.dataStore.data
            .map { readSnapshot(it) }
            .distinctUntilChanged { previous, current ->
                if (previous == null || current == null) {
                    previous == null && current == null
                } else {
                    previous.generation == current.generation &&
                            previous.registrationId == current.registrationId &&
                            previous.accessToken == current.accessToken &&
                            previous.user.id == current.user.id &&
                            previous.user.role == current.user.role
                }
            }

    suspend fun getToken(): String? = tokenFlow.first()

    suspend fun getUser(): SessionUser = userFlow.first()

    suspend fun isLoggedIn(): Boolean = isLoggedInFlow.first()

    suspend fun getGeneration(): Long =
        context.dataStore.data.first()[SESSION_GENERATION] ?: 0L

    /*
     * Giữ tương thích với code cũ.
     * Luồng login mới phải dùng saveAuthenticatedSession().
     */
    suspend fun saveToken(token: String) {
        context.dataStore.edit { preferences ->
            NotificationBindingStore.clear(preferences)
            preferences[SESSION_GENERATION] = Math.addExact(
                preferences[SESSION_GENERATION] ?: 0L,
                1L
            )
            preferences[REGISTRATION_ID] = UUID.randomUUID().toString()

            clearSosSmsState(preferences)

            // Chờ lưu xong thông tin tài khoản mới cho chuẩn bị SMS.
            preferences[SOS_SMS_LOGIN_PENDING] = true

            preferences[SOS_SMS_SESSION_ID] =
                UUID.randomUUID().toString()

            preferences[ACCESS_TOKEN] = token
            preferences[IS_LOGGED_IN] = true
        }
    }

    suspend fun saveUser(user: SessionUser) {
        context.dataStore.edit { preferences ->
            val loginPending = preferences[SOS_SMS_LOGIN_PENDING] == true

            val accountChanged =
                preferences[USER_ID] != user.id ||
                        preferences[USER_ROLE] != user.role

            if (accountChanged) {
                if (!loginPending) {
                    NotificationBindingStore.clear(preferences)
                    preferences[SESSION_GENERATION] = Math.addExact(
                        preferences[SESSION_GENERATION] ?: 0L,
                        1L
                    )
                    preferences[REGISTRATION_ID] = UUID.randomUUID().toString()
                }
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

    /*
     * expectedGeneration được chốt TRƯỚC request login.
     * Nếu logout/login khác đã thay phiên thì không lưu response cũ.
     */
    suspend fun saveAuthenticatedSession(
        token: String,
        user: SessionUser,
        expectedGeneration: Long
    ): Boolean {
        require(token.isNotBlank())

        var saved = false

        context.dataStore.edit { preferences ->
            val currentGeneration =
                preferences[SESSION_GENERATION] ?: 0L

            if (currentGeneration != expectedGeneration) {
                return@edit
            }

            NotificationBindingStore.clear(preferences)
            clearSosSmsState(preferences)

            preferences[ACCESS_TOKEN] = token
            preferences[IS_LOGGED_IN] = true
            preferences.writeUser(user)
            preferences[SOS_SMS_SESSION_ID] = UUID.randomUUID().toString()
            preferences[SOS_SMS_LOGIN_PENDING] = false

            preferences[SESSION_GENERATION] =
                Math.addExact(currentGeneration, 1L)

            preferences[REGISTRATION_ID] =
                UUID.randomUUID().toString()

            saved = true
        }

        return saved
    }

    /*
     * Khôi phục cùng registration sau khi app khởi động lại.
     * Phiên cũ chưa có registration được khởi tạo một lần.
     */
    suspend fun getSessionSnapshot(): AuthenticatedSessionSnapshot? {
        var snapshot: AuthenticatedSessionSnapshot? = null

        context.dataStore.edit { preferences ->
            if (
                preferences[SOS_SMS_LOGIN_PENDING] == true ||
                preferences[IS_LOGGED_IN] != true ||
                preferences[ACCESS_TOKEN].isNullOrBlank()
            ) {
                return@edit
            }

            if (preferences[REGISTRATION_ID] == null) {
                preferences[SESSION_GENERATION] = Math.addExact(
                    preferences[SESSION_GENERATION] ?: 0L,
                    1L
                )
                preferences[REGISTRATION_ID] =
                    UUID.randomUUID().toString()
            }

            snapshot = readSnapshot(preferences)
        }

        return snapshot
    }

    /*
     * Chỉ kiểm tra; không tạo registration hoặc phục hồi phiên cũ.
     */
    suspend fun isCurrentSession(
        snapshot: AuthenticatedSessionSnapshot
    ): Boolean {
        val current = readSnapshot(
            context.dataStore.data.first()
        ) ?: return false

        return current.generation == snapshot.generation &&
                current.registrationId == snapshot.registrationId &&
                current.accessToken == snapshot.accessToken &&
                current.user.id == snapshot.user.id &&
                current.user.role == snapshot.user.role
    }

    /*
     * Truyền expectedGeneration ở luồng logout.
     * Không cho logout cũ xóa phiên mới.
     */

    suspend fun clearSession(
        expectedGeneration: Long? = null
    ): Boolean {
        var cleared = false

        context.dataStore.edit { preferences ->
            val generation =
                preferences[SESSION_GENERATION] ?: 0L

            if (
                expectedGeneration != null &&
                generation != expectedGeneration
            ) {
                return@edit
            }

            clearSessionPreferences(preferences, generation)
            cleared = true
        }

        return cleared
    }

    internal suspend fun <T> endCurrentSession(
        snapshot: AuthenticatedSessionSnapshot,
        capture: (Preferences) -> T
    ): T? {
        var captured: T? = null

        context.dataStore.edit { preferences ->
            if (!matchesSession(preferences, snapshot)) {
                return@edit
            }

            captured = capture(preferences)

            clearSessionPreferences(
                preferences,
                preferences[SESSION_GENERATION] ?: 0L
            )
        }

        return captured
    }

    private fun clearSessionPreferences(
        preferences: MutablePreferences,
        generation: Long
    ) {
        NotificationBindingStore.clear(preferences)
        clearSosSmsState(preferences)

        preferences[SESSION_GENERATION] =
            Math.addExact(generation, 1L)

        preferences.remove(REGISTRATION_ID)
        preferences.remove(ACCESS_TOKEN)
        preferences.remove(IS_LOGGED_IN)

        preferences.remove(USER_ID)
        preferences.remove(USER_FULL_NAME)
        preferences.remove(USER_EMAIL)
        preferences.remove(USER_PHONE)
        preferences.remove(USER_ROLE)
    }

    internal suspend fun <T> readForCurrentSession(
        snapshot: AuthenticatedSessionSnapshot,
        block: (Preferences) -> T
    ): T? {
        val preferences = context.dataStore.data.first()
        if (!matchesSession(preferences, snapshot)) return null
        return block(preferences)
    }

    internal suspend fun <T> editForCurrentSession(
        snapshot: AuthenticatedSessionSnapshot,
        block: (MutablePreferences) -> T
    ): T? {
        var result: T? = null

        context.dataStore.edit { preferences ->
            if (!matchesSession(preferences, snapshot)) {
                return@edit
            }
            result = block(preferences)
        }

        return result
    }

    private fun matchesSession(
        preferences: Preferences,
        snapshot: AuthenticatedSessionSnapshot
    ): Boolean {
        val current = readSnapshot(preferences) ?: return false

        return current.generation == snapshot.generation &&
                current.registrationId == snapshot.registrationId &&
                current.accessToken == snapshot.accessToken &&
                current.user.id == snapshot.user.id &&
                current.user.role == snapshot.user.role
    }

    private fun readSnapshot(
        preferences: Preferences
    ): AuthenticatedSessionSnapshot? {
        if (preferences[SOS_SMS_LOGIN_PENDING] == true) return null
        if (preferences[IS_LOGGED_IN] != true) return null

        val token = preferences[ACCESS_TOKEN]
            ?.takeIf { it.isNotBlank() }
            ?: return null

        val registrationId = preferences[REGISTRATION_ID]
            ?: return null

        return AuthenticatedSessionSnapshot(
            generation = preferences[SESSION_GENERATION] ?: 0L,
            registrationId = registrationId,
            user = readUser(preferences),
            accessToken = token
        )
    }

    private fun readUser(preferences: Preferences): SessionUser =
        SessionUser(
            id = preferences[USER_ID],
            fullName = preferences[USER_FULL_NAME],
            email = preferences[USER_EMAIL],
            phone = preferences[USER_PHONE],
            role = preferences[USER_ROLE]
        )

    private fun MutablePreferences.writeUser(user: SessionUser) {
        putOrRemove(USER_ID, user.id)
        putOrRemove(USER_FULL_NAME, user.fullName)
        putOrRemove(USER_EMAIL, user.email)
        putOrRemove(USER_PHONE, user.phone)
        putOrRemove(USER_ROLE, user.role)
    }

    private fun MutablePreferences.putOrRemove(
        key: Preferences.Key<String>,
        value: String?
    ) {
        if (value == null) {
            remove(key)
        } else {
            this[key] = value
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
