package com.example.floodguard.ui.screens.home

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Air
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Sos
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.WaterDrop
import androidx.compose.material.icons.filled.Waves

import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue

import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

import androidx.lifecycle.viewmodel.compose.viewModel

import com.example.floodguard.ui.navigation.AppRoutes


// =====================================================
// COLORS
// =====================================================

private val HomeBackground = Color(0xFF06111D)

private val HeaderBackground = Color(0xFF081522)

private val CardBackground = Color(0xFF0D1B29)

private val CardBackground2 = Color(0xFF102231)

private val BorderColor = Color(0xFF1D3547)

private val WhiteText = Color(0xFFF3F7FA)

private val GrayText = Color(0xFF8FA6B8)

private val CyanColor = Color(0xFF20D7FF)

private val GreenColor = Color(0xFF3DDC97)

private val OrangeColor = Color(0xFFFFA726)

private val RedColor = Color(0xFFFF4D4D)

private val DarkRed = Color(0xFF271416)


// =====================================================
// HOME SCREEN
// =====================================================

@Composable
fun HomeScreen(
    viewModel: HomeViewModel = viewModel(),

    onWarningClick: () -> Unit = {},

    onNotificationClick: () -> Unit = {},

    onProfileClick: () -> Unit = {},

    onSosClick: () -> Unit = {},

    onMapClick: () -> Unit = {},

    onSafeLocationClick: () -> Unit = {},

    onBottomNavigate: (String) -> Unit = {}
) {

    val state by viewModel.uiState

    Scaffold(

        containerColor = HomeBackground,

        bottomBar = {

            HomeBottomBar(
                onNavigate = onBottomNavigate
            )
        }

    ) { innerPadding ->

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .background(HomeBackground)
        ) {

            // HEADER
            HomeHeader(
                onNotificationClick = onNotificationClick,
                onProfileClick = onProfileClick
            )

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(
                        rememberScrollState()
                    )
                    .padding(horizontal = 16.dp)
            ) {

                Spacer(
                    modifier = Modifier.height(16.dp)
                )


                // =========================================
                // LOCATION
                // =========================================

                CurrentLocationCard(
                    state = state
                )


                Spacer(
                    modifier = Modifier.height(16.dp)
                )


                // =========================================
                // SOS
                // =========================================

                EmergencySosCard(
                    onSosClick = onSosClick
                )


                Spacer(
                    modifier = Modifier.height(20.dp)
                )


                // =========================================
                // WARNING
                // =========================================

                FloodWarningCard(
                    state = state,
                    onClick = onWarningClick
                )


                Spacer(
                    modifier = Modifier.height(24.dp)
                )


                // =========================================
                // MONITORING
                // =========================================

                SectionTitle(
                    title = "QUAN TRẮC THỦY VĂN",
                    subtitle = "Dữ liệu cập nhật gần thời gian thực"
                )


                Spacer(
                    modifier = Modifier.height(12.dp)
                )


                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement =
                        Arrangement.spacedBy(10.dp)
                ) {

                    HydroCard(
                        modifier = Modifier.weight(1f),
                        icon = Icons.Default.WaterDrop,
                        metric = state.rainfall,
                        iconColor = CyanColor
                    )

                    HydroCard(
                        modifier = Modifier.weight(1f),
                        icon = Icons.Default.Waves,
                        metric = state.riverLevel,
                        iconColor = CyanColor
                    )
                }


                Spacer(
                    modifier = Modifier.height(10.dp)
                )


                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement =
                        Arrangement.spacedBy(10.dp)
                ) {

                    HydroCard(
                        modifier = Modifier.weight(1f),
                        icon = Icons.Default.Air,
                        metric = state.wind,
                        iconColor = CyanColor
                    )

                    HydroCard(
                        modifier = Modifier.weight(1f),
                        icon = Icons.Default.Warning,
                        metric = state.floodPoint,
                        iconColor = OrangeColor
                    )
                }


                Spacer(
                    modifier = Modifier.height(26.dp)
                )


                // =========================================
                // SAFE LOCATION
                // =========================================

                SectionTitle(
                    title = "ĐIỂM TRÁNH TRÚ GẦN NHẤT",
                    subtitle =
                        "Ưu tiên điểm còn khả năng tiếp nhận"
                )


                Spacer(
                    modifier = Modifier.height(12.dp)
                )


                SafeShelterCard(
                    state = state,
                    onMapClick = onMapClick,
                    onSafeLocationClick =
                        onSafeLocationClick
                )


                Spacer(
                    modifier = Modifier.height(26.dp)
                )


                // =========================================
                // REGIONAL SUMMARY
                // =========================================

                SectionTitle(
                    title = "TỔNG HỢP KHU VỰC",
                    subtitle =
                        "Mức cảnh báo ngập lụt hiện tại"
                )


                Spacer(
                    modifier = Modifier.height(12.dp)
                )


                RegionalSummaryCard(
                    data = state.regionalFloodInfo
                )


                Spacer(
                    modifier = Modifier.height(28.dp)
                )


                Text(
                    text =
                        "FloodGuard • Hệ thống cảnh báo lũ & hỗ trợ cứu hộ",
                    color = Color(0xFF516779),
                    fontSize = 10.sp,
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center
                )


                Spacer(
                    modifier = Modifier.height(20.dp)
                )
            }
        }
    }
}


