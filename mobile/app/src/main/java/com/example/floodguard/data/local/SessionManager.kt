
package com.example.floodguard.data.local

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

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

class SessionManager(
    private val context: Context
) {

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
    }


    suspend fun saveToken(token: String) {
        context.dataStore.edit { preferences ->
            preferences[ACCESS_TOKEN] = token
            preferences[IS_LOGGED_IN] = true
        }
    }

    val tokenFlow: Flow<String?> =
        context.dataStore.data.map { preferences ->
            preferences[ACCESS_TOKEN]
        }

    suspend fun getToken(): String? {
        return tokenFlow.first()
    }


    val isLoggedInFlow: Flow<Boolean> =
        context.dataStore.data.map { preferences ->
            preferences[IS_LOGGED_IN] ?: false
        }

    suspend fun isLoggedIn(): Boolean {
        val preferences = context.dataStore.data.first()

        return (preferences[IS_LOGGED_IN] ?: false) &&
                !preferences[ACCESS_TOKEN].isNullOrBlank()
    }

    suspend fun saveUser(user: SessionUser) {
        context.dataStore.edit { preferences ->

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
        }
    }

    // =====================================
    // ĐỌC THÔNG TIN TÀI KHOẢN
    // =====================================
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

    suspend fun getUser(): SessionUser {
        return userFlow.first()
    }

    // =====================================
    // ĐĂNG XUẤT
    // =====================================
    suspend fun clearSession() {
        context.dataStore.edit { preferences ->
            preferences.remove(ACCESS_TOKEN)
            preferences.remove(IS_LOGGED_IN)

            preferences.remove(USER_ID)
            preferences.remove(USER_FULL_NAME)
            preferences.remove(USER_EMAIL)
            preferences.remove(USER_PHONE)
            preferences.remove(USER_ROLE)
        }
    }
}
