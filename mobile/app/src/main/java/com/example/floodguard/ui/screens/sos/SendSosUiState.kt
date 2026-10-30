
package com.example.floodguard.ui.screens.sos

enum class SosSituation(val label: String) {
    TRAPPED("Bị mắc kẹt do ngập"),
    EVACUATION("Cần sơ tán khẩn cấp"),
    INJURED("Có người bị thương"),
    VULNERABLE("Người già / trẻ nhỏ cần hỗ trợ"),
    OTHER("Tình huống khác")
}

enum class SosPeopleCount(val label: String) {
    ONE("1"),
    TWO_THREE("2–3"),
    FOUR_SIX("4–6"),
    MORE_THAN_SIX("> 6")
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

data class SendSosUiState(
    val selectedSituations: Set<SosSituation> = emptySet(),
    val peopleCount: SosPeopleCount? = null,
    val waterLevel: SosWaterLevel? = null,
    val note: String = "",

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
    val locationText: String = "Chưa xác định vị trí GPS"
)
