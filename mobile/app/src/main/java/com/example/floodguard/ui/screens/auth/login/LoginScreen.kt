package com.example.floodguard.ui.screens.auth.login

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.WaterDrop
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp


// =====================================================
// FLOODGUARD COLORS
// =====================================================

private val FloodBackground = Color(0xFF031525)

private val FloodCard = Color(0xFF112536)

private val FloodCardDark = Color(0xFF0C2031)

private val FloodInput = Color(0xFF001321)

private val FloodCyan = Color(0xFF00D9F5)

private val FloodCyanLight = Color(0xFF9DEEFF)

private val FloodTextPrimary = Color(0xFFDDF7FF)

private val FloodTextSecondary = Color(0xFFB0BDC6)

private val FloodTextMuted = Color(0xFF728592)

private val FloodError = Color(0xFFFF7474)

private val EmergencyBackground = Color(0xFF351421)

private val EmergencyText = Color(0xFFFFB5B5)


// =====================================================
// LOGIN SCREEN
// =====================================================

@Composable
fun LoginScreen(
    viewModel: LoginViewModel,
    onLoginSuccess: () -> Unit = {},
    onRegisterClick: () -> Unit = {},
    onForgotPasswordClick: () -> Unit = {},
    onCall114Click: () -> Unit = {}
) {

    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(uiState.loginSuccess) {

        if (uiState.loginSuccess) {

            onLoginSuccess()

            viewModel.resetLoginSuccess()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(FloodBackground)
    ) {

        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(
                    start = 22.dp,
                    end = 22.dp,
                    bottom = 35.dp
                )
        ) {

            // =================================================
            // HEADER
            // =================================================

            Spacer(
                modifier = Modifier.height(18.dp)
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top
            ) {

                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically
                ) {

                    Box(
                        modifier = Modifier
                            .size(12.dp)
                            .clip(RoundedCornerShape(50))
                            .background(FloodCyan)
                    )

                    Spacer(
                        modifier = Modifier.width(9.dp)
                    )

                    Text(
                        text = "FLOODGUARD  •  HỆ THỐNG HỖ TRỢ",
                        color = FloodCyanLight,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        letterSpacing = 0.7.sp
                    )
                }

                SystemChip()
            }

            // =================================================
            // AREA
            // =================================================

            Spacer(
                modifier = Modifier.height(35.dp)
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End
            ) {

                AreaChip()
            }

            // =================================================
            // LOGO
            // =================================================

            Spacer(
                modifier = Modifier.height(38.dp)
            )

            FloodGuardLogo(
                modifier = Modifier.align(
                    Alignment.CenterHorizontally
                )
            )

            Spacer(
                modifier = Modifier.height(19.dp)
            )

            // =================================================
            // TITLE
            // =================================================

            Text(
                text = "CẢNH BÁO LŨ & CỨU HỘ",
                modifier = Modifier.fillMaxWidth(),
                color = FloodTextPrimary,
                fontSize = 27.sp,
                lineHeight = 33.sp,
                fontWeight = FontWeight.ExtraBold,
                fontFamily = FontFamily.Monospace,
                textAlign = TextAlign.Center,
                letterSpacing = 0.5.sp
            )

            Spacer(
                modifier = Modifier.height(13.dp)
            )

            SystemStatusChip(
                modifier = Modifier.align(
                    Alignment.CenterHorizontally
                )
            )

            // =================================================
            // LOGIN CARD
            // =================================================

            Spacer(
                modifier = Modifier.height(22.dp)
            )

            LoginCard(
                uiState = uiState,

                onIdentifierChange =
                    viewModel::onIdentifierChange,

                onPasswordChange =
                    viewModel::onPasswordChange,

                onPasswordVisibilityClick =
                    viewModel::togglePasswordVisibility,

                onRememberChange =
                    viewModel::onRememberMeChange,

                onForgotPasswordClick =
                    onForgotPasswordClick,

                onLoginClick = {
                    viewModel.login()
                }
            )

            // =================================================
            // REGISTER
            // =================================================

            Spacer(
                modifier = Modifier.height(30.dp)
            )

            RegisterSection(
                onRegisterClick =
                    onRegisterClick
            )

            // =================================================
            // DEVELOPMENT INFORMATION
            // =================================================

            Spacer(
                modifier = Modifier.height(28.dp)
            )

            DevelopmentCard()

            // =================================================
            // CALL 114
            // =================================================

            Spacer(
                modifier = Modifier.height(17.dp)
            )

            Emergency114Button(
                onClick = onCall114Click,
                modifier = Modifier.align(
                    Alignment.CenterHorizontally
                )
            )

            // =================================================
            // FOOTER
            // =================================================

            Spacer(
                modifier = Modifier.height(30.dp)
            )

            FloodGuardFooter()

            Spacer(
                modifier = Modifier.height(20.dp)
            )
        }
    }
}