// =====================================================
// HEADER
// =====================================================

@Composable
private fun HomeHeader(
    onNotificationClick: () -> Unit,
    onProfileClick: () -> Unit
) {

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(HeaderBackground)
            .padding(
                horizontal = 16.dp,
                vertical = 12.dp
            ),
        verticalAlignment =
            Alignment.CenterVertically
    ) {

        Column(
            modifier = Modifier.weight(1f)
        ) {

            Text(
                text = "CẢNH BÁO LŨ & CỨU HỘ",
                color = WhiteText,
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold
            )

            Spacer(
                modifier = Modifier.height(3.dp)
            )

            Row(
                verticalAlignment =
                    Alignment.CenterVertically
            ) {

                Text(
                    text = "Miền Trung",
                    color = GrayText,
                    fontSize = 11.sp
                )

                Text(
                    text = "  •  ",
                    color = GrayText,
                    fontSize = 11.sp
                )

                Box(
                    modifier = Modifier
                        .size(7.dp)
                        .background(
                            GreenColor,
                            CircleShape
                        )
                )

                Spacer(
                    modifier = Modifier.size(5.dp)
                )

                Text(
                    text = "TRỰC TUYẾN",
                    color = GreenColor,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }


        IconButton(
            onClick =
                onNotificationClick
        ) {

            Icon(
                imageVector =
                    Icons.Default.Notifications,
                contentDescription =
                    "Thông báo",
                tint = WhiteText
            )
        }


        IconButton(
            onClick =
                onProfileClick
        ) {

            Icon(
                imageVector =
                    Icons.Default.Person,
                contentDescription =
                    "Cá nhân",
                tint = WhiteText
            )
        }
    }
}


// =====================================================
// LOCATION CARD
// =====================================================

@Composable
private fun CurrentLocationCard(
    state: HomeUiState
) {

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(
                1.dp,
                BorderColor,
                RoundedCornerShape(16.dp)
            ),

        shape =
            RoundedCornerShape(16.dp),

        colors =
            CardDefaults.cardColors(
                containerColor =
                    CardBackground
            )
    ) {

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),

            verticalAlignment =
                Alignment.CenterVertically
        ) {

            Column(
                modifier =
                    Modifier.weight(1f)
            ) {

                Text(
                    text =
                        "VỊ TRÍ HIỆN TẠI",

                    color = GrayText,

                    fontSize = 10.sp,

                    fontWeight =
                        FontWeight.Bold
                )


                Spacer(
                    modifier =
                        Modifier.height(8.dp)
                )


                Row(
                    verticalAlignment =
                        Alignment.CenterVertically
                ) {

                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .background(
                                Color(0xFF12354A),
                                CircleShape
                            ),

                        contentAlignment =
                            Alignment.Center
                    ) {

                        Icon(
                            imageVector =
                                Icons.Default.LocationOn,

                            contentDescription = null,

                            tint = CyanColor
                        )
                    }


                    Spacer(
                        modifier =
                            Modifier.size(10.dp)
                    )


                    Column {

                        Text(
                            text =
                                state.locationName,

                            color = WhiteText,

                            fontSize = 16.sp,

                            fontWeight =
                                FontWeight.Bold
                        )


                        Text(
                            text =
                                state.locationDetail,

                            color = GrayText,

                            fontSize = 11.sp
                        )
                    }
                }
            }


            Column(
                horizontalAlignment =
                    Alignment.End
            ) {

                Text(
                    text =
                        "CẤP BÁO ĐỘNG",

                    color = GrayText,

                    fontSize = 9.sp
                )


                Spacer(
                    modifier =
                        Modifier.height(4.dp)
                )


                Text(
                    text =
                        state.alertLevel,

                    color = OrangeColor,

                    fontSize = 18.sp,

                    fontWeight =
                        FontWeight.Bold
                )


                Text(
                    text =
                        state.alertStatus,

                    color = OrangeColor,

                    fontSize = 9.sp,

                    fontWeight =
                        FontWeight.Bold
                )
            }
        }
    }
}


