package com.example.floodguard.ui.screens.map

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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Apartment
import androidx.compose.material.icons.filled.CenterFocusStrong
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Sos
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.floodguard.ui.components.FloodGuardBottomBar
import com.example.floodguard.ui.navigation.AppRoutes

// =====================================================
// COLORS
// =====================================================

private val MapBackground = Color(0xFF06111F)
private val MapHeader = Color(0xFF081522)
private val MapCard = Color(0xFF0B1726)
private val MapBorder = Color(0xFF1D3547)

private val MapText = Color(0xFFF4F7FA)
private val MapSecondary = Color(0xFF8FA6B8)

private val MapCyan = Color(0xFF00E5FF)
private val MapGreen = Color(0xFF16C784)
private val MapOrange = Color(0xFFFFA000)
private val MapRed = Color(0xFFFF4D4D)

// =====================================================
// ROUTE
// =====================================================

@Composable
fun FloodMapRoute(
    viewModel: FloodMapViewModel,
    onBack: () -> Unit,
    onNotificationClick: () -> Unit = {},
    onProfileClick: () -> Unit = {},
    onSafeRouteClick: () -> Unit = {},
    onShelterDetailClick: () -> Unit = {},
    onSosClick: () -> Unit = {},
    onBottomNavigate: (String) -> Unit = {}
) {

    val state by viewModel.uiState.collectAsStateWithLifecycle()

    FloodMapScreen(
        state = state,
        onBack = onBack,
        onNotificationClick = onNotificationClick,
        onProfileClick = onProfileClick,
        onToggleFloodLayer = viewModel::toggleFloodLayer,
        onToggleUserLayer = viewModel::toggleUserLayer,
        onToggleShelterLayer = viewModel::toggleShelterLayer,
        onToggleSafeRouteLayer = viewModel::toggleSafeRouteLayer,
        onSafeRouteClick = onSafeRouteClick,
        onShelterDetailClick = onShelterDetailClick,
        onSosClick = onSosClick,
        onBottomNavigate = onBottomNavigate
    )
}

// =====================================================
// SCREEN
// =====================================================

@Composable
fun FloodMapScreen(
    state: FloodMapUiState,
    onBack: () -> Unit,
    onNotificationClick: () -> Unit,
    onProfileClick: () -> Unit,
    onToggleFloodLayer: () -> Unit,
    onToggleUserLayer: () -> Unit,
    onToggleShelterLayer: () -> Unit,
    onToggleSafeRouteLayer: () -> Unit,
    onSafeRouteClick: () -> Unit,
    onShelterDetailClick: () -> Unit,
    onSosClick: () -> Unit,
    onBottomNavigate: (String) -> Unit
) {

    Scaffold(
        containerColor = MapBackground,

        bottomBar = {
            FloodGuardBottomBar(
                currentRoute = AppRoutes.MAP,
                onNavigate = onBottomNavigate
            )
        }
    ) { innerPadding ->

        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(MapBackground)
                .padding(innerPadding)
                .verticalScroll(
                    rememberScrollState()
                )
        ) {

            FloodMapHeader(
                state = state,
                onBack = onBack,
                onNotificationClick = onNotificationClick,
                onProfileClick = onProfileClick
            )

            FloodGpsInfo(
                state = state
            )

            Spacer(
                modifier = Modifier.height(10.dp)
            )

            FloodLayerRow(
                state = state,
                onToggleFloodLayer = onToggleFloodLayer,
                onToggleUserLayer = onToggleUserLayer,
                onToggleShelterLayer = onToggleShelterLayer,
                onToggleSafeRouteLayer = onToggleSafeRouteLayer
            )

            Spacer(
                modifier = Modifier.height(12.dp)
            )

            FloodMockMap(
                state = state
            )

            Spacer(
                modifier = Modifier.height(20.dp)
            )

            FloodAreaSummary(
                state = state
            )

            Spacer(
                modifier = Modifier.height(18.dp)
            )

            FloodShelterCard(
                state = state
            )

            Spacer(
                modifier = Modifier.height(18.dp)
            )

            Button(
                onClick = onSafeRouteClick,

                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 18.dp)
                    .height(54.dp),

                shape = RoundedCornerShape(12.dp),

                colors = ButtonDefaults.buttonColors(
                    containerColor = MapCard,
                    contentColor = MapText
                )
            ) {

                Icon(
                    imageVector = Icons.Default.Navigation,
                    contentDescription = null,
                    tint = MapText
                )

                Spacer(
                    modifier = Modifier.width(8.dp)
                )

                Text(
                    text = "CHỈ ĐƯỜNG AN TOÀN",
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp
                )
            }

            Spacer(
                modifier = Modifier.height(14.dp)
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 18.dp),

                horizontalArrangement =
                    Arrangement.spacedBy(12.dp)
            ) {

                OutlinedButton(
                    onClick = onShelterDetailClick,

                    modifier = Modifier
                        .weight(1f)
                        .height(52.dp),

                    shape = RoundedCornerShape(12.dp),

                    border = BorderStroke(
                        1.dp,
                        MapBorder
                    )
                ) {

                    Text(
                        text = "Chi tiết trạm trú",
                        color = MapText
                    )
                }

                Button(
                    onClick = onSosClick,

                    modifier = Modifier
                        .weight(1f)
                        .height(52.dp),

                    shape = RoundedCornerShape(12.dp),

                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFFE53935)
                    )
                ) {

                    Icon(
                        imageVector = Icons.Default.Sos,
                        contentDescription = null,
                        tint = Color.White
                    )

                    Spacer(
                        modifier = Modifier.width(6.dp)
                    )

                    Text(
                        text = "PHÁT SOS VỊ TRÍ NÀY",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 11.sp
                    )
                }
            }

            Spacer(
                modifier = Modifier.height(24.dp)
            )
        }
    }
}

