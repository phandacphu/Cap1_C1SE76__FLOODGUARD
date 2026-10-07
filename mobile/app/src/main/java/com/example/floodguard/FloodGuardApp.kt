package com.example.floodguard

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.compose.rememberNavController

import com.example.floodguard.core.datastore.UserPreferences
import com.example.floodguard.core.network.ApiClient
import com.example.floodguard.data.repository.AuthRepository
import com.example.floodguard.ui.navigation.AppNavGraph

@Composable
fun FloodGuardApp() {

    val navController =
        rememberNavController()

    val context =
        LocalContext.current

    val userPreferences =
        remember {
            UserPreferences(
                context.applicationContext
            )
        }

    val authRepository =
        remember {
            AuthRepository(
                authApi = ApiClient.authApi,
                userPreferences = userPreferences
            )
        }

    AppNavGraph(
        navController = navController,
        authRepository = authRepository
    )
}