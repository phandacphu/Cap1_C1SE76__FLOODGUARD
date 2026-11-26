package com.example.floodguard.core.notifications

import android.content.Intent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

class PendingFloodWarningOpen internal constructor(
    val request: FloodWarningOpenRequest,
    internal val savedIntent: Intent
) {
    override fun toString(): String =
        "PendingFloodWarningOpen(redacted)"
}

object FloodWarningOpenInbox {
    private val mutablePending =
        MutableStateFlow<PendingFloodWarningOpen?>(null)

    val pending = mutablePending.asStateFlow()

    fun offer(intent: Intent?): Boolean {
        val source = intent ?: return false
        val request = FloodWarningOpenRequest.parse(source)
            ?: return false

        // Chỉ giữ metadata đã kiểm tra, không sao chép extras tùy ý.
        val saved = Intent(FloodWarningLocalNotifications.OPEN_ACTION)
            .setData(source.data)
            .putExtra(
                FloodWarningLocalNotifications.EXTRA_GENERATION,
                request.generation
            )

        listOf(
            FloodWarningLocalNotifications.EXTRA_ALERT_ID,
            FloodWarningLocalNotifications.EXTRA_REGISTRATION,
            FloodWarningLocalNotifications.EXTRA_INSTALLATION,
            FloodWarningLocalNotifications.EXTRA_BINDING
        ).forEach { key ->
            saved.putExtra(key, source.getStringExtra(key))
        }

        mutablePending.value = PendingFloodWarningOpen(request, saved)
        return true
    }

    fun consume(entry: PendingFloodWarningOpen): Boolean =
        mutablePending.compareAndSet(entry, null)

    fun intentForSave(): Intent? =
        mutablePending.value?.let { Intent(it.savedIntent) }

    fun discardGeneration(generation: Long) {
        val entry = mutablePending.value ?: return

        if (entry.request.generation == generation) {
            consume(entry)
        }
    }
}