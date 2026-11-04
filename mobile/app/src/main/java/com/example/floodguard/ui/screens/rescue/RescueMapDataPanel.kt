package com.example.floodguard.ui.screens.rescue

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.floodguard.R

private val DataText = Color(0xFFD4E4FA)
private val DataMuted = Color(0xFFBBC9CD)
private val DataCyan = Color(0xFF8AEBFF)
private val DataFont = FontFamily(Font(R.font.rescue_be_vietnam_regular))

@Composable
internal fun RescueMapDataPanel(
    state: RescueMapDataUiState,
    onRefresh: () -> Unit,
    onRetryAreas: () -> Unit,
    onRetryWarnings: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF122131))
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Dữ liệu từ hệ thống",
                    modifier = Modifier.weight(1f),
                    fontFamily = DataFont,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    color = DataText
                )
                TextButton(onClick = onRefresh, enabled = !state.isLoading) {
                    Text("Cập nhật", fontFamily = DataFont, color = if (state.isLoading) DataMuted else DataCyan)
                }
            }
            DataLayerRow("Vùng ngập", state.floodAreas, "Chưa có dữ liệu vùng ngập.", onRetryAreas)
            DataLayerRow("Cảnh báo hiện hành", state.activeWarnings, "Không có cảnh báo hiện hành.", onRetryWarnings)
            Text(
                "Có thể xem bản đồ khi chưa cấp quyền vị trí.",
                modifier = Modifier.padding(bottom = 8.dp),
                fontFamily = DataFont, fontSize = 11.sp, color = DataMuted
            )
        }
    }
}

@Composable
private fun DataLayerRow(
    title: String,
    state: RescueMapLoadState<*>,
    emptyMessage: String,
    onRetry: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, fontFamily = DataFont, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = DataText)
            val message = when (state) {
                RescueMapLoadState.Loading -> "Đang tải…"
                RescueMapLoadState.Empty -> emptyMessage
                is RescueMapLoadState.Data<*> -> "Đã tải ${state.items.size} bản ghi"
                is RescueMapLoadState.Error -> state.message
            }
            Text(message, fontFamily = DataFont, fontSize = 12.sp, lineHeight = 17.sp, color = DataMuted)
        }
        if (state is RescueMapLoadState.Loading) {
            CircularProgressIndicator(modifier = Modifier.size(18.dp), color = DataCyan, strokeWidth = 2.dp)
        } else if (state is RescueMapLoadState.Error) {
            TextButton(onClick = onRetry) {
                Text("Thử lại", fontFamily = DataFont, color = DataCyan)
            }
        }
    }
}