// =====================================================
// SOS CARD
// =====================================================

@Composable
private fun EmergencySosCard(
    onSosClick: () -> Unit
) {

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(
                1.dp,
                Color(0xFF742B31),
                RoundedCornerShape(18.dp)
            ),

        shape =
            RoundedCornerShape(18.dp),

        colors =
            CardDefaults.cardColors(
                containerColor = DarkRed
            )
    ) {

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {

            Row(
                verticalAlignment =
                    Alignment.CenterVertically
            ) {

                Icon(
                    imageVector =
                        Icons.Default.Warning,

                    contentDescription = null,

                    tint = RedColor,

                    modifier =
                        Modifier.size(18.dp)
                )


                Spacer(
                    modifier =
                        Modifier.size(7.dp)
                )


                Text(
                    text =
                        "TRỢ GIÚP KHẨN CẤP 24/7",

                    color = RedColor,

                    fontSize = 11.sp,

                    fontWeight =
                        FontWeight.Bold
                )
            }


            Spacer(
                modifier =
                    Modifier.height(9.dp)
            )


            Text(
                text =
                    "Bạn đang gặp nguy hiểm?",

                color = WhiteText,

                fontSize = 19.sp,

                fontWeight =
                    FontWeight.Bold
            )


            Spacer(
                modifier =
                    Modifier.height(4.dp)
            )


            Text(
                text =
                    "Gửi ngay vị trí hiện tại và thông tin SOS đến lực lượng cứu hộ.",

                color = GrayText,

                fontSize = 12.sp,

                lineHeight = 17.sp
            )


            Spacer(
                modifier =
                    Modifier.height(16.dp)
            )


            Button(
                onClick = onSosClick,

                modifier = Modifier
                    .fillMaxWidth()
                    .height(58.dp),

                shape =
                    RoundedCornerShape(14.dp),

                colors =
                    ButtonDefaults.buttonColors(
                        containerColor =
                            Color(0xFFE53935)
                    )
            ) {

                Icon(
                    imageVector =
                        Icons.Default.Sos,

                    contentDescription = null,

                    modifier =
                        Modifier.size(25.dp)
                )


                Spacer(
                    modifier =
                        Modifier.size(10.dp)
                )


                Text(
                    text =
                        "PHÁT TÍN HIỆU SOS NGAY",

                    color = Color.White,

                    fontSize = 14.sp,

                    fontWeight =
                        FontWeight.Bold
                )
            }


            Spacer(
                modifier =
                    Modifier.height(10.dp)
            )


            Row(
                modifier =
                    Modifier.fillMaxWidth(),

                horizontalArrangement =
                    Arrangement.spacedBy(10.dp)
            ) {

                OutlinedButton(
                    onClick = {},

                    modifier = Modifier
                        .weight(1f)
                        .height(46.dp),

                    shape =
                        RoundedCornerShape(12.dp),

                    border =
                        BorderStroke(
                            1.dp,
                            Color(0xFF7A3030)
                        )
                ) {

                    Icon(
                        imageVector =
                            Icons.Default.Call,

                        contentDescription = null,

                        tint =
                            Color(0xFFFF7373),

                        modifier =
                            Modifier.size(17.dp)
                    )


                    Spacer(
                        modifier =
                            Modifier.size(5.dp)
                    )


                    Text(
                        text = "Gọi 114",

                        color = WhiteText,

                        fontSize = 12.sp
                    )
                }


                OutlinedButton(
                    onClick = {},

                    modifier = Modifier
                        .weight(1f)
                        .height(46.dp),

                    shape =
                        RoundedCornerShape(12.dp),

                    border =
                        BorderStroke(
                            1.dp,
                            Color(0xFF22644E)
                        )
                ) {

                    Icon(
                        imageVector =
                            Icons.Default.CheckCircle,

                        contentDescription = null,

                        tint = GreenColor,

                        modifier =
                            Modifier.size(17.dp)
                    )


                    Spacer(
                        modifier =
                            Modifier.size(5.dp)
                    )


                    Text(
                        text =
                            "Tôi an toàn",

                        color = WhiteText,

                        fontSize = 12.sp
                    )
                }
            }
        }
    }
}