// =====================================================
// HEADER SYSTEM CHIP
// =====================================================

@Composable
private fun SystemChip() {

    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(30.dp))
            .background(
                Color(0xFF11283A)
            )
            .padding(
                horizontal = 15.dp,
                vertical = 9.dp
            )
    ) {

        Text(
            text = "HỆ THỐNG",
            color = FloodTextSecondary,
            fontSize = 10.sp,
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.sp
        )
    }
}


// =====================================================
// AREA CHIP
// =====================================================

@Composable
private fun AreaChip() {

    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(30.dp))
            .background(
                Color(0xFF193348)
            )
            .padding(
                horizontal = 14.dp,
                vertical = 8.dp
            ),
        verticalAlignment = Alignment.CenterVertically
    ) {

        Box(
            modifier = Modifier
                .size(9.dp)
                .clip(RoundedCornerShape(50))
                .background(
                    Color(0xFF7BDFFF)
                )
        )

        Spacer(
            modifier = Modifier.width(8.dp)
        )

        Text(
            text = "KHU VỰC: ĐÀ NẴNG",
            color = Color(0xFF7FDFFF),
            fontSize = 11.sp,
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.3.sp
        )
    }
}


// =====================================================
// LOGO
// =====================================================

@Composable
private fun FloodGuardLogo(
    modifier: Modifier = Modifier
) {

    Box(
        modifier = modifier
            .size(80.dp)
            .clip(
                RoundedCornerShape(22.dp)
            )
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        Color(0xFF175568),
                        Color(0xFF0D374B)
                    )
                )
            ),
        contentAlignment =
            Alignment.Center
    ) {

        Icon(
            imageVector =
                Icons.Default.WaterDrop,
            contentDescription =
                "FloodGuard",
            tint =
                FloodCyan,
            modifier =
                Modifier.size(42.dp)
        )
    }
}


// =====================================================
// STATUS CHIP
// =====================================================

@Composable
private fun SystemStatusChip(
    modifier: Modifier = Modifier
) {

    Row(
        modifier = modifier
            .clip(
                RoundedCornerShape(30.dp)
            )
            .background(
                Color(0xFF0D2637)
            )
            .padding(
                horizontal = 14.dp,
                vertical = 6.dp
            ),
        verticalAlignment =
            Alignment.CenterVertically
    ) {

        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(
                    RoundedCornerShape(50)
                )
                .background(
                    FloodCyanLight
                )
        )

        Spacer(
            modifier =
                Modifier.width(8.dp)
        )

        Text(
            text =
                "HỆ THỐNG HỖ TRỢ CẢNH BÁO & CỨU HỘ",
            color =
                FloodCyanLight,
            fontSize =
                10.sp,
            fontWeight =
                FontWeight.Bold,
            fontFamily =
                FontFamily.Monospace,
            letterSpacing =
                0.5.sp
        )
    }
}


// =====================================================
// LOGIN CARD
// =====================================================

