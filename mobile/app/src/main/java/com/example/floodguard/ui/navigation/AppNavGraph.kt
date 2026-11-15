package com.example.floodguard.ui.navigation

import android.widget.Toast
import android.net.Uri
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.floodguard.ui.screens.rescue.RescueOverviewUiState
import com.example.floodguard.ui.screens.rescue.RescueSummaryMetric
import com.example.floodguard.ui.screens.rescue.RescueSummaryState
import com.example.floodguard.ui.screens.rescue.RescueOverviewSection
import com.example.floodguard.ui.screens.rescue.RescueOverviewSectionState
import com.example.floodguard.data.remote.dto.rescue.sos.RescueSosApi
import com.example.floodguard.data.remote.dto.rescue.sos.RescueRouteDistanceApi
import com.example.floodguard.ui.screens.rescue.sos.*
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
import com.example.floodguard.data.remote.api.ResidentSosApi
import com.example.floodguard.data.repository.ResidentSosRepository
import com.example.floodguard.ui.screens.sos.ResidentSosDetailViewModel
import com.example.floodguard.ui.screens.sos.ResidentSosSubmissionViewModel
import com.example.floodguard.ui.screens.sos.rememberResidentSosTracking
import com.example.floodguard.ui.screens.sos.ResidentSosUploadPanel
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
import com.example.floodguard.ui.screens.sos.SosStatusScreen
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
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
    val residentSosTracking = rememberResidentSosTracking(sessionManager)
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
                role = user.role,
                accountKey = user.id.orEmpty() + ":" + token?.let { value ->
                    java.security.MessageDigest.getInstance("SHA-256")
                        .digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
                }.orEmpty()
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

    // Session-owned state is isolated from Resident's shared SOS API/DTO.
    val rescueSos = if (session.isLoggedIn && session.role == "rescue" && isRescueRoute(currentRoute)) {
        val store = remember(session.accountKey) {
            val api = ApiClient.createAuthenticatedRetrofit(sessionManager).create(RescueSosApi::class.java)
            RescueSosStore(RescueSosRepository(api), scope)
        }
        DisposableEffect(store) { onDispose { store.close() } }
        store
    } else null
    // One authenticated route-distance repository per Rescue session; its short-lived
    // in-memory road distance cache survives switching between SOS list and detail.
    val rescueDistanceRepository = if (session.isLoggedIn && session.role == "rescue" &&
        isRescueRoute(currentRoute)) {
        remember(session.accountKey) {
            val api = ApiClient.createAuthenticatedRetrofit(sessionManager)
                .create(RescueRouteDistanceApi::class.java)
            RescueRouteDistanceRepository(api)
        }
    } else null
    var rescueFilter by rememberSaveable(session.accountKey) { mutableStateOf(SosFilter.ACTIVE) }
    fun openRescueTab(route: String) {
        navController.navigate(route) {
            popUpTo(AppRoutes.RESCUE_HOME) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }
    fun openRescueSos(id: String) {
        navController.navigate("${AppRoutes.RESCUE_SOS_DETAIL}/${Uri.encode(id)}") { launchSingleTop = true }
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
            val sos = rescueSos?.state?.collectAsStateWithLifecycle()?.value ?: RescueSosState()
            rescueSos?.let { store ->
                RescueSosRefresh(store)
                RescueSosRefresh(store, SosFilter.RESCUED)
            }
            fun metric(resource: SosResource<List<RescueSos>>): RescueSummaryState = when {
                sos.accessError != null -> RescueSummaryState.Failed(sos.accessError!!)
                resource.error != null -> RescueSummaryState.Failed(resource.error)
                resource.data != null -> RescueSummaryState.Value(resource.data.size)
                resource.loading -> RescueSummaryState.Loading
                else -> RescueSummaryState.NotReady
            }
            RescueOverviewScreen(
                uiState = RescueOverviewUiState(
                    summaries = mapOf(RescueSummaryMetric.NEW_SOS to metric(sos.active),
                        RescueSummaryMetric.RESCUED_SOS to metric(sos.rescued)),
                    prioritySos = when {
                        sos.accessError != null -> RescueOverviewSectionState.Failed(sos.accessError!!)
                        sos.active.error != null -> RescueOverviewSectionState.Failed(sos.active.error!!)
                        sos.active.data != null -> RescueOverviewSectionState.Ready("${sos.active.data!!.size} yêu cầu đang chờ cứu. Mở danh sách để xem chi tiết.")
                        sos.active.loading -> RescueOverviewSectionState.Loading
                        else -> RescueOverviewSectionState.NotReady
                    }),
                onRetry = { section ->
                    if (section == RescueOverviewSection.SUMMARY || section == RescueOverviewSection.PRIORITY_SOS) {
                        rescueSos?.refresh(SosFilter.ACTIVE)
                        rescueSos?.refresh(SosFilter.RESCUED)
                    }
                },
                availableDestinations = setOf(RescueOverviewDestination.MAP,
                    RescueOverviewDestination.SOS_LIST, RescueOverviewDestination.SOS_NEW, RescueOverviewDestination.SOS_RESCUED),
                onOpenDestination = { destination ->
                    when (destination) {
                        RescueOverviewDestination.MAP -> openRescueTab(AppRoutes.RESCUE_MAP)
                        RescueOverviewDestination.SOS_NEW -> { rescueFilter = SosFilter.ACTIVE; openRescueTab(AppRoutes.RESCUE_SOS) }
                        RescueOverviewDestination.SOS_RESCUED -> { rescueFilter = SosFilter.RESCUED; openRescueTab(AppRoutes.RESCUE_SOS) }
                        RescueOverviewDestination.SOS_LIST -> openRescueTab(AppRoutes.RESCUE_SOS)
                        else -> Unit
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
                    onSosTab = { openRescueTab(AppRoutes.RESCUE_SOS) },
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

        composable(route = AppRoutes.RESCUE_SOS) {
            rescueSos?.let { store ->
                RescueSosListScreen(store = store, filter = rescueFilter,
                    rescueLocation = rescueLocation, distanceRepository = rescueDistanceRepository,
                    onFilterChange = { rescueFilter = it }, onOpen = ::openRescueSos,
                    onOverview = { openRescueTab(AppRoutes.RESCUE_HOME) },
                    onMap = { openRescueTab(AppRoutes.RESCUE_MAP) })
            }
        }
        composable(route = "${AppRoutes.RESCUE_SOS_DETAIL}/{requestId}") { entry ->
            val id = entry.arguments?.getString("requestId")
            rescueSos?.let { store ->
                val distanceRepository = rescueDistanceRepository
                if (!id.isNullOrBlank() && distanceRepository != null) RescueSosDetailScreen(id = id, store = store,
                    rescueLocation = rescueLocation, distanceRepository = distanceRepository,
                    onBack = { openRescueTab(AppRoutes.RESCUE_SOS) },
                    onOverview = { openRescueTab(AppRoutes.RESCUE_HOME) },
                    onMap = { openRescueTab(AppRoutes.RESCUE_MAP) })
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
            val residentRepository = remember(sessionManager) {
                val retrofit = ApiClient.createResidentSosRetrofit(
                    sessionManager
                )

                ResidentSosRepository(
                    api = retrofit.create(ResidentSosApi::class.java)
                )
            }

            val profileViewModel: ProfileViewModel = viewModel {
                ProfileViewModel(
                    loadRequests = {
                        residentRepository.getRequests()
                            .onSuccess { requests ->
                                requests.forEach(residentSosTracking::observe)
                            }
                            .onFailure(residentSosTracking::onApiError)
                    }
                )
            }

            val sosState by profileViewModel.sosState.collectAsState()

            val profileUploadState by
            residentSosTracking.uploader.state.collectAsState()

            val visibleSosState = if (profileUploadState.accessDenied) {
                com.example.floodguard.ui.screens.profile.ProfileSosUiState(
                    error = profileUploadState.message
                        ?: "Không còn quyền truy cập dữ liệu SOS."
                )
            } else {
                val updated = profileUploadState.lastServerRequest

                sosState.copy(
                    requests = sosState.requests.map { request ->
                        if (
                            updated != null &&
                            request.id == updated.id &&
                            !(
                                    request.state == "rescued" &&
                                            updated.state == "active"
                                    )
                        ) {
                            updated
                        } else {
                            request
                        }
                    }
                )
            }

            val profileLifecycleOwner =
                androidx.lifecycle.compose.LocalLifecycleOwner.current

            androidx.compose.runtime.DisposableEffect(
                profileLifecycleOwner,
                profileViewModel
            ) {
                val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
                    if (event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) {
                        profileViewModel.loadSosHistory()
                    }
                }

                profileLifecycleOwner.lifecycle.addObserver(observer)

                onDispose {
                    profileLifecycleOwner.lifecycle.removeObserver(observer)
                }
            }

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

                sosState = visibleSosState,

                onSosStatusClick = { sosId ->
                    navController.navigate(
                        "${AppRoutes.SOS_STATUS}/${android.net.Uri.encode(sosId)}"
                    ) {
                        launchSingleTop = true
                    }
                },

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
                    ),
                    floodAreaRepository = FloodAreaRepository(
                        floodAreaApi = ApiClient.floodAreaApi
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
                        ),
                        floodAreaRepository = FloodAreaRepository(
                            floodAreaApi = ApiClient.floodAreaApi
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
        // CHI TIẾT VÀ LỊCH SỬ SOS
        // CHI TIẾT VÀ LỊCH SỬ SOS
        composable(
            route = "${AppRoutes.SOS_STATUS}/{sosId}"
        ) { entry ->
            val sosId = entry.arguments
                ?.getString("sosId")
                .orEmpty()

            val repository = remember(sessionManager) {
                val retrofit = ApiClient.createResidentSosRetrofit(
                    sessionManager
                )

                ResidentSosRepository(
                    api = retrofit.create(ResidentSosApi::class.java)
                )
            }

            val statusViewModel: ResidentSosDetailViewModel = viewModel(
                viewModelStoreOwner = entry
            ) {
                ResidentSosDetailViewModel(
                    sosId = sosId,
                    loadDetail = { id ->
                        repository.getDetail(id)
                            .onSuccess(residentSosTracking::observe)
                            .onFailure(residentSosTracking::onApiError)
                    },
                    loadHistory = { id ->
                        repository.getHistory(id)
                            .onFailure(residentSosTracking::onApiError)
                    }
                )
            }

            val statusState by statusViewModel.uiState.collectAsState()
            val historyState by statusViewModel.historyState.collectAsState()
            val uploadState by
            residentSosTracking.uploader.state.collectAsState()

            val acknowledgedRequest = uploadState.lastServerRequest
                ?.takeIf { it.id == sosId }

            val displayStatusState = when {
                uploadState.accessDenied -> statusState.copy(
                    request = null,
                    loadedAtMillis = null,
                    error = uploadState.message
                        ?: "Không còn quyền truy cập SOS."
                )

                statusState.request != null &&
                        acknowledgedRequest != null &&
                        !(
                                statusState.request?.state == "rescued" &&
                                        acknowledgedRequest.state == "active"
                                ) -> statusState.copy(
                    request = acknowledgedRequest
                )

                else -> statusState
            }

            LaunchedEffect(
                uploadState.sosId,
                uploadState.lastServerRequest?.state
            ) {
                if (
                    uploadState.sosId == sosId &&
                    uploadState.lastServerRequest?.state == "rescued" &&
                    statusState.request?.state != "rescued"
                ) {
                    statusViewModel.refreshAfterCompletion()
                }
            }

            val lifecycleOwner =
                androidx.lifecycle.compose.LocalLifecycleOwner.current

            androidx.compose.runtime.DisposableEffect(
                lifecycleOwner,
                statusViewModel
            ) {
                val observer =
                    androidx.lifecycle.LifecycleEventObserver { _, event ->
                        if (
                            event ==
                            androidx.lifecycle.Lifecycle.Event.ON_RESUME
                        ) {
                            statusViewModel.refresh()
                        }
                    }

                lifecycleOwner.lifecycle.addObserver(observer)

                onDispose {
                    lifecycleOwner.lifecycle.removeObserver(observer)
                }
            }

            SosStatusScreen(
                state = displayStatusState,
                historyState = historyState,
                gpsContent = {
                    if (displayStatusState.request?.state == "active") {
                        ResidentSosUploadPanel(
                            sosId = sosId,
                            tracking = residentSosTracking
                        )
                    }
                },
                onRefresh = statusViewModel::refresh,
                onBack = {
                    if (!navController.popBackStack()) {
                        navController.navigate(AppRoutes.PROFILE) {
                            popUpTo(entry.destination.id) {
                                inclusive = true
                            }
                            launchSingleTop = true
                        }
                    }
                }
            )
        }


        // GỬI SOS
        composable(route = AppRoutes.SEND_SOS) { entry ->
            val residentRepository = remember(sessionManager) {
                val retrofit = ApiClient.createResidentSosRetrofit(
                    sessionManager
                )

                ResidentSosRepository(
                    api = retrofit.create(ResidentSosApi::class.java)
                )
            }

            val submissionViewModel: ResidentSosSubmissionViewModel =
                viewModel(
                    viewModelStoreOwner = entry
                ) {
                    ResidentSosSubmissionViewModel(
                        loadActive = {
                            residentRepository.getActive()
                                .onFailure(residentSosTracking::onApiError)
                        },
                        createRemote = { request ->
                            residentRepository.create(request)
                                .onFailure(residentSosTracking::onApiError)
                        }
                    )
                }

            val sendSosViewModel: SendSosViewModel = viewModel(
                viewModelStoreOwner = entry
            ) {
                SendSosViewModel(
                    submitValidatedSos = { request, isLocationFresh ->
                        submissionViewModel.submit(
                            request = request,
                            isLocationFresh = isLocationFresh
                        )
                    }
                )
            }

            val submissionState by
            submissionViewModel.state.collectAsState()

            LaunchedEffect(submissionState.openSosId) {
                val id = submissionState.openSosId
                    ?: return@LaunchedEffect

                residentSosTracking.refresh()

                navController.navigate(
                    "${AppRoutes.SOS_STATUS}/${android.net.Uri.encode(id)}"
                ) {
                    popUpTo(entry.destination.id) {
                        inclusive = true
                    }
                    launchSingleTop = true
                }
            }

            val submissionLifecycleOwner =
                androidx.lifecycle.compose.LocalLifecycleOwner.current

            androidx.compose.runtime.DisposableEffect(
                submissionLifecycleOwner,
                submissionViewModel
            ) {
                val observer =
                    androidx.lifecycle.LifecycleEventObserver { _, event ->
                        if (
                            event ==
                            androidx.lifecycle.Lifecycle.Event.ON_RESUME
                        ) {
                            submissionViewModel.checkActive()
                        }
                    }

                submissionLifecycleOwner.lifecycle.addObserver(observer)

                onDispose {
                    submissionLifecycleOwner.lifecycle.removeObserver(observer)
                }
            }

            val backFromSend: () -> Unit = {
                if (!navController.popBackStack()) {
                    navController.navigate(AppRoutes.HOME) {
                        launchSingleTop = true
                    }
                }
            }

            if (submissionState.formAllowed) {
                SendSosScreen(
                    viewModel = sendSosViewModel,
                    onBack = backFromSend
                )
            } else {
                androidx.compose.foundation.layout.Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            androidx.compose.ui.graphics.Color(0xFF071521)
                        )
                        .statusBarsPadding()
                        .navigationBarsPadding()
                        .padding(20.dp),
                    verticalArrangement =
                        androidx.compose.foundation.layout.Arrangement
                            .spacedBy(16.dp)
                ) {
                    androidx.compose.material3.TextButton(
                        onClick = backFromSend
                    ) {
                        androidx.compose.material3.Text(
                            "‹ Quay lại",
                            color = androidx.compose.ui.graphics.Color(
                                0xFF20D7FF
                            )
                        )
                    }

                    if (
                        submissionState.isChecking ||
                        submissionState.openSosId != null
                    ) {
                        CircularProgressIndicator()

                        androidx.compose.material3.Text(
                            text = if (
                                submissionState.openSosId != null
                            ) {
                                "Đang mở yêu cầu SOS…"
                            } else {
                                "Đang kiểm tra SOS đang hoạt động…"
                            },
                            color = androidx.compose.ui.graphics.Color.White
                        )
                    }

                    submissionState.error?.let { message ->
                        androidx.compose.material3.Text(
                            message,
                            color = androidx.compose.ui.graphics.Color(
                                0xFFFFB4AB
                            )
                        )

                        androidx.compose.material3.OutlinedButton(
                            onClick = submissionViewModel::checkActive
                        ) {
                            androidx.compose.material3.Text(
                                "Thử lại",
                                color = androidx.compose.ui.graphics.Color(
                                    0xFF20D7FF
                                )
                            )
                        }
                    }
                }
            }
        }
    }
}
