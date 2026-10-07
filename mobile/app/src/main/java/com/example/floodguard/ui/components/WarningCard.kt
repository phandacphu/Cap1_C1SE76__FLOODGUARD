package com.example.floodguard.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.example.floodguard.domain.model.Warning


@Composable
fun WarningCard(
    warning: Warning,
    onClick: () -> Unit
) {

    val severityInfo =
        getSeverityInfo(
            severity = warning.severity
        )

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable {
                onClick()
            },

        shape = RoundedCornerShape(18.dp),

        border = BorderStroke(
            width = 1.dp,
            color = severityInfo.color.copy(
                alpha = 0.35f
            )
        ),

        colors = CardDefaults.cardColors(
            containerColor = Color(0xFF0D1726)
        ),

        elevation = CardDefaults.cardElevation(
            defaultElevation = 0.dp
        )
    ) {

        Column(
            modifier = Modifier.fillMaxWidth()
        ) {

            // =========================
            // THANH MÀU SEVERITY
            // =========================

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(5.dp)
            ) {

                Surface(
                    modifier = Modifier.matchParentSize(),
                    color = severityInfo.color
                ) {}
            }


            // =========================
            // CONTENT
            // =========================

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(
                        horizontal = 16.dp,
                        vertical = 16.dp
                    )
            ) {

                // =========================
                // SEVERITY + TIME
                // =========================

                Row(
                    modifier = Modifier.fillMaxWidth(),

                    horizontalArrangement =
                        Arrangement.SpaceBetween,

                    verticalAlignment =
                        Alignment.CenterVertically
                ) {

                    Surface(
                        color =
                            severityInfo.color.copy(
                                alpha = 0.14f
                            ),

                        shape =
                            RoundedCornerShape(8.dp)
                    ) {

                        Text(
                            text =
                                severityInfo.label,

                            color =
                                severityInfo.color,

                            style =
                                MaterialTheme
                                    .typography
                                    .labelMedium,

                            fontWeight =
                                FontWeight.Bold,

                            modifier = Modifier.padding(
                                horizontal = 10.dp,
                                vertical = 6.dp
                            )
                        )
                    }

                    Text(
                        text = warning.startTime,

                        color =
                            Color(0xFF94A3B8),

                        style =
                            MaterialTheme
                                .typography
                                .labelMedium,

                        fontWeight =
                            FontWeight.Medium
                    )
                }


                Spacer(
                    modifier = Modifier.height(14.dp)
                )


                // =========================
                // TITLE
                // =========================

                Text(
                    text = warning.title,

                    color = Color.White,

                    style =
                        MaterialTheme
                            .typography
                            .titleMedium,

                    fontWeight =
                        FontWeight.Bold,

                    maxLines = 2,

                    overflow =
                        TextOverflow.Ellipsis
                )


                Spacer(
                    modifier = Modifier.height(9.dp)
                )


                // =========================
                // AREA
                // =========================

                Text(
                    text = "📍 ${warning.area}",

                    color =
                        Color(0xFFB8C4D6),

                    style =
                        MaterialTheme
                            .typography
                            .bodySmall,

                    maxLines = 2,

                    overflow =
                        TextOverflow.Ellipsis
                )


                Spacer(
                    modifier = Modifier.height(14.dp)
                )


                // =========================
                // CONTENT
                // =========================

                Text(
                    text = warning.content,

                    color =
                        Color(0xFFD5DEE9),

                    style =
                        MaterialTheme
                            .typography
                            .bodyMedium,

                    lineHeight =
                        MaterialTheme
                            .typography
                            .bodyMedium
                            .lineHeight
                )


                // =========================
                // MOCK METRIC
                // =========================

                if (
                    warning.metricLeftValue != null ||
                    warning.metricRightValue != null
                ) {

                    Spacer(
                        modifier =
                            Modifier.height(18.dp)
                    )

                    Row(
                        modifier =
                            Modifier.fillMaxWidth(),

                        horizontalArrangement =
                            Arrangement.spacedBy(
                                10.dp
                            )
                    ) {

                        WarningMetricBox(
                            modifier =
                                Modifier.weight(1f),

                            label =
                                warning.metricLeftLabel,

                            value =
                                warning.metricLeftValue,

                            accentColor =
                                severityInfo.color
                        )

                        WarningMetricBox(
                            modifier =
                                Modifier.weight(1f),

                            label =
                                warning.metricRightLabel,

                            value =
                                warning.metricRightValue,

                            accentColor =
                                severityInfo.color
                        )
                    }
                }


                Spacer(
                    modifier =
                        Modifier.height(18.dp)
                )


                HorizontalDivider(
                    color =
                        Color(0xFF1E293B),

                    thickness = 1.dp
                )


                Spacer(
                    modifier =
                        Modifier.height(12.dp)
                )


                // =========================
                // FOOTER
                // =========================

                Row(
                    modifier =
                        Modifier.fillMaxWidth(),

                    horizontalArrangement =
                        Arrangement.SpaceBetween,

                    verticalAlignment =
                        Alignment.CenterVertically
                ) {

                    Text(
                        text =
                            warning.footerText
                                ?: if (
                                    warning.isActive
                                ) {
                                    "ĐANG HOẠT ĐỘNG"
                                } else {
                                    "ĐÃ KẾT THÚC"
                                },

                        color =
                            if (warning.isActive) {
                                severityInfo.color
                            } else {
                                Color(0xFF64748B)
                            },

                        style =
                            MaterialTheme
                                .typography
                                .labelSmall,

                        fontWeight =
                            FontWeight.Bold,

                        modifier =
                            Modifier.weight(1f),

                        maxLines = 1,

                        overflow =
                            TextOverflow.Ellipsis
                    )


                    Spacer(
                        modifier =
                            Modifier.width(12.dp)
                    )


                    Text(
                        text = "Xem chi tiết  ›",

                        color =
                            Color(0xFF22D3EE),

                        style =
                            MaterialTheme
                                .typography
                                .labelMedium,

                        fontWeight =
                            FontWeight.SemiBold
                    )
                }
            }
        }
    }
}


