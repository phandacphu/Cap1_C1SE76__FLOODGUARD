package com.example.floodguard.ui.screens.rescue.sos

import org.junit.Assert.*
import org.junit.Test

class RescueSosSmsFormattingTest {
    @Test fun sourceLabelsDoNotGuessSms() {
        assertEquals("SMS", sosSourceLabel("sms"))
        assertEquals("Ứng dụng", sosSourceLabel("api"))
        assertEquals("Ứng dụng", sosSourceLabel(null))
        assertEquals("Ứng dụng", sosSourceLabel(""))
        assertEquals("Ứng dụng", sosSourceLabel("   "))
        assertEquals("Không rõ", sosSourceLabel("unknown"))
    }

    @Test fun validPhoneCanOpenDialer() {
        assertEquals("0901234567", sosDialablePhone("0901234567"))
        assertEquals("+84901234567", sosDialablePhone("+84901234567"))
        assertEquals("0901234567", sosDialablePhone(" 0901234567 "))
    }

    @Test fun invalidPhoneCannotOpenDialer() {
        listOf(
            null, "", " ", "ABC", "123", "*123#",
            "0901234567;123", "0901234567,123",
            "tel:0901234567", "1234567890123456"
        ).forEach { assertNull(sosDialablePhone(it)) }
    }

    @Test fun nullCaptureAndSmsTimesRemainUnknown() {
        assertEquals("Không rõ", sosTime(null, "Không rõ"))
        assertEquals("Chưa có thông tin", sosTime(null))
        assertEquals(
            "Chưa có thời gian hợp lệ",
            sosTime("invalid", "Không rõ")
        )
    }
}
