package com.example.floodguard.ui.screens.rescue.profile

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.floodguard.R
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

private val ProfileBackground = Color(0xFF051424)
private val ProfileSurface = Color(0xFF122131)
private val ProfileTextColor = Color(0xFFD4E4FA)
private val ProfileMuted = Color(0xFFBBC9CD)
private val ProfileAccent = Color(0xFF45F797)
private val ProfileError = Color(0xFFFFB4AB)

private val ProfileFont = FontFamily(
    Font(R.font.rescue_be_vietnam_regular, FontWeight.Normal),
    Font(R.font.rescue_be_vietnam_semibold, FontWeight.SemiBold),
    Font(R.font.rescue_be_vietnam_bold, FontWeight.Bold)
)

@Composable
fun RescueProfileScreen(
    state: RescueProfileUiState,
    onRefresh: () -> Unit,
    onBack: () -> Unit,
    onLogout: suspend () -> Result<Unit>,
    onLoggedOut: () -> Unit
) {
    var isLoggingOut by remember { mutableStateOf(false) }
    var logoutError by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    val logout: () -> Unit = {
        if (!isLoggingOut) {
            isLoggingOut = true
            logoutError = null

            scope.launch {
                try {
                    val result = onLogout()

                    if (result.isSuccess) {
                        onLoggedOut()
                    } else {
                        logoutError =
                            "Không thể đăng xuất. Vui lòng thử lại."
                    }
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    logoutError =
                        "Không thể đăng xuất. Vui lòng thử lại."
                } finally {
                    isLoggingOut = false
                }
            }
        }
    }

    LaunchedEffect(state.sessionExpired) {
        if (state.sessionExpired) {
            logout()
        }
    }

    BackHandler(enabled = isLoggingOut) {
        // Đợi hoàn tất thao tác xóa phiên đăng nhập.
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ProfileBackground)
            .safeDrawingPadding()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(
                onClick = onBack,
                enabled = !isLoggingOut
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
                    contentDescription = "Quay lại",
                    tint = ProfileTextColor
                )
            }

            Text(
                text = "Hồ sơ nhân viên cứu hộ",
                modifier = Modifier.weight(1f),
                color = ProfileTextColor,
                fontFamily = ProfileFont,
                fontWeight = FontWeight.Bold,
                fontSize = 18.sp
            )
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            when {
                state.isLoading -> {
                    ProfilePanel {
                        CircularProgressIndicator(
                            color = ProfileAccent
                        )
                        ProfileText("Đang tải thông tin hồ sơ…")
                    }
                }

                state.error != null -> {
                    ProfilePanel {
                        ProfileText(
                            text = state.error.orEmpty(),
                            color = ProfileError
                        )

                        if (!state.sessionExpired) {
                            Button(
                                onClick = onRefresh,
                                enabled = !isLoggingOut,
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = ProfileAccent,
                                    contentColor = ProfileBackground
                                )
                            ) {
                                Text(
                                    text = "Thử lại",
                                    fontFamily = ProfileFont
                                )
                            }
                        }
                    }
                }

                state.profile != null -> {
                    val profile = state.profile

                    ProfilePanel {
                        Row(
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.AccountCircle,
                                contentDescription = null,
                                modifier = Modifier.size(56.dp),
                                tint = ProfileAccent
                            )

                            Column(
                                modifier = Modifier
                                    .weight(1f)
                                    .padding(start = 12.dp),
                                verticalArrangement =
                                    Arrangement.spacedBy(6.dp)
                            ) {
                                ProfileText(
                                    text = displayProfileValue(
                                        profile.fullName
                                    ),
                                    bold = true
                                )
                                ProfileText(
                                    text = "Nhân viên cứu hộ",
                                    color = ProfileAccent
                                )
                            }
                        }
                    }

                    ProfilePanel {
                        ProfileText(
                            text = "Thông tin cá nhân",
                            bold = true
                        )

                        ProfileField("Họ và tên", profile.fullName)
                        ProfileField("Email", profile.email)
                        ProfileField("Số điện thoại", profile.phone)
                        ProfileField("Mã tài khoản", profile.id)
                        ProfileField("Vai trò", "Nhân viên cứu hộ")
                        ProfileField(
                            label = "Trạng thái",
                            value = when (profile.isActive) {
                                true -> "Đang hoạt động"
                                false -> "Đã vô hiệu hóa"
                                null -> "Chưa có thông tin"
                            }
                        )
                    }
                }

                else -> {
                    ProfilePanel {
                        ProfileText(
                            "Chưa tải được thông tin hồ sơ."
                        )
                        TextButton(onClick = onRefresh) {
                            ProfileText(
                                text = "Thử lại",
                                color = ProfileAccent
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(4.dp))
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            logoutError?.let { message ->
                ProfileText(
                    text = message,
                    color = ProfileError
                )
            }

            OutlinedButton(
                onClick = logout,
                enabled = !isLoggingOut,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
            ) {
                ProfileText(
                    text = when {
                        isLoggingOut -> "Đang đăng xuất…"
                        state.sessionExpired -> "Đăng nhập lại"
                        else -> "Đăng xuất"
                    },
                    color = ProfileAccent,
                    bold = true
                )
            }
        }
    }
}

@Composable
private fun ProfilePanel(
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = ProfileSurface
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            content = content
        )
    }
}

@Composable
private fun ProfileField(
    label: String,
    value: String?
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(
            text = label,
            color = ProfileMuted,
            fontFamily = ProfileFont,
            fontSize = 12.sp
        )

        ProfileText(displayProfileValue(value))
    }
}

@Composable
private fun ProfileText(
    text: String,
    color: Color = ProfileTextColor,
    bold: Boolean = false
) {
    Text(
        text = text,
        color = color,
        fontFamily = ProfileFont,
        fontWeight = if (bold) {
            FontWeight.SemiBold
        } else {
            FontWeight.Normal
        },
        fontSize = 14.sp
    )
}

private fun displayProfileValue(value: String?): String {
    return value
        ?.trim()
        ?.takeIf { it.isNotEmpty() }
        ?: "Chưa cập nhật"
}