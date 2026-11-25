package com.example.floodguard.data.local

import android.content.Context
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
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

class SessionManager(
    private val context: Context
) {
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
        context.dataStore.edit {
            it[ACCESS_TOKEN] = token
            it[IS_LOGGED_IN] = true
        }
    }

    suspend fun saveUser(user: SessionUser) {
        context.dataStore.edit {
            it.writeUser(user)
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

            preferences[ACCESS_TOKEN] = token
            preferences[IS_LOGGED_IN] = true
            preferences.writeUser(user)

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
}