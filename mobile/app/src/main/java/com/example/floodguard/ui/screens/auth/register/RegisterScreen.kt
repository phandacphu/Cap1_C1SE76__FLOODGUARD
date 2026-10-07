package com.example.floodguard.ui.screens.auth.register

import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.Warning

import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue

import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.runtime.LaunchedEffect


// =====================================================
// COLORS
// =====================================================

private val FloodBackground =
    Color(0xFF061728)

private val FloodCard =
    Color(0xFF13283B)

private val FloodInput =
    Color(0xFF0C2032)

private val FloodCyan =
    Color(0xFF0CD8F3)

private val FloodLightCyan =
    Color(0xFFA9EDFF)

private val FloodText =
    Color(0xFFDCE8F5)

private val FloodSecondaryText =
    Color(0xFF96A7B5)

private val FloodError =
    Color(0xFFFF8A80)


// =====================================================
// REGISTER SCREEN
// =====================================================

@Composable
fun RegisterScreen(

    onBackClick: () -> Unit,

    onLoginClick: () -> Unit,

    onRegisterSuccess: () -> Unit,

    viewModel: RegisterViewModel = viewModel()
) {

    val state by
    viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(state.registerSuccess) {

        if (state.registerSuccess) {

            viewModel.resetSuccess()

            onRegisterSuccess()
        }
    }

    Scaffold(
        containerColor = FloodBackground
    ) { innerPadding ->

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(
                    rememberScrollState()
                )
                .padding(
                    horizontal = 20.dp
                )
        ) {

            Spacer(
                modifier =
                    Modifier.height(16.dp)
            )

            // ============================
            // HEADER
            // ============================

            RegisterHeader(
                onBackClick = onBackClick
            )

            Spacer(
                modifier =
                    Modifier.height(24.dp)
            )

            // ============================
            // FLOODGUARD BRAND
            // ============================

            FloodGuardBrand()

            Spacer(
                modifier =
                    Modifier.height(28.dp)
            )

            // ============================
            // REGISTER CARD
            // ============================

            RegisterCard(

                state = state,

                viewModel = viewModel,

                onRegisterClick = {

                    viewModel.register()
                },

                onLoginClick =
                    onLoginClick
            )

            Spacer(
                modifier =
                    Modifier.height(16.dp)
            )

            // ============================
            // DEVELOPMENT INFORMATION
            // ============================

            DevelopmentInformationCard()

            Spacer(
                modifier =
                    Modifier.height(14.dp)
            )

            // ============================
            // EMERGENCY
            // ============================

            EmergencyCard()

            Spacer(
                modifier =
                    Modifier.height(24.dp)
            )

            // ============================
            // FOOTER
            // ============================

            FloodGuardFooter()

            Spacer(
                modifier =
                    Modifier.height(28.dp)
            )
        }
    }
}


// =====================================================
// HEADER
// =====================================================

@Composable
private fun RegisterHeader(
    onBackClick: () -> Unit
) {

    Row(

        modifier =
            Modifier.fillMaxWidth(),

        verticalAlignment =
            Alignment.CenterVertically,

        horizontalArrangement =
            Arrangement.SpaceBetween
    ) {

        // BACK

        Surface(

            modifier =
                Modifier.size(58.dp),

            shape =
                RoundedCornerShape(15.dp),

            color =
                Color(0xFF1B3044),

            onClick =
                onBackClick
        ) {

            Box(
                contentAlignment =
                    Alignment.Center
            ) {

                Icon(

                    imageVector =
                        Icons.Default.ArrowBack,

                    contentDescription =
                        "Quay lại",

                    tint =
                        FloodLightCyan,

                    modifier =
                        Modifier.size(28.dp)
                )
            }
        }


        // FLOODGUARD BADGE

        Surface(

            shape =
                RoundedCornerShape(30.dp),

            color =
                Color(0xFF1A3044)
        ) {

            Row(

                modifier =
                    Modifier.padding(
                        horizontal = 15.dp,
                        vertical = 9.dp
                    ),

                verticalAlignment =
                    Alignment.CenterVertically
            ) {

                Box(

                    modifier =
                        Modifier
                            .size(9.dp)
                            .clip(CircleShape)
                            .background(
                                FloodCyan
                            )
                )

                Spacer(
                    modifier =
                        Modifier.width(8.dp)
                )

                Text(

                    text =
                        "FLOODGUARD",

                    color =
                        FloodText,

                    fontSize =
                        12.sp,

                    fontWeight =
                        FontWeight.Bold
                )
            }
        }
    }
}