// =====================================================
// HEADER
// =====================================================

@Composable
private fun FloodMapHeader(
    state: FloodMapUiState,
    onBack: () -> Unit,
    onNotificationClick: () -> Unit,
    onProfileClick: () -> Unit
) {

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MapHeader)
            .statusBarsPadding()
            .padding(
                horizontal = 8.dp,
                vertical = 8.dp
            ),

        verticalAlignment = Alignment.CenterVertically
    ) {

        IconButton(
            onClick = onBack
        ) {

            Text(
                text = "←",
                color = MapText,
                fontSize = 28.sp
            )
        }

        Column(
            modifier = Modifier.weight(1f)
        ) {

            Text(
                text = state.title,
                color = MapText,
                fontSize = 20.sp,
                fontWeight = FontWeight.Medium
            )

            Text(
                text = state.realtimeStatus,
                color = MapSecondary,
                fontSize = 10.sp
            )
        }

        IconButton(
            onClick = onNotificationClick
        ) {

            Icon(
                imageVector = Icons.Default.Notifications,
                contentDescription = "Thông báo",
                tint = MapText
            )
        }

        IconButton(
            onClick = onProfileClick
        ) {

            Icon(
                imageVector = Icons.Default.Person,
                contentDescription = "Cá nhân",
                tint = MapText
            )
        }
    }
}

// =====================================================
// GPS INFO
// =====================================================

@Composable
private fun FloodGpsInfo(
    state: FloodMapUiState
) {

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(
                horizontal = 18.dp,
                vertical = 10.dp
            ),

        verticalAlignment = Alignment.CenterVertically
    ) {

        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(Color(0xFF12354A)),

            contentAlignment = Alignment.Center
        ) {

            Icon(
                imageVector = Icons.Default.MyLocation,
                contentDescription = null,
                tint = MapCyan,
                modifier = Modifier.size(20.dp)
            )
        }

        Spacer(
            modifier = Modifier.width(10.dp)
        )

        Column(
            modifier = Modifier.weight(1f)
        ) {

            Text(
                text = state.currentLocation,
                color = MapText,
                fontSize = 13.sp
            )

            Spacer(
                modifier = Modifier.height(2.dp)
            )

            Row {

                Text(
                    text = state.gpsAccuracy,
                    color = MapGreen,
                    fontSize = 10.sp
                )

                Text(
                    text = "  •  ${state.updateTime}",
                    color = MapSecondary,
                    fontSize = 10.sp
                )
            }
        }

        Text(
            text = state.satelliteInfo,
            color = MapText,
            fontSize = 10.sp,
            fontWeight = FontWeight.Medium
        )
    }
}

