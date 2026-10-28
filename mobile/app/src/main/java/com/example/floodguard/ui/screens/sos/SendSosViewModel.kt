
package com.example.floodguard.ui.screens.sos

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

class SendSosViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(SendSosUiState())

    val uiState: StateFlow<SendSosUiState> =
        _uiState.asStateFlow()

    // Chọn hoặc bỏ chọn một tình huống cứu hộ
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

    // Nhập ghi chú, giới hạn tối đa 200 ký tự
    fun updateNote(note: String) {
        _uiState.update { current ->
            current.copy(
                note = note.take(200)
            )
        }
    }

    // Cập nhật thông tin vị trí khi tích hợp GPS
    fun updateLocation(location: String) {
        _uiState.update { current ->
            current.copy(locationText = location)
        }
    }

    // Xóa dữ liệu khi người dùng muốn nhập lại
    fun resetForm() {
        _uiState.value = SendSosUiState()
    }
}
