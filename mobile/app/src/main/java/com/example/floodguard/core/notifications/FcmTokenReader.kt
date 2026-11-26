package com.example.floodguard.core.notifications

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull


@Suppress("DEPRECATION")
object FcmTokenReader {
    suspend fun read(context: Context): String? {
        val configured = FirebaseApp.getApps(context.applicationContext)
            .any { it.name == FirebaseApp.DEFAULT_APP_NAME }

        // Chưa có google-services.json: giữ được luồng app hiện tại.
        if (!configured) return null

        val token = try {
            withTimeoutOrNull(15_000L) {
                FirebaseMessaging.getInstance().token.await()
            }
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            throw IOException("Không lấy được token FCM.")
        }

        // Khi đã cấu hình, lỗi lấy token không được biến thành PUT token=null.
        if (token.isNullOrBlank()) {
            throw IOException("Chưa lấy được token FCM.")
        }

        return token
    }
}