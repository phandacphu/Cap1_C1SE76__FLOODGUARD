package com.example.floodguard.ui.screens.rescue

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

@Composable
fun RescueEntryScreen(
    accessDenied: Boolean = false,
    onLogout: suspend () -> Result<Unit>,
    onLoggedOut: () -> Unit
) {
    if (!accessDenied) {
        RescueOverviewScreen(
            onLogout = onLogout,
            onLoggedOut = onLoggedOut
        )
        return
    }
    var isLoggingOut by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = Color(0xFFF4F7FA),
        contentColor = Color(0xFF172B4D)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .safeDrawingPadding()
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "FLOODGUARD",
                style = MaterialTheme.typography.titleMedium
            )

            Text(
                text = if (accessDenied) {
                    "Tài khoản chưa được hỗ trợ"
                } else {
                    "Khu vực cứu hộ"
                },
                style = MaterialTheme.typography.headlineMedium
            )

            Text(
                text = if (accessDenied) {
                    "Không xác định được vai trò phù hợp trên ứng dụng. " +
                            "Vui lòng đăng xuất và liên hệ quản trị viên."
                } else {
                    "Bạn đã đăng nhập bằng tài khoản cứu hộ. " +
                            "Các chức năng cứu hộ sẽ được bổ sung ở những task tiếp theo."
                },
                style = MaterialTheme.typography.bodyLarge
            )

            errorMessage?.let { message ->
                Text(
                    text = message,
                    color = Color(0xFFB3261E)
                )
            }

            Button(
                modifier = Modifier.fillMaxWidth(),
                enabled = !isLoggingOut,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFF1565C0),
                    contentColor = Color.White
                ),
                onClick = {
                    if (!isLoggingOut) {
                        isLoggingOut = true
                        errorMessage = null

                        scope.launch {
                            val result = onLogout()

                            if (result.isSuccess) {
                                onLoggedOut()
                            } else {
                                errorMessage =
                                    "Không thể đăng xuất. Vui lòng thử lại."
                            }

                            isLoggingOut = false
                        }
                    }
                }
            ) {
                Text(
                    text = if (isLoggingOut) {
                        "Đang đăng xuất..."
                    } else {
                        "Đăng xuất"
                    }
                )
            }
        }
    }
}