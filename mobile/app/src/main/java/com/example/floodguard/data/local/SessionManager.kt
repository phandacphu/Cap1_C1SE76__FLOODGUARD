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

class SessionManager(
    private val context: Context
) {

    companion object {
        private val ACCESS_TOKEN = stringPreferencesKey("access_token")
        private val IS_LOGGED_IN = booleanPreferencesKey("is_logged_in")
    }

    /**
     * Lưu token sau khi login thành công.
     */
    suspend fun saveToken(token: String) {
        context.dataStore.edit { preferences ->
            preferences[ACCESS_TOKEN] = token
            preferences[IS_LOGGED_IN] = true
        }
    }

    /**
     * Theo dõi token dưới dạng Flow.
     */
    val tokenFlow: Flow<String?> =
        context.dataStore.data.map { preferences ->
            preferences[ACCESS_TOKEN]
        }

    /**
     * Lấy token hiện tại một lần.
     */
    suspend fun getToken(): String? {
        return context.dataStore.data
            .map { preferences ->
                preferences[ACCESS_TOKEN]
            }
            .first()
    }

    /**
     * Kiểm tra user hiện đang có session hay không.
     */
    val isLoggedInFlow: Flow<Boolean> =
        context.dataStore.data.map { preferences ->
            preferences[IS_LOGGED_IN] ?: false
        }

    /**
     * Kiểm tra session một lần.
     */
    suspend fun isLoggedIn(): Boolean {
        val preferences = context.dataStore.data.first()

        val token = preferences[ACCESS_TOKEN]
        val isLoggedIn = preferences[IS_LOGGED_IN] ?: false

        return isLoggedIn && !token.isNullOrBlank()
    }

    /**
     * Xóa toàn bộ session khi logout
     * hoặc token hết hạn.
     */
    suspend fun clearSession() {
        context.dataStore.edit { preferences ->
            preferences.remove(ACCESS_TOKEN)
            preferences.remove(IS_LOGGED_IN)
        }
    }
}