@Composable
private fun LoginCard(
    uiState: LoginUiState,
    onIdentifierChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onPasswordVisibilityClick: () -> Unit,
    onRememberChange: (Boolean) -> Unit,
    onForgotPasswordClick: () -> Unit,
    onLoginClick: () -> Unit
) {

    Card(
        modifier =
            Modifier.fillMaxWidth(),

        shape =
            RoundedCornerShape(16.dp),

        colors =
            CardDefaults.cardColors(
                containerColor =
                    FloodCard
            )
    ) {

        Column(
            modifier =
                Modifier.padding(20.dp)
        ) {

            Text(
                text = "ĐĂNG NHẬP",
                color = FloodTextPrimary,
                fontSize = 23.sp,
                fontWeight = FontWeight.Bold,
                fontFamily =
                    FontFamily.Monospace
            )

            Spacer(
                modifier =
                    Modifier.height(4.dp)
            )

            Text(
                text =
                    "Truy cập hệ thống tiếp nhận cảnh báo & gửi yêu cầu ứng cứu",
                color =
                    FloodTextSecondary,
                fontSize =
                    14.sp,
                lineHeight =
                    20.sp
            )

            // =================================================
            // EMAIL
            // =================================================

            Spacer(
                modifier =
                    Modifier.height(22.dp)
            )

            InputLabel(
                text = "EMAIL HOẶC SỐ ĐIỆN THOẠI"
            )

            Spacer(
                modifier =
                    Modifier.height(7.dp)
            )

            OutlinedTextField(
                value = uiState.identifier,

                onValueChange = onIdentifierChange,

                modifier = Modifier.fillMaxWidth(),

                placeholder = {
                    Text(
                        text = "example@gmail.com hoặc 0901234567",
                        color = FloodTextMuted
                    )
                },

                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Email,
                        contentDescription = null,
                        tint = Color(0xFF7B909D)
                    )
                },

                singleLine = true,

                isError =
                    uiState.identifierError != null,

                keyboardOptions =
                    KeyboardOptions(
                        keyboardType = KeyboardType.Text
                    ),

                shape =
                    RoundedCornerShape(10.dp),

                colors =
                    floodTextFieldColors()
            )

            uiState.identifierError?.let {
                ErrorText(
                    text = it
                )
            }

            // =================================================
            // PASSWORD
            // =================================================

            Spacer(
                modifier =
                    Modifier.height(17.dp)
            )

            InputLabel(
                text =
                    "MẬT KHẨU"
            )

            Spacer(
                modifier =
                    Modifier.height(7.dp)
            )

            OutlinedTextField(
                value =
                    uiState.password,

                onValueChange =
                    onPasswordChange,

                modifier =
                    Modifier.fillMaxWidth(),

                placeholder = {

                    Text(
                        text =
                            "••••••••",
                        color =
                            FloodTextMuted,
                        letterSpacing =
                            3.sp
                    )
                },

                leadingIcon = {

                    Icon(
                        imageVector =
                            Icons.Default.Lock,
                        contentDescription =
                            null,
                        tint =
                            Color(0xFF7B909D)
                    )
                },

                trailingIcon = {

                    IconButton(
                        onClick =
                            onPasswordVisibilityClick
                    ) {

                        Icon(
                            imageVector =
                                if (
                                    uiState.passwordVisible
                                ) {
                                    Icons.Default.VisibilityOff
                                } else {
                                    Icons.Default.Visibility
                                },

                            contentDescription =
                                if (
                                    uiState.passwordVisible
                                ) {
                                    "Ẩn mật khẩu"
                                } else {
                                    "Hiện mật khẩu"
                                },

                            tint =
                                Color(0xFF7B909D)
                        )
                    }
                },

                visualTransformation =
                    if (
                        uiState.passwordVisible
                    ) {

                        VisualTransformation.None

                    } else {

                        PasswordVisualTransformation()
                    },

                singleLine = true,

                isError =
                    uiState.passwordError != null,

                keyboardOptions =
                    KeyboardOptions(
                        keyboardType =
                            KeyboardType.Password
                    ),

                shape =
                    RoundedCornerShape(10.dp),

                colors =
                    floodTextFieldColors()
            )
            uiState.passwordError?.let {
                ErrorText(
                    text = it
                )
            }
            uiState.apiError?.let {

                Spacer(
                    modifier = Modifier.height(8.dp)
                )

                ErrorText(
                    text = it
                )
            }

            // =================================================
            // REMEMBER + FORGOT PASSWORD
            // =================================================

            Spacer(
                modifier =
                    Modifier.height(7.dp)
            )

            Row(
                modifier =
                    Modifier.fillMaxWidth(),
                verticalAlignment =
                    Alignment.CenterVertically
            ) {

                Checkbox(
                    checked =
                        uiState.rememberMe,

                    onCheckedChange =
                        onRememberChange,

                    colors =
                        CheckboxDefaults.colors(
                            checkedColor =
                                FloodCyan,
                            uncheckedColor =
                                Color(0xFF738895),
                            checkmarkColor =
                                FloodBackground
                        )
                )

                Text(
                    text =
                        "Ghi nhớ",
                    color =
                        FloodTextSecondary,
                    fontSize =
                        14.sp
                )

                Spacer(
                    modifier =
                        Modifier.weight(1f)
                )

                Text(
                    text =
                        "Quên mật khẩu?",
                    color =
                        Color(0xFF73D8FF),
                    fontSize =
                        13.sp,
                    modifier =
                        Modifier.clickable {
                            onForgotPasswordClick()
                        }
                )
            }

            // =================================================
            // LOGIN BUTTON
            // =================================================

            Spacer(
                modifier =
                    Modifier.height(12.dp)
            )

            LoginButton(
                isLoading =
                    uiState.isLoading,

                onClick =
                    onLoginClick
            )
        }
    }
}


