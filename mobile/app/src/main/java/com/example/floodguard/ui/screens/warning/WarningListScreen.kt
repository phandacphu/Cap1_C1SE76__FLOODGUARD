package com.example.floodguard.ui.screens.warning

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel

import com.example.floodguard.ui.components.FloodGuardBottomBar
import com.example.floodguard.ui.components.WarningCard
import com.example.floodguard.ui.navigation.AppRoutes


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WarningListScreen(
    onBackClick: () -> Unit,
    onWarningClick: (String) -> Unit,
    onNotificationClick: () -> Unit = {},
    onProfileClick: () -> Unit = {},
    onBottomNavigate: (String) -> Unit = {},
    viewModel: WarningViewModel = viewModel()
) {

    val uiState by viewModel.uiState.collectAsState()

    var selectedFilter by remember {
        mutableStateOf("all")
    }

    Scaffold(
        containerColor = Color(0xFF07101F),

        topBar = {

            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF07101F)
                ),

                navigationIcon = {

                    IconButton(
                        onClick = onBackClick
                    ) {

                        Icon(
                            imageVector = Icons.Outlined.ArrowBack,
                            contentDescription = "Quay lại",
                            tint = Color.White
                        )
                    }
                },

                title = {

                    Column {

                        Text(
                            text = "DỮ LIỆU PHỤC VỤ PHÁT TRIỂN",
                            color = Color(0xFF22D3EE),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.SemiBold
                        )

                        Text(
                            text = "Cảnh báo lũ",
                            color = Color.White,
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold
                        )
                    }
                },

                actions = {

                    IconButton(
                        onClick = onNotificationClick
                    ) {

                        Icon(
                            imageVector = Icons.Outlined.Notifications,
                            contentDescription = "Thông báo",
                            tint = Color.White
                        )
                    }

                    IconButton(
                        onClick = onProfileClick
                    ) {

                        Icon(
                            imageVector = Icons.Outlined.Person,
                            contentDescription = "Cá nhân",
                            tint = Color.White
                        )
                    }
                }
            )
        },

        bottomBar = {

            FloodGuardBottomBar(
                currentRoute = AppRoutes.HOME,
                onNavigate = onBottomNavigate
            )
        }

    ) { paddingValues ->

        when (val state = uiState) {

            WarningUiState.Loading -> {

                LoadingWarningState(
                    modifier = Modifier.padding(
                        paddingValues
                    )
                )
            }

            WarningUiState.Empty -> {

                EmptyWarningState(
                    modifier = Modifier.padding(
                        paddingValues
                    )
                )
            }

            is WarningUiState.Error -> {

                ErrorWarningState(
                    modifier = Modifier.padding(
                        paddingValues
                    ),
                    message = state.message,
                    onRetry = {
                        viewModel.retry()
                    }
                )
            }

            is WarningUiState.Success -> {

                val filteredWarnings =
                    when (selectedFilter) {

                        "critical" ->
                            state.warnings.filter {
                                it.severity.equals(
                                    "critical",
                                    ignoreCase = true
                                )
                            }

                        "high" ->
                            state.warnings.filter {
                                it.severity.equals(
                                    "high",
                                    ignoreCase = true
                                )
                            }

                        "medium" ->
                            state.warnings.filter {
                                it.severity.equals(
                                    "medium",
                                    ignoreCase = true
                                )
                            }

                        "low" ->
                            state.warnings.filter {
                                it.severity.equals(
                                    "low",
                                    ignoreCase = true
                                )
                            }

                        else ->
                            state.warnings
                    }

                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues),

                    contentPadding = PaddingValues(
                        start = 16.dp,
                        end = 16.dp,
                        top = 8.dp,
                        bottom = 24.dp
                    ),

                    verticalArrangement =
                        Arrangement.spacedBy(16.dp)
                ) {

                    // =========================
                    // LOCATION
                    // =========================

                    item {

                        LocationSection()
                    }


                    // =========================
                    // SUMMARY
                    // =========================

                    item {

                        WarningSummarySection(
                            totalWarnings =
                                state.warnings.size
                        )
                    }


                    // =========================
                    // FILTER
                    // =========================

                    item {

                        WarningFilterSection(
                            selectedFilter =
                                selectedFilter,

                            onFilterSelected = {
                                selectedFilter = it
                            }
                        )
                    }


                    // =========================
                    // LIST
                    // =========================

                    if (filteredWarnings.isEmpty()) {

                        item {

                            NoFilteredWarningState()
                        }

                    } else {

                        items(
                            items = filteredWarnings,
                            key = {
                                it.id
                            }
                        ) { warning ->

                            WarningCard(
                                warning = warning,
                                onClick = {

                                    onWarningClick(
                                        warning.id
                                    )
                                }
                            )
                        }
                    }


                    // =========================
                    // FOOTER NOTE
                    // =========================

                    item {

                        DevelopmentDataNotice()
                    }
                }
            }
        }
    }
}


