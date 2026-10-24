
package com.example.floodguard.ui.screens.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val Navy = Color(0xFF071521)
private val CardNavy = Color(0xFF102638)
private val Cyan = Color(0xFF20D7FF)
private val Gray = Color(0xFF91A9B9)

@Composable
fun ProfileScreen(
    fullName: String = "Chưa cập nhật",
    email: String = "Chưa cập nhật",
    phone: String = "Chưa cập nhật",

    // Dữ liệu lịch sử SOS từ ProfileViewModel
    sosState: ProfileSosUiState = ProfileSosUiState(),
    onRetrySos: () -> Unit = {},

    onBackClick: () -> Unit = {},
    onLogoutClick: () -> Unit = {},
    onMenuClick: (String) -> Unit = {}
) {
    var floodAlerts by remember { mutableStateOf(true) }
    var sosAlerts by remember { mutableStateOf(true) }
    var safetyAlerts by remember { mutableStateOf(true) }
    var locationAlerts by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Navy)
    ) {

        // =====================================
        // HEADER
        // =====================================
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onBackClick) {
                Icon(
                    imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
                    contentDescription = "Quay lại",
                    tint = Color.White
                )
            }

            Text(
                text = "HỒ SƠ CÁ NHÂN",
                modifier = Modifier.weight(1f),
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 18.sp
            )

            Icon(
                imageVector = Icons.Outlined.Notifications,
                contentDescription = "Thông báo",
                tint = Cyan
            )
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {

            // =====================================
            // THẺ TÀI KHOẢN
            // =====================================
            ProfileCard {
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Outlined.AccountCircle,
                        contentDescription = "Ảnh đại diện",
                        modifier = Modifier.size(60.dp),
                        tint = Cyan
                    )

                    Spacer(Modifier.width(12.dp))

                    Column {
                        Text(
                            text = fullName,
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp
                        )

                        Text(
                            text = email,
                            color = Gray,
                            fontSize = 12.sp
                        )

                        Text(
                            text = "Tài khoản FLOODGUARD",
                            color = Cyan,
                            fontSize = 11.sp
                        )
                    }
                }
            }

            // =====================================
            // THÔNG TIN ĐỊNH DANH
            // =====================================
            ProfileHeading("THÔNG TIN ĐỊNH DANH")

            ProfileCard {
                ProfileInfo("Họ và tên", fullName)
                ProfileInfo("Email", email)
                ProfileInfo("Số điện thoại", phone)
                ProfileInfo("Địa chỉ", "Chưa cập nhật")
                ProfileInfo("Vị trí", "Chưa có dữ liệu")
            }

            // =====================================
            // LỊCH SỬ YÊU CẦU SOS
            // =====================================
            ProfileHeading("THÔNG TIN CỨU HỘ & NHẬT KÝ")

            ProfileCard {

                Text(
                    text = "Lịch sử yêu cầu SOS",
                    color = Color.White,
                    fontWeight = FontWeight.Bold
                )

                Spacer(Modifier.height(12.dp))

                when {

                    // Đang gọi API
                    sosState.isLoading -> {
                        Row(
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(24.dp),
                                color = Cyan,
                                strokeWidth = 2.dp
                            )

                            Spacer(Modifier.width(12.dp))

                            Text(
                                text = "Đang tải lịch sử SOS...",
                                color = Gray,
                                fontSize = 12.sp
                            )
                        }
                    }

                    // API trả về lỗi
                    sosState.error != null -> {
                        Text(
                            text = sosState.error,
                            color = Color(0xFFFFB4AB),
                            fontSize = 12.sp
                        )

                        Spacer(Modifier.height(8.dp))

                        TextButton(
                            onClick = onRetrySos
                        ) {
                            Text(
                                text = "Thử lại",
                                color = Cyan
                            )
                        }
                    }

                    // Không có yêu cầu SOS
                    sosState.requests.isEmpty() -> {
                        Text(
                            text = "Bạn chưa có yêu cầu SOS nào.",
                            color = Gray,
                            fontSize = 12.sp
                        )
                    }

                    // Có dữ liệu SOS từ API
                    else -> {
                        sosState.requests.forEachIndexed { index, request ->

                            Text(
                                text = "Yêu cầu SOS #${index + 1}",
                                color = Cyan,
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp
                            )

                            Spacer(Modifier.height(6.dp))

                            ProfileInfo(
                                label = "Trạng thái",
                                value = request.status
                                    ?: "Chưa cập nhật"
                            )

                            ProfileInfo(
                                label = "Mức độ khẩn cấp",
                                value = request.urgency
                                    ?: "Chưa cập nhật"
                            )

                            ProfileInfo(
                                label = "Số người cần hỗ trợ",
                                value = request.numberOfPeople
                                    ?.toString()
                                    ?: "Chưa cập nhật"
                            )

                            ProfileInfo(
                                label = "Thời gian gửi",
                                value = request.createdAt
                                    ?: "Chưa cập nhật"
                            )

                            if (!request.note.isNullOrBlank()) {
                                ProfileInfo(
                                    label = "Ghi chú",
                                    value = request.note
                                )
                            }

                            if (index < sosState.requests.lastIndex) {
                                Spacer(Modifier.height(10.dp))

                                HorizontalDivider(
                                    color = Gray.copy(alpha = 0.25f)
                                )

                                Spacer(Modifier.height(10.dp))
                            }
                        }
                    }
                }

                Spacer(Modifier.height(8.dp))

                ProfileMenu(
                    title = "Xem yêu cầu cứu hộ",
                    action = "sos_history",
                    onClick = onMenuClick
                )
            }

            // =====================================
            // QUYỀN & QUYỀN TRUY CẬP
            // =====================================
            ProfileHeading("QUYỀN & QUYỀN TRUY CẬP")

            ProfileCard {
                ProfileMenu(
                    "Quyền truy cập vị trí",
                    "location_permission",
                    onMenuClick
                )

                ProfileMenu(
                    "Quyền nhận thông báo",
                    "notification_permission",
                    onMenuClick
                )

                ProfileMenu(
                    "Quản lý thông tin cá nhân",
                    "personal_info",
                    onMenuClick
                )
            }

            // =====================================
            // CÀI ĐẶT CẢNH BÁO THẢM HỌA
            // =====================================
            ProfileHeading("CÀI ĐẶT CẢNH BÁO THẢM HỌA")

            ProfileCard {
                ProfileSwitch(
                    title = "Cảnh báo lũ lụt",
                    checked = floodAlerts,
                    onCheckedChange = {
                        floodAlerts = it
                    }
                )

                ProfileSwitch(
                    title = "Thông báo cứu hộ SOS",
                    checked = sosAlerts,
                    onCheckedChange = {
                        sosAlerts = it
                    }
                )

                ProfileSwitch(
                    title = "Thông tin an toàn",
                    checked = safetyAlerts,
                    onCheckedChange = {
                        safetyAlerts = it
                    }
                )

                ProfileSwitch(
                    title = "Cảnh báo theo vị trí",
                    checked = locationAlerts,
                    onCheckedChange = {
                        locationAlerts = it
                    }
                )
            }

            // =====================================
            // BẢO MẬT & QUYỀN RIÊNG TƯ
            // =====================================
            ProfileHeading("BẢO MẬT & QUYỀN RIÊNG TƯ")

            ProfileCard {
                ProfileMenu(
                    "Đổi mật khẩu",
                    "change_password",
                    onMenuClick
                )

                ProfileMenu(
                    "Quản lý quyền riêng tư",
                    "privacy",
                    onMenuClick
                )
            }

            // =====================================
            // HỖ TRỢ & THÔNG TIN HỆ THỐNG
            // =====================================
            ProfileHeading("HỖ TRỢ & THÔNG TIN HỆ THỐNG")

            ProfileCard {
                ProfileMenu(
                    "Trung tâm trợ giúp",
                    "help",
                    onMenuClick
                )

                ProfileMenu(
                    "Về FLOODGUARD",
                    "about",
                    onMenuClick
                )
            }

            // =====================================
            // ĐĂNG XUẤT
            // =====================================
            Button(
                onClick = onLogoutClick,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFF173449)
                )
            ) {
                Text(
                    text = "ĐĂNG XUẤT",
                    color = Color.White
                )
            }

            Text(
                text = "FLOODGUARD là hệ thống nguyên mẫu, " +
                        "không thay thế dịch vụ cứu hộ chính thức.",
                color = Gray,
                fontSize = 10.sp,
                modifier = Modifier.padding(bottom = 20.dp)
            )
        }
    }
}

