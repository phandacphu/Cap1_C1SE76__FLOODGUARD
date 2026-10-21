
package com.example.floodguard.ui.navigation

import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable

import com.example.floodguard.core.network.ApiClient
import com.example.floodguard.data.local.SessionManager
import com.example.floodguard.data.local.SessionUser
import com.example.floodguard.data.remote.api.RescueRequestApi
import com.example.floodguard.data.repository.AuthRepository
import com.example.floodguard.data.repository.RescueRequestRepository
import com.example.floodguard.ui.screens.auth.login.LoginScreen
import com.example.floodguard.ui.screens.auth.login.LoginViewModel
import com.example.floodguard.ui.screens.auth.register.RegisterScreen
import com.example.floodguard.ui.screens.auth.register.RegisterViewModel
import com.example.floodguard.ui.screens.home.HomeScreen
import com.example.floodguard.ui.screens.map.FloodMapRoute
import com.example.floodguard.ui.screens.map.FloodMapViewModel
import com.example.floodguard.ui.screens.profile.ProfileScreen
import com.example.floodguard.ui.screens.profile.ProfileViewModel
import com.example.floodguard.ui.screens.warning.WarningDetailRoute
import com.example.floodguard.ui.screens.warning.WarningDetailViewModel
import com.example.floodguard.ui.screens.warning.WarningListScreen

import kotlinx.coroutines.launch

@Composable


