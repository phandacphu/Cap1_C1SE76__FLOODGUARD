package com.example.floodguard.ui.navigation

import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import com.example.floodguard.core.network.ApiClient
import com.example.floodguard.data.local.SessionManager
import com.example.floodguard.data.local.SessionUser
import com.example.floodguard.data.remote.api.RescueRequestApi
import com.example.floodguard.data.repository.AuthRepository
import com.example.floodguard.data.repository.FloodAlertRepository
import com.example.floodguard.data.repository.FloodAreaRepository
import com.example.floodguard.data.repository.FloodHistoryRepository
import com.example.floodguard.data.repository.SafeLocationRepository
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
import com.example.floodguard.ui.screens.safe_location.SafeLocationListScreen
import com.example.floodguard.ui.screens.warning.WarningDetailRoute
import com.example.floodguard.ui.screens.warning.WarningDetailViewModel
import com.example.floodguard.ui.screens.warning.WarningListScreen
import com.example.floodguard.ui.screens.warning.WarningViewModel
import kotlinx.coroutines.launch
import com.example.floodguard.ui.screens.safe_location.SafeLocationDetailScreen
import com.example.floodguard.ui.screens.safe_location.SafeLocationDetailViewModel
import com.example.floodguard.ui.screens.safe_location.SafeLocationViewModel
import com.example.floodguard.ui.screens.sos.SendSosScreen
import com.example.floodguard.ui.screens.sos.SendSosViewModel
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.navigation.compose.currentBackStackEntryAsState
import com.example.floodguard.ui.screens.rescue.RescueEntryScreen
import com.example.floodguard.ui.screens.rescue.RescueOverviewScreen
import com.example.floodguard.ui.screens.rescue.RescueOverviewDestination
import com.example.floodguard.ui.screens.rescue.RescueMapScreen
import com.example.floodguard.ui.screens.rescue.rememberRescueMapLocation
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine


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
    val navigationSession by produceState<NavigationSession?>(
        initialValue = null,
        key1 = sessionManager
    ) {
        combine(
            sessionManager.tokenFlow,
            sessionManager.userFlow
        ) { token, user ->
            NavigationSession(
                isLoggedIn = !token.isNullOrBlank(),
                role = user.role
            )
        }
            .catch {
                emit(NavigationSession())
            }
            .collect {
                value = it
            }
    }

    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute =
        backStackEntry?.destination?.route ?: startDestination

    val session = navigationSession

    if (session == null) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            CircularProgressIndicator()
        }
        return
    }

    val isPublicRoute =
        currentRoute == AppRoutes.LOGIN ||
                currentRoute == AppRoutes.REGISTER

    val redirectRoute = when {
        isPublicRoute -> null

        !session.isLoggedIn -> AppRoutes.LOGIN

        homeRouteForRole(session.role) == AppRoutes.ACCESS_DENIED -> {
            if (currentRoute != AppRoutes.ACCESS_DENIED) {
                AppRoutes.ACCESS_DENIED
            } else {
                null
            }
        }

        session.role == "rescue" -> {
            if (!isRescueRoute(currentRoute)) {
                AppRoutes.RESCUE_HOME
            } else {
                null
            }
        }

        isRescueRoute(currentRoute) ||
                currentRoute == AppRoutes.ACCESS_DENIED -> {
            AppRoutes.HOME
        }

        else -> null
    }

    if (redirectRoute != null) {
        LaunchedEffect(redirectRoute) {
            navController.navigate(redirectRoute) {
                popUpTo(navController.graph.id) {
                    inclusive = true
                }
                launchSingleTop = true
            }
        }
        return
    }
    // One GPS controller for the authenticated Rescue area, shared by its tabs.
    // Public routes and Resident sessions never start this request.
    val rescueLocation = if (session.isLoggedIn && session.role == "rescue" &&
        isRescueRoute(currentRoute)
    ) {
        rememberRescueMapLocation(autoLocate = true)
    } else {
        null
    }

    val safeLocationViewModel: SafeLocationViewModel = viewModel {
        SafeLocationViewModel(
            repository = SafeLocationRepository(
                safeLocationApi = ApiClient.safeLocationApi
            )
        )
    }

    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
        composable(route = AppRoutes.RESCUE_HOME) {
            RescueOverviewScreen(
                availableDestinations = setOf(RescueOverviewDestination.MAP),
                onOpenDestination = { destination ->
                    if (destination == RescueOverviewDestination.MAP) {
                        navController.navigate(AppRoutes.RESCUE_MAP) {
                            launchSingleTop = true
                            restoreState = true
                        }
                    }
                },
                onLogout = {
                    authRepository.logout()
                },
                onLoggedOut = {
                    navController.navigate(AppRoutes.LOGIN) {
                        popUpTo(navController.graph.id) {
                            inclusive = true
                        }
                        launchSingleTop = true
                    }
                }
            )
        }

        composable(route = AppRoutes.RESCUE_MAP) {
            rescueLocation?.let { location ->
                RescueMapScreen(
                    location = location,
                    onBack = {
                        val returnedHome = navController.popBackStack(
                            route = AppRoutes.RESCUE_HOME,
                            inclusive = false,
                            saveState = true
                        )
                        if (!returnedHome) {
                            navController.navigate(AppRoutes.RESCUE_HOME) {
                                popUpTo(navController.graph.id) { inclusive = true }
                                launchSingleTop = true
                            }
                        }
                    }
                )
            }
        }

        composable(route = AppRoutes.ACCESS_DENIED) {
            RescueEntryScreen(
                accessDenied = true,
                onLogout = {
                    authRepository.logout()
                },
                onLoggedOut = {
                    navController.navigate(AppRoutes.LOGIN) {
                        popUpTo(navController.graph.id) {
                            inclusive = true
                        }
                        launchSingleTop = true
                    }
                }
            )
        }
        // PROFILE — CCF-249
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
                    navController.navigate(AppRoutes.PROFILE) {
                        launchSingleTop = true
                    }
                },
                onSosClick = {
                    navController.navigate(AppRoutes.SEND_SOS) {
                        launchSingleTop = true
                    }
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
                            navController.navigate(AppRoutes.SEND_SOS) {
                                launchSingleTop = true
                            }
                        }

                        AppRoutes.SAFE_LOCATION -> {
                            navController.navigate(AppRoutes.SAFE_LOCATION) {
                                launchSingleTop = true
                            }
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
                    scope.launch {
                        val destination = homeRouteForRole(
                            sessionManager.getUser().role
                        )

                        Toast.makeText(
                            context,
                            "Đăng nhập thành công",
                            Toast.LENGTH_SHORT
                        ).show()

                        navController.navigate(destination) {
                            popUpTo(navController.graph.id) {
                                inclusive = true
                            }
                            launchSingleTop = true
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
                            navController.navigate(AppRoutes.SEND_SOS) {
                                launchSingleTop = true
                            }
                        }

                        AppRoutes.SAFE_LOCATION -> {
                            navController.navigate(AppRoutes.SAFE_LOCATION) {
                                launchSingleTop = true
                            }
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
                    navController.navigate(AppRoutes.PROFILE) {
                        launchSingleTop = true
                    }
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
                    navController.navigate(AppRoutes.SEND_SOS) {
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
                            navController.navigate(AppRoutes.SEND_SOS) {
                                launchSingleTop = true
                            }
                        }

                        AppRoutes.SAFE_LOCATION -> {
                            navController.navigate(AppRoutes.SAFE_LOCATION) {
                                launchSingleTop = true
                            }
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

        // SAFE LOCATION LIST - CCF-69
        composable(route = AppRoutes.SAFE_LOCATION) {
            SafeLocationListScreen(
                viewModel = safeLocationViewModel,
                onBack = {
                    navController.popBackStack()
                },
                onMapClick = {
                    navController.navigate(AppRoutes.MAP) {
                        launchSingleTop = true
                    }
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
                            navController.navigate(AppRoutes.SEND_SOS) {
                                launchSingleTop = true
                            }
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

        // SAFE LOCATION DETAIL - CCF-70
        composable(
            route = "${AppRoutes.SAFE_LOCATION_DETAIL}/{locationId}"
        ) { backStackEntry ->

            val locationId = backStackEntry.arguments
                ?.getString("locationId")
                .orEmpty()


            val detailViewModel: SafeLocationDetailViewModel = viewModel(
                viewModelStoreOwner = backStackEntry
            ) {
                SafeLocationDetailViewModel(
                    repository = SafeLocationRepository(
                        safeLocationApi = ApiClient.safeLocationApi
                    )
                )
            }

            androidx.compose.runtime.LaunchedEffect(locationId) {
                detailViewModel.loadLocation(locationId)
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
                    navController.navigate(AppRoutes.PROFILE) {
                        launchSingleTop = true
                    }
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
                            navController.navigate(AppRoutes.SEND_SOS) {
                                launchSingleTop = true
                            }
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
                    ),
                    floodHistoryRepository = FloodHistoryRepository(
                        api = ApiClient.floodHistoryApi
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
                onShelterDetailClick = { locationId ->
                    navController.navigate(
                        "${AppRoutes.SAFE_LOCATION_DETAIL}/" +
                                android.net.Uri.encode(locationId)
                    ) {
                        launchSingleTop = true
                    }
                },
                onSosClick = {
                    navController.navigate(AppRoutes.SEND_SOS) {
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

                        AppRoutes.MAP -> Unit

                        AppRoutes.SEND_SOS -> {
                            navController.navigate(AppRoutes.SEND_SOS) {
                                launchSingleTop = true
                            }
                        }

                        AppRoutes.SAFE_LOCATION -> {
                            navController.navigate(AppRoutes.SAFE_LOCATION) {
                                launchSingleTop = true
                            }
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


        // SEND SOS — CCF-83
        composable(route = AppRoutes.SEND_SOS) {

            val rescueRepository = remember(sessionManager) {
                val retrofit =
                    ApiClient.createAuthenticatedRetrofit(
                        sessionManager
                    )

                RescueRequestRepository(
                    api = retrofit.create(
                        RescueRequestApi::class.java
                    )
                )
            }

            val sendSosViewModel: SendSosViewModel = viewModel {
                SendSosViewModel(
                    repository = rescueRepository
                )
            }

            SendSosScreen(
                viewModel = sendSosViewModel,
                onBack = {
                    val returned = navController.popBackStack()

                    if (!returned) {
                        navController.navigate(AppRoutes.HOME) {
                            popUpTo(AppRoutes.SEND_SOS) {
                                inclusive = true
                            }
                            launchSingleTop = true
                        }
                    }
                }
            )
        }
    }
}
