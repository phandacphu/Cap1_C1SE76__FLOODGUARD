package com.example.floodguard.ui.navigation

import android.widget.Toast

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel

import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable

import com.example.floodguard.data.repository.AuthRepository

import com.example.floodguard.ui.screens.auth.login.LoginScreen
import com.example.floodguard.ui.screens.auth.login.LoginViewModel
import com.example.floodguard.ui.screens.auth.register.RegisterScreen

import com.example.floodguard.ui.screens.home.HomeScreen
import com.example.floodguard.ui.screens.warning.WarningListScreen
import com.example.floodguard.ui.screens.auth.register.RegisterViewModel

@Composable
fun AppNavGraph(
    navController: NavHostController,
    authRepository: AuthRepository
) {

    val context = LocalContext.current

    NavHost(
        navController = navController,
        startDestination = AppRoutes.LOGIN
    ) {

        // =========================
        // HOME
        // =========================
        composable(
            route = AppRoutes.HOME
        ) {

            HomeScreen(

                onWarningClick = {

                    navController.navigate(
                        AppRoutes.WARNING_LIST
                    )
                },

                onNotificationClick = {

                    Toast.makeText(
                        context,
                        "Thông báo chưa được triển khai",
                        Toast.LENGTH_SHORT
                    ).show()
                },

                onProfileClick = {

                    Toast.makeText(
                        context,
                        "Cá nhân chưa được triển khai",
                        Toast.LENGTH_SHORT
                    ).show()
                },

                onSosClick = {

                    Toast.makeText(
                        context,
                        "SOS chưa được triển khai",
                        Toast.LENGTH_SHORT
                    ).show()
                },

                onMapClick = {

                    Toast.makeText(
                        context,
                        "Bản đồ chưa được triển khai",
                        Toast.LENGTH_SHORT
                    ).show()
                },

                onSafeLocationClick = {

                    Toast.makeText(
                        context,
                        "Tránh trú chưa được triển khai",
                        Toast.LENGTH_SHORT
                    ).show()
                },

                onBottomNavigate = { route ->

                    when (route) {

                        AppRoutes.HOME -> {
                            // Đang ở Home nên không làm gì
                        }

                        AppRoutes.MAP -> {

                            Toast.makeText(
                                context,
                                "Bản đồ chưa được triển khai",
                                Toast.LENGTH_SHORT
                            ).show()
                        }

                        AppRoutes.SEND_SOS -> {

                            Toast.makeText(
                                context,
                                "SOS chưa được triển khai",
                                Toast.LENGTH_SHORT
                            ).show()
                        }

                        AppRoutes.SAFE_LOCATION -> {

                            Toast.makeText(
                                context,
                                "Tránh trú chưa được triển khai",
                                Toast.LENGTH_SHORT
                            ).show()
                        }

                        AppRoutes.PROFILE -> {

                            Toast.makeText(
                                context,
                                "Cài đặt chưa được triển khai",
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    }
                }
            )
        }

        // =========================
        // LOGIN
        // =========================
        composable(
            route = AppRoutes.LOGIN
        ) {

            val loginViewModel: LoginViewModel =
                viewModel {
                    LoginViewModel(
                        authRepository = authRepository
                    )
                }

            LoginScreen(
                viewModel = loginViewModel,

                onLoginSuccess = {

                    Toast.makeText(
                        context,
                        "Đăng nhập thành công",
                        Toast.LENGTH_SHORT
                    ).show()

                    navController.navigate(
                        AppRoutes.HOME
                    ) {

                        popUpTo(
                            AppRoutes.LOGIN
                        ) {
                            inclusive = true
                        }
                    }
                },

                onRegisterClick = {

                    navController.navigate(
                        AppRoutes.REGISTER
                    )
                }
            )
        }

        // =========================
        // REGISTER
        // =========================

        composable(
            route = AppRoutes.REGISTER
        ) {

            val registerViewModel: RegisterViewModel =
                viewModel {
                    RegisterViewModel(
                        authRepository = authRepository
                    )
                }

            RegisterScreen(

                viewModel = registerViewModel,

                onBackClick = {
                    navController.popBackStack()
                },

                onLoginClick = {
                    navController.popBackStack()
                },

                onRegisterSuccess = {

                    Toast.makeText(
                        context,
                        "Đăng ký thành công",
                        Toast.LENGTH_SHORT
                    ).show()

                    navController.popBackStack()
                }
            )
        }

        // =========================
        // WARNING LIST
        // =========================
        composable(
            route = AppRoutes.WARNING_LIST
        ) {

            WarningListScreen(

                onBackClick = {
                    navController.popBackStack()
                },

                onWarningClick = {

                    navController.navigate(
                        AppRoutes.WARNING_DETAIL
                    )
                },

                onNotificationClick = {

                    Toast.makeText(
                        context,
                        "Thông báo chưa được triển khai",
                        Toast.LENGTH_SHORT
                    ).show()
                },

                onProfileClick = {

                    Toast.makeText(
                        context,
                        "Cá nhân chưa được triển khai",
                        Toast.LENGTH_SHORT
                    ).show()
                },

                onBottomNavigate = { route ->

                    when (route) {

                        AppRoutes.HOME -> {

                            navController.navigate(
                                AppRoutes.HOME
                            ) {
                                launchSingleTop = true
                            }
                        }

                        AppRoutes.MAP -> {

                            Toast.makeText(
                                context,
                                "Bản đồ chưa được triển khai",
                                Toast.LENGTH_SHORT
                            ).show()
                        }

                        AppRoutes.SEND_SOS -> {

                            Toast.makeText(
                                context,
                                "SOS chưa được triển khai",
                                Toast.LENGTH_SHORT
                            ).show()
                        }

                        AppRoutes.SAFE_LOCATION -> {

                            Toast.makeText(
                                context,
                                "Tránh trú chưa được triển khai",
                                Toast.LENGTH_SHORT
                            ).show()
                        }

                        AppRoutes.PROFILE -> {

                            Toast.makeText(
                                context,
                                "Cá nhân chưa được triển khai",
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    }
                }
            )
        }

        // =========================
        // WARNING DETAIL
        // =========================
        composable(
            route = AppRoutes.WARNING_DETAIL
        ) {

            Text(
                text = "Warning Detail"
            )
        }
    }
}