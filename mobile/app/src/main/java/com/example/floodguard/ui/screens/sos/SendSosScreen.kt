
package com.example.floodguard.ui.screens.sos


import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.Uri

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.*

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.DisposableEffect

import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.input.KeyboardType
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
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay



private val SosBackground = Color(0xFF061626)
private val SosCard = Color(0xFF142638)
private val SosCardSelected = Color(0xFF20354A)
private val SosCyan = Color(0xFF00D7EF)
private val SosText = Color(0xFFD9E5F0)
private val SosMuted = Color(0xFF95A9B8)
private val SosPink = Color(0xFFFFB5AC)
private val SosYellow = Color(0xFFFFC83D)

@Composable
fun SendSosScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: SendSosViewModel
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val formEnabled = !uiState.isSubmitting && uiState.submittedSosId == null


    // CCF-81: Theo dõi vòng đời màn SOS
    val lifecycleOwner = LocalLifecycleOwner.current

    var isScreenActive by remember {
        mutableStateOf(
            lifecycleOwner.lifecycle.currentState
                .isAtLeast(Lifecycle.State.STARTED)
        )
    }


    var locationIsExpired by remember {
        mutableStateOf(false)
    }

    LaunchedEffect(
        uiState.locationTimestampMillis,
        uiState.isLoadingLocation,
        isScreenActive
    ) {
        locationIsExpired = false

        val timestamp = uiState.locationTimestampMillis
            ?: return@LaunchedEffect

        if (!isScreenActive || uiState.isLoadingLocation) {
            return@LaunchedEffect
        }

        val ageMillis = System.currentTimeMillis() - timestamp

        if (ageMillis < 0L || ageMillis > 30_000L) {
            locationIsExpired = true
        } else {
            delay(30_001L - ageMillis)
            locationIsExpired = true
        }
    }


    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> {
                    isScreenActive = true
                }

                Lifecycle.Event.ON_STOP -> {
                    isScreenActive = false
                }

                else -> Unit
            }
        }

        lifecycleOwner.lifecycle.addObserver(observer)

        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    // CCF-81: GPS cho SOS Form
    val fusedLocationClient = remember(context) {
        LocationServices.getFusedLocationProviderClient(context)
    }


    var gpsRetryKey by remember {
        mutableIntStateOf(0)
    }

    val permissionLauncher =
        rememberLauncherForActivityResult(
            ActivityResultContracts.RequestMultiplePermissions()
        ) { permissions ->

            val granted =
                permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                        permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true

            if (granted) {
                if (!viewModel.uiState.value.isSubmitting &&
                    viewModel.uiState.value.submittedSosId == null
                ) gpsRetryKey++
            } else {
                viewModel.setLocationError(
                    "Chưa được cấp quyền truy cập vị trí."
                )
            }
        }


    LaunchedEffect(gpsRetryKey, isScreenActive) {
        if (viewModel.uiState.value.isSubmitting ||
            viewModel.uiState.value.submittedSosId != null
        ) return@LaunchedEffect

        if (!isScreenActive) {
            // Xóa vị trí cũ khi ứng dụng không còn hoạt động.
            viewModel.setLocationError(
                "Vị trí cần được cập nhật khi quay lại màn SOS."
            )
            return@LaunchedEffect
        }

        // Kiểm tra quyền vị trí
        val hasPermission =
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED ||
                    ContextCompat.checkSelfPermission(
                        context,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    ) == PackageManager.PERMISSION_GRANTED

        if (!hasPermission) {
            viewModel.setLocationError(
                "Cần cấp quyền vị trí để lấy tọa độ SOS."
            )
            return@LaunchedEffect
        }

        // Kiểm tra dịch vụ vị trí
        val locationManager =
            context.getSystemService(LocationManager::class.java)

        val locationEnabled =
            locationManager?.isProviderEnabled(
                LocationManager.GPS_PROVIDER
            ) == true ||
                    locationManager?.isProviderEnabled(
                        LocationManager.NETWORK_PROVIDER
                    ) == true

        if (!locationEnabled) {
            viewModel.setLocationError(
                "Dịch vụ vị trí đang tắt. Vui lòng bật GPS."
            )
            return@LaunchedEffect
        }

        viewModel.startLocationLoading()

        val cancellationTokenSource = CancellationTokenSource()

        try {
            // Lấy vị trí với timeout tối đa 15 giây
            val location = withTimeoutOrNull(15_000L) {
                fusedLocationClient.getCurrentLocation(
                    Priority.PRIORITY_HIGH_ACCURACY,
                    cancellationTokenSource.token
                ).await()
            }

            if (location != null) {
                val ageMillis =
                    System.currentTimeMillis() - location.time

                val isValidLocation =
                    location.latitude.isFinite() &&
                            location.longitude.isFinite() &&
                            location.latitude in -90.0..90.0 &&
                            location.longitude in -180.0..180.0 &&
                            ageMillis in 0L..30_000L

                if (isValidLocation) {
                    viewModel.updateLocation(location)
                } else {
                    viewModel.setLocationError(
                        "Tọa độ GPS không hợp lệ hoặc đã cũ. Vui lòng thử lại."
                    )
                }
            } else {
                viewModel.setLocationError(
                    "Không thể lấy vị trí sau 15 giây. Vui lòng thử lại."
                )
            }

        } catch (e: CancellationException) {
            throw e

        } catch (e: SecurityException) {
            viewModel.setLocationError(
                "Quyền truy cập vị trí không còn hợp lệ."
            )

        } catch (e: Exception) {
            viewModel.setLocationError(
                "Không thể lấy GPS. Vui lòng thử lại."
            )

        } finally {
            cancellationTokenSource.cancel()
        }
    }


    var showDemoDialog by rememberSaveable {
        mutableStateOf(false)
    }

    var showSubmitConfirmation by rememberSaveable {
        mutableStateOf(false)
    }

    Scaffold(
        containerColor = SosBackground,
        topBar = {
            SosTopBar(
                onBack = onBack
            )
        }
    ) { innerPadding ->
        LazyColumn(
            state = listState,
            modifier = modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(
                start = 16.dp,
                end = 16.dp,
                top = 12.dp,
                bottom = 32.dp
            ),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                SosEmergencyBanner()
            }

            item {
                SosLocationCard(
                    uiState = uiState,
                    isExpired = locationIsExpired,
                    enabled = formEnabled,
                    onRetry = {
                        if (formEnabled) gpsRetryKey++
                    },
                    onRequestPermission = {
                        if (formEnabled) permissionLauncher.launch(
                            arrayOf(
                                Manifest.permission.ACCESS_FINE_LOCATION,
                                Manifest.permission.ACCESS_COARSE_LOCATION
                            )
                        )
                    }
                )
                uiState.validationErrors.location?.let {
                    Text(it, color = SosPink, fontSize = 12.sp)
                }
            }

            item {
                SosSectionTitle(
                    "LOẠI TÌNH HUỐNG (CHỌN NHIỀU)"
                )

                uiState.validationErrors.situations?.let {
                    Text(it, color = SosPink, fontSize = 12.sp)
                }
            }



            items(SosSituation.entries.toList()) { situation ->
                SosSituationRow(
                    situation = situation,
                    selected = situation in uiState.selectedSituations,
                    enabled = formEnabled,
                    onClick = {
                        viewModel.toggleSituation(situation)
                    }
                )
            }

            item {
                SosSectionTitle(
                    "SỐ NGƯỜI CẦN HỖ TRỢ"
                )

                uiState.validationErrors.peopleCount?.let {
                    Text(it, color = SosPink, fontSize = 12.sp)
                }
                Spacer(Modifier.height(8.dp))

                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    SosPeopleCount.entries.forEach { count ->
                        SosChoiceChip(
                            text = count.label,
                            selected = uiState.peopleCount == count,
                            modifier = Modifier.weight(1f),
                            enabled = formEnabled,
                            onClick = {
                                viewModel.selectPeopleCount(count)
                            }
                        )
                    }

                }
            }


            item {
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    SosSectionTitle("SỐ NGƯỜI CHÍNH XÁC")


                    OutlinedTextField(
                        value = uiState.exactPeopleCount,
                        onValueChange = viewModel::updateExactPeopleCount,
                        label = {
                            Text("Nhập số người")
                        },
                        placeholder = {
                            Text("Ví dụ: 3")
                        },
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Number
                        ),
                        singleLine = true,
                        enabled = formEnabled,
                        isError = uiState.validationErrors.exactPeopleCount != null,
                        modifier = Modifier.fillMaxWidth(),

                        // Màu chữ giống phần Ghi chú
                        textStyle = androidx.compose.ui.text.TextStyle(
                            color = SosText,
                            fontSize = 14.sp
                        ),

                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = SosText,
                            unfocusedTextColor = SosText,
                            cursorColor = SosCyan,
                            focusedBorderColor = SosCyan,
                            unfocusedBorderColor = SosMuted,
                            focusedLabelColor = SosCyan,
                            unfocusedLabelColor = SosMuted,
                            focusedContainerColor = SosCard,
                            unfocusedContainerColor = SosCard
                        )
                    )

                    uiState.validationErrors.exactPeopleCount?.let { error ->
                        Text(
                            text = error,
                            color = SosPink,
                            fontSize = 12.sp
                        )
                    }
                }
            }

            item {
                SosSectionTitle(
                    "MỨC NƯỚC ƯỚC TÍNH"
                )

                uiState.validationErrors.waterLevel?.let {
                    Text(it, color = SosPink, fontSize = 12.sp)
                }

                Spacer(Modifier.height(8.dp))

                SosWaterLevel.entries
                    .chunked(2)
                    .forEach { rowItems ->
                        Row(
                            horizontalArrangement =
                                Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            rowItems.forEach { level ->
                                SosWaterLevelCard(
                                    level = level,
                                    selected = uiState.waterLevel == level,
                                    modifier = Modifier.weight(1f),
                                    enabled = formEnabled,
                                    onClick = {
                                        viewModel.selectWaterLevel(level)
                                    }
                                )
                            }
                        }

                        Spacer(Modifier.height(8.dp))
                    }
            }

            item {
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    SosSectionTitle("MỨC ĐỘ KHẨN CẤP")

                    SosUrgency.entries.forEach { urgency ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(
                                    if (uiState.urgency == urgency) {
                                        SosCardSelected
                                    } else {
                                        SosCard
                                    }
                                )
                                .clickable(enabled = formEnabled) {
                                    viewModel.selectUrgency(urgency)
                                }
                                .padding(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = uiState.urgency == urgency,
                                enabled = formEnabled,
                                onClick = {
                                    viewModel.selectUrgency(urgency)
                                }
                            )

                            Text(
                                text = urgency.label,
                                color = SosText,
                                modifier = Modifier.padding(start = 8.dp)
                            )
                        }
                    }

                    uiState.validationErrors.urgency?.let { error ->
                        Text(
                            text = error,
                            color = SosPink,
                            fontSize = 12.sp
                        )
                    }
                }
            }

            item {
                SosSectionTitle(
                    "GHI CHÚ CHO ĐỘI CỨU HỘ"
                )

                Spacer(Modifier.height(8.dp))

                SosNoteField(
                    note = uiState.note,
                    enabled = formEnabled,
                    onNoteChange = viewModel::updateNote
                )
            }


            item {
                if (uiState.isSubmitting) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(24.dp),
                            color = SosCyan,
                            strokeWidth = 2.dp
                        )

                        Text(
                            "Đang gửi yêu cầu SOS...",
                            color = SosText
                        )
                    }
                }

                uiState.submitError?.let { error ->
                    Text(
                        text = error,
                        color = SosPink,
                        fontSize = 13.sp
                    )
                }

                uiState.submittedSosId?.let { sosId ->
                    Text(
                        text = "Yêu cầu SOS đã được hệ thống ghi nhận. Mã: $sosId",
                        color = Color(0xFF22D3A0),
                        fontSize = 13.sp
                    )
                }
            }

            item {
                Button(
                    onClick = {
                        val isValid = viewModel.validateForm()

                        android.util.Log.d(
                            "SosValidation",
                            "SOS button clicked, isValid=$isValid"
                        )

                        if (isValid) {
                            showSubmitConfirmation = true
                        } else {
                            val errors = viewModel.uiState.value.validationErrors

                            val situationCount = SosSituation.entries.size

                            val targetIndex = when {
                                errors.location != null -> 1

                                errors.situations != null -> 2

                                errors.peopleCount != null ->
                                    3 + situationCount

                                errors.exactPeopleCount != null ->
                                    4 + situationCount

                                errors.waterLevel != null ->
                                    5 + situationCount

                                errors.urgency != null ->
                                    6 + situationCount

                                else -> 0
                            }

                            scope.launch {
                                listState.animateScrollToItem(targetIndex)
                            }

                            android.widget.Toast.makeText(
                                context,
                                "Thông tin SOS chưa đầy đủ. Vui lòng kiểm tra các mục báo lỗi.",
                                android.widget.Toast.LENGTH_LONG
                            ).show()
                        }
                    },

                    enabled = !uiState.isSubmitting &&
                            uiState.submittedSosId == null,

                    modifier = Modifier
                        .fillMaxWidth()
                        .height(94.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = SosPink,
                        contentColor = Color(0xFF751010)
                    )
                ) {
                    Column(
                        horizontalAlignment =
                            Alignment.CenterHorizontally,
                        verticalArrangement =
                            Arrangement.Center
                    ) {
                        Text(
                            "◆ GỬI TÍN HIỆU SOS",
                            fontSize = 23.sp,
                            fontWeight = FontWeight.Black
                        )

                        Spacer(Modifier.height(5.dp))

                        Text(
                            "BẢN DEMO • CHƯA GỬI YÊU CẦU THẬT",
                            fontSize = 10.sp,
                            textAlign = TextAlign.Center,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            item {
                Row(
                    horizontalArrangement =
                        Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedButton(
                        onClick = {
                            val intent = Intent(
                                Intent.ACTION_DIAL,
                                Uri.parse("tel:114")
                            )
                            context.startActivity(intent)
                        },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(14.dp),
                        border = BorderStroke(
                            1.dp,
                            SosPink.copy(alpha = 0.5f)
                        )
                    ) {
                        Icon(
                            Icons.Default.Phone,
                            contentDescription = null,
                            tint = SosPink
                        )
                        Spacer(Modifier.width(5.dp))
                        Text(
                            "Gọi 114",
                            color = SosPink
                        )
                    }

                    OutlinedButton(
                        onClick = {
                            if (formEnabled) {
                                viewModel.resetForm()
                                gpsRetryKey++
                            }
                        },
                        enabled = formEnabled,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Icon(
                            Icons.Default.Check,
                            contentDescription = null,
                            tint = Color(0xFF22D3A0)
                        )
                        Spacer(Modifier.width(5.dp))
                        Text(
                            "Xóa mẫu",
                            color = Color(0xFF22D3A0)
                        )
                    }
                }
            }

            item {
                Text(
                    "⚠ Chỉ gửi SOS khi cần cứu hộ khẩn cấp.",
                    color = SosMuted,
                    fontSize = 12.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }


    if (showSubmitConfirmation) {
        AlertDialog(
            onDismissRequest = {
                showSubmitConfirmation = false
            },
            title = {
                Text("Xác nhận gửi SOS")
            },
            text = {
                Text(
                    "Bạn đã kiểm tra thông tin, số người cần hỗ trợ " +
                            "và vị trí GPS chưa? " +
                            "Chức năng gửi SOS thật chưa được kích hoạt " +
                            "trong bản kiểm thử này."
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showSubmitConfirmation = false
                        showDemoDialog = true
                    }
                ) {
                    Text("Tiếp tục Demo")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        showSubmitConfirmation = false
                    }
                ) {
                    Text("Quay lại")
                }
            }
        )
    }

    if (showDemoDialog) {
        AlertDialog(
            onDismissRequest = {
                showDemoDialog = false
            },
            title = {
                Text("Chức năng SOS đang phát triển")
            },
            text = {
                Text(
                    "Đây là giao diện thử nghiệm CCF-80. " +
                            "Ứng dụng chưa gửi yêu cầu SOS đến lực lượng cứu hộ. " +
                            "Tọa độ GPS chỉ được hiển thị trong biểu mẫu. " +
                            "Ứng dụng chưa gửi yêu cầu SOS lên hệ thống cứu hộ."
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDemoDialog = false
                    }
                ) {
                    Text("Đã hiểu")
                }
            }
        )
    }
}

@Composable
private fun SosTopBar(
    onBack: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(SosBackground)
            .statusBarsPadding()
            .padding(
                horizontal = 14.dp,
                vertical = 14.dp
            ),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(onClick = onBack) {
            Icon(
                imageVector =
                    Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = "Quay lại",
                tint = SosText
            )
        }

        Column(
            modifier = Modifier.weight(1f)
        ) {
            Text(
                "● GIAO DIỆN THỬ NGHIỆM",
                color = Color(0xFF23D6A4),
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold
            )

            Text(
                "Tín hiệu cứu hộ khẩn cấp",
                color = SosText,
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

@Composable
private fun SosEmergencyBanner() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(Color(0xFF291423))
            .padding(18.dp)
    ) {
        Text(
            "CẦN HỖ TRỢ KHẨN CẤP?",
            color = SosPink,
            fontSize = 18.sp,
            fontWeight = FontWeight.ExtraBold
        )

        Spacer(Modifier.height(10.dp))

        Text(
            "Điền thông tin tình huống để chuẩn bị " +
                    "yêu cầu cứu hộ. Chức năng gửi SOS thực tế " +
                    "chưa được kích hoạt trong bản demo này.",
            color = SosText,
            fontSize = 14.sp,
            lineHeight = 21.sp
        )

        Spacer(Modifier.height(10.dp))

        Text(
            "Kênh khẩn cấp: Có thể gọi 114",
            color = SosMuted,
            fontSize = 12.sp
        )
    }
}


@Composable
private fun SosLocationCard(
    uiState: SendSosUiState,
    isExpired: Boolean,
    enabled: Boolean,
    onRetry: () -> Unit,
    onRequestPermission: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(SosCard)
            .padding(16.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.LocationOn,
                contentDescription = null,
                tint = SosCyan
            )

            Spacer(Modifier.width(6.dp))

            Text(
                text = "VỊ TRÍ CỦA BẠN",
                color = SosCyan,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold
            )
        }

        Spacer(Modifier.height(12.dp))

        Text(
            text = uiState.locationText,
            color = SosText,
            fontWeight = FontWeight.Bold
        )

        if (isExpired) {
            Spacer(Modifier.height(8.dp))

            Text(
                text = "GPS đã quá 30 giây. Vui lòng cập nhật vị trí trước khi gửi SOS.",
                color = SosPink,
                fontSize = 12.sp
            )
        }

        if (
            uiState.latitude != null &&
            uiState.longitude != null
        ) {
            Spacer(Modifier.height(8.dp))

            Text(
                text = "Vĩ độ: %.6f".format(
                    java.util.Locale.US,
                    uiState.latitude
                ),
                color = SosText,
                fontSize = 13.sp
            )

            Text(
                text = "Kinh độ: %.6f".format(
                    java.util.Locale.US,
                    uiState.longitude
                ),
                color = SosText,
                fontSize = 13.sp
            )

            uiState.locationAccuracyMeters?.let { accuracy ->
                Text(
                    text = "Độ chính xác ước tính: %.1f m".format(
                        java.util.Locale.US,
                        accuracy
                    ),
                    color = SosMuted,
                    fontSize = 12.sp
                )
            }

            Text(
                text = "Vị trí được ghi nhận từ thiết bị, không bảo đảm chính xác tuyệt đối.",
                color = SosMuted,
                fontSize = 11.sp
            )
        }

        if (uiState.isLoadingLocation) {
            Spacer(Modifier.height(10.dp))
            CircularProgressIndicator(
                modifier = Modifier.size(24.dp),
                color = SosCyan,
                strokeWidth = 2.dp
            )
        }


        uiState.locationError?.let { error ->
            Spacer(Modifier.height(8.dp))

            Text(
                text = error,
                color = SosPink,
                fontSize = 12.sp
            )

            if (error.contains("quyền", ignoreCase = true)) {
                Spacer(Modifier.height(8.dp))

                OutlinedButton(
                    onClick = onRequestPermission,
                    enabled = enabled
                ) {
                    Text("Cấp quyền vị trí", color = SosCyan)
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        OutlinedButton(
            onClick = onRetry,
            enabled = enabled && !uiState.isLoadingLocation,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                "Cập nhật GPS",
                color = SosCyan
            )
        }

    }
}


@Composable
private fun SosSectionTitle(title: String) {
    Text(
        text = title,
        color = SosMuted,
        fontSize = 12.sp,
        letterSpacing = 1.sp,
        fontWeight = FontWeight.Bold
    )
}

@Composable
private fun SosSituationRow(
    situation: SosSituation,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(
                if (selected) SosCardSelected else SosCard
            )
            .clickable(enabled = enabled, onClick = onClick)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            situation.label,
            color = SosText,
            fontSize = 15.sp,
            modifier = Modifier.weight(1f)
        )

        Spacer(Modifier.width(12.dp))

        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(RoundedCornerShape(50))
                .background(
                    if (selected) SosCyan
                    else Color(0xFF314558)
                ),
            contentAlignment = Alignment.Center
        ) {
            if (selected) {
                Icon(
                    Icons.Default.Check,
                    contentDescription = "Đã chọn",
                    tint = SosBackground,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    }
}

@Composable
private fun SosChoiceChip(
    text: String,
    selected: Boolean,
    modifier: Modifier = Modifier,
    enabled: Boolean,
    onClick: () -> Unit
) {
    Box(
        modifier = modifier
            .height(56.dp)
            .clip(RoundedCornerShape(13.dp))
            .background(
                if (selected) SosCyan else SosCard
            )
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            color = if (selected) SosBackground else SosText
        )
    }
}

@Composable
private fun SosWaterLevelCard(
    level: SosWaterLevel,
    selected: Boolean,
    modifier: Modifier = Modifier,
    enabled: Boolean,
    onClick: () -> Unit
) {
    val accent = if (level == SosWaterLevel.DANGEROUS) {
        SosPink
    } else {
        SosYellow
    }

    Column(
        modifier = modifier
            .height(110.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(
                if (selected) SosCardSelected else SosCard
            )
            .clickable(enabled = enabled, onClick = onClick)
            .padding(12.dp),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement =
                Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                "≋",
                color = if (selected) accent else SosCyan,
                fontSize = 23.sp,
                fontWeight = FontWeight.Bold
            )

            if (selected) {
                Icon(
                    Icons.Default.Check,
                    contentDescription = "Đã chọn",
                    tint = accent,
                    modifier = Modifier.size(18.dp)
                )
            }
        }

        Text(
            level.label,
            color = if (selected) accent else SosText,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold
        )

        Text(
            level.description,
            color = if (selected) accent else SosMuted,
            fontSize = 12.sp
        )
    }
}


@Composable
private fun SosNoteField(
    note: String,
    enabled: Boolean,
    onNoteChange: (String) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(SosCard)
            .padding(14.dp)
    ) {
        OutlinedTextField(
            value = note,
            enabled = enabled,
            onValueChange = { newValue ->
                onNoteChange(newValue.take(200))
            },
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 120.dp),
            placeholder = {
                Text(
                    "Mô tả tình huống, dấu hiệu nhận biết " +
                            "vị trí và những người cần hỗ trợ...",
                    color = SosMuted,
                    fontSize = 14.sp
                )
            },
            textStyle = androidx.compose.ui.text.TextStyle(
                color = SosText,
                fontSize = 14.sp
            ),
            minLines = 3,
            maxLines = 6,
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = SosText,
                unfocusedTextColor = SosText,
                cursorColor = SosCyan,
                focusedBorderColor = SosCyan,
                unfocusedBorderColor = Color.Transparent,
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent
            )
        )

        Spacer(Modifier.height(4.dp))

        Text(
            text = "${note.length}/200 ký tự",
            color = SosMuted,
            fontSize = 11.sp,
            modifier = Modifier.align(Alignment.End)
        )
    }
}

