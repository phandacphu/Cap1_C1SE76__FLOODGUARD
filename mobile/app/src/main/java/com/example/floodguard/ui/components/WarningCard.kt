package com.example.floodguard.ui.components

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.View

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.example.floodguard.domain.model.Warning
import com.example.floodguard.domain.model.WarningTimeStatus
import com.example.floodguard.domain.model.formatWarningDateTime
import com.example.floodguard.domain.model.warningSeverityLabel
import com.example.floodguard.domain.model.warningTimeStatusLabel
import java.util.Locale

// Shared presentation for the list and detail. All backgrounds are solid colors.
val WarningBackground = Color(0xFF07101F)
val WarningSurface = Color(0xFF0D1726)
val WarningBorder = Color(0xFF263449)
val WarningSecondaryText = Color(0xFFB8C4D6)
val WarningAccent = Color(0xFF22D3EE)

fun warningSeverityColor(severity: String): Color = when (severity.lowercase(Locale.ROOT)) {
    "low", "thấp" -> Color(0xFFFFD54F)
    "medium", "trung bình" -> Color(0xFFFFA726)
    "high", "cao" -> Color(0xFFFF6464)
    "critical", "khẩn cấp" -> Color(0xFFE3A0FF)
    else -> WarningSecondaryText
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WarningTopBar(
    title: String,
    onBack: () -> Unit,
    onNotificationClick: () -> Unit,
    onProfileClick: () -> Unit
) {
    val view = LocalView.current
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(view, lifecycleOwner) {
        val window = findWarningActivity(view.context)?.window
        var previousLightStatusBar: Boolean? = null
        val applyStatusBarStyle = Runnable {
            if (window != null && view.isAttachedToWindow) {
                val controller = WindowCompat.getInsetsController(window, view)
                if (previousLightStatusBar == null) {
                    previousLightStatusBar = controller.isAppearanceLightStatusBars
                }
                controller.isAppearanceLightStatusBars = false
            }
        }
        // Apply after attachment, and again after the route resumes. The initial
        // composition can occur before the view has an insets controller.
        val attachListener = object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(attachedView: View) {
                attachedView.post(applyStatusBarStyle)
            }
            override fun onViewDetachedFromWindow(detachedView: View) = Unit
        }
        val lifecycleObserver = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) view.post(applyStatusBarStyle)
        }
        view.addOnAttachStateChangeListener(attachListener)
        lifecycleOwner.lifecycle.addObserver(lifecycleObserver)
        view.post(applyStatusBarStyle)
        onDispose {
            view.removeCallbacks(applyStatusBarStyle)
            view.removeOnAttachStateChangeListener(attachListener)
            lifecycleOwner.lifecycle.removeObserver(lifecycleObserver)
            if (window != null) {
                previousLightStatusBar?.let { previous ->
                    WindowCompat.getInsetsController(window, view)
                        .isAppearanceLightStatusBars = previous
                }
            }
        }
    }
    TopAppBar(
        title = {
            Text(
                text = title,
                color = Color.White,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        },
        navigationIcon = {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Quay lại", tint = Color.White)
            }
        },
        actions = {
            IconButton(onClick = onNotificationClick) {
                Icon(Icons.Outlined.Notifications, "Thông báo", tint = Color.White)
            }
            IconButton(onClick = onProfileClick) {
                Icon(Icons.Outlined.Person, "Cá nhân", tint = Color.White)
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = WarningBackground,
            scrolledContainerColor = WarningBackground
        )
    )
}


private fun findWarningActivity(context: Context): Activity? {
    var current = context
    while (current is ContextWrapper) {
        if (current is Activity) return current
        val base = current.baseContext
        if (base === current) return null
        current = base
    }
    return current as? Activity
}

@Composable
fun WarningDataNotice() {
    Surface(
        color = WarningSurface,
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, WarningBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(
            text = buildAnnotatedString {
                withStyle(SpanStyle(color = WarningAccent, fontWeight = FontWeight.Bold)) {
                    append("Dữ liệu kiểm thử. ")
                }
                append("Chưa phải cảnh báo lũ thực tế được xác thực.")
            },
            color = WarningSecondaryText,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(12.dp)
        )
    }
}

@Composable
fun WarningSeverityBadge(severity: String) {
    val color = warningSeverityColor(severity)
    Surface(color = color.copy(alpha = 0.14f), shape = RoundedCornerShape(8.dp)) {
        Text(
            text = "Mức độ ${warningSeverityLabel(severity).lowercase(Locale.forLanguageTag("vi-VN"))}",
            color = color,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp)
        )
    }
}

@Composable
fun WarningCard(warning: Warning, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, WarningBorder),
        colors = CardDefaults.cardColors(containerColor = WarningSurface)
    ) {
        Box(
            Modifier.fillMaxWidth().height(4.dp)
                .background(warningSeverityColor(warning.severity))
        )
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            WarningSeverityBadge(warning.severity)
            Text(
                warning.title,
                color = Color.White,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(
                    Icons.Outlined.LocationOn, null,
                    tint = WarningSecondaryText, modifier = Modifier.size(18.dp)
                )
                Text(
                    warning.area, color = WarningSecondaryText,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 2, overflow = TextOverflow.Ellipsis
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    "Bắt đầu: ${formatWarningDateTime(warning.startTime)}",
                    color = WarningSecondaryText, style = MaterialTheme.typography.bodySmall
                )
                Text(
                    "Kết thúc: ${formatWarningDateTime(warning.endTime)}",
                    color = WarningSecondaryText, style = MaterialTheme.typography.bodySmall
                )
            }
            Text(
                warning.content, color = Color(0xFFD5DEE9),
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 3, overflow = TextOverflow.Ellipsis
            )
            HorizontalDivider(color = WarningBorder)
            // A separate line keeps long status labels readable at larger font sizes.
            Text(
                warningTimeStatusLabel(warning.timeStatus),
                color = if (warning.timeStatus == WarningTimeStatus.EFFECTIVE) {
                    WarningAccent
                } else {
                    WarningSecondaryText
                },
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically) {
                Text("Xem chi tiết", color = WarningAccent, style = MaterialTheme.typography.labelLarge)
                Icon(Icons.Outlined.ChevronRight, null, tint = WarningAccent, modifier = Modifier.size(18.dp))
            }
        }
    }
}
