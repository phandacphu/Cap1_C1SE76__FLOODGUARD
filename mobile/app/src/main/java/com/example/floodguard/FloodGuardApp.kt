package com.example.floodguard

import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
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

@Composable
fun FloodGuardApp() {

    val navController =
        rememberNavController()

    val context =
        LocalContext.current

    val sessionManager =
        remember {
            SessionManager(
                context.applicationContext
            )
        }

    val authRepository =
        remember {
            AuthRepository(
                authApi = ApiClient.authApi,
                sessionManager = sessionManager
            )
        }

    // null = đang kiểm tra session
    // true = đã login
    // false = chưa login
    val isLoggedIn by produceState<Boolean?>(
        initialValue = null
    ) {

        value = try {
            sessionManager.isLoggedIn()
        } catch (e: Exception) {
            false
        }
    }

    when (isLoggedIn) {

        null -> {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        }

        else -> {
            AppNavGraph(
                navController = navController,
                authRepository = authRepository,
                startDestination = if (isLoggedIn == true) {
                    "home"
                } else {
                    "login"
                }
            )
        }
    }
}