fun AppNavGraph(
    navController: NavHostController,
    authRepository: AuthRepository,
    startDestination: String
) {
    val context = LocalContext.current

    val sessionManager = remember(context) {
        SessionManager(context.applicationContext)
    }

    val scope = rememberCoroutineScope()

    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {


        composable(route = AppRoutes.PROFILE) {

            // Lấy thông tin tài khoản đã lưu
            val user by sessionManager.userFlow.collectAsState(
                initial = SessionUser()
            )

            // Retrofit có Bearer Token
            val rescueRepository = remember(sessionManager) {

                val retrofit =
                    ApiClient.createAuthenticatedRetrofit(
                        sessionManager
                    )

                val rescueApi = retrofit.create(
                    RescueRequestApi::class.java
                )

                RescueRequestRepository(
                    api = rescueApi
                )
            }

            // ViewModel quản lý API SOS
            val profileViewModel: ProfileViewModel = viewModel {
                ProfileViewModel(
                    repository = rescueRepository
                )
            }

            val sosState by profileViewModel.sosState.collectAsState()

            ProfileScreen(
                fullName = user.fullName
                    ?.takeIf { it.isNotBlank() }
                    ?: "Chưa cập nhật",

                email = user.email
                    ?.takeIf { it.isNotBlank() }
                    ?: "Chưa cập nhật",

                phone = user.phone
                    ?.takeIf { it.isNotBlank() }
                    ?: "Chưa cập nhật",

                sosState = sosState,

                onRetrySos = {
                    profileViewModel.loadSosHistory()
                },

                onBackClick = {
                    navController.popBackStack()
                },

                onLogoutClick = {
                    scope.launch {
                        val result = authRepository.logout()

                        if (result.isSuccess) {

                            Toast.makeText(
                                context,
                                "Đăng xuất thành công",
                                Toast.LENGTH_SHORT
                            ).show()

                            navController.navigate(AppRoutes.LOGIN) {
                                popUpTo(navController.graph.id) {
                                    inclusive = true
                                }
                                launchSingleTop = true
                            }

                        } else {

                            Toast.makeText(
                                context,
                                result.exceptionOrNull()?.message
                                    ?: "Đăng xuất thất bại",
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    }
                },


                onMenuClick = { action ->
                    when (action) {
                        "sos_history" -> {
                            profileViewModel.loadSosHistory()

                            Toast.makeText(
                                context,
                                "Đang cập nhật lịch sử yêu cầu SOS...",
                                Toast.LENGTH_SHORT
                            ).show()
                        }

                        else -> {
                            Toast.makeText(
                                context,
                                "Chức năng $action chưa được triển khai",
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    }
                }

            )
        }


        composable(route = AppRoutes.HOME) {

            HomeScreen(
                onWarningClick = {
                    navController.navigate(AppRoutes.WARNING_LIST)
                },

                onNotificationClick = {
                    Toast.makeText(
                        context,
                        "Thông báo chưa được triển khai",
                        Toast.LENGTH_SHORT
                    ).show()
                },

                onProfileClick = {
                    navController.navigate(AppRoutes.PROFILE) {
                        launchSingleTop = true
                    }
                },

                onSosClick = {
                    Toast.makeText(
                        context,
                        "SOS chưa được triển khai",
                        Toast.LENGTH_SHORT
                    ).show()
                },

                onMapClick = {
                    navController.navigate(AppRoutes.MAP)
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
                            // Đang ở Home
                        }

                        AppRoutes.MAP -> {
                            navController.navigate(AppRoutes.MAP) {
                                launchSingleTop = true
                            }
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
                            navController.navigate(AppRoutes.PROFILE) {
                                launchSingleTop = true
                            }
                        }
                    }
                }
            )
        }


        composable(route = AppRoutes.LOGIN) {

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

                    navController.navigate(AppRoutes.HOME) {
                        popUpTo(AppRoutes.LOGIN) {
                            inclusive = true
                        }
                    }
                },

                onRegisterClick = {
                    navController.navigate(AppRoutes.REGISTER)
                }
            )
        }


        composable(route = AppRoutes.REGISTER) {

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


        composable(route = AppRoutes.WARNING_LIST) {

            WarningListScreen(
                onBackClick = {
                    navController.popBackStack()
                },

                onWarningClick = { warningId ->
                    navController.navigate(
                        "${AppRoutes.WARNING_DETAIL}/$warningId"
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
                    navController.navigate(AppRoutes.PROFILE) {
                        launchSingleTop = true
                    }
                },

                onBottomNavigate = { route ->
                    when (route) {

                        AppRoutes.HOME -> {
                            navController.navigate(AppRoutes.HOME) {
                                launchSingleTop = true
                            }
                        }

                        AppRoutes.MAP -> {
                            navController.navigate(AppRoutes.MAP) {
                                launchSingleTop = true
                            }
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
                            navController.navigate(AppRoutes.PROFILE) {
                                launchSingleTop = true
                            }
                        }
                    }
                }
            )
        }

        composable(
            route = "${AppRoutes.WARNING_DETAIL}/{warningId}"
        ) { backStackEntry ->

            val warningDetailViewModel: WarningDetailViewModel =
                viewModel(
                    viewModelStoreOwner = backStackEntry
                )

            WarningDetailRoute(
                viewModel = warningDetailViewModel,

                onBack = {
                    navController.popBackStack()
                },

                onNotificationClick = {
                    Toast.makeText(
                        context,
                        "Thông báo chưa được triển khai",
                        Toast.LENGTH_SHORT
                    ).show()
                },

                onProfileClick = {
                    navController.navigate(AppRoutes.PROFILE) {
                        launchSingleTop = true
                    }
                },

                onFloodMapClick = {
                    navController.navigate(AppRoutes.MAP)
                },

                onSafeLocationClick = {
                    Toast.makeText(
                        context,
                        "Tránh trú chưa được triển khai",
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

                onBottomNavigate = { route ->
                    when (route) {

                        AppRoutes.HOME -> {
                            navController.navigate(AppRoutes.HOME) {
                                launchSingleTop = true
                            }
                        }

                        AppRoutes.MAP -> {
                            navController.navigate(AppRoutes.MAP) {
                                launchSingleTop = true
                            }
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
                            navController.navigate(AppRoutes.PROFILE) {
                                launchSingleTop = true
                            }
                        }
                    }
                }
            )
        }


        composable(route = AppRoutes.MAP) {

            val floodMapViewModel: FloodMapViewModel = viewModel()

            FloodMapRoute(
                viewModel = floodMapViewModel,

                onBack = {
                    navController.popBackStack()
                },

                onNotificationClick = {
                    Toast.makeText(
                        context,
                        "Thông báo chưa được triển khai",
                        Toast.LENGTH_SHORT
                    ).show()
                },

                onProfileClick = {
                    navController.navigate(AppRoutes.PROFILE) {
                        launchSingleTop = true
                    }
                },

                onSafeRouteClick = {
                    Toast.makeText(
                        context,
                        "Đang mở tuyến đường an toàn",
                        Toast.LENGTH_SHORT
                    ).show()
                },

                onShelterDetailClick = {
                    Toast.makeText(
                        context,
                        "Chi tiết trạm trú chưa được triển khai",
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

                onBottomNavigate = { route ->
                    when (route) {

                        AppRoutes.HOME -> {
                            navController.navigate(AppRoutes.HOME) {
                                launchSingleTop = true
                            }
                        }

                        AppRoutes.MAP -> {
                            // Đang ở Map
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
                            navController.navigate(AppRoutes.PROFILE) {
                                launchSingleTop = true
                            }
                        }
                    }
                }
            )
        }
    }
}
