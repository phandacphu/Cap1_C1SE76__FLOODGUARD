package com.example.floodguard.core.notifications

import com.google.gson.GsonBuilder
import java.time.Instant

enum class FloodWarningV2PushKind(val wireValue: String) {
    GENERAL("general"),
    NEAR("near"),
    INSIDE("inside"),
    DEACTIVATED("deactivated")
}

class FloodWarningV2Push private constructor(
    val eventId: String,
    val alertId: String,
    val kind: FloodWarningV2PushKind,
    val title: String,
    val body: String,
    val createdAt: Instant,
    val installationId: String,
    val bindingId: String
) {
    val isDeactivation: Boolean
        get() = kind == FloodWarningV2PushKind.DEACTIVATED

    val requiresLocationEvaluation: Boolean
        get() = kind == FloodWarningV2PushKind.NEAR ||
                kind == FloodWarningV2PushKind.INSIDE

    override fun toString(): String =
        "FloodWarningV2Push(redacted)"

    companion object {
        private val gson = GsonBuilder()
            .disableHtmlEscaping()
            .create()

        private val requiredKeys = setOf(
            "schemaVersion",
            "eventId",
            "alertId",
            "kind",
            "title",
            "body",
            "createdAt",
            "installationId",
            "bindingId"
        )

        fun parse(data: Map<String, String>): Result<FloodWarningV2Push> {
            return try {
                require(data.keys.containsAll(requiredKeys))
                require(data["schemaVersion"] == "2")

                require(
                    gson.toJson(data)
                        .toByteArray(Charsets.UTF_8).size <= 3500
                )

                val kind = FloodWarningV2PushKind.entries.firstOrNull {
                    it.wireValue == data["kind"]
                } ?: throw IllegalArgumentException()

                val title = requireNotNull(data["title"])
                val body = requireNotNull(data["body"])

                require(title.toByteArray(Charsets.UTF_8).size <= 600)
                require(body.toByteArray(Charsets.UTF_8).size <= 2000)

                // Control chỉ dùng hủy/đồng bộ, có thể không có nội dung hiển thị.
                if (kind != FloodWarningV2PushKind.DEACTIVATED) {
                    require(title.isNotBlank())
                    require(body.isNotBlank())
                }

                val createdAtText = requiredText(data, "createdAt")
                require(createdAtText.endsWith("Z"))
                val createdAt = Instant.parse(createdAtText)

                Result.success(
                    FloodWarningV2Push(
                        eventId = requiredText(data, "eventId"),
                        alertId = requiredText(data, "alertId"),
                        kind = kind,
                        title = title,
                        body = body,
                        createdAt = createdAt,
                        installationId = requiredText(
                            data, "installationId"
                        ),
                        bindingId = requiredText(data, "bindingId")
                    )
                )
            } catch (_: Exception) {
                // Không đưa payload hoặc thông tin thiết bị vào lỗi/log.
                Result.failure(
                    IllegalArgumentException(
                        "Payload FCM V2 không hợp lệ."
                    )
                )
            }
        }

        private fun requiredText(
            data: Map<String, String>,
            key: String
        ): String {
            val value = requireNotNull(data[key])
            require(value.isNotBlank())
            return value
        }
    }
}