// =====================================================
// FLOOD WARNING CARD
// =====================================================

@Composable
private fun FloodWarningCard(
    state: HomeUiState,
    onClick: () -> Unit
) {

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable {
                onClick()
            }
            .border(
                1.dp,
                Color(0xFF734525),
                RoundedCornerShape(16.dp)
            ),

        shape =
            RoundedCornerShape(16.dp),

        colors =
            CardDefaults.cardColors(
                containerColor =
                    Color(0xFF211A14)
            )
    ) {

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {

            Row(
                verticalAlignment =
                    Alignment.CenterVertically
            ) {

                Box(
                    modifier = Modifier
                        .size(42.dp)
                        .background(
                            Color(0xFF422817),
                            CircleShape
                        ),

                    contentAlignment =
                        Alignment.Center
                ) {

                    Icon(
                        imageVector =
                            Icons.Default.Warning,

                        contentDescription = null,

                        tint = OrangeColor
                    )
                }


                Spacer(
                    modifier =
                        Modifier.size(10.dp)
                )


                Column {

                    Text(
                        text =
                            "BẢN TIN KHẨN",

                        color =
                            OrangeColor,

                        fontSize = 10.sp,

                        fontWeight =
                            FontWeight.Bold
                    )


                    Text(
                        text =
                            state.warningTitle,

                        color = WhiteText,

                        fontSize = 15.sp,

                        fontWeight =
                            FontWeight.Bold
                    )
                }
            }


            Spacer(
                modifier =
                    Modifier.height(12.dp)
            )


            Text(
                text =
                    state.warningDescription,

                color =
                    Color(0xFFD0D8DE),

                fontSize = 12.sp,

                lineHeight = 18.sp
            )


            Spacer(
                modifier =
                    Modifier.height(12.dp)
            )


            Row(
                modifier =
                    Modifier.fillMaxWidth(),

                verticalAlignment =
                    Alignment.CenterVertically
            ) {

                Text(
                    text =
                        state.warningTime,

                    color = GrayText,

                    fontSize = 10.sp,

                    modifier =
                        Modifier.weight(1f)
                )


                Text(
                    text =
                        "XEM CHI TIẾT →",

                    color =
                        OrangeColor,

                    fontSize = 10.sp,

                    fontWeight =
                        FontWeight.Bold
                )
            }
        }
    }
}


// =====================================================
// SECTION TITLE
// =====================================================

@Composable
private fun SectionTitle(
    title: String,
    subtitle: String
) {

    Column {

        Text(
            text = title,

            color = WhiteText,

            fontSize = 15.sp,

            fontWeight =
                FontWeight.Bold
        )


        Spacer(
            modifier =
                Modifier.height(3.dp)
        )


        Text(
            text = subtitle,

            color = GrayText,

            fontSize = 11.sp
        )
    }
}


// =====================================================
// HYDRO CARD
// =====================================================