// =====================================
// PROFILE CARD
// =====================================
@Composable
private fun ProfileCard(
    content: @Composable ColumnScope.() -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                color = CardNavy,
                shape = RoundedCornerShape(12.dp)
            )
            .padding(14.dp),
        content = content
    )
}

// =====================================
// PROFILE HEADING
// =====================================
@Composable
private fun ProfileHeading(
    title: String
) {
    Text(
        text = title,
        color = Cyan,
        fontSize = 13.sp,
        fontWeight = FontWeight.Bold
    )
}

// =====================================
// PROFILE INFO
// =====================================
@Composable
private fun ProfileInfo(
    label: String,
    value: String
) {
    Column(
        modifier = Modifier.padding(vertical = 7.dp)
    ) {
        Text(
            text = label,
            color = Gray,
            fontSize = 11.sp
        )

        Text(
            text = value,
            color = Color.White,
            fontSize = 14.sp
        )
    }
}

// =====================================
// PROFILE MENU
// =====================================
@Composable
private fun ProfileMenu(
    title: String,
    action: String,
    onClick: (String) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable {
                onClick(action)
            }
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = title,
            modifier = Modifier.weight(1f),
            color = Color.White,
            fontSize = 13.sp
        )

        Icon(
            imageVector = Icons.AutoMirrored.Outlined.KeyboardArrowRight,
            contentDescription = null,
            tint = Gray
        )
    }
}

// =====================================
// PROFILE SWITCH
// =====================================
@Composable
private fun ProfileSwitch(
    title: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = title,
            modifier = Modifier.weight(1f),
            color = Color.White,
            fontSize = 12.sp
        )

        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedTrackColor = Cyan
            )
        )
    }
}