// =====================================================
// LAYERS
// =====================================================

@Composable
private fun FloodLayerRow(
    state: FloodMapUiState,
    onToggleFloodLayer: () -> Unit,
    onToggleUserLayer: () -> Unit,
    onToggleShelterLayer: () -> Unit,
    onToggleSafeRouteLayer: () -> Unit
) {

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp),

        horizontalArrangement =
            Arrangement.SpaceBetween
    ) {

        FloodLayerItem(
            text = "Vùng ngập",
            selected = state.isFloodLayerEnabled,
            onClick = onToggleFloodLayer
        )

        FloodLayerItem(
            text = "Vị trí bạn",
            selected = state.isUserLayerEnabled,
            onClick = onToggleUserLayer
        )

        FloodLayerItem(
            text = "Điểm trú",
            selected = state.isShelterLayerEnabled,
            onClick = onToggleShelterLayer
        )

        FloodLayerItem(
            text = "Tuyến an toàn",
            selected = state.isSafeRouteLayerEnabled,
            onClick = onToggleSafeRouteLayer
        )
    }
}

@Composable
private fun FloodLayerItem(
    text: String,
    selected: Boolean,
    onClick: () -> Unit
) {

    Text(
        text = text,

        color = if (selected) {
            MapGreen
        } else {
            MapSecondary
        },

        fontSize = 11.sp,

        modifier = Modifier
            .clickable {
                onClick()
            }
            .padding(6.dp)
    )
}

// =====================================================
// MOCK MAP
// =====================================================

