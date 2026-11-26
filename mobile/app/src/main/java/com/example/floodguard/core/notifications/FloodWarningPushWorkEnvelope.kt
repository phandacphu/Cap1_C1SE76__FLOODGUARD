package com.example.floodguard.core.notifications

import androidx.work.Data
import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.local.SavedNotificationBinding
import com.google.gson.GsonBuilder
import com.google.gson.JsonParser
import java.security.MessageDigest
import java.util.Base64

class FloodWarningPushWorkEnvelope private constructor(
    val generation: Long,
    private val registrationId: String,
    private val accountFingerprint: String,
    val push: FloodWarningV2Push
) {
    fun matches(
        session: AuthenticatedSessionSnapshot?,
        binding: SavedNotificationBinding?
    ): Boolean {
        if (session == null || binding == null) return false

        val accountId = session.user.id
        if (
            session.user.role != "resident" ||
            accountId.isNullOrBlank()
        ) {
            return false
        }

        return session.generation == generation &&
                session.registrationId == registrationId &&
                fingerprint(accountId) == accountFingerprint &&
                binding.installationId == push.installationId &&
                binding.bindingId == push.bindingId
    }

    fun toWorkData(): Data {
        val payload = mapOf(
            "schemaVersion" to "2",
            "eventId" to push.eventId,
            "alertId" to push.alertId,
            "kind" to push.kind.wireValue,
            "title" to push.title,
            "body" to push.body,
            "createdAt" to push.createdAt.toString(),
            "installationId" to push.installationId,
            "bindingId" to push.bindingId
        )

        return Data.Builder()
            .putLong(GENERATION, generation)
            .putString(REGISTRATION, registrationId)
            .putString(ACCOUNT, accountFingerprint)
            .putString(PAYLOAD, gson.toJson(payload))
            .build()
    }

    override fun toString(): String =
        "FloodWarningPushWorkEnvelope(redacted)"

    companion object {
        private const val GENERATION = "warning_v2_generation"
        private const val REGISTRATION = "warning_v2_registration"
        private const val ACCOUNT = "warning_v2_account"
        private const val PAYLOAD = "warning_v2_payload"

        private val gson = GsonBuilder()
            .disableHtmlEscaping()
            .create()

        fun capture(
            session: AuthenticatedSessionSnapshot,
            binding: SavedNotificationBinding,
            push: FloodWarningV2Push
        ): FloodWarningPushWorkEnvelope {
            val accountId = session.user.id

            require(session.user.role == "resident")
            require(!accountId.isNullOrBlank())
            require(session.generation >= 0L)
            require(session.registrationId.isNotBlank())
            require(binding.installationId == push.installationId)
            require(binding.bindingId == push.bindingId)

            return FloodWarningPushWorkEnvelope(
                generation = session.generation,
                registrationId = session.registrationId,
                accountFingerprint = fingerprint(accountId),
                push = push
            )
        }

        fun fromWorkData(
            data: Data
        ): Result<FloodWarningPushWorkEnvelope> = runCatching {
            val generation = data.getLong(GENERATION, -1L)
            require(generation >= 0L)

            val registration = requireNotNull(
                data.getString(REGISTRATION)
            )
            require(registration.isNotBlank())

            val account = requireNotNull(data.getString(ACCOUNT))
            require(account.isNotBlank())

            val raw = requireNotNull(data.getString(PAYLOAD))
            val json = JsonParser.parseString(raw).asJsonObject

            val payload = json.entrySet().associate { entry ->
                val value = entry.value
                require(value.isJsonPrimitive)
                require(value.asJsonPrimitive.isString)

                entry.key to value.asString
            }

            val push = FloodWarningV2Push.parse(payload).getOrThrow()

            FloodWarningPushWorkEnvelope(
                generation,
                registration,
                account,
                push
            )
        }

        private fun fingerprint(accountId: String): String =
            Base64.getUrlEncoder().withoutPadding().encodeToString(
                MessageDigest.getInstance("SHA-256").digest(
                    accountId.toByteArray(Charsets.UTF_8)
                )
            )
    }
}