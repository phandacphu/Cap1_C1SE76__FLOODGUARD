package com.example.floodguard.ui.screens.warning

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.floodguard.core.notifications.NotificationDeviceRuntime
import com.example.floodguard.data.local.SessionManager
import com.example.floodguard.data.model.FloodLocationV2Status
import com.example.floodguard.data.repository.WarningZoneGroup
import java.time.Instant
import java.util.Locale

@Composable
fun FloodWarningLocationSection(
    sessionManager: SessionManager,
    runtime: NotificationDeviceRuntime,
    onOpen: (String) -> Unit
) {
    val sessionFlow = remember(sessionManager) {
        sessionManager.authenticatedSessionFlow
    }
    val session by sessionFlow.collectAsStateWithLifecycle(
        initialValue = null
    )
    val locationState by runtime.locationState.collectAsStateWithLifecycle()

    // Không hiển thị cache của generation/tài khoản trước.
    val currentSession = session
    val sameSession =
        currentSession != null &&
                currentSession.user.role == "resident" &&
                locationState.generation == currentSession.generation

    val evaluation = if (sameSession) {
        locationState.evaluation?.forDisplayAt(Instant.now())
    } else {
        null
    }

    val hasActive = evaluation?.activeAlertIds?.isNotEmpty() == true
    val status = evaluation?.status

    val accent = when {
        !hasActive -> Color(0xFF8FA6B8)

        status == FloodLocationV2Status.INSIDE &&
                evaluation?.matches?.any {
                    it.relation == FloodLocationV2Status.INSIDE &&
                            it.group == WarningZoneGroup.CURRENT_FLOOD
                } == true -> Color(0xFFFF5A46)

        status == FloodLocationV2Status.INSIDE ||
                status == FloodLocationV2Status.NEAR ->
            Color(0xFFFFB74D)

        status == FloodLocationV2Status.FAR ->
            Color(0xFF00C8ED)

        else -> Color(0xFF8FA6B8)
    }

    val localReason =
        if (sameSession) locationState.reason else "stopped"

    val message = when {
        localReason in setOf(
            "permission_denied",
            "location_disabled",
            "offline"
        ) -> locationUnknownMessage(localReason)

        evaluation != null && !hasActive ->
            "Chưa có bản tin đang bật. Bạn vẫn có thể xem bản tin chung và lịch sử."

        status == FloodLocationV2Status.INSIDE ->
            "Vị trí của bạn nằm trong vùng được công bố, bao gồm ranh giới."

        status == FloodLocationV2Status.NEAR ->
            "Vị trí của bạn ở ngoài vùng và cách ranh giới gần nhất không quá 500 m."

        status == FloodLocationV2Status.FAR ->
            "Vị trí hiện tại nằm ngoài phạm vi cảnh báo theo bộ dữ liệu đủ điều kiện. " +
                    "Kết quả này không khẳng định khu vực an toàn."

        else -> locationUnknownMessage(
            if (sameSession) {
                evaluation?.reason ?: locationState.reason
            } else {
                "stopped"
            }
        )
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFF0B1726)
        ),
        border = BorderStroke(1.dp, accent.copy(alpha = 0.65f))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                text = "CẢNH BÁO THEO VỊ TRÍ",
                color = Color(0xFFF4F7FA),
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp
            )

            Text(
                text = message,
                color = accent,
                fontSize = 14.sp
            )

            if (
                evaluation != null &&
                hasActive &&
                (
                        status == FloodLocationV2Status.INSIDE ||
                                status == FloodLocationV2Status.NEAR
                        )
            ) {
                // Parser đã sắp inside trước near,
                // và near theo khoảng cách gốc.
                // Hiển thị toàn bộ matches, không lấy riêng vùng đầu tiên.
                evaluation.matches.forEachIndexed { index, match ->
                    val groupLabel = when (match.group) {
                        WarningZoneGroup.CURRENT_FLOOD ->
                            "Ngập hiện tại"

                        WarningZoneGroup.HISTORICAL_FLOOD ->
                            "Ngập lịch sử"

                        WarningZoneGroup.LOW_LYING ->
                            "Vùng trũng"
                    }

                    val zoneName = match.name
                        ?.takeIf { it.isNotBlank() }
                        ?: "Vùng chưa có tên"

                    val relationText =
                        if (match.relation == FloodLocationV2Status.INSIDE) {
                            "Trong vùng, bao gồm ranh giới"
                        } else {
                            val distance = match.distanceToBoundaryM
                            if (distance != null) {
                                val formatted = String.format(
                                    Locale("vi", "VN"),
                                    "%.1f",
                                    distance
                                )
                                "Ngoài vùng, cách ranh giới khoảng $formatted m"
                            } else {
                                "Gần vùng"
                            }
                        }

                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(
                            text = "${index + 1}. $zoneName",
                            color = Color(0xFFF4F7FA),
                            fontWeight = FontWeight.SemiBold
                        )

                        Text(
                            text = "$groupLabel · $relationText",
                            color = accent,
                            fontSize = 13.sp
                        )

                        when (match.group) {
                            WarningZoneGroup.HISTORICAL_FLOOD ->
                                Text(
                                    text = "Đây là vùng từng ngập, không xác nhận hiện đang ngập.",
                                    color = Color(0xFF8FA6B8),
                                    fontSize = 12.sp
                                )

                            WarningZoneGroup.LOW_LYING ->
                                Text(
                                    text = "Có nguy cơ khi mưa lớn, không đồng nghĩa hiện đang ngập.",
                                    color = Color(0xFF8FA6B8),
                                    fontSize = 12.sp
                                )

                            WarningZoneGroup.CURRENT_FLOOD -> Unit
                        }
                    }
                }
            }

            if (evaluation?.coverage?.status == "partial") {
                Text(
                    text = "Dữ liệu vùng chưa đầy đủ. Không thể kết luận ngoài phạm vi " +
                            "chỉ vì không tìm thấy vùng phù hợp.",
                    color = Color(0xFFFFB74D),
                    fontSize = 12.sp
                )
            }

            evaluation?.activeAlertIds?.forEachIndexed { index, alertId ->
                TextButton(
                    onClick = { onOpen(alertId) }
                ) {
                    Text(
                        text = if (evaluation.activeAlertIds.size == 1) {
                            "Xem bản tin"
                        } else {
                            "Xem bản tin ${index + 1}"
                        },
                        color = Color(0xFF00C8ED)
                    )
                }
            }

            TextButton(onClick = runtime::refreshLocation) {
                Text(
                    text = "Cập nhật vị trí",
                    color = Color(0xFF00C8ED)
                )
            }

            Text(
                text = "Bạn vẫn đọc được bản tin chung khi không cấp quyền vị trí.",
                color = Color(0xFF8FA6B8),
                fontSize = 12.sp
            )
        }
    }
}

