package com.example.floodguard.data.model

import com.example.floodguard.data.remote.dto.rescue.CreateSosLocation
import com.example.floodguard.data.remote.dto.rescue.CreateSosRequest
import com.example.floodguard.data.remote.dto.rescue.SosSmsCredential
import org.junit.Assert.*
import org.junit.Test
import java.util.Base64
import java.util.Locale
import java.util.UUID

class SosSubmissionCodecTest {
    private val now = 1_900_000_000_000L

    // Dữ liệu giả chỉ dùng trong unit test.
    private val credential = SosSmsCredential(
        credential = "TEST_ONLY_NOT_REAL",
        expiresAt = "2099-01-01T00:00:00Z",
        recipientPhone = "+84900000000",
        format = "FGSOS1"
    )

    private fun request(note: String? = null) =
        CreateSosRequest(
            location = CreateSosLocation(16.0544, 108.2022),
            situations = listOf("other", "injured"),
            numberOfPeople = 3,
            waterLevel = "waist",
            note = note
        )

    @Test
    fun vietnameseNoteHasNineAsciiPartsAndOriginalGpsTime() {
        val submission = SosSubmissionCodec.newSubmission(
            request("  Cần cứu | người già\ntrẻ nhỏ  "),
            capturedAtMillis = 1_000L,
            smsCredential = credential
        )

        val body = SosSubmissionCodec.encodeSms(submission, now)
        val parts = body.split('|')

        assertEquals(9, parts.size)
        assertEquals("1970-01-01T00:00:01Z", parts[4])
        assertEquals("other,injured", parts[5])
        assertFalse(body.contains('\n'))
        assertTrue(body.all { it.code < 128 })
        assertFalse(parts[8].contains('='))

        assertEquals(
            "Cần cứu | người già\ntrẻ nhỏ",
            String(
                Base64.getUrlDecoder().decode(parts[8]),
                Charsets.UTF_8
            )
        )
    }

    @Test
    fun emptyNoteAndUnknownTimeWorkWithAnyLocale() {
        val originalLocale = Locale.getDefault()

        try {
            Locale.setDefault(Locale.GERMANY)

            val submission = SosSubmissionCodec.newSubmission(
                request("   ").copy(
                    location = CreateSosLocation(1e-8, -1e-8)
                ),
                capturedAtMillis = null,
                smsCredential = credential
            )

            val body = SosSubmissionCodec.encodeSms(submission, now)
            val parts = body.split('|')

            assertEquals(9, parts.size)
            assertEquals("0.00000001,-0.00000001", parts[3])
            assertEquals("-", parts[4])
            assertTrue(body.endsWith('|'))
        } finally {
            Locale.setDefault(originalLocale)
        }
    }

    @Test
    fun phaseChangeKeepsUuidPayloadAndSituationOrder() {
        val selected = mutableListOf("other", "injured")

        val submission = SosSubmissionCodec.newSubmission(
            request("Cần hỗ trợ").copy(situations = selected),
            capturedAtMillis = 1_000L,
            smsCredential = credential
        )

        val before = SosSubmissionCodec.encodeSms(submission, now)
        selected.reverse()

        val changed = submission.withPhase(
            SosSubmissionPhase.UNCERTAIN
        )

        assertEquals(
            before,
            SosSubmissionCodec.encodeSms(changed, now + 1_000L)
        )
        assertEquals(
            listOf("other", "injured"),
            changed.request.situations
        )

        val id = changed.request.clientRequestId!!
        assertEquals(4, UUID.fromString(id).version())
        assertEquals(2, UUID.fromString(id).variant())
        assertEquals(UUID.fromString(id).toString(), id)

        assertThrows(IllegalArgumentException::class.java) {
            SosSubmissionCodec.newSubmission(
                changed.request,
                1_000L,
                credential
            )
        }
    }

    @Test
    fun invalidDataAndMissingCredentialAreRejected() {
        val invalidRequests = listOf(
            request().copy(numberOfPeople = 0),
            request().copy(
                location = CreateSosLocation(Double.NaN, 108.0)
            ),
            request().copy(
                situations = listOf("other", "other")
            ),
            request("🆘".repeat(101)),
            request("\uD83D")
        )

        invalidRequests.forEach { invalid ->
            assertThrows(IllegalArgumentException::class.java) {
                SosSubmissionCodec.newSubmission(
                    invalid,
                    null,
                    credential
                )
            }
        }

        val withoutCredential = SosSubmissionCodec.newSubmission(
            request(),
            null,
            null
        )

        assertThrows(IllegalArgumentException::class.java) {
            SosSubmissionCodec.encodeSms(withoutCredential, now)
        }

        val validEmoji = SosSubmissionCodec.newSubmission(
            request("🆘".repeat(100)),
            null,
            credential
        )

        assertEquals(200, validEmoji.request.note!!.length)
        assertTrue(
            SosSubmissionCodec.encodeSms(validEmoji, now).length > 160
        )
    }
}