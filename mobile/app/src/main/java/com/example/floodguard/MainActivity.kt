package com.example.floodguard

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.os.BundleCompat
import com.example.floodguard.core.notifications.FloodWarningOpenInbox
import com.example.floodguard.core.notifications.NotificationDeviceRuntime
import com.example.floodguard.ui.theme.FloodGuardTheme

class MainActivity : ComponentActivity() {

    companion object {
        private const val PENDING_WARNING_INTENT =
            "pending_warning_v2_intent"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        NotificationDeviceRuntime.get(applicationContext).start()

        if (savedInstanceState == null) {
            FloodWarningOpenInbox.offer(intent)
        } else if (FloodWarningOpenInbox.pending.value == null) {
            val pendingIntent = BundleCompat.getParcelable(
                savedInstanceState,
                PENDING_WARNING_INTENT,
                Intent::class.java
            )
            FloodWarningOpenInbox.offer(pendingIntent)
        }

        enableEdgeToEdge()

        setContent {
            FloodGuardTheme {
                FloodGuardApp()
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        FloodWarningOpenInbox.offer(intent)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.remove(PENDING_WARNING_INTENT)

        FloodWarningOpenInbox.intentForSave()?.let {
            outState.putParcelable(PENDING_WARNING_INTENT, it)
        }

        super.onSaveInstanceState(outState)
    }

    override fun onResume() {
        super.onResume()
        NotificationDeviceRuntime.get(applicationContext).onResume()
    }

    override fun onPause() {
        NotificationDeviceRuntime.get(applicationContext).onPause()
        super.onPause()
    }
}