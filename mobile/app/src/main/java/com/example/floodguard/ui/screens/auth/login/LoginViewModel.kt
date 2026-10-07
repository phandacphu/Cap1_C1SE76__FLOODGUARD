package com.example.floodguard.ui.screens.auth.login

import android.util.Patterns
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

// =====================================================
// LOGIN UI STATE
// =====================================================

data class LoginUiState(
    val identifier: String = "",
    val password: String = "",

    val passwordVisible: Boolean = false,
    val rememberMe: Boolean = false,

    val identifierError: String? = null,
    val passwordError: String? = null,
    val apiError: String? = null,

    val isLoading: Boolean = false,
    val loginSuccess: Boolean = false
)

// =====================================================
// LOGIN VIEW MODEL
// =====================================================

class LoginViewModel(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState =
        MutableStateFlow(LoginUiState())

    val uiState: StateFlow<LoginUiState> =
        _uiState.asStateFlow()

    // =================================================
    // IDENTIFIER - EMAIL OR PHONE
    // =================================================

    fun onIdentifierChange(value: String) {
        _uiState.value =
            _uiState.value.copy(
                identifier = value,
                identifierError = null,
                apiError = null
            )
    }

    // =================================================
    // PASSWORD
    // =================================================

    fun onPasswordChange(value: String) {
        _uiState.value =
            _uiState.value.copy(
                password = value,
                passwordError = null,
                apiError = null
            )
    }

    // =================================================
    // SHOW / HIDE PASSWORD
    // =================================================

    fun togglePasswordVisibility() {
        _uiState.value =
            _uiState.value.copy(
                passwordVisible =
                    !_uiState.value.passwordVisible
            )
    }

    // =================================================
    // REMEMBER ME
    // =================================================

    fun onRememberMeChange(value: Boolean) {
        _uiState.value =
            _uiState.value.copy(
                rememberMe = value
            )
    }

    // =================================================
    // LOGIN
    // =================================================

    fun login() {

        val currentState = _uiState.value

        val identifier =
            currentState.identifier.trim()

        val password =
            currentState.password

        // ---------------------------------------------
        // VALIDATION
        // ---------------------------------------------

        var identifierError: String? = null
        var passwordError: String? = null

        if (identifier.isBlank()) {

            identifierError =
                "Vui lòng nhập email hoặc số điện thoại"

        } else {

            val isEmail =
                Patterns.EMAIL_ADDRESS
                    .matcher(identifier)
                    .matches()

            val isPhone =
                identifier.matches(
                    Regex("^0\\d{9}$")
                )

            if (!isEmail && !isPhone) {
                identifierError =
                    "Email hoặc số điện thoại không đúng định dạng"
            }
        }

        if (password.isBlank()) {

            passwordError =
                "Vui lòng nhập mật khẩu"

        } else if (password.length < 8) {

            passwordError =
                "Mật khẩu phải có ít nhất 8 ký tự"
        }

        // ---------------------------------------------
        // VALIDATION FAILED
        // ---------------------------------------------

        if (
            identifierError != null ||
            passwordError != null
        ) {

            _uiState.value =
                currentState.copy(
                    identifier = identifier,
                    identifierError = identifierError,
                    passwordError = passwordError,
                    apiError = null,
                    loginSuccess = false
                )

            return
        }

        // ---------------------------------------------
        // CALL LOGIN API
        // ---------------------------------------------

        viewModelScope.launch {

            _uiState.value =
                _uiState.value.copy(
                    identifier = identifier,
                    identifierError = null,
                    passwordError = null,
                    apiError = null,
                    isLoading = true,
                    loginSuccess = false
                )

            val result =
                authRepository.login(
                    identifier = identifier,
                    password = password
                )

            result
                .onSuccess {

                    _uiState.value =
                        _uiState.value.copy(
                            isLoading = false,
                            apiError = null,
                            loginSuccess = true
                        )
                }
                .onFailure { exception ->

                    _uiState.value =
                        _uiState.value.copy(
                            isLoading = false,
                            apiError =
                                exception.message
                                    ?: "Đăng nhập thất bại",
                            loginSuccess = false
                        )
                }
        }
    }

    // =================================================
    // RESET LOGIN SUCCESS
    // =================================================

    fun resetLoginSuccess() {
        _uiState.value =
            _uiState.value.copy(
                loginSuccess = false
            )
    }

    // =================================================
    // RESET ERRORS
    // =================================================

    fun clearErrors() {
        _uiState.value =
            _uiState.value.copy(
                identifierError = null,
                passwordError = null,
                apiError = null
            )
    }
}