// =====================================================
// LABEL
// =====================================================

@Composable
private fun InputLabel(
    text: String
) {

    Text(
        text = text,
        color =
            FloodTextSecondary,
        fontSize =
            11.sp,
        fontFamily =
            FontFamily.Monospace,
        fontWeight =
            FontWeight.Bold,
        letterSpacing =
            1.7.sp
    )
}


// =====================================================
// ERROR TEXT
// =====================================================

@Composable
private fun ErrorText(
    text: String
) {

    Spacer(
        modifier =
            Modifier.height(5.dp)
    )

    Text(
        text = text,
        color =
            FloodError,
        fontSize =
            12.sp
    )
}


// =====================================================
// TEXT FIELD COLORS
// =====================================================

@Composable
private fun floodTextFieldColors() =
    OutlinedTextFieldDefaults.colors(

        focusedContainerColor =
            FloodInput,

        unfocusedContainerColor =
            FloodInput,

        disabledContainerColor =
            FloodInput,

        errorContainerColor =
            FloodInput,

        focusedBorderColor =
            FloodCyan,

        unfocusedBorderColor =
            Color.Transparent,

        errorBorderColor =
            FloodError,

        focusedTextColor =
            Color.White,

        unfocusedTextColor =
            Color.White,

        cursorColor =
            FloodCyan,

        focusedLeadingIconColor =
            FloodCyan
    )


// =====================================================
// LOGIN BUTTON
// =====================================================

@Composable
private fun LoginButton(
    isLoading: Boolean,
    onClick: () -> Unit
) {

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(59.dp)
            .clip(
                RoundedCornerShape(10.dp)
            )
            .background(
                Brush.horizontalGradient(
                    colors = listOf(
                        Color(0xFF00A8E8),
                        Color(0xFF00E5F5)
                    )
                )
            )
            .clickable(
                enabled =
                    !isLoading
            ) {
                onClick()
            },

        contentAlignment =
            Alignment.Center
    ) {

        if (isLoading) {

            CircularProgressIndicator(
                modifier =
                    Modifier.size(24.dp),
                color =
                    FloodBackground,
                strokeWidth =
                    2.dp
            )

        } else {

            Text(
                text =
                    "ĐĂNG NHẬP  →",
                color =
                    FloodBackground,
                fontSize =
                    17.sp,
                fontWeight =
                    FontWeight.ExtraBold,
                fontFamily =
                    FontFamily.Monospace,
                letterSpacing =
                    0.5.sp
            )
        }
    }
}


// =====================================================
// REGISTER SECTION
// =====================================================