private fun locationUnknownMessage(reason: String?): String =
    when (reason) {
        "permission_denied" ->
            "Chưa xác định được vị trí. Bạn chưa cấp quyền vị trí cho ứng dụng."

        "location_disabled" ->
            "Chưa xác định được vị trí. Hãy bật Vị trí trên điện thoại."

        "offline" ->
            "Đang mất kết nối Internet. Chưa thể cập nhật đánh giá vị trí."

        "acquiring_location" ->
            "Đang lấy vị trí và đối chiếu dữ liệu."

        "no_fix" ->
            "Chưa lấy được mẫu vị trí mới. Hãy thử ở nơi thoáng hơn."

        "stale_location" ->
            "Vị trí trước đã hết hạn. Cần lấy mẫu vị trí mới."

        "poor_accuracy" ->
            "Độ chính xác vị trí chưa đủ để xác định phạm vi cảnh báo."

        "incomplete_zone_data", "zone_data_unavailable", "no_zones" ->
            "Dữ liệu vùng chưa đủ điều kiện để xác định phạm vi cảnh báo."

        "invalid_location_time" ->
            "Thời điểm đo vị trí chưa hợp lệ. Hãy kiểm tra giờ điện thoại."

        "context_changed" ->
            "Phiên thiết bị đã thay đổi. Chưa có đánh giá vị trí mới."

        "no_active_alert" ->
            "Chưa có bản tin đang bật."

        else ->
            "Chưa có đánh giá vị trí hợp lệ. Nhấn Cập nhật vị trí để thử lại."
    }