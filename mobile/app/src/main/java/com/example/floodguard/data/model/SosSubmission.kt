package com.example.floodguard.data.model

import com.example.floodguard.data.remote.dto.rescue.CreateSosRequest
import com.example.floodguard.data.remote.dto.rescue.SosSmsCredential
import java.math.BigDecimal
import java.time.Instant
import java.util.Base64
import java.util.UUID

enum class SosSubmissionPhase {
    PREPARED,
    UNCERTAIN,
    SMS_OPENED,
    REJECTED
}

// Giữ thông tin của một lần cầu cứu.
// Không dùng data class để tránh toString làm lộ mã SMS.
class SosSubmission(
    val request: CreateSosRequest,
    val capturedAtMillis: Long?,
    val smsCredential: SosSmsCredential?,
    val phase: SosSubmissionPhase =
        SosSubmissionPhase.PREPARED,
    val revision: Long = 0L
) {
    fun withPhase(
        phase: SosSubmissionPhase
    ): SosSubmission {
        check(revision in 0L until Long.MAX_VALUE) {
            "Phiên bản bản gửi SOS không hợp lệ."
        }

        return SosSubmission(
            request = request,
            capturedAtMillis = capturedAtMillis,
            smsCredential = smsCredential,
            phase = phase,
            revision = revision + 1L
        )
    }

    override fun toString(): String =
        "SosSubmission(redacted)"
}

object SosSubmissionCodec {
    private val uuidV4 = Regex(
        "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-" +
                "[89ab][0-9a-f]{3}-[0-9a-f]{12}"
    )

    private val situations = setOf(
        "trapped",
        "evacuation",
        "injured",
        "vulnerable",
        "other"
    )

    private val waterLevels = setOf(
        "below_knee",
        "waist",
        "chest",
        "above_two_meters"
    )

    // Chỉ gọi khi người dùng bắt đầu một yêu cầu mới.
    // Retry, khôi phục màn hình và chuyển SMS dùng bản đã lưu.
    fun newSubmission(
        request: CreateSosRequest,
        capturedAtMillis: Long?,
        smsCredential: SosSmsCredential?
    ): SosSubmission {
        require(request.clientRequestId == null) {
            "Yêu cầu đã có mã. Hãy dùng lại bản gửi đã lưu."
        }

        val frozen = request.copy(
            situations = request.situations.toList(),
            note = request.note?.trim()?.ifBlank { null },
            clientRequestId = UUID.randomUUID().toString()
        )

        validateRequest(frozen)

        return SosSubmission(
            request = frozen,
            capturedAtMillis =
                capturedAtMillis?.takeIf { it > 0L },
            smsCredential = smsCredential
        )
    }

    fun validateRequest(request: CreateSosRequest) {
        require(
            request.clientRequestId?.matches(uuidV4) == true
        ) {
            "Mã cầu cứu phải là UUID v4 chữ thường."
        }

        val location = request.location

        require(
            location.latitude.isFinite() &&
                    location.longitude.isFinite() &&
                    location.latitude in -90.0..90.0 &&
                    location.longitude in -180.0..180.0
        ) {
            "Tọa độ SOS không hợp lệ."
        }

        require(
            request.situations.size in 1..5 &&
                    request.situations.distinct().size ==
                    request.situations.size &&
                    request.situations.all { it in situations }
        ) {
            "Tình huống SOS không hợp lệ hoặc bị trùng."
        }

        require(request.numberOfPeople > 0) {
            "Số người phải lớn hơn 0."
        }

        require(request.waterLevel in waterLevels) {
            "Mực nước SOS không hợp lệ."
        }

        val note = request.note

        require(
            note == note?.trim() &&
                    (note?.length ?: 0) <= 200
        ) {
            "Ghi chú tối đa 200 UTF-16 units " +
                    "sau khi bỏ khoảng trắng đầu/cuối."
        }

        require(
            note == null ||
                    String(
                        note.toByteArray(Charsets.UTF_8),
                        Charsets.UTF_8
                    ) == note
        ) {
            "Ghi chú có ký tự chưa hoàn chỉnh. " +
                    "Hãy nhập lại ký tự cuối."
        }
    }

    fun coordinate(value: Double): String {
        require(value.isFinite()) {
            "Tọa độ không hợp lệ."
        }

        return BigDecimal.valueOf(value)
            .stripTrailingZeros()
            .toPlainString()
    }

    fun encodeSms(
        submission: SosSubmission,
        nowMillis: Long = System.currentTimeMillis()
    ): String {
        val request = submission.request
        validateRequest(request)

        val credential = submission.smsCredential

        require(credential?.usableAt(nowMillis) == true) {
            "Tự tiếp nhận SMS chưa sẵn sàng: " +
                    "chưa có mã hoặc mã đã hết hạn."
        }

        val capturedAt = submission.capturedAtMillis
            ?.takeIf { it > 0L }
            ?.let { Instant.ofEpochMilli(it).toString() }
            ?: "-"

        val note64 = Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(
                request.note.orEmpty()
                    .toByteArray(Charsets.UTF_8)
            )

        val body = listOf(
            "FGSOS1",
            credential!!.credential,
            request.clientRequestId!!,
            "${coordinate(request.location.latitude)}," +
                    coordinate(request.location.longitude),
            capturedAt,
            request.situations.joinToString(","),
            request.numberOfPeople.toString(),
            request.waterLevel,
            note64
        ).joinToString("|")

        require(body.length <= 3000) {
            "Nội dung SMS vượt quá 3.000 ký tự."
        }

        return body
    }
}