@Composable
private fun HydroCard(
    modifier: Modifier,
    icon: ImageVector,
    metric: HydroMetric,
    iconColor: Color
) {

    Card(
        modifier = modifier
            .height(132.dp)
            .border(
                1.dp,
                BorderColor,
                RoundedCornerShape(14.dp)
            ),

        shape =
            RoundedCornerShape(14.dp),

        colors =
            CardDefaults.cardColors(
                containerColor =
                    CardBackground
            )
    ) {

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(13.dp)
        ) {

            Row(
                verticalAlignment =
                    Alignment.CenterVertically
            ) {

                Icon(
                    imageVector = icon,

                    contentDescription = null,

                    tint = iconColor,

                    modifier =
                        Modifier.size(18.dp)
                )


                Spacer(
                    modifier =
                        Modifier.size(6.dp)
                )


                Text(
                    text =
                        metric.title,

                    color = GrayText,

                    fontSize = 9.sp,

                    fontWeight =
                        FontWeight.Bold
                )
            }


            Spacer(
                modifier =
                    Modifier.weight(1f)
            )


            Row(
                verticalAlignment =
                    Alignment.Bottom
            ) {

                Text(
                    text =
                        metric.value,

                    color =
                        if (
                            metric.title ==
                            "ĐIỂM NGẬP YẾU"
                        )
                            OrangeColor
                        else
                            CyanColor,

                    fontSize = 24.sp,

                    fontWeight =
                        FontWeight.Bold
                )


                Spacer(
                    modifier =
                        Modifier.size(4.dp)
                )


                Text(
                    text =
                        metric.unit,

                    color = GrayText,

                    fontSize = 10.sp,

                    modifier =
                        Modifier.padding(
                            bottom = 3.dp
                        )
                )
            }


            Spacer(
                modifier =
                    Modifier.height(4.dp)
            )


            Text(
                text =
                    metric.note,

                color =
                    if (
                        metric.title ==
                        "ĐIỂM NGẬP YẾU"
                    )
                        OrangeColor
                    else
                        GrayText,

                fontSize = 10.sp
            )
        }
    }
}


// =====================================================
// SAFE SHELTER
// =====================================================

@Composable
private fun SafeShelterCard(
    state: HomeUiState,

    onMapClick: () -> Unit,

    onSafeLocationClick: () -> Unit
) {

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(
                1.dp,
                Color(0xFF1C4D42),
                RoundedCornerShape(16.dp)
            ),

        shape =
            RoundedCornerShape(16.dp),

        colors =
            CardDefaults.cardColors(
                containerColor =
                    Color(0xFF0D201E)
            )
    ) {

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp)
        ) {

            Row(
                verticalAlignment =
                    Alignment.CenterVertically
            ) {

                Box(
                    modifier = Modifier
                        .size(42.dp)
                        .background(
                            Color(0xFF123D32),
                            CircleShape
                        ),

                    contentAlignment =
                        Alignment.Center
                ) {

                    Icon(
                        imageVector =
                            Icons.Default.Home,

                        contentDescription = null,

                        tint = GreenColor
                    )
                }


                Spacer(
                    modifier =
                        Modifier.size(10.dp)
                )


                Column(
                    modifier =
                        Modifier.weight(1f)
                ) {

                    Text(
                        text =
                            state.shelterName,

                        color = WhiteText,

                        fontSize = 14.sp,

                        fontWeight =
                            FontWeight.Bold
                    )


                    Spacer(
                        modifier =
                            Modifier.height(2.dp)
                    )


                    Text(
                        text =
                            state.shelterAddress,

                        color = GrayText,

                        fontSize = 10.sp
                    )
                }


                Text(
                    text =
                        state.shelterDistance,

                    color = GreenColor,

                    fontSize = 13.sp,

                    fontWeight =
                        FontWeight.Bold
                )
            }


            Spacer(
                modifier =
                    Modifier.height(14.dp)
            )


            // MAP PREVIEW

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(160.dp)
                    .background(
                        Color(0xFF102A35),
                        RoundedCornerShape(14.dp)
                    )
                    .clickable {
                        onMapClick()
                    },

                contentAlignment =
                    Alignment.Center
            ) {

                Column(
                    horizontalAlignment =
                        Alignment.CenterHorizontally
                ) {

                    Icon(
                        imageVector =
                            Icons.Default.Map,

                        contentDescription = null,

                        tint = CyanColor,

                        modifier =
                            Modifier.size(38.dp)
                    )


                    Spacer(
                        modifier =
                            Modifier.height(6.dp)
                    )


                    Text(
                        text =
                            "BẢN ĐỒ TUYẾN ĐƯỜNG AN TOÀN",

                        color = WhiteText,

                        fontSize = 11.sp,

                        fontWeight =
                            FontWeight.Bold
                    )


                    Text(
                        text =
                            "Nhấn để xem bản đồ",

                        color = GrayText,

                        fontSize = 10.sp
                    )
                }
            }


            Spacer(
                modifier =
                    Modifier.height(14.dp)
            )


            Row(
                modifier =
                    Modifier.fillMaxWidth(),

                horizontalArrangement =
                    Arrangement.spacedBy(10.dp)
            ) {

                ShelterInfoBox(
                    modifier =
                        Modifier.weight(1f),

                    title = "SỨC CHỨA",

                    value =
                        state.shelterCapacity
                )


                ShelterInfoBox(
                    modifier =
                        Modifier.weight(1f),

                    title = "TIỆN ÍCH",

                    value =
                        state.shelterUtilities
                )
            }


            Spacer(
                modifier =
                    Modifier.height(12.dp)
            )


            Button(
                onClick =
                    onSafeLocationClick,

                modifier =
                    Modifier.fillMaxWidth(),

                shape =
                    RoundedCornerShape(12.dp),

                colors =
                    ButtonDefaults.buttonColors(
                        containerColor =
                            Color(0xFF147C60)
                    )
            ) {

                Icon(
                    imageVector =
                        Icons.Default.Navigation,

                    contentDescription = null,

                    modifier =
                        Modifier.size(18.dp)
                )


                Spacer(
                    modifier =
                        Modifier.size(7.dp)
                )


                Text(
                    text =
                        "CHỈ ĐƯỜNG AN TOÀN",

                    fontWeight =
                        FontWeight.Bold,

                    fontSize = 12.sp
                )
            }
        }
    }
}


