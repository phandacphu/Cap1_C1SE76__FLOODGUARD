package com.example.floodguard.ui.navigation

import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import com.example.floodguard.core.network.ApiClient
import com.example.floodguard.data.repository.AuthRepository
import com.example.floodguard.data.repository.FloodAlertRepository
import com.example.floodguard.data.repository.FloodAreaRepository
import com.example.floodguard.data.repository.SafeLocationRepository
import com.example.floodguard.ui.screens.auth.login.LoginScreen
import com.example.floodguard.ui.screens.auth.login.LoginViewModel
import com.example.floodguard.ui.screens.auth.register.RegisterScreen
import com.example.floodguard.ui.screens.auth.register.RegisterViewModel
import com.example.floodguard.ui.screens.home.HomeScreen
import com.example.floodguard.ui.screens.map.FloodMapRoute
import com.example.floodguard.ui.screens.map.FloodMapViewModel
import com.example.floodguard.ui.screens.safe_location.SafeLocationListScreen
import com.example.floodguard.ui.screens.warning.WarningDetailRoute
import com.example.floodguard.ui.screens.warning.WarningDetailViewModel
import com.example.floodguard.ui.screens.warning.WarningListScreen
import com.example.floodguard.ui.screens.warning.WarningViewModel
import com.example.floodguard.ui.screens.safe_location.SafeLocationDetailScreen
import com.example.floodguard.ui.screens.safe_location.SafeLocationDetailViewModel
import com.example.floodguard.ui.screens.safe_location.SafeLocationViewModel

@Composable
fun AppNavGraph(
    navController: NavHostController,
    authRepository: AuthRepository,
    startDestination: String
) {
    val context = LocalContext.current

    val safeLocationViewModel: SafeLocationViewModel = viewModel()

    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
        // HOME
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
                    navController.navigate(AppRoutes.MAP)
                },
                onSafeLocationClick = {
                    navController.navigate(AppRoutes.SAFE_LOCATION) {
                        launchSingleTop = true
                    }
                },
                onBottomNavigate = { route ->
                    when (route) {
                        AppRoutes.HOME -> Unit

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
                            navController.navigate(AppRoutes.SAFE_LOCATION) {
                                launchSingleTop = true
                            }
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

        // LOGIN
        composable(route = AppRoutes.LOGIN) {
            val loginViewModel: LoginViewModel = viewModel {
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

        // REGISTER
        composable(route = AppRoutes.REGISTER) {
            val registerViewModel: RegisterViewModel = viewModel {
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

        // WARNING LIST
        composable(route = AppRoutes.WARNING_LIST) {
            val warningViewModel: WarningViewModel = viewModel {
                WarningViewModel(
                    floodAlertRepository = FloodAlertRepository(
                        floodAlertApi = ApiClient.floodAlertApi
                    )
                )
            }

            WarningListScreen(
                viewModel = warningViewModel,
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
                    Toast.makeText(
                        context,
                        "Cá nhân chưa được triển khai",
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
                            navController.navigate(AppRoutes.SAFE_LOCATION) {
                                launchSingleTop = true
                            }
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

        // WARNING DETAIL
        composable(
            route = "${AppRoutes.WARNING_DETAIL}/{warningId}"
        ) { backStackEntry ->
            val warningDetailViewModel: WarningDetailViewModel =
                viewModel(
                    viewModelStoreOwner = backStackEntry
                ) {
                    WarningDetailViewModel(
                        savedStateHandle = createSavedStateHandle(),
                        floodAlertRepository = FloodAlertRepository(
                            floodAlertApi = ApiClient.floodAlertApi
                        )
                    )
                }

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
                    Toast.makeText(
                        context,
                        "Cá nhân chưa được triển khai",
                        Toast.LENGTH_SHORT
                    ).show()
                },
                onFloodMapClick = {
                    navController.navigate(AppRoutes.MAP)
                },
                onSafeLocationClick = {
                    navController.navigate(AppRoutes.SAFE_LOCATION) {
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
                            navController.navigate(AppRoutes.SAFE_LOCATION) {
                                launchSingleTop = true
                            }
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

        // SAFE LOCATION LIST - CCF-69
        composable(route = AppRoutes.SAFE_LOCATION) {
            SafeLocationListScreen(
                viewModel = safeLocationViewModel,
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
                    Toast.makeText(
                        context,
                        "Hồ sơ chưa được triển khai",
                        Toast.LENGTH_SHORT
                    ).show()
                },

                onViewDetail = { locationId ->
                    navController.navigate(
                        "${AppRoutes.SAFE_LOCATION_DETAIL}/$locationId"
                    )
                },

                onDirections = {
                    Toast.makeText(
                        context,
                        "Chỉ đường sẽ được tích hợp sau",
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

                        AppRoutes.SAFE_LOCATION -> Unit

                        AppRoutes.SEND_SOS -> {
                            Toast.makeText(
                                context,
                                "SOS chưa được triển khai",
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

        // SAFE LOCATION DETAIL - CCF-70
        composable(
            route = "${AppRoutes.SAFE_LOCATION_DETAIL}/{locationId}"
        ) { backStackEntry ->

            val locationId = backStackEntry.arguments
                ?.getString("locationId")
                .orEmpty()

            val detailViewModel: SafeLocationDetailViewModel = viewModel(
                viewModelStoreOwner = backStackEntry
            )

            androidx.compose.runtime.LaunchedEffect(locationId) {
                detailViewModel.loadLocation(
                    locationId = locationId,
                    locations = safeLocationViewModel
                        .getLocationById(locationId)
                        ?.let { listOf(it) }
                        ?: emptyList()
                )
            }

            SafeLocationDetailScreen(
                viewModel = detailViewModel,

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
                    Toast.makeText(
                        context,
                        "Hồ sơ chưa được triển khai",
                        Toast.LENGTH_SHORT
                    ).show()
                },

                onDirections = {
                    Toast.makeText(
                        context,
                        "Chưa có tuyến đường được xác minh",
                        Toast.LENGTH_SHORT
                    ).show()
                },

                onContactClick = {
                    Toast.makeText(
                        context,
                        "Chức năng liên hệ chưa được kết nối",
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

                        AppRoutes.SAFE_LOCATION -> {
                            navController.popBackStack()
                        }

                        AppRoutes.SEND_SOS -> {
                            Toast.makeText(
                                context,
                                "SOS chưa được triển khai",
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

        // FLOOD MAP
        composable(route = AppRoutes.MAP) {
            val floodMapViewModel: FloodMapViewModel = viewModel {
                FloodMapViewModel(
                    floodAreaRepository = FloodAreaRepository(
                        floodAreaApi = ApiClient.floodAreaApi
                    ),
                    floodAlertRepository = FloodAlertRepository(
                        floodAlertApi = ApiClient.floodAlertApi
                    ),
                    safeLocationRepository = SafeLocationRepository(
                        safeLocationApi = ApiClient.safeLocationApi
                    )
                )
            }

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
                    Toast.makeText(
                        context,
                        "Cá nhân chưa được triển khai",
                        Toast.LENGTH_SHORT
                    ).show()
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

                        AppRoutes.MAP -> Unit

                        AppRoutes.SEND_SOS -> {
                            Toast.makeText(
                                context,
                                "SOS chưa được triển khai",
                                Toast.LENGTH_SHORT
                            ).show()
                        }

                        AppRoutes.SAFE_LOCATION -> {
                            navController.navigate(AppRoutes.SAFE_LOCATION) {
                                launchSingleTop = true
                            }
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
    }
}