@Composable
private fun FloodMockMap(
    state: FloodMapUiState
) {

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .height(430.dp),

        shape = RoundedCornerShape(18.dp),

        colors = CardDefaults.cardColors(
            containerColor = Color(0xFF071524)
        ),

        border = BorderStroke(
            1.dp,
            Color(0xFF10283B)
        )
    ) {

        Box(
            modifier = Modifier.fillMaxSize()
        ) {

            // MOCK RIVER

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(28.dp)
                    .align(Alignment.Center)
                    .background(
                        Color(0xFF087A8B)
                    )
            )

            // FLOOD ZONE

            if (state.isFloodLayerEnabled) {

                Box(
                    modifier = Modifier
                        .width(145.dp)
                        .height(130.dp)
                        .align(Alignment.Center)
                        .background(
                            MapRed.copy(alpha = 0.25f),
                            RoundedCornerShape(24.dp)
                        )
                        .border(
                            2.dp,
                            MapRed,
                            RoundedCornerShape(24.dp)
                        ),

                    contentAlignment = Alignment.Center
                ) {

                    Column(
                        horizontalAlignment =
                            Alignment.CenterHorizontally
                    ) {

                        Icon(
                            imageVector =
                                Icons.Default.Warning,

                            contentDescription = null,

                            tint = Color.White
                        )

                        Spacer(
                            modifier = Modifier.height(6.dp)
                        )

                        Text(
                            text = state.floodedAreaLabel,
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp
                        )
                    }
                }
            }

            // OVERFLOW

            Box(
                modifier = Modifier
                    .width(145.dp)
                    .height(92.dp)
                    .align(Alignment.CenterEnd)
                    .padding(end = 14.dp)
                    .background(
                        MapOrange.copy(alpha = 0.20f),
                        RoundedCornerShape(20.dp)
                    )
                    .border(
                        2.dp,
                        MapOrange,
                        RoundedCornerShape(20.dp)
                    ),

                contentAlignment = Alignment.Center
            ) {

                Text(
                    text = state.overflowLabel,
                    color = MapText,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            // SHELTER

            if (state.isShelterLayerEnabled) {

                Column(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(
                            top = 54.dp,
                            end = 70.dp
                        ),

                    horizontalAlignment =
                        Alignment.CenterHorizontally
                ) {

                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .clip(CircleShape)
                            .background(MapGreen),

                        contentAlignment = Alignment.Center
                    ) {

                        Icon(
                            imageVector =
                                Icons.Default.Security,

                            contentDescription = null,

                            tint = Color.White
                        )
                    }

                    Spacer(
                        modifier = Modifier.height(4.dp)
                    )

                    Text(
                        text = state.shelterMarkerLabel,
                        color = MapGreen,
                        fontSize = 10.sp
                    )
                }
            }

            // CURRENT USER

            if (state.isUserLayerEnabled) {

                Row(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(
                            start = 54.dp,
                            bottom = 82.dp
                        ),

                    verticalAlignment =
                        Alignment.CenterVertically
                ) {

                    Box(
                        modifier = Modifier
                            .size(24.dp)
                            .border(
                                3.dp,
                                Color.White,
                                CircleShape
                            )
                            .clip(CircleShape)
                            .background(
                                Color(0xFF1C2D3A)
                            )
                    )

                    Spacer(
                        modifier = Modifier.width(8.dp)
                    )

                    Column {

                        Text(
                            text = state.userMarkerLabel,
                            color = MapText,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )

                        Text(
                            text = "Độ cao: 4.2m",
                            color = MapSecondary,
                            fontSize = 9.sp
                        )
                    }
                }
            }

            // SAFE ROUTE LABEL

            if (state.isSafeRouteLayerEnabled) {

                Text(
                    text = state.safeRouteLabel,
                    color = MapText,
                    fontSize = 10.sp,

                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(
                            start = 42.dp,
                            top = 120.dp
                        )
                        .background(
                            Color(0xFF12354A),
                            RoundedCornerShape(20.dp)
                        )
                        .border(
                            1.dp,
                            MapText,
                            RoundedCornerShape(20.dp)
                        )
                        .padding(
                            horizontal = 12.dp,
                            vertical = 6.dp
                        )
                )
            }

            // RIGHT MAP CONTROLS

            Column(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(
                        top = 20.dp,
                        end = 10.dp
                    ),

                verticalArrangement =
                    Arrangement.spacedBy(6.dp)
            ) {

                MapControlButton(
                    icon = Icons.Default.Add
                )

                MapControlButton(
                    icon = Icons.Default.Remove
                )

                MapControlButton(
                    icon = Icons.Default.CenterFocusStrong
                )

                MapControlButton(
                    icon = Icons.Default.Layers
                )

                MapControlButton(
                    icon = Icons.Default.Navigation
                )
            }

            // LEGEND

            Row(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(14.dp),

                horizontalArrangement =
                    Arrangement.spacedBy(14.dp)
            ) {

                MapLegend(
                    color = MapGreen,
                    text = "An toàn"
                )

                MapLegend(
                    color = MapOrange,
                    text = "0.3-0.5m"
                )

                MapLegend(
                    color = MapRed,
                    text = ">0.8m"
                )
            }
        }
    }
}

@Composable
private fun MapControlButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector
) {

    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(CircleShape)
            .background(Color(0xFF0A1A29)),

        contentAlignment = Alignment.Center
    ) {

        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MapText,
            modifier = Modifier.size(19.dp)
        )
    }
}

@Composable
private fun MapLegend(
    color: Color,
    text: String
) {

    Row(
        verticalAlignment =
            Alignment.CenterVertically
    ) {

        Box(
            modifier = Modifier
                .size(10.dp)
                .background(
                    color,
                    RoundedCornerShape(2.dp)
                )
        )

        Spacer(
            modifier = Modifier.width(5.dp)
        )

        Text(
            text = text,
            color = MapSecondary,
            fontSize = 9.sp
        )
    }
}

// =====================================================
// AREA SUMMARY
// =====================================================