// =====================================================
// SHELTER INFO
// =====================================================

@Composable
private fun ShelterInfoBox(
    modifier: Modifier,
    title: String,
    value: String
) {

    Column(
        modifier = modifier
            .background(
                Color(0xFF102823),
                RoundedCornerShape(10.dp)
            )
            .padding(10.dp)
    ) {

        Text(
            text = title,

            color = GrayText,

            fontSize = 9.sp
        )


        Spacer(
            modifier =
                Modifier.height(4.dp)
        )


        Text(
            text = value,

            color = WhiteText,

            fontSize = 10.sp,

            fontWeight =
                FontWeight.SemiBold
        )
    }
}


// =====================================================
// REGIONAL SUMMARY
// =====================================================

@Composable
private fun RegionalSummaryCard(
    data: List<RegionalFloodInfo>
) {

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(
                1.dp,
                BorderColor,
                RoundedCornerShape(15.dp)
            ),

        shape =
            RoundedCornerShape(15.dp),

        colors =
            CardDefaults.cardColors(
                containerColor =
                    CardBackground
            )
    ) {

        Column(
            modifier =
                Modifier.fillMaxWidth()
        ) {

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        CardBackground2
                    )
                    .padding(
                        horizontal = 12.dp,
                        vertical = 11.dp
                    )
            ) {

                Text(
                    text = "KHU VỰC",

                    modifier =
                        Modifier.weight(1.3f),

                    color = GrayText,

                    fontSize = 9.sp,

                    fontWeight =
                        FontWeight.Bold
                )


                Text(
                    text = "CẤP",

                    modifier =
                        Modifier.weight(0.8f),

                    color = GrayText,

                    fontSize = 9.sp,

                    fontWeight =
                        FontWeight.Bold
                )


                Text(
                    text = "TRẠNG THÁI",

                    modifier =
                        Modifier.weight(1f),

                    color = GrayText,

                    fontSize = 9.sp,

                    fontWeight =
                        FontWeight.Bold
                )
            }


            data.forEachIndexed {
                    index,
                    item ->

                RegionalRow(
                    item = item
                )


                if (
                    index <
                    data.lastIndex
                ) {

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(1.dp)
                            .background(
                                BorderColor
                            )
                    )
                }
            }
        }
    }
}


// =====================================================
// REGION ROW
// =====================================================