// =====================================================
// METRIC BOX
// =====================================================

@Composable
private fun WarningMetricBox(
    modifier: Modifier = Modifier,
    label: String?,
    value: String?,
    accentColor: Color
) {

    Surface(
        modifier = modifier,

        color =
            Color(0xFF111D2E),

        shape =
            RoundedCornerShape(12.dp),

        border =
            BorderStroke(
                width = 1.dp,
                color = Color(0xFF1E2D42)
            )
    ) {

        Column(
            modifier = Modifier.padding(
                horizontal = 12.dp,
                vertical = 12.dp
            )
        ) {

            Text(
                text =
                    label ?: "THÔNG SỐ",

                color =
                    Color(0xFF7E8DA3),

                style =
                    MaterialTheme
                        .typography
                        .labelSmall,

                fontWeight =
                    FontWeight.Medium,

                maxLines = 1,

                overflow =
                    TextOverflow.Ellipsis
            )


            Spacer(
                modifier =
                    Modifier.height(6.dp)
            )


            Text(
                text =
                    value ?: "--",

                color =
                    accentColor,

                style =
                    MaterialTheme
                        .typography
                        .titleMedium,

                fontWeight =
                    FontWeight.Bold,

                maxLines = 1,

                overflow =
                    TextOverflow.Ellipsis
            )
        }
    }
}


// =====================================================
// SEVERITY
// =====================================================

private data class SeverityInfo(
    val label: String,
    val color: Color
)


private fun getSeverityInfo(
    severity: String
): SeverityInfo {

    return when (
        severity.lowercase()
    ) {

        "critical" -> {

            SeverityInfo(
                label = "KHẨN CẤP",
                color = Color(0xFFFF3B4E)
            )
        }


        "high" -> {

            SeverityInfo(
                label = "CẤP 3 – CAO",
                color = Color(0xFFFF4D4F)
            )
        }


        "medium" -> {

            SeverityInfo(
                label = "CẤP 2 – TRUNG BÌNH",
                color = Color(0xFFFFA726)
            )
        }


        "low" -> {

            SeverityInfo(
                label = "CẤP 1 – THẤP",
                color = Color(0xFFFFD54F)
            )
        }


        else -> {

            SeverityInfo(
                label = "KHÔNG XÁC ĐỊNH",
                color = Color(0xFF94A3B8)
            )
        }
    }
}