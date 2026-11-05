package com.example.floodguard.ui.screens.rescue

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.floodguard.R
import com.google.android.gms.maps.model.LatLng
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun RescueHistoryPointSheet(
    point: LatLng,
    onFocus: () -> Unit,
    onDismiss: () -> Unit
) {
    val font = FontFamily(Font(R.font.rescue_be_vietnam_regular))
    val cyan = Color(0xFF8AEBFF)
    val text = Color(0xFFD4E4FA)
    val muted = Color(0xFFBBC9CD)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = Color(0xFF122131),
        contentColor = text
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(modifier = Modifier.fillMaxWidth()) {
                Text("Thông tin vùng ngập", modifier = Modifier.weight(1f),
                    fontFamily = font, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                TextButton(onClick = onDismiss) {
                    Text("Đóng", fontFamily = font, color = cyan)
                }
            }
            Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF1B3040))) {
                Column(modifier = Modifier.fillMaxWidth().padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Ngập lịch sử", fontFamily = font, fontWeight = FontWeight.Bold, color = text)
                    Text("Loại dữ liệu: Điểm ngập lịch sử", fontFamily = font, color = muted)
                    Text(String.format(Locale.ROOT, "Vĩ độ: %.6f\nKinh độ: %.6f", point.latitude, point.longitude),
                        fontFamily = font, color = muted)
                    Text("Thông tin chi tiết chưa được bổ sung.", fontFamily = font, color = muted)
                    Button(onClick = onFocus, colors = ButtonDefaults.buttonColors(
                        containerColor = cyan, contentColor = Color(0xFF051424))) {
                        Text("Xem trên bản đồ", fontFamily = font)
                    }
                }
            }
            Text("Dữ liệu tham khảo lịch sử, không phản ánh tình trạng ngập hiện tại.",
                fontFamily = font, color = muted, fontSize = 13.sp)
        }
    }
}