@Composable
private fun FloodAreaSummary(
    state: FloodMapUiState
) {

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp)
    ) {

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {

            Text(
                text = "KHU VỰC GIÁM SÁT",
                color = MapSecondary,
                fontSize = 9.sp
            )

            Text(
                text = "  •  ${state.monitoredSubArea}",
                color = MapSecondary,
                fontSize = 9.sp,
                modifier = Modifier.weight(1f)
            )

            Text(
                text = state.alertLevel,
                color = MapOrange,
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,

                modifier = Modifier
                    .background(
                        MapOrange.copy(alpha = 0.15f),
                        RoundedCornerShape(6.dp)
                    )
                    .padding(
                        horizontal = 8.dp,
                        vertical = 5.dp
                    )
            )
        }

        Spacer(
            modifier = Modifier.height(6.dp)
        )

        Text(
            text = state.monitoredArea
                .lowercase()
                .replaceFirstChar {
                    it.uppercase()
                },

            color = MapText,
            fontSize = 18.sp
        )

        Spacer(
            modifier = Modifier.height(18.dp)
        )

        Row(
            modifier = Modifier.fillMaxWidth()
        ) {

            FloodMetric(
                modifier = Modifier.weight(1f),
                title = "Mực ngập dự kiến",
                value = state.expectedFloodDepth,
                note = state.expectedFloodTrend,
                valueColor = MapText,
                noteColor = MapOrange
            )

            FloodMetric(
                modifier = Modifier.weight(1f),
                title = state.riverName,
                value = state.riverLevel,
                note = state.riverLevelNote,
                valueColor = MapText,
                noteColor = MapSecondary
            )

            FloodMetric(
                modifier = Modifier.weight(1f),
                title = "Trạm trú gần nhất",
                value = state.nearestShelterDistance,
                note = state.nearestShelterNote,
                valueColor = MapGreen,
                noteColor = MapSecondary
            )
        }
    }
}

@Composable
private fun FloodMetric(
    modifier: Modifier,
    title: String,
    value: String,
    note: String,
    valueColor: Color,
    noteColor: Color
) {

    Column(
        modifier = modifier
    ) {

        Text(
            text = title,
            color = MapSecondary,
            fontSize = 9.sp
        )

        Spacer(
            modifier = Modifier.height(6.dp)
        )

        Text(
            text = value,
            color = valueColor,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold
        )

        Spacer(
            modifier = Modifier.height(4.dp)
        )

        Text(
            text = note,
            color = noteColor,
            fontSize = 9.sp
        )
    }
}

// =====================================================
// SHELTER
// =====================================================

@Composable
private fun FloodShelterCard(
    state: FloodMapUiState
) {

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp),

        colors = CardDefaults.cardColors(
            containerColor = Color.Transparent
        )
    ) {

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp),

            verticalAlignment =
                Alignment.Top
        ) {

            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(
                        RoundedCornerShape(10.dp)
                    )
                    .background(
                        MapGreen.copy(alpha = 0.15f)
                    ),

                contentAlignment =
                    Alignment.Center
            ) {

                Icon(
                    imageVector =
                        Icons.Default.Apartment,

                    contentDescription = null,

                    tint = MapGreen
                )
            }

            Spacer(
                modifier = Modifier.width(10.dp)
            )

            Column(
                modifier = Modifier.weight(1f)
            ) {

                Row(
                    modifier = Modifier.fillMaxWidth()
                ) {

                    Text(
                        text = "Điểm sơ tán: ${state.shelterName}",
                        color = MapText,
                        fontSize = 14.sp,
                        modifier = Modifier.weight(1f)
                    )

                    Text(
                        text = state.shelterCapacity,
                        color = MapGreen,
                        fontSize = 10.sp
                    )
                }

                Spacer(
                    modifier = Modifier.height(4.dp)
                )

                Text(
                    text = state.shelterDescription,
                    color = MapSecondary,
                    fontSize = 11.sp,
                    lineHeight = 16.sp
                )
            }
        }
    }
}