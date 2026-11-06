
package com.example.floodguard.ui.screens.sos

enum class SosSituation(val label: String) {
    TRAPPED("Bị mắc kẹt do ngập"),
    EVACUATION("Cần sơ tán khẩn cấp"),
    INJURED("Có người bị thương"),
    VULNERABLE("Người già / trẻ nhỏ cần hỗ trợ"),
    OTHER("Tình huống khác")
}
enum class SosWaterLevel(
    val label: String,
    val description: String
) {
    BELOW_KNEE("Dưới đầu gối", "~0.5m"),
    WAIST("Đến thắt lưng", "~0.8m"),
    CHEST("Đến ngực", "~1.2m"),
    DANGEROUS("Trên 2m / nguy cấp", "> 2.0m")
}

data class SosFormErrors(
    val situations: String? = null,
    val waterLevel: String? = null,
    val location: String? = null,
    val exactPeopleCount: String? = null
) {
    fun hasErrors(): Boolean =
        situations != null ||
                waterLevel != null ||
                location != null ||
                exactPeopleCount != null
}


data class SendSosUiState(
    val selectedSituations: Set<SosSituation> = emptySet(),
    val waterLevel: SosWaterLevel? = null,
    val note: String = "",
    val validationErrors: SosFormErrors = SosFormErrors(),

    // CCF-81: Tọa độ GPS của yêu cầu SOS
    val latitude: Double? = null,
    val longitude: Double? = null,

    // Độ chính xác GPS (mét), nếu thiết bị cung cấp
    val locationAccuracyMeters: Float? = null,

    // Thời điểm ghi nhận tọa độ, tính bằng Unix milliseconds
    val locationTimestampMillis: Long? = null,

    // Trạng thái lấy vị trí
    val isLoadingLocation: Boolean = false,
    val locationError: String? = null,

    // Nội dung hiển thị cho người dùng

    val locationText: String = "Chưa xác định vị trí GPS",

// CCF-83: Thông tin cần thiết để gửi SOS
    val exactPeopleCount: String = "",

// Trạng thái gửi yêu cầu SOS
    val isSubmitting: Boolean = false,
    val submitError: String? = null,
    val submittedSosId: String? = null

)
