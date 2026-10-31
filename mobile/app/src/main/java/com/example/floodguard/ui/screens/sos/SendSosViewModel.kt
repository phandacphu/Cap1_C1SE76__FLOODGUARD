
package com.example.floodguard.ui.screens.sos

import android.location.Location
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.remote.dto.rescue.CreateSosLocation
import com.example.floodguard.data.remote.dto.rescue.CreateSosRequest
import com.example.floodguard.data.repository.RescueRequestRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class SendSosViewModel(
    private val repository: RescueRequestRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(SendSosUiState())

    val uiState: StateFlow<SendSosUiState> =
        _uiState.asStateFlow()

    // Chọn hoặc bỏ chọn tình huống cứu hộ
    fun toggleSituation(situation: SosSituation) {
        _uiState.update { current ->
            val updatedSituations = current.selectedSituations.toMutableSet()

            if (situation in updatedSituations) {
                updatedSituations.remove(situation)
            } else {
                updatedSituations.add(situation)
            }

            current.copy(
                selectedSituations = updatedSituations,
                validationErrors = current.validationErrors.copy(
                    situations = if (updatedSituations.isNotEmpty()) null
                    else current.validationErrors.situations
                )
            )
        }
    }

    // Chọn số người cần hỗ trợ
    fun selectPeopleCount(count: SosPeopleCount) {
        _uiState.update { current ->
            current.copy(
                peopleCount = count,
                validationErrors = current.validationErrors.copy(
                    peopleCount = null
                )
            )
        }
    }


    // CCF-83: Chọn mức độ khẩn cấp
    fun selectUrgency(urgency: SosUrgency) {
        _uiState.update { current ->
            current.copy(
                urgency = urgency,
                submitError = null,
                validationErrors = current.validationErrors.copy(
                    urgency = null
                )
            )
        }
    }

    // CCF-83: Nhập số người chính xác
    fun updateExactPeopleCount(value: String) {
        _uiState.update { current ->
            current.copy(
                exactPeopleCount = value.filter { it.isDigit() }.take(3),
                submitError = null,
                validationErrors = current.validationErrors.copy(
                    exactPeopleCount = null
                )
            )
        }
    }

    // Chọn mức nước ước tính
    fun selectWaterLevel(level: SosWaterLevel) {
        _uiState.update { current ->
            current.copy(
                waterLevel = level,
                validationErrors = current.validationErrors.copy(
                    waterLevel = null
                )
            )
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
                locationText = "Đã xác định vị trí GPS",
                validationErrors = current.validationErrors.copy(
                    location = null
                )
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


        val exactCount = current.exactPeopleCount.toIntOrNull()

        val matchesPeopleGroup = when (current.peopleCount) {
            SosPeopleCount.ONE -> exactCount == 1

            SosPeopleCount.TWO_THREE ->
                exactCount != null && exactCount in 2..3

            SosPeopleCount.FOUR_SIX ->
                exactCount != null && exactCount in 4..6

            SosPeopleCount.MORE_THAN_SIX ->
                exactCount != null && exactCount > 6

            null -> true
        }

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
            } else null,

            urgency = if (current.urgency == null) {
                "Vui lòng chọn mức độ khẩn cấp."
            } else null,


            exactPeopleCount = when {
                exactCount == null || exactCount < 1 ->
                    "Vui lòng nhập số người chính xác, lớn hơn 0."

                !matchesPeopleGroup ->
                    "Số người chính xác không khớp với nhóm đã chọn."

                else -> null
            }


        )

        _uiState.update {
            it.copy(validationErrors = errors)
        }

        return !errors.hasErrors()
    }


    // CCF-83: Gửi SOS qua Repository
    // Chỉ gọi khi đã cấu hình Backend kiểm thử an toàn.
    fun submitSos() {
        val current = _uiState.value

        if (current.isSubmitting || current.submittedSosId != null) {
            return
        }

        if (!validateForm()) {
            return
        }

        val validated = _uiState.value

        val latitude = validated.latitude ?: return
        val longitude = validated.longitude ?: return
        val urgency = validated.urgency ?: return
        val numberOfPeople =
            validated.exactPeopleCount.toIntOrNull() ?: return

        val request = CreateSosRequest(
            location = CreateSosLocation(
                latitude = latitude,
                longitude = longitude
            ),
            urgency = urgency.apiValue,
            numberOfPeople = numberOfPeople,
            note = validated.note.trim().ifBlank { null }
        )

        _uiState.update {
            it.copy(
                isSubmitting = true,
                submitError = null
            )
        }

        viewModelScope.launch {
            try {
                val result = repository.createSos(request)

                result.fold(
                    onSuccess = { created ->
                        _uiState.update {
                            it.copy(
                                isSubmitting = false,
                                submittedSosId = created.id,
                                submitError = null
                            )
                        }
                    },
                    onFailure = { error ->
                        _uiState.update {
                            it.copy(
                                isSubmitting = false,
                                submitError = error.message
                                    ?: "Không thể gửi SOS."
                            )
                        }
                    }
                )
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        submitError = e.message
                            ?: "Không thể xử lý yêu cầu SOS."
                    )
                }
            } finally {
                _uiState.update {
                    it.copy(isSubmitting = false)
                }
            }
        }
    }

    // Xóa biểu mẫu SOS
    fun resetForm() {
        val current = _uiState.value

        if (
            current.isSubmitting ||
            current.submittedSosId != null
        ) {
            return
        }

        _uiState.value = SendSosUiState()
    }


}