// =====================================================
// BRAND
// =====================================================

@Composable
private fun FloodGuardBrand() {

    Column(

        modifier =
            Modifier.fillMaxWidth(),

        horizontalAlignment =
            Alignment.CenterHorizontally
    ) {

        Surface(

            modifier =
                Modifier.size(72.dp),

            shape =
                RoundedCornerShape(20.dp),

            color =
                Color(0xFF1B3A50)
        ) {

            Box(

                contentAlignment =
                    Alignment.Center
            ) {

                Icon(

                    imageVector =
                        Icons.Default.Shield,

                    contentDescription =
                        "FloodGuard",

                    tint =
                        FloodCyan,

                    modifier =
                        Modifier.size(40.dp)
                )
            }
        }

        Spacer(
            modifier =
                Modifier.height(16.dp)
        )

        Text(

            text =
                "CẢNH BÁO LŨ & CỨU HỘ",

            color =
                FloodText,

            fontWeight =
                FontWeight.Bold,

            fontSize =
                26.sp,

            textAlign =
                TextAlign.Center
        )

        Spacer(
            modifier =
                Modifier.height(10.dp)
        )

        Surface(

            shape =
                RoundedCornerShape(20.dp),

            color =
                Color(0xFF102638)
        ) {

            Text(

                text =
                    "DỮ LIỆU PHỤC VỤ PHÁT TRIỂN",

                modifier =
                    Modifier.padding(
                        horizontal = 14.dp,
                        vertical = 6.dp
                    ),

                color =
                    FloodLightCyan,

                fontSize =
                    10.sp,

                fontWeight =
                    FontWeight.Bold
            )
        }
    }
}


// =====================================================
// REGISTER CARD
// =====================================================

