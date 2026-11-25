package com.example.floodguard.ui.screens.warning

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import com.example.floodguard.core.notifications.FloodWarningRefreshSignal
import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.local.SessionManager
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.collectLatest

@Composable
internal fun FloodWarningV2Updates(
    model: FloodWarningV2ViewModel,
    sessionManager: SessionManager,
    onRefresh: () -> Unit
) {
    val owner = LocalLifecycleOwner.current
    val refresh by rememberUpdatedState(onRefresh)

    LaunchedEffect(model, sessionManager, owner) {
        observeFloodWarningV2Updates(
            lifecycle = owner.lifecycle,
            sessions = sessionManager.authenticatedSessionFlow,
            revisions = FloodWarningRefreshSignal.revision,
            model = model,
            refresh = { refresh() }
        )
    }

    DisposableEffect(model) {
        onDispose {
            model.clearAccount()
        }
    }
}

internal suspend fun observeFloodWarningV2Updates(
    lifecycle: Lifecycle,
    sessions: Flow<AuthenticatedSessionSnapshot?>,
    revisions: Flow<Long>,
    model: FloodWarningV2ViewModel,
    refresh: () -> Unit
) {
    sessions.collectLatest { session ->
        // Vô hiệu hóa cả các response còn đang đến của phiên trước.
        model.clearAccount()

        if (
            session != null &&
            session.user.role == "resident" &&
            !session.user.id.isNullOrBlank()
        ) {
            lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
                // StateFlow phát revision hiện tại khi resume:
                // tín hiệu đến lúc pause cũng được đối chiếu lại.
                revisions.collect {
                    refresh()
                }
            }
        }
    }
}