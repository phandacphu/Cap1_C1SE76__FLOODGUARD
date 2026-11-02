package com.example.floodguard

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.compose.rememberNavController
import com.example.floodguard.core.network.ApiClient
import com.example.floodguard.data.local.SessionManager
import com.example.floodguard.data.repository.AuthRepository
import com.example.floodguard.ui.navigation.AppNavGraph
import com.example.floodguard.ui.navigation.AppRoutes
import com.example.floodguard.ui.navigation.homeRouteForRole
import kotlinx.coroutines.CancellationException

@Composable
fun FloodGuardApp() {
    val navController = rememberNavController()
    val context = LocalContext.current

    val sessionManager = remember(context) {
        SessionManager(context.applicationContext)
    }

    val authRepository = remember(sessionManager) {
        AuthRepository(
            authApi = ApiClient.authApi,
            sessionManager = sessionManager
        )
    }

    val startDestination by produceState<String?>(
        initialValue = null,
        key1 = sessionManager
    ) {
        value = try {
            if (sessionManager.isLoggedIn()) {
                homeRouteForRole(
                    sessionManager.getUser().role
                )
            } else {
                AppRoutes.LOGIN
            }
        } catch (exception: CancellationException) {
            throw exception
        } catch (_: Exception) {
            AppRoutes.LOGIN
        }
    }

    val destination = startDestination

    if (destination == null) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            CircularProgressIndicator()
        }
    } else {
        AppNavGraph(
            navController = navController,
            authRepository = authRepository,
            startDestination = destination
        )
    }
}