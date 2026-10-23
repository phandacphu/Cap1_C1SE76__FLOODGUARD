package com.example.floodguard.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.LocalDrink
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.MedicalServices
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.ElectricalServices
import androidx.compose.material.icons.filled.DirectionsBus
import androidx.compose.material.icons.filled.HealthAndSafety
import androidx.compose.material.icons.filled.Air
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.LocalHospital
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.floodguard.domain.model.SafeLocation
import com.example.floodguard.domain.model.SafeLocationFacility
import com.example.floodguard.domain.model.SafeLocationStatus

private val CardBackground = Color(0xFF15283B)
private val Cyan = Color(0xFF39D9E8)
private val SecondaryText = Color(0xFF9CAFC0)

@Composable
fun SafeLocationCard(
    location: SafeLocation,
    modifier: Modifier = Modifier,
    onViewDetail: (String) -> Unit = {},
    onDirections: (SafeLocation) -> Unit = {}
) {
    val statusColor = when (location.status) {
        SafeLocationStatus.AVAILABLE -> Color(0xFF41D69A)
        SafeLocationStatus.LIMITED -> Color(0xFFFFB84D)
        SafeLocationStatus.MEDICAL -> Cyan
        SafeLocationStatus.FULL -> Color(0xFFFF7272)
        SafeLocationStatus.UNKNOWN -> SecondaryText
    }

    val statusLabel = location.statusDescription.ifBlank {
        when (location.status) {
            SafeLocationStatus.AVAILABLE -> "Còn chỗ"
            SafeLocationStatus.LIMITED -> "Hạn chế tiếp nhận"
            SafeLocationStatus.MEDICAL -> "Hỗ trợ y tế"
            SafeLocationStatus.FULL -> "Đã đầy"
            SafeLocationStatus.UNKNOWN -> "Chưa xác định"
        }
    }

    val capacityKnown = location.capacity >= 0

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(
            containerColor = CardBackground
        )
    ) {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF1C3348))
                    .padding(
                        horizontal = 16.dp,
                        vertical = 12.dp
                    ),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(9.dp)
                        .background(
                            statusColor,
                            RoundedCornerShape(50)
                        )
                )

                Spacer(Modifier.width(8.dp))

                Text(
                    text = statusLabel.uppercase(),
                    color = statusColor,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f)
                )
            }

            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {

                // Tên và trạng thái
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top
                ) {
                    Column(
                        modifier = Modifier.weight(1f)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.Top
                        ) {
                            Text(
                                text = location.name,
                                modifier = Modifier.weight(1f),
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                fontSize = 17.sp,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis
                            )

                            Text(
                                text = location.distanceMeters?.let { meters ->
                                    if (meters >= 1000) {
                                        String.format(
                                            java.util.Locale.getDefault(),
                                            "%.1f km",
                                            meters / 1000.0
                                        )
                                    } else {
                                        "$meters m"
                                    }
                                } ?: "Chưa rõ",
                                color = Cyan,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1
                            )
                        }

                        Spacer(Modifier.height(6.dp))

                        Row(
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Default.LocationOn,
                                contentDescription = null,
                                tint = SecondaryText,
                                modifier = Modifier.size(15.dp)
                            )

                            Spacer(Modifier.width(4.dp))

                            Text(
                                text = location.address,
                                color = SecondaryText,
                                fontSize = 12.sp,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }


                }

                HorizontalDivider(
                    color = Color.White.copy(alpha = 0.1f)
                )

                // Thời gian di chuyển (dữ liệu minh họa)
                location.travelMinutes?.let { minutes ->
                    Text(
                        text = "Thời gian di chuyển tham khảo: $minutes phút (dữ liệu mẫu)",
                        color = SecondaryText,
                        fontSize = 12.sp
                    )
                }


                // Tổng sức chứa từ Backend.
                // Chưa có dữ liệu số người đang trú hoặc chỗ còn lại.
                Column(
                    verticalArrangement = Arrangement.spacedBy(7.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "Tổng sức chứa thiết kế",
                            color = SecondaryText,
                            fontSize = 12.sp
                        )

                        Text(
                            text = if (capacityKnown) {
                                "${location.capacity} người"
                            } else {
                                "Chưa có dữ liệu"
                            },
                            color = Color.White,
                            fontWeight = FontWeight.Medium,
                            fontSize = 12.sp
                        )
                    }

                    Text(
                        text = "Số người đang trú và chỗ còn lại: Chưa có dữ liệu xác minh",
                        color = SecondaryText,
                        fontSize = 11.sp
                    )
                }


                // Các tiện ích
                if (location.facilities.isNotEmpty()) {
                    Column(
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(
                            text = "TIỆN ÍCH",
                            color = SecondaryText,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold
                        )

                        location.facilities
                            .chunked(2)
                            .forEach { facilities ->
                                Row(
                                    horizontalArrangement =
                                        Arrangement.spacedBy(8.dp)
                                ) {
                                    facilities.forEach { facility ->
                                        FacilityTag(facility)
                                    }
                                }
                            }
                    }
                }

                // Thông báo an toàn
                if (location.safetyNote.isNotBlank()) {
                    Text(
                        text = location.safetyNote,
                        color = Color(0xFFFFB84D),
                        fontSize = 12.sp
                    )
                }

                // Nút thao tác
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedButton(
                        onClick = {
                            onViewDetail(location.id)
                        },
                        modifier = Modifier
                            .weight(1f)
                            .height(46.dp),
                        shape = RoundedCornerShape(12.dp),
                        border = androidx.compose.foundation.BorderStroke(
                            1.dp,
                            Cyan
                        ),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = Cyan
                        ),
                        contentPadding = PaddingValues(horizontal = 4.dp)
                    ) {
                        Text(
                            text = "Xem chi tiết",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1
                        )
                    }

                    Button(
                        onClick = {
                            onDirections(location)
                        },
                        enabled = location.isRouteSafe &&
                                location.isAcceptingPeople &&
                                location.availableSlots > 0 &&
                                location.latitude != 0.0 &&
                                location.longitude != 0.0,
                        modifier = Modifier
                            .weight(1f)
                            .height(46.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Cyan,
                            contentColor = Color(0xFF092334),
                            disabledContainerColor = Color(0xFF42566A),
                            disabledContentColor = SecondaryText
                        ),
                        contentPadding = PaddingValues(horizontal = 4.dp)
                    ) {
                        Text(
                            text = "Chỉ đường",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1
                        )

                        Spacer(modifier = Modifier.width(4.dp))

                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                            contentDescription = null,
                            modifier = Modifier.size(15.dp)
                        )
                    }
                }

                // Cảnh báo dữ liệu mẫu
                Text(
                    text = if (location.isVerified) {
                        "Thông tin địa điểm đã được xác minh"
                    } else {
                        "Thông tin tiếp nhận và an toàn chưa được xác minh"
                    },
                    color = SecondaryText,
                    fontSize = 10.sp
                )
            }
        }
    }
}

