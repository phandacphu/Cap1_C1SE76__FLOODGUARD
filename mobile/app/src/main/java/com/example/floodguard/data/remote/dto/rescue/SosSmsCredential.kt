package com.example.floodguard.data.remote.dto.rescue

import java.time.Instant

class SosSmsCredentialResponse(
    val success: Boolean = false,
    val data: SosSmsCredential? = null
) {
    override fun toString(): String =
        "SosSmsCredentialResponse(redacted)"
}

class SosSmsCredential(
    val credential: String,
    val expiresAt: String,
    val recipientPhone: String,
    val format: String
) {
    fun isValid(): Boolean = runCatching {
        format == "FGSOS1" &&
                credential.isNotBlank() &&
                credential.all {
                    it.code in 33..126 && it != '|'
                } &&
                recipientPhone.matches(
                    Regex("\\+?[0-9]{3,15}")
                ) &&
                Instant.parse(expiresAt).toEpochMilli() > 0L
    }.getOrDefault(false)

    fun usableAt(nowMillis: Long): Boolean =
        isValid() &&
                Instant.parse(expiresAt).toEpochMilli() > nowMillis

    fun needsRefresh(nowMillis: Long): Boolean =
        !usableAt(nowMillis) ||
                Instant.parse(expiresAt).toEpochMilli() -
                nowMillis <= REFRESH_BEFORE_MILLIS

    override fun toString(): String =
        "SosSmsCredential(redacted)"

    private companion object {
        const val REFRESH_BEFORE_MILLIS =
            24 * 60 * 60 * 1000L
    }
}