@Composable
private fun RegionalRow(
    item: RegionalFloodInfo
) {

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(
                horizontal = 12.dp,
                vertical = 12.dp
            ),

        verticalAlignment =
            Alignment.CenterVertically
    ) {

        Text(
            text =
                item.area,

            modifier =
                Modifier.weight(1.3f),

            color = WhiteText,

            fontSize = 11.sp,

            fontWeight =
                FontWeight.Medium
        )


        Text(
            text =
                item.level,

            modifier =
                Modifier.weight(0.8f),

            color =
                when {

                    item.level.contains("2") ->
                        RedColor

                    item.level.contains("1") ->
                        OrangeColor

                    else ->
                        GreenColor
                },

            fontSize = 11.sp,

            fontWeight =
                FontWeight.Bold
        )


        Text(
            text =
                item.status,

            modifier =
                Modifier.weight(1f),

            color =
                when (
                    item.status
                ) {

                    "Nguy hiểm" ->
                        RedColor

                    "Cảnh giác" ->
                        OrangeColor

                    else ->
                        GreenColor
                },

            fontSize = 10.sp
        )
    }
}


// =====================================================
// BOTTOM BAR
// =====================================================

@Composable
private fun HomeBottomBar(
    onNavigate: (String) -> Unit
) {

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                Color(0xFF081522)
            )
            .border(
                width = 1.dp,
                color = BorderColor
            )
            .padding(
                horizontal = 6.dp,
                vertical = 7.dp
            ),

        horizontalArrangement =
            Arrangement.SpaceAround,

        verticalAlignment =
            Alignment.Bottom
    ) {

        BottomItem(
            icon =
                Icons.Default.Home,

            title =
                "Tổng quan",

            selected = true,

            onClick = {
                onNavigate(
                    AppRoutes.HOME
                )
            }
        )


        BottomItem(
            icon =
                Icons.Default.Map,

            title =
                "Bản đồ",

            onClick = {
                onNavigate(
                    AppRoutes.MAP
                )
            }
        )


        // CENTRAL SOS

        Column(
            modifier =
                Modifier.clickable {

                    onNavigate(
                        AppRoutes.SEND_SOS
                    )
                },

            horizontalAlignment =
                Alignment.CenterHorizontally
        ) {

            Box(
                modifier = Modifier
                    .size(52.dp)
                    .background(
                        Color(0xFFE53935),
                        CircleShape
                    ),

                contentAlignment =
                    Alignment.Center
            ) {

                Icon(
                    imageVector =
                        Icons.Default.Sos,

                    contentDescription =
                        "SOS",

                    tint =
                        Color.White,

                    modifier =
                        Modifier.size(27.dp)
                )
            }


            Spacer(
                modifier =
                    Modifier.height(2.dp)
            )


            Text(
                text = "Cứu hộ",

                color =
                    Color(0xFFFF7373),

                fontSize = 9.sp,

                fontWeight =
                    FontWeight.Bold
            )
        }


        BottomItem(
            icon =
                Icons.Default.LocationOn,

            title =
                "Tránh trú",

            onClick = {

                onNavigate(
                    AppRoutes.SAFE_LOCATION
                )
            }
        )


        BottomItem(
            icon =
                Icons.Default.Settings,

            title =
                "Cài đặt",

            onClick = {

                onNavigate(
                    AppRoutes.PROFILE
                )
            }
        )
    }
}


// =====================================================
// BOTTOM ITEM
// =====================================================

@Composable
private fun BottomItem(
    icon: ImageVector,
    title: String,
    selected: Boolean = false,
    onClick: () -> Unit
) {

    Column(
        modifier = Modifier
            .clickable {
                onClick()
            }
            .padding(5.dp),

        horizontalAlignment =
            Alignment.CenterHorizontally
    ) {

        Icon(
            imageVector = icon,

            contentDescription = title,

            tint =
                if (selected)
                    CyanColor
                else
                    GrayText,

            modifier =
                Modifier.size(21.dp)
        )


        Spacer(
            modifier =
                Modifier.height(3.dp)
        )


        Text(
            text = title,

            color =
                if (selected)
                    CyanColor
                else
                    GrayText,

            fontSize = 9.sp,

            fontWeight =
                if (selected)
                    FontWeight.Bold
                else
                    FontWeight.Normal
        )
    }
}