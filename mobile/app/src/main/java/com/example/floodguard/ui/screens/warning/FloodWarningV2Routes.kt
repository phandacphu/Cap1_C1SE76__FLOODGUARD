package com.example.floodguard.ui.screens.warning

import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.layout.padding
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.floodguard.core.network.ApiClient
import com.example.floodguard.core.notifications.NotificationDeviceRuntime
import com.example.floodguard.data.local.SessionManager
import com.example.floodguard.data.remote.api.FloodWarningV2Api
import com.example.floodguard.data.repository.FloodWarningV2Repository
import com.example.floodguard.ui.components.FloodGuardBottomBar
import com.example.floodguard.ui.components.WarningBackground
import com.example.floodguard.ui.navigation.AppRoutes

@Composable
private fun warningV2Repository(
    sessionManager: SessionManager
): FloodWarningV2Repository {
    return remember(sessionManager) {
        FloodWarningV2Repository(
            ApiClient.createAuthenticatedRetrofit(sessionManager)
                .create(FloodWarningV2Api::class.java)
        )
    }
}

@Composable
fun FloodWarningV2ListRoute(
    sessionManager: SessionManager,
    onBack: () -> Unit,
    onOpen: (String) -> Unit,
    onBottomNavigate: (String) -> Unit
) {
    val repository = warningV2Repository(sessionManager)
    val model: FloodWarningV2ViewModel = viewModel(key = "warning-v2-list") {
        FloodWarningV2ViewModel(repository)
    }
    val state = model.list.collectAsStateWithLifecycle().value

    FloodWarningV2Updates(model, sessionManager) {
        model.refreshList()
    }

    Scaffold(
        containerColor = WarningBackground,
        bottomBar = {
            FloodGuardBottomBar(
                currentRoute = AppRoutes.HOME,
                onNavigate = onBottomNavigate
            )
        }
    ) { padding ->
        FloodWarningV2ListContent(
            state = state,
            onFilter = model::selectFilter,
            onRefresh = model::refreshList,
            onOpen = onOpen,
            onBack = onBack,
            modifier = Modifier.padding(padding)
        )
    }
}

@Composable
fun FloodWarningV2DetailRoute(
    warningId: String,
    sessionManager: SessionManager,
    onBack: () -> Unit,
    onMap: () -> Unit,
    onBottomNavigate: (String) -> Unit
) {
    val repository = warningV2Repository(sessionManager)
    val model: FloodWarningV2ViewModel = viewModel(
        key = "warning-v2-detail:$warningId"
    ) {
        FloodWarningV2ViewModel(repository)
    }
    val state = model.detail.collectAsStateWithLifecycle().value

    FloodWarningV2Updates(model, sessionManager) {
        model.openDetail(warningId)
    }

    Scaffold(
        containerColor = WarningBackground,
        bottomBar = {
            FloodGuardBottomBar(
                currentRoute = AppRoutes.HOME,
                onNavigate = onBottomNavigate
            )
        }
    ) { padding ->
        FloodWarningV2DetailContent(
            state = state,
            onRefresh = { model.openDetail(warningId) },
            onBack = onBack,
            onMap = onMap,
            modifier = Modifier.padding(padding)
        )
    }
}

@Composable
fun FloodWarningV2OverviewRoute(
    sessionManager: SessionManager,
    onOpen: (String) -> Unit,
    onViewAll: () -> Unit
) {
    val context = LocalContext.current

    val runtime = remember(context.applicationContext) {
        NotificationDeviceRuntime.get(context.applicationContext)
    }

    val repository = warningV2Repository(sessionManager)

    val model: FloodWarningV2ViewModel = viewModel(
        key = "warning-v2-overview"
    ) {
        FloodWarningV2ViewModel(repository)
    }

    val state = model.overview.collectAsStateWithLifecycle().value

    FloodWarningV2Updates(model, sessionManager) {
        model.refreshOverview()
        runtime.refreshLocation()
    }

    FloodWarningV2Overview(
        state = state,
        onRefresh = {
            model.refreshOverview()
            runtime.refreshLocation()
        },
        onOpen = onOpen,
        onViewAll = onViewAll
    )

    FloodWarningLocationSection(
        sessionManager = sessionManager,
        runtime = runtime,
        onOpen = onOpen
    )
}