@Composable
private fun FacilityTag(
    facility: SafeLocationFacility
) {
    val (label, facilityIcon) = when (facility) {
        SafeLocationFacility.CLEAN_WATER ->
            "Nước uống" to Icons.Default.LocalDrink

        SafeLocationFacility.ELECTRICITY ->
            "Điện" to Icons.Default.Bolt

        SafeLocationFacility.MEDICAL ->
            "Y tế" to Icons.Default.MedicalServices

        SafeLocationFacility.HOT_MEALS ->
            "Thực phẩm" to Icons.Default.Restaurant

        SafeLocationFacility.GENERATOR ->
            "Máy phát điện" to Icons.Default.ElectricalServices

        SafeLocationFacility.RESCUE_PICKUP ->
            "Đón cứu hộ" to Icons.Default.DirectionsBus

        SafeLocationFacility.EMERGENCY_CARE ->
            "Cấp cứu" to Icons.Default.HealthAndSafety

        SafeLocationFacility.OXYGEN ->
            "Oxy" to Icons.Default.Air

        SafeLocationFacility.DOCTOR ->
            "Bác sĩ" to Icons.Default.Person

        SafeLocationFacility.AMBULANCE ->
            "Xe cứu thương" to Icons.Default.LocalHospital
    }

    Row(
        modifier = Modifier
            .background(
                Color.White.copy(alpha = 0.07f),
                RoundedCornerShape(8.dp)
            )
            .padding(
                horizontal = 9.dp,
                vertical = 7.dp
            ),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        Icon(
            imageVector = facilityIcon,
            contentDescription = null,
            tint = Cyan,
            modifier = Modifier.size(14.dp)
        )

        Text(
            text = label,
            color = Color(0xFFD2E5EE),
            fontSize = 11.sp,
            maxLines = 1
        )
    }
}