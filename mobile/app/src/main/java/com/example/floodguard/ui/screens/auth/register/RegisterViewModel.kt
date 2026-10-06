package com.example.floodguard.ui.screens.auth.register

import android.util.Patterns
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class RegisterUiState(

    val fullName: String = "",
    val phone: String = "",
    val email: String = "",
    val password: String = "",
    val confirmPassword: String = "",

    val passwordVisible: Boolean = false,
    val confirmPasswordVisible: Boolean = false,

    val gpsAccepted: Boolean = false,

    val fullNameError: String? = null,
    val phoneError: String? = null,
    val emailError: String? = null,
    val passwordError: String? = null,
    val confirmPasswordError: String? = null,

    val isLoading: Boolean = false,
    val registerSuccess: Boolean = false,
    val generalError: String? = null
)

class RegisterViewModel(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState =
        MutableStateFlow(RegisterUiState())

    val uiState: StateFlow<RegisterUiState> =
        _uiState.asStateFlow()

    // ============================
    // FULL NAME
    // ============================

    fun onFullNameChange(value: String) {

        _uiState.value =
            _uiState.value.copy(
                fullName = value,
                fullNameError = null,
                generalError = null
            )
    }

    // ============================
    // PHONE
    // ============================

    fun onPhoneChange(value: String) {

        val filteredPhone =
            value
                .filter { it.isDigit() }
                .take(10)

        _uiState.value =
            _uiState.value.copy(
                phone = filteredPhone,
                phoneError = null,
                generalError = null
            )
    }

    // ============================
    // EMAIL
    // ============================

    fun onEmailChange(value: String) {

        _uiState.value =
            _uiState.value.copy(
                email = value,
                emailError = null,
                generalError = null
            )
    }

    // ============================
    // PASSWORD
    // ============================

    fun onPasswordChange(value: String) {

        _uiState.value =
            _uiState.value.copy(
                password = value,
                passwordError = null,
                confirmPasswordError = null,
                generalError = null
            )
    }

    // ============================
    // CONFIRM PASSWORD
    // ============================

    fun onConfirmPasswordChange(value: String) {

        _uiState.value =
            _uiState.value.copy(
                confirmPassword = value,
                confirmPasswordError = null,
                generalError = null
            )
    }

    // ============================
    // PASSWORD VISIBILITY
    // ============================

    fun togglePasswordVisibility() {

        _uiState.value =
            _uiState.value.copy(
                passwordVisible =
                    !_uiState.value.passwordVisible
            )
    }

    fun toggleConfirmPasswordVisibility() {

        _uiState.value =
            _uiState.value.copy(
                confirmPasswordVisible =
                    !_uiState.value.confirmPasswordVisible
            )
    }

    // ============================
    // GPS CHECKBOX
    // ============================

    fun onGpsAcceptedChange(value: Boolean) {

        _uiState.value =
            _uiState.value.copy(
                gpsAccepted = value
            )
    }

    // ============================
    // VALIDATION
    // ============================

    fun validateForm(): Boolean {

        val currentState = _uiState.value

        var fullNameError: String? = null
        var phoneError: String? = null
        var emailError: String? = null
        var passwordError: String? = null
        var confirmPasswordError: String? = null

        // FULL NAME

        if (currentState.fullName.trim().isEmpty()) {

            fullNameError =
                "Vui lòng nhập họ và tên"
        }

        // PHONE

        if (currentState.phone.isBlank()) {

            phoneError =
                "Vui lòng nhập số điện thoại"

        } else if (
            !currentState.phone.matches(
                Regex("^0\\d{9}$")
            )
        ) {

            phoneError =
                "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0"
        }

        // EMAIL

        if (currentState.email.trim().isEmpty()) {

            emailError =
                "Vui lòng nhập email"

        } else if (
            !Patterns.EMAIL_ADDRESS
                .matcher(currentState.email.trim())
                .matches()
        ) {

            emailError =
                "Email không đúng định dạng"
        }

        // PASSWORD

        if (currentState.password.isEmpty()) {

            passwordError =
                "Vui lòng nhập mật khẩu"

        } else if (
            currentState.password.length < 8
        ) {

            passwordError =
                "Mật khẩu phải có ít nhất 8 ký tự"
        }

        // CONFIRM PASSWORD

        if (currentState.confirmPassword.isEmpty()) {

            confirmPasswordError =
                "Vui lòng xác nhận mật khẩu"

        } else if (
            currentState.confirmPassword !=
            currentState.password
        ) {

            confirmPasswordError =
                "Mật khẩu xác nhận không khớp"
        }

        // UPDATE UI STATE

        _uiState.value =
            currentState.copy(
                fullNameError = fullNameError,
                phoneError = phoneError,
                emailError = emailError,
                passwordError = passwordError,
                confirmPasswordError = confirmPasswordError
            )

        return fullNameError == null &&
                phoneError == null &&
                emailError == null &&
                passwordError == null &&
                confirmPasswordError == null
    }

    // ============================
    // REGISTER API
    // ============================

    fun register() {

        val valid = validateForm()

        if (!valid) {
            return
        }

        val currentState = _uiState.value

        viewModelScope.launch {

            _uiState.value =
                currentState.copy(
                    isLoading = true,
                    registerSuccess = false,
                    generalError = null
                )

            val result =
                authRepository.register(
                    fullName =
                        currentState.fullName.trim(),
                    phone =
                        currentState.phone,
                    email =
                        currentState.email.trim(),
                    password =
                        currentState.password
                )

            result
                .onSuccess {

                    _uiState.value =
                        _uiState.value.copy(
                            isLoading = false,
                            registerSuccess = true,
                            generalError = null
                        )
                }
                .onFailure { exception ->

                    _uiState.value =
                        _uiState.value.copy(
                            isLoading = false,
                            registerSuccess = false,
                            generalError =
                                exception.message
                                    ?: "Đăng ký thất bại"
                        )
                }
        }
    }

    // ============================
    // RESET SUCCESS
    // ============================

    fun resetSuccess() {

        _uiState.value =
            _uiState.value.copy(
                registerSuccess = false
            )
    }

    // ============================
    // CLEAR ERROR
    // ============================

    fun clearError() {

        _uiState.value =
            _uiState.value.copy(
                generalError = null
            )
    }
}