package com.example.floodguard.ui.screens.home

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.Uri
import android.os.SystemClock
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.ButtonColors
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull

private val ForecastText = Color(0xFFF3F7FA)
private val ForecastMuted = Color(0xFF8FA6B8)
private val ForecastError = Color(0xFFFF4D4D)

@SuppressLint("MissingPermission")
@Composable
fun HomeForecastSection(
    state: HomeUiState,
    onLoadForecast: (Double, Double) -> Unit,
    buttonColors: ButtonColors
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()

    val locationClient = remember(context) {
        LocationServices.getFusedLocationProviderClient(context)
    }

    var readingLocation by remember { mutableStateOf(false) }
    var locationError by remember { mutableStateOf<String?>(null) }
    var showPermissionSettings by remember { mutableStateOf(false) }
    var locationJob by remember { mutableStateOf<Job?>(null) }

    fun hasLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                ) == PackageManager.PERMISSION_GRANTED
    }

    fun requestForecastAtCurrentLocation() {
        if (readingLocation || state.isLoadingForecast) return

        readingLocation = true
        locationError = null
        showPermissionSettings = false

        locationJob = scope.launch {
            val cancellationSource = CancellationTokenSource()

            try {
                val manager = context.getSystemService(
                    LocationManager::class.java
                )

                val locationEnabled =
                    manager?.isProviderEnabled(
                        LocationManager.GPS_PROVIDER
                    ) == true ||
                            manager?.isProviderEnabled(
                                LocationManager.NETWORK_PROVIDER
                            ) == true

                if (!locationEnabled) {
                    locationError =
                        "Dịch vụ vị trí đang tắt. Hãy bật vị trí rồi thử lại."
                    return@launch
                }

                val location = withTimeoutOrNull(15_000L) {
                    locationClient.getCurrentLocation(
                        Priority.PRIORITY_HIGH_ACCURACY,
                        cancellationSource.token
                    ).await()
                }

                if (location == null) {
                    locationError =
                        "Chưa lấy được vị trí sau 15 giây. Vui lòng thử lại."
                    return@launch
                }

                val ageNanos = SystemClock.elapsedRealtimeNanos() -
                        location.elapsedRealtimeNanos

                val validLocation =
                    location.latitude.isFinite() &&
                            location.longitude.isFinite() &&
                            location.latitude in -90.0..90.0 &&
                            location.longitude in -180.0..180.0 &&
                            ageNanos in 0L..30_000_000_000L

                if (!validLocation) {
                    locationError =
                        "Vị trí không hợp lệ hoặc đã cũ. Vui lòng thử lại."
                    return@launch
                }

                if (
                    lifecycleOwner.lifecycle.currentState
                        .isAtLeast(Lifecycle.State.STARTED)
                ) {
                    onLoadForecast(
                        location.latitude,
                        location.longitude
                    )
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: SecurityException) {
                locationError =
                    "Chưa có quyền truy cập vị trí. Hãy kiểm tra quyền ứng dụng."
                showPermissionSettings = true
            } catch (error: Exception) {
                locationError =
                    "Không thể lấy vị trí hiện tại. Vui lòng thử lại."
            } finally {
                cancellationSource.cancel()
                readingLocation = false
            }
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val granted =
            permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                    permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true

        if (granted) {
            requestForecastAtCurrentLocation()
        } else {
            locationError =
                "Bạn chưa cho phép truy cập vị trí."
            showPermissionSettings = true
        }
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) {
                locationJob?.cancel()
            }
        }

        lifecycleOwner.lifecycle.addObserver(observer)

        onDispose {
            locationJob?.cancel()
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(
            text = "DỰ BÁO THỜI TIẾT & DÒNG CHẢY",
            color = ForecastText,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold
        )

        Text(
            text = "Dùng vị trí thiết bị để tải dự báo tham khảo.",
            color = ForecastMuted,
            fontSize = 13.sp
        )

        OutlinedButton(
            onClick = {
                if (hasLocationPermission()) {
                    requestForecastAtCurrentLocation()
                } else {
                    permissionLauncher.launch(
                        arrayOf(
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION
                        )
                    )
                }
            },
            enabled = !readingLocation && !state.isLoadingForecast,
            colors = buttonColors,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                when {
                    readingLocation -> "Đang lấy vị trí..."
                    state.isLoadingForecast -> "Đang tải dự báo..."
                    else -> "Lấy vị trí và tải dự báo"
                }
            )
        }

        locationError?.let { message ->
            Text(
                text = message,
                color = ForecastError,
                fontSize = 13.sp
            )
        }

        if (showPermissionSettings) {
            OutlinedButton(
                onClick = {
                    context.startActivity(
                        Intent(
                            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.parse("package:${context.packageName}")
                        )
                    )
                },
                colors = buttonColors
            ) {
                Text("Mở cài đặt quyền vị trí")
            }
        }

        if (!readingLocation && locationError == null) {
            state.forecastError?.let { message ->
                Text(
                    text = message,
                    color = ForecastError,
                    fontSize = 13.sp
                )
            }

            state.forecastData?.let { data ->
                Text(
                    text = "Đã tải dự báo: ${state.forecastLoadedAt.orEmpty()}",
                    color = ForecastText,
                    fontSize = 13.sp
                )

                Text(
                    text = "Nguồn thời tiết: " +
                            (data.weather?.source ?: "Chưa rõ nguồn"),
                    color = ForecastMuted,
                    fontSize = 12.sp
                )

                Text(
                    text = "Nguồn dòng chảy: " +
                            (data.flood?.source ?: "Chưa rõ nguồn"),
                    color = ForecastMuted,
                    fontSize = 12.sp
                )

                Text(
                    text = if (data.flood?.dataAvailable == false) {
                        "Chưa có dữ liệu mô hình sông phù hợp gần vị trí này."
                    } else {
                        "Đã tải dữ liệu dự báo dòng chảy."
                    },
                    color = ForecastMuted,
                    fontSize = 13.sp
                )
            }
        }
    }
}