// =====================================================
// LOCATION
// =====================================================

@Composable
private fun LocationSection() {

    Column(
        modifier = Modifier.fillMaxWidth()
    ) {

        Text(
            text = "KHU VỰC THEO DÕI",
            color = Color(0xFF64748B),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Medium
        )

        Spacer(
            modifier = Modifier.height(5.dp)
        )

        Row(
            verticalAlignment =
                Alignment.CenterVertically
        ) {

            Text(
                text = "⌖",
                color = Color(0xFF22D3EE),
                style = MaterialTheme.typography.titleMedium
            )

            Spacer(
                modifier = Modifier.width(7.dp)
            )

            Text(
                text = "Đà Nẵng & Lưu vực",
                color = Color.White,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
        }
    }
}


// =====================================================
// SUMMARY
// =====================================================

@Composable
private fun WarningSummarySection(
    totalWarnings: Int
) {

    Row(
        modifier = Modifier.fillMaxWidth(),

        horizontalArrangement =
            Arrangement.spacedBy(8.dp)
    ) {

        SummaryCard(
            modifier = Modifier.weight(1f),
            title = "HOẠT ĐỘNG",
            value = "$totalWarnings",
            subtitle = "bản tin",
            valueColor = Color(0xFFFF4D4F)
        )

        SummaryCard(
            modifier = Modifier.weight(1f),
            title = "KHU VỰC",
            value = "Đà Nẵng",
            subtitle = "đang theo dõi",
            valueColor = Color(0xFF22D3EE)
        )

        SummaryCard(
            modifier = Modifier.weight(1f),
            title = "TRẠNG THÁI",
            value = "Theo dõi",
            subtitle = "dữ liệu phát triển",
            valueColor = Color(0xFFFFD54F)
        )
    }
}


@Composable
private fun SummaryCard(
    modifier: Modifier,
    title: String,
    value: String,
    subtitle: String,
    valueColor: Color
) {

    Surface(
        modifier = modifier,

        shape =
            RoundedCornerShape(14.dp),

        color =
            Color(0xFF0D1726),

        border =
            BorderStroke(
                width = 1.dp,
                color = Color(0xFF1E293B)
            )
    ) {

        Column(
            modifier = Modifier.padding(
                horizontal = 10.dp,
                vertical = 12.dp
            )
        ) {

            Text(
                text = title,
                color = Color(0xFF718096),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold
            )

            Spacer(
                modifier = Modifier.height(6.dp)
            )

            Text(
                text = value,
                color = valueColor,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold
            )

            Spacer(
                modifier = Modifier.height(3.dp)
            )

            Text(
                text = subtitle,
                color = Color(0xFF94A3B8),
                style = MaterialTheme.typography.labelSmall
            )
        }
    }
}


// =====================================================
// FILTER
// =====================================================

@Composable
private fun WarningFilterSection(
    selectedFilter: String,
    onFilterSelected: (String) -> Unit
) {

    Column {

        Text(
            text = "MỨC CẢNH BÁO",
            color = Color(0xFF64748B),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Medium
        )

        Spacer(
            modifier = Modifier.height(8.dp)
        )

        val filters = listOf(
            "all" to "Tất cả",
            "critical" to "Khẩn cấp",
            "high" to "Cấp 3",
            "medium" to "Cấp 2",
            "low" to "Cấp 1"
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(
                    rememberScrollState()
                ),

            horizontalArrangement =
                Arrangement.spacedBy(8.dp)
        ) {

            filters.forEach { filter ->

                WarningFilterChip(
                    key = filter.first,
                    label = filter.second,
                    selectedFilter =
                        selectedFilter,
                    onFilterSelected =
                        onFilterSelected
                )
            }
        }
    }
}


@Composable
private fun WarningFilterChip(
    key: String,
    label: String,
    selectedFilter: String,
    onFilterSelected: (String) -> Unit
) {

    val selected =
        key == selectedFilter

    FilterChip(
        selected = selected,

        onClick = {
            onFilterSelected(key)
        },

        label = {

            Text(
                text = label,
                fontWeight =
                    if (selected) {
                        FontWeight.Bold
                    } else {
                        FontWeight.Medium
                    }
            )
        },

        shape =
            RoundedCornerShape(20.dp),

        border =
            FilterChipDefaults.filterChipBorder(
                enabled = true,
                selected = selected,
                borderColor =
                    Color(0xFF263449),
                selectedBorderColor =
                    Color(0xFF22D3EE)
            ),

        colors =
            FilterChipDefaults.filterChipColors(

                containerColor =
                    Color(0xFF0D1726),

                labelColor =
                    Color(0xFF94A3B8),

                selectedContainerColor =
                    Color(0xFF123B4A),

                selectedLabelColor =
                    Color(0xFF22D3EE)
            )
    )
}


// =====================================================
// FILTER EMPTY
// =====================================================

@Composable
private fun NoFilteredWarningState() {

    Surface(
        modifier = Modifier.fillMaxWidth(),

        color =
            Color(0xFF0D1726),

        shape =
            RoundedCornerShape(16.dp),

        border =
            BorderStroke(
                width = 1.dp,
                color = Color(0xFF1E293B)
            )
    ) {

        Text(
            text =
                "Không có cảnh báo thuộc mức này.",

            color =
                Color(0xFF94A3B8),

            textAlign =
                TextAlign.Center,

            modifier =
                Modifier.padding(32.dp)
        )
    }
}


// =====================================================
// DEVELOPMENT NOTICE
// =====================================================

@Composable
private fun DevelopmentDataNotice() {

    Surface(
        modifier =
            Modifier.fillMaxWidth(),

        color =
            Color(0xFF0B1422),

        shape =
            RoundedCornerShape(14.dp),

        border =
            BorderStroke(
                width = 1.dp,
                color = Color(0xFF172235)
            )
    ) {

        Column(
            modifier = Modifier.padding(14.dp),
            horizontalAlignment =
                Alignment.CenterHorizontally
        ) {

            Text(
                text =
                    "DỮ LIỆU PHỤC VỤ PHÁT TRIỂN",

                color =
                    Color(0xFF22D3EE),

                style =
                    MaterialTheme.typography.labelSmall,

                fontWeight =
                    FontWeight.Bold
            )

            Spacer(
                modifier =
                    Modifier.height(5.dp)
            )

            Text(
                text =
                    "Các thông số đang hiển thị dùng để phát triển và kiểm thử giao diện, chưa phải dữ liệu được cơ quan nhà nước xác thực.",

                color =
                    Color(0xFF718096),

                style =
                    MaterialTheme.typography.labelSmall,

                textAlign =
                    TextAlign.Center
            )
        }
    }
}


// =====================================================
// LOADING
// =====================================================

@Composable
private fun LoadingWarningState(
    modifier: Modifier = Modifier
) {

    Box(
        modifier = modifier
            .fillMaxSize(),

        contentAlignment =
            Alignment.Center
    ) {

        Column(
            horizontalAlignment =
                Alignment.CenterHorizontally
        ) {

            CircularProgressIndicator(
                color =
                    Color(0xFF22D3EE)
            )

            Spacer(
                modifier =
                    Modifier.height(14.dp)
            )

            Text(
                text =
                    "Đang tải cảnh báo...",

                color =
                    Color.White
            )
        }
    }
}


// =====================================================
// EMPTY
// =====================================================

@Composable
private fun EmptyWarningState(
    modifier: Modifier = Modifier
) {

    Box(
        modifier = modifier
            .fillMaxSize()
            .padding(30.dp),

        contentAlignment =
            Alignment.Center
    ) {

        Column(
            horizontalAlignment =
                Alignment.CenterHorizontally
        ) {

            Text(
                text = "Cảnh báo lũ",
                color = Color.White,
                style =
                    MaterialTheme.typography.titleMedium,
                fontWeight =
                    FontWeight.Bold
            )

            Spacer(
                modifier =
                    Modifier.height(8.dp)
            )

            Text(
                text =
                    "Hiện không có cảnh báo lũ đang hoạt động.",

                color =
                    Color(0xFF94A3B8),

                textAlign =
                    TextAlign.Center
            )
        }
    }
}


// =====================================================
// ERROR
// =====================================================

@Composable
private fun ErrorWarningState(
    modifier: Modifier = Modifier,
    message: String,
    onRetry: () -> Unit
) {

    Box(
        modifier = modifier
            .fillMaxSize()
            .padding(30.dp),

        contentAlignment =
            Alignment.Center
    ) {

        Column(
            horizontalAlignment =
                Alignment.CenterHorizontally
        ) {

            Text(
                text = "Không thể tải cảnh báo",
                color = Color.White,
                style =
                    MaterialTheme.typography.titleMedium,
                fontWeight =
                    FontWeight.Bold
            )

            Spacer(
                modifier =
                    Modifier.height(8.dp)
            )

            Text(
                text = message,
                color =
                    Color(0xFFFF6B6B),
                textAlign =
                    TextAlign.Center
            )

            Spacer(
                modifier =
                    Modifier.height(18.dp)
            )

            Button(
                onClick = onRetry
            ) {

                Text(
                    text = "Thử lại"
                )
            }
        }
    }
}