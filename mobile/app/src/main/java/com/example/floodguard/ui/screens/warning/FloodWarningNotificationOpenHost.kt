package com.example.floodguard.ui.screens.warning

import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import com.example.floodguard.core.notifications.FloodWarningOpenInbox
import com.example.floodguard.data.local.NotificationBindingStore
import com.example.floodguard.data.local.SessionManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive

@Composable
fun FloodWarningNotificationOpenHost(
    sessionManager: SessionManager,
    ready: Boolean,
    onOpen: (String) -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val currentOnOpen by rememberUpdatedState(onOpen)

    val bindingStore = remember(sessionManager) {
        NotificationBindingStore(sessionManager)
    }

    val pending by FloodWarningOpenInbox.pending
        .collectAsStateWithLifecycle()

    LaunchedEffect(pending, ready, sessionManager, lifecycleOwner) {
        val entry = pending ?: return@LaunchedEffect

        lifecycleOwner.lifecycle.repeatOnLifecycle(
            Lifecycle.State.RESUMED
        ) {
            try {
                val session = sessionManager.getSessionSnapshot()
                val binding = session?.let {
                    bindingStore.getConfirmed(it)
                }

                currentCoroutineContext().ensureActive()

                if (!entry.request.matches(session, binding)) {
                    if (FloodWarningOpenInbox.consume(entry)) {
                        Toast.makeText(
                            context,
                            "Thông báo thuộc phiên thiết bị đã thay đổi.",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                    return@repeatOnLifecycle
                }

                // Chờ graph và giao diện Resident sẵn sàng.
                if (!ready) return@repeatOnLifecycle

                val currentSession = session
                    ?: return@repeatOnLifecycle

                if (!sessionManager.isCurrentSession(currentSession)) {
                    FloodWarningOpenInbox.consume(entry)
                    return@repeatOnLifecycle
                }

                currentCoroutineContext().ensureActive()

                // Không xóa request mới đến trong lúc chờ DataStore.
                if (FloodWarningOpenInbox.consume(entry)) {
                    currentOnOpen(entry.request.alertId)
                }
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                if (FloodWarningOpenInbox.consume(entry)) {
                    Toast.makeText(
                        context,
                        "Không thể xác minh phiên của thông báo.",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
        }
    }
}