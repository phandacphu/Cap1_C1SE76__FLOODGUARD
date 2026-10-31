
package com.example.floodguard.ui.screens.sos

import android.Manifest
import android.content.pm.PackageManager
import android.location.LocationManager
import android.location.Location
import androidx.lifecycle.ViewModel
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableIntStateOf
import androidx.core.content.ContextCompat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.delay

class SendSosViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(SendSosUiState())

    val uiState: StateFlow<SendSosUiState> =
        _uiState.asStateFlow()

    // Chọn hoặc bỏ chọn tình huống cứu hộ
    fun toggleSituation(situation: SosSituation) {
        _uiState.update { current ->
            val updatedSituations =
                current.selectedSituations.toMutableSet()

            if (situation in updatedSituations) {
                updatedSituations.remove(situation)
            } else {
                updatedSituations.add(situation)
            }

            current.copy(
                selectedSituations = updatedSituations
            )
        }
    }

    // Chọn số người cần hỗ trợ
    fun selectPeopleCount(count: SosPeopleCount) {
        _uiState.update { current ->
            current.copy(peopleCount = count)
        }
    }

    // Chọn mức nước ước tính
    fun selectWaterLevel(level: SosWaterLevel) {
        _uiState.update { current ->
            current.copy(waterLevel = level)
        }
    }

    // Nhập ghi chú, tối đa 200 ký tự
    fun updateNote(note: String) {
        _uiState.update { current ->
            current.copy(note = note.take(200))
        }
    }

    // CCF-81: Bắt đầu lấy tọa độ GPS
    fun startLocationLoading() {
        _uiState.update { current ->
            current.copy(
                latitude = null,
                longitude = null,
                locationAccuracyMeters = null,
                locationTimestampMillis = null,
                isLoadingLocation = true,
                locationError = null,
                locationText = "Đang lấy vị trí GPS..."
            )
        }
    }

    // CCF-81: Nhận tọa độ GPS
    fun updateLocation(location: Location) {
        _uiState.update { current ->
            current.copy(
                latitude = location.latitude,
                longitude = location.longitude,
                locationAccuracyMeters =
                    if (location.hasAccuracy()) {
                        location.accuracy
                    } else {
                        null
                    },
                locationTimestampMillis = location.time,
                isLoadingLocation = false,
                locationError = null,
                locationText = "Đã xác định vị trí GPS"
            )
        }
    }

    // CCF-81: Xử lý lỗi GPS
    fun setLocationError(message: String) {
        _uiState.update { current ->
            current.copy(
                latitude = null,
                longitude = null,
                locationAccuracyMeters = null,
                locationTimestampMillis = null,
                isLoadingLocation = false,
                locationError = message,
                locationText = "Không thể xác định vị trí GPS"
            )
        }
    }


    fun validateForm(): Boolean {
        val current = _uiState.value

        val hasValidLocation =
            current.latitude?.isFinite() == true &&
                    current.longitude?.isFinite() == true &&
                    current.latitude in -90.0..90.0 &&
                    current.longitude in -180.0..180.0 &&
                    current.locationTimestampMillis?.let { timestamp ->
                        System.currentTimeMillis() - timestamp in 0L..30_000L
                    } == true &&
                    !current.isLoadingLocation &&
                    current.locationError == null

        val errors = SosFormErrors(
            situations = if (current.selectedSituations.isEmpty()) {
                "Vui lòng chọn ít nhất một tình huống."
            } else null,

            peopleCount = if (current.peopleCount == null) {
                "Vui lòng chọn số người cần hỗ trợ."
            } else null,

            waterLevel = if (current.waterLevel == null) {
                "Vui lòng chọn mức nước ước tính."
            } else null,

            location = if (!hasValidLocation) {
                "Vị trí GPS chưa hợp lệ hoặc đã cũ. Vui lòng thử lại GPS."
            } else null
        )

        _uiState.update {
            it.copy(validationErrors = errors)
        }

        return !errors.hasErrors()
    }


    // Xóa dữ liệu biểu mẫu
    fun resetForm() {
        _uiState.value = SendSosUiState()
    }
}