@Composable
private fun RegisterCard(

    state: RegisterUiState,

    viewModel: RegisterViewModel,

    onRegisterClick: () -> Unit,

    onLoginClick: () -> Unit
) {

    Surface(

        modifier =
            Modifier.fillMaxWidth(),

        color =
            FloodCard,

        shape =
            RoundedCornerShape(18.dp)
    ) {

        Column(

            modifier =
                Modifier.padding(20.dp)
        ) {

            // ============================
            // TITLE
            // ============================

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
                        "ĐĂNG KÝ",

                    color =
                        FloodLightCyan,

                    fontSize =
                        23.sp,

                    fontWeight =
                        FontWeight.Bold
                )

                Surface(

                    color =
                        Color(0xFF263E52),

                    shape =
                        RoundedCornerShape(5.dp)
                ) {

                    Text(

                        text =
                            "KHU VỰC: ĐÀ NẴNG",

                        color =
                            FloodLightCyan,

                        modifier =
                            Modifier.padding(
                                horizontal = 8.dp,
                                vertical = 5.dp
                            ),

                        fontSize =
                            10.sp,

                        fontWeight =
                            FontWeight.Bold
                    )
                }
            }

            Spacer(
                modifier =
                    Modifier.height(4.dp)
            )

            Text(

                text =
                    "Tạo tài khoản dành cho người dân",

                color =
                    FloodSecondaryText,

                fontSize =
                    14.sp
            )

            Spacer(
                modifier =
                    Modifier.height(20.dp)
            )


            // ============================
            // FULL NAME
            // ============================

            RegisterTextField(

                label =
                    "HỌ VÀ TÊN",

                value =
                    state.fullName,

                onValueChange =
                    viewModel::onFullNameChange,

                placeholder =
                    "Nguyễn Văn A",

                icon =
                    Icons.Default.Person,

                error =
                    state.fullNameError
            )


            Spacer(
                modifier =
                    Modifier.height(12.dp)
            )


            // ============================
            // PHONE
            // ============================

            RegisterTextField(

                label =
                    "SỐ ĐIỆN THOẠI",

                value =
                    state.phone,

                onValueChange =
                    viewModel::onPhoneChange,

                placeholder =
                    "0912345678",

                icon =
                    Icons.Default.Phone,

                keyboardType =
                    KeyboardType.Phone,

                error =
                    state.phoneError
            )


            Spacer(
                modifier =
                    Modifier.height(12.dp)
            )


            // ============================
            // EMAIL
            // ============================

            RegisterTextField(

                label =
                    "ĐỊA CHỈ EMAIL",

                value =
                    state.email,

                onValueChange =
                    viewModel::onEmailChange,

                placeholder =
                    "nguyenvana@gmail.com",

                icon =
                    Icons.Default.Email,

                keyboardType =
                    KeyboardType.Email,

                error =
                    state.emailError
            )


            Spacer(
                modifier =
                    Modifier.height(12.dp)
            )


            // ============================
            // PASSWORD
            // ============================

            RegisterPasswordField(

                label =
                    "MẬT KHẨU",

                value =
                    state.password,

                onValueChange =
                    viewModel::onPasswordChange,

                visible =
                    state.passwordVisible,

                onVisibilityClick =
                    viewModel::togglePasswordVisibility,

                error =
                    state.passwordError
            )


            Spacer(
                modifier =
                    Modifier.height(12.dp)
            )


            // ============================
            // CONFIRM PASSWORD
            // ============================

            RegisterPasswordField(

                label =
                    "XÁC NHẬN MẬT KHẨU",

                value =
                    state.confirmPassword,

                onValueChange =
                    viewModel::onConfirmPasswordChange,

                visible =
                    state.confirmPasswordVisible,

                onVisibilityClick =
                    viewModel::toggleConfirmPasswordVisibility,

                error =
                    state.confirmPasswordError
            )


            Spacer(
                modifier =
                    Modifier.height(12.dp)
            )


            // ============================
            // GPS AGREEMENT
            // ============================

            GpsAgreement(

                checked =
                    state.gpsAccepted,

                onCheckedChange =
                    viewModel::onGpsAcceptedChange
            )


            // ============================
            // GENERAL ERROR
            // ============================

            state.generalError?.let {

                Spacer(
                    modifier =
                        Modifier.height(8.dp)
                )

                Text(

                    text = it,

                    color =
                        FloodError,

                    fontSize =
                        12.sp
                )
            }


            Spacer(
                modifier =
                    Modifier.height(18.dp)
            )


            // ============================
            // REGISTER BUTTON
            // ============================

            Button(

                onClick =
                    onRegisterClick,

                enabled =
                    !state.isLoading,

                modifier =
                    Modifier
                        .fillMaxWidth()
                        .height(62.dp),

                shape =
                    RoundedCornerShape(17.dp),

                colors =
                    ButtonDefaults.buttonColors(

                        containerColor =
                            FloodCyan,

                        contentColor =
                            Color(0xFF001018),

                        disabledContainerColor =
                            FloodCyan.copy(
                                alpha = 0.4f
                            )
                    )
            ) {

                if (state.isLoading) {

                    CircularProgressIndicator(

                        modifier =
                            Modifier.size(24.dp),

                        color =
                            Color.Black,

                        strokeWidth =
                            2.dp
                    )

                } else {

                    Text(

                        text =
                            "ĐĂNG KÝ TÀI KHOẢN",

                        fontSize =
                            16.sp,

                        fontWeight =
                            FontWeight.Bold
                    )

                    Spacer(
                        modifier =
                            Modifier.width(10.dp)
                    )

                    Icon(

                        imageVector =
                            Icons.Default.ArrowForward,

                        contentDescription =
                            null
                    )
                }
            }


            Spacer(
                modifier =
                    Modifier.height(13.dp)
            )


            // ============================
            // LOGIN
            // ============================

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
                        "Đã có tài khoản?",

                    color =
                        FloodSecondaryText,

                    fontSize =
                        14.sp
                )

                TextButton(

                    onClick =
                        onLoginClick,

                    contentPadding =
                        PaddingValues(
                            horizontal = 5.dp
                        )
                ) {

                    Text(

                        text =
                            "ĐĂNG NHẬP NGAY ›",

                        color =
                            FloodCyan,

                        fontWeight =
                            FontWeight.Bold,

                        fontSize =
                            13.sp
                    )
                }
            }
        }
    }
}


// =====================================================
// NORMAL TEXT FIELD
// =====================================================

@Composable
private fun RegisterTextField(

    label: String,

    value: String,

    onValueChange: (String) -> Unit,

    placeholder: String,

    icon: ImageVector,

    keyboardType: KeyboardType =
        KeyboardType.Text,

    error: String? = null
) {

    Column {

        Text(

            text =
                label,

            color =
                FloodText,

            fontSize =
                12.sp,

            fontWeight =
                FontWeight.Bold
        )

        Spacer(
            modifier =
                Modifier.height(6.dp)
        )

        OutlinedTextField(

            value =
                value,

            onValueChange =
                onValueChange,

            modifier =
                Modifier.fillMaxWidth(),

            singleLine =
                true,

            shape =
                RoundedCornerShape(12.dp),

            leadingIcon = {

                Icon(

                    imageVector =
                        icon,

                    contentDescription =
                        null,

                    tint =
                        FloodSecondaryText
                )
            },

            placeholder = {

                Text(

                    text =
                        placeholder,

                    color =
                        FloodSecondaryText
                )
            },

            keyboardOptions =
                KeyboardOptions(
                    keyboardType =
                        keyboardType
                ),

            isError =
                error != null,

            colors =
                OutlinedTextFieldDefaults.colors(

                    focusedContainerColor =
                        FloodInput,

                    unfocusedContainerColor =
                        FloodInput,

                    focusedBorderColor =
                        FloodCyan,

                    unfocusedBorderColor =
                        Color.Transparent,

                    errorBorderColor =
                        FloodError,

                    cursorColor =
                        FloodCyan,

                    focusedTextColor =
                        FloodText,

                    unfocusedTextColor =
                        FloodText
                )
        )

        if (error != null) {

            Spacer(
                modifier =
                    Modifier.height(4.dp)
            )

            Text(

                text =
                    error,

                color =
                    FloodError,

                fontSize =
                    12.sp
            )
        }
    }
}


// =====================================================
// PASSWORD FIELD
// =====================================================

@Composable
private fun RegisterPasswordField(

    label: String,

    value: String,

    onValueChange: (String) -> Unit,

    visible: Boolean,

    onVisibilityClick: () -> Unit,

    error: String? = null
) {

    Column {

        Text(

            text =
                label,

            color =
                FloodText,

            fontSize =
                12.sp,

            fontWeight =
                FontWeight.Bold
        )

        Spacer(
            modifier =
                Modifier.height(6.dp)
        )

        OutlinedTextField(

            value =
                value,

            onValueChange =
                onValueChange,

            modifier =
                Modifier.fillMaxWidth(),

            singleLine =
                true,

            shape =
                RoundedCornerShape(12.dp),

            leadingIcon = {

                Icon(

                    imageVector =
                        Icons.Default.Lock,

                    contentDescription =
                        null,

                    tint =
                        FloodSecondaryText
                )
            },

            trailingIcon = {

                IconButton(

                    onClick =
                        onVisibilityClick
                ) {

                    Icon(

                        imageVector =
                            if (visible)
                                Icons.Default.VisibilityOff
                            else
                                Icons.Default.Visibility,

                        contentDescription =
                            if (visible)
                                "Ẩn mật khẩu"
                            else
                                "Hiện mật khẩu",

                        tint =
                            FloodSecondaryText
                    )
                }
            },

            visualTransformation =

                if (visible) {

                    VisualTransformation.None

                } else {

                    PasswordVisualTransformation()
                },

            keyboardOptions =
                KeyboardOptions(
                    keyboardType =
                        KeyboardType.Password
                ),

            isError =
                error != null,

            colors =
                OutlinedTextFieldDefaults.colors(

                    focusedContainerColor =
                        FloodInput,

                    unfocusedContainerColor =
                        FloodInput,

                    focusedBorderColor =
                        FloodCyan,

                    unfocusedBorderColor =
                        Color.Transparent,

                    errorBorderColor =
                        FloodError,

                    cursorColor =
                        FloodCyan,

                    focusedTextColor =
                        FloodText,

                    unfocusedTextColor =
                        FloodText
                )
        )

        if (error != null) {

            Spacer(
                modifier =
                    Modifier.height(4.dp)
            )

            Text(

                text =
                    error,

                color =
                    FloodError,

                fontSize =
                    12.sp
            )
        }
    }
}