@Composable
private fun RegisterSection(
    onRegisterClick: () -> Unit
) {

    Row(
        modifier =
            Modifier.fillMaxWidth(),
        horizontalArrangement =
            Arrangement.Center,
        verticalAlignment =
            Alignment.CenterVertically
    ) {

        Text(
            text =
                "Chưa có tài khoản cư dân? ",
            color =
                FloodTextSecondary,
            fontSize =
                14.sp
        )

        Text(
            text =
                "ĐĂNG KÝ NGAY →",
            color =
                FloodCyanLight,
            fontSize =
                14.sp,
            fontWeight =
                FontWeight.Bold,
            fontFamily =
                FontFamily.Monospace,
            modifier =
                Modifier.clickable {
                    onRegisterClick()
                }
        )
    }
}


// =====================================================
// DEVELOPMENT CARD
// =====================================================

@Composable
private fun DevelopmentCard() {

    Card(
        modifier =
            Modifier.fillMaxWidth(),

        shape =
            RoundedCornerShape(15.dp),

        colors =
            CardDefaults.cardColors(
                containerColor =
                    FloodCardDark
            )
    ) {

        Row(
            modifier =
                Modifier.padding(
                    horizontal = 16.dp,
                    vertical = 16.dp
                ),
            verticalAlignment =
                Alignment.Top
        ) {

            Box(
                modifier = Modifier
                    .padding(top = 4.dp)
                    .size(11.dp)
                    .clip(
                        RoundedCornerShape(50)
                    )
                    .background(
                        FloodCyan
                    )
            )

            Spacer(
                modifier =
                    Modifier.width(12.dp)
            )

            Column {

                Text(
                    text =
                        "DỮ LIỆU PHỤC VỤ PHÁT TRIỂN",
                    color =
                        FloodCyanLight,
                    fontSize =
                        11.sp,
                    fontWeight =
                        FontWeight.Bold,
                    fontFamily =
                        FontFamily.Monospace,
                    letterSpacing =
                        1.sp
                )

                Spacer(
                    modifier =
                        Modifier.height(8.dp)
                )

                Text(
                    text =
                        "Thông tin trong phiên bản hiện tại phục vụ mục đích phát triển và kiểm thử hệ thống.",
                    color =
                        FloodTextSecondary,
                    fontSize =
                        13.sp,
                    lineHeight =
                        18.sp
                )
            }
        }
    }
}


// =====================================================
// EMERGENCY 114
// =====================================================

@Composable
private fun Emergency114Button(
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {

    Box(
        modifier = modifier
            .clip(
                RoundedCornerShape(30.dp)
            )
            .background(
                EmergencyBackground
            )
            .clickable {
                onClick()
            }
            .padding(
                horizontal = 18.dp,
                vertical = 10.dp
            )
    ) {

        Text(
            text =
                "☎  Cần trợ giúp khẩn cấp? Gọi tổng đài 114",
            color =
                EmergencyText,
            fontSize =
                12.sp,
            fontWeight =
                FontWeight.SemiBold
        )
    }
}


// =====================================================
// FOOTER
// =====================================================

@Composable
private fun FloodGuardFooter() {

    Column(
        modifier =
            Modifier.fillMaxWidth(),
        horizontalAlignment =
            Alignment.CenterHorizontally
    ) {

        Text(
            text =
                "FLOODGUARD  •  HỆ THỐNG HỖ TRỢ CẢNH BÁO & CỨU HỘ",
            color =
                Color(0xFF718490),
            fontSize =
                9.sp,
            fontWeight =
                FontWeight.Bold,
            fontFamily =
                FontFamily.Monospace,
            letterSpacing =
                0.4.sp,
            textAlign =
                TextAlign.Center
        )

        Spacer(
            modifier =
                Modifier.height(7.dp)
        )

        Text(
            text =
                "Ứng dụng hỗ trợ thông tin, không thay thế hướng dẫn chính thức.",
            color =
                Color(0xFF536774),
            fontSize =
                10.sp,
            textAlign =
                TextAlign.Center
        )
    }
}