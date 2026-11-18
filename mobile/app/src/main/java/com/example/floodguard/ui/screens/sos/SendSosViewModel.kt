package com.example.floodguard.ui.screens.sos

import android.location.Location
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.remote.dto.rescue.CreateSosLocation
import com.example.floodguard.data.remote.dto.rescue.CreateSosRequest
import com.example.floodguard.data.remote.dto.rescue.CreatedSosDto
import com.example.floodguard.data.repository.RescueRequestRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class SendSosViewModel(
    repository: RescueRequestRepository? = null,
    createSosRequest:
    (suspend (CreateSosRequest) -> Result<CreatedSosDto>)? = null,
    private val nowMillis: () -> Long = System::currentTimeMillis,
    private val submitValidatedSos:
    (suspend (
        CreateSosRequest,
        () -> Boolean
    ) -> Result<CreatedSosDto>)? = null
) : ViewModel() {

    private val createSosRequest:
            (suspend (CreateSosRequest) -> Result<CreatedSosDto>)? =
        createSosRequest ?: repository?.let { it::createSos }

    init {
        require(
            this.createSosRequest != null ||
                    submitValidatedSos != null
        ) {
            "Cần cung cấp Repository hoặc hàm gửi SOS."
        }
    }

    private val _uiState = MutableStateFlow(SendSosUiState())
    val uiState: StateFlow<SendSosUiState> = _uiState.asStateFlow()

    private fun canEdit(state: SendSosUiState): Boolean =
        !state.isSubmitting && state.submittedSosId == null

    private fun exactPeopleCountError(value: String): String? {
        val count = value.trim().toIntOrNull()
        return if (count == null || count <= 0) {
            "Vui lòng nhập số người chính xác, lớn hơn 0."
        } else {
            null
        }
    }

    private fun hasFreshLocation(state: SendSosUiState, timeMillis: Long): Boolean =
        state.latitude?.isFinite() == true &&
            state.longitude?.isFinite() == true &&
            state.latitude in -90.0..90.0 &&
            state.longitude in -180.0..180.0 &&
            state.locationTimestampMillis?.let { timestamp ->
                timeMillis - timestamp in 0L..30_000L
            } == true &&
            !state.isLoadingLocation && state.locationError == null

    fun toggleSituation(situation: SosSituation) {
        _uiState.update { current ->
            if (!canEdit(current)) return@update current
            val updated = current.selectedSituations.toMutableSet()
            if (!updated.add(situation)) updated.remove(situation)
            current.copy(
                selectedSituations = updated,
                validationErrors = current.validationErrors.copy(
                    situations = if (updated.isNotEmpty()) null
                    else current.validationErrors.situations
                )
            )
        }
    }

    fun updateExactPeopleCount(value: String) {
        _uiState.update { current ->
            if (!canEdit(current)) return@update current

            current.copy(
                exactPeopleCount = value,
                submitError = null,
                validationErrors = current.validationErrors.copy(
                    exactPeopleCount = exactPeopleCountError(value)
                )
            )
        }
    }

    fun selectWaterLevel(level: SosWaterLevel) {
        _uiState.update { current ->
            if (!canEdit(current)) return@update current
            current.copy(
                waterLevel = level,
                validationErrors = current.validationErrors.copy(waterLevel = null)
            )
        }
    }

    fun updateNote(note: String) {
        _uiState.update { current ->
            if (!canEdit(current)) current else current.copy(note = note.take(200))
        }
    }

    // GPS callbacks can arrive after submission starts; ignore them rather than changing
    // the submitted request's location while the HTTP call is in flight.
    fun startLocationLoading() {
        _uiState.update { current ->
            if (!canEdit(current)) return@update current
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

    fun updateLocation(location: Location) {
        _uiState.update { current ->
            if (!canEdit(current)) return@update current
            val updated = current.copy(
                latitude = location.latitude,
                longitude = location.longitude,
                locationAccuracyMeters = if (location.hasAccuracy()) location.accuracy else null,
                locationTimestampMillis = location.time,
                isLoadingLocation = false,
                locationError = null,
                locationText = "Đã xác định vị trí GPS"
            )
            updated.copy(
                validationErrors = updated.validationErrors.copy(
                    location = if (hasFreshLocation(updated, nowMillis())) null
                    else "Vị trí GPS chưa hợp lệ hoặc đã cũ. Vui lòng thử lại GPS."
                )
            )
        }
    }

    fun setLocationError(message: String) {
        _uiState.update { current ->
            if (!canEdit(current)) return@update current
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
        if (!canEdit(current)) return false

        val errors = SosFormErrors(
            situations = if (current.selectedSituations.isEmpty())
                "Vui lòng chọn ít nhất một tình huống." else null,
            waterLevel = if (current.waterLevel == null)
                "Vui lòng chọn mức nước ước tính." else null,
            location = if (!hasFreshLocation(current, nowMillis()))
                "Vị trí GPS chưa hợp lệ hoặc đã cũ. Vui lòng thử lại GPS."
            else null,
            exactPeopleCount = exactPeopleCountError(current.exactPeopleCount)
        )
        _uiState.update { latest ->
            if (!canEdit(latest)) latest else latest.copy(validationErrors = errors)
        }
        return !errors.hasErrors() && canEdit(_uiState.value)
    }
    fun submitSos() {
        if (!canEdit(_uiState.value)) return
        if (!validateForm()) return

        val validated = _uiState.value
        if (!canEdit(validated)) return
        val latitude = validated.latitude ?: return
        val longitude = validated.longitude ?: return
        val numberOfPeople =
            validated.exactPeopleCount.trim().toIntOrNull() ?: return

        val selectedWaterLevel = validated.waterLevel ?: return

        val request = CreateSosRequest(
            location = CreateSosLocation(
                latitude = latitude,
                longitude = longitude
            ),
            situations = SosSituation.entries
                .filter { it in validated.selectedSituations }
                .map { situation ->
                    when (situation) {
                        SosSituation.TRAPPED -> "trapped"
                        SosSituation.EVACUATION -> "evacuation"
                        SosSituation.INJURED -> "injured"
                        SosSituation.VULNERABLE -> "vulnerable"
                        SosSituation.OTHER -> "other"
                    }
                },
            numberOfPeople = numberOfPeople,
            waterLevel = when (selectedWaterLevel) {
                SosWaterLevel.BELOW_KNEE -> "below_knee"
                SosWaterLevel.WAIST -> "waist"
                SosWaterLevel.CHEST -> "chest"
                SosWaterLevel.DANGEROUS -> "above_two_meters"
            },
            note = validated.note.trim().ifBlank { null }
        )

        // Lock synchronously before launching the coroutine to prevent double taps.
        _uiState.update { current ->
            if (!canEdit(current)) current
            else current.copy(isSubmitting = true, submitError = null)
        }
        if (!_uiState.value.isSubmitting) return

        viewModelScope.launch {
            try {
                // Re-check the 30-second GPS window immediately before POST, after
                // coroutine scheduling; the original validation may have expired.
                if (!hasFreshLocation(validated, nowMillis())) {
                    _uiState.update { state ->
                        state.copy(
                            submitError = "Vị trí GPS đã quá 30 giây. Vui lòng cập nhật GPS.",
                            validationErrors = state.validationErrors.copy(
                                location = "Vị trí GPS chưa hợp lệ hoặc đã cũ. Vui lòng thử lại GPS."
                            )
                        )
                    }
                    return@launch
                }

                val result = if (submitValidatedSos != null) {
                    submitValidatedSos.invoke(request) {
                        hasFreshLocation(validated, nowMillis())
                    }
                } else {
                    requireNotNull(createSosRequest).invoke(request)
                }

                result.fold(
                    onSuccess = { created ->
                        _uiState.update { state ->
                            if (created.id.isBlank()) {
                                state.copy(
                                    submitError = "Không nhận được mã SOS hợp lệ. " +
                                        "Hãy kiểm tra trạng thái trước khi thử lại."
                                )
                            } else {
                                state.copy(submittedSosId = created.id, submitError = null)
                            }
                        }
                    },
                    onFailure = { error ->
                        _uiState.update {
                            it.copy(submitError = error.message ?: "Không thể gửi SOS.")
                        }
                    }
                )
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(submitError = e.message ?: "Không thể xử lý yêu cầu SOS.")
                }
            } finally {
                _uiState.update { it.copy(isSubmitting = false) }
            }
        }
    }

    fun resetForm() {
        if (!canEdit(_uiState.value)) return
        _uiState.value = SendSosUiState()
    }
}