// =====================================================
// GPS AGREEMENT
// =====================================================

@Composable
private fun GpsAgreement(

    checked: Boolean,

    onCheckedChange: (Boolean) -> Unit
) {

    Row(

        modifier =
            Modifier.fillMaxWidth(),

        verticalAlignment =
            Alignment.Top
    ) {

        Checkbox(

            checked =
                checked,

            onCheckedChange =
                onCheckedChange,

            colors =
                CheckboxDefaults.colors(

                    checkedColor =
                        FloodCyan,

                    uncheckedColor =
                        FloodSecondaryText,

                    checkmarkColor =
                        Color.Black
                )
        )

        Spacer(
            modifier =
                Modifier.width(4.dp)
        )

        Text(

            text =
                "Tôi đồng ý cho phép ứng dụng sử dụng vị trí GPS khi gửi SOS.",

            color =
                FloodSecondaryText,

            fontSize =
                14.sp,

            lineHeight =
                20.sp,

            modifier =
                Modifier.padding(
                    top = 11.dp
                )
        )
    }
}


// =====================================================
// DEVELOPMENT CARD
// =====================================================

@Composable
private fun DevelopmentInformationCard() {

    Surface(

        modifier =
            Modifier.fillMaxWidth(),

        color =
            Color(0xFF0D2234),

        shape =
            RoundedCornerShape(17.dp)
    ) {

        Column(

            modifier =
                Modifier.padding(16.dp)
        ) {

            Row(

                verticalAlignment =
                    Alignment.CenterVertically
            ) {

                Box(

                    modifier =
                        Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(
                                FloodCyan
                            )
                )

                Spacer(
                    modifier =
                        Modifier.width(8.dp)
                )

                Text(

                    text =
                        "DỮ LIỆU PHỤC VỤ PHÁT TRIỂN",

                    color =
                        FloodLightCyan,

                    fontWeight =
                        FontWeight.Bold,

                    fontSize =
                        13.sp
                )
            }

            Spacer(
                modifier =
                    Modifier.height(12.dp)
            )

            Text(

                text =
                    "Thông tin người dùng được sử dụng để hỗ trợ cảnh báo, xác định vị trí khi gửi SOS và phục vụ hoạt động điều phối cứu hộ của hệ thống.",

                color =
                    FloodSecondaryText,

                fontSize =
                    13.sp,

                lineHeight =
                    20.sp
            )
        }
    }
}


// =====================================================
// EMERGENCY
// =====================================================

@Composable
private fun EmergencyCard() {

    Surface(

        modifier =
            Modifier.fillMaxWidth(),

        color =
            Color(0xFF20354A),

        shape =
            RoundedCornerShape(14.dp)
    ) {

        Row(

            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(
                        vertical = 14.dp,
                        horizontal = 8.dp
                    ),

            horizontalArrangement =
                Arrangement.Center,

            verticalAlignment =
                Alignment.CenterVertically
        ) {

            Icon(

                imageVector =
                    Icons.Default.Warning,

                contentDescription =
                    null,

                tint =
                    Color(0xFFFFA59D)
            )

            Spacer(
                modifier =
                    Modifier.width(8.dp)
            )

            Text(

                text =
                    "GỌI HỖ TRỢ KHẨN CẤP: 114 / 112",

                color =
                    Color(0xFFFFAAA2),

                fontSize =
                    13.sp,

                fontWeight =
                    FontWeight.Bold
            )
        }
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
                "FLOODGUARD • HỆ THỐNG HỖ TRỢ CẢNH BÁO & CỨU HỘ",

            color =
                FloodSecondaryText,

            fontSize =
                11.sp,

            fontWeight =
                FontWeight.Bold,

            textAlign =
                TextAlign.Center
        )

        Spacer(
            modifier =
                Modifier.height(6.dp)
        )

        Text(

            text =
                "Ứng dụng hỗ trợ thông tin, không thay thế hướng dẫn chính thức từ cơ quan chức năng.",

            color =
                FloodSecondaryText.copy(
                    alpha = 0.55f
                ),

            fontSize =
                11.sp,

            lineHeight =
                16.sp,

            textAlign =
                TextAlign.Center
        )
    }
}