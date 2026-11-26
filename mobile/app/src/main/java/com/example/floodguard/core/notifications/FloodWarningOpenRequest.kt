package com.example.floodguard.core.notifications

import android.content.Intent
import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.local.SavedNotificationBinding

class FloodWarningOpenRequest private constructor(
    val alertId: String,
    val generation: Long,
    private val registrationId: String,
    private val installationId: String,
    private val bindingId: String
) {
    fun matches(
        session: AuthenticatedSessionSnapshot?,
        binding: SavedNotificationBinding?
    ): Boolean =
        session != null &&
                binding != null &&
                session.user.role == "resident" &&
                !session.user.id.isNullOrBlank() &&
                session.generation == generation &&
                session.registrationId == registrationId &&
                binding.installationId == installationId &&
                binding.bindingId == bindingId

    override fun toString(): String =
        "FloodWarningOpenRequest(redacted)"

    companion object {
        fun parse(intent: Intent?): FloodWarningOpenRequest? {
            if (
                intent == null ||
                intent.action != FloodWarningLocalNotifications.OPEN_ACTION
            ) {
                return null
            }

            return runCatching {
                val uri = requireNotNull(intent.data)

                require(uri.scheme == "floodguard")
                require(uri.host == "warning")
                require(uri.pathSegments.size == 1)
                require(
                    uri.getQueryParameter("kind") in
                            setOf("general", "near", "inside")
                )

                val alertId = requiredExtra(
                    intent,
                    FloodWarningLocalNotifications.EXTRA_ALERT_ID
                )
                require(uri.pathSegments.single() == alertId)

                val generation = intent.getLongExtra(
                    FloodWarningLocalNotifications.EXTRA_GENERATION,
                    -1L
                )
                require(generation >= 0L)
                require(
                    uri.getQueryParameter("generation") ==
                            generation.toString()
                )

                val registration = requiredExtra(
                    intent,
                    FloodWarningLocalNotifications.EXTRA_REGISTRATION
                )
                require(
                    uri.getQueryParameter("registration") == registration
                )

                FloodWarningOpenRequest(
                    alertId = alertId,
                    generation = generation,
                    registrationId = registration,
                    installationId = requiredExtra(
                        intent,
                        FloodWarningLocalNotifications.EXTRA_INSTALLATION
                    ),
                    bindingId = requiredExtra(
                        intent,
                        FloodWarningLocalNotifications.EXTRA_BINDING
                    )
                )
            }.getOrNull()
        }

        private fun requiredExtra(
            intent: Intent,
            key: String
        ): String {
            val value = requireNotNull(intent.getStringExtra(key))
            require(value.isNotBlank())
            return value
        }
    }
}