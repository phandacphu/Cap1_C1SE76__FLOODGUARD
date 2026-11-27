package com.example.floodguard.data.local

import com.example.floodguard.data.model.SosSubmission
import com.example.floodguard.data.model.SosSubmissionPhase
import com.example.floodguard.data.model.SosCachedLocation
import com.example.floodguard.data.remote.dto.rescue.CreateSosLocation
import com.example.floodguard.data.remote.dto.rescue.CreateSosRequest
import com.example.floodguard.data.remote.dto.rescue.SosSmsCredential
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class SosSubmissionPersistenceTest {
    private lateinit var sessions: SessionManager
    private lateinit var key: SosSmsSessionKey

    private val credential = SosSmsCredential(
        "TEST_ONLY_NOT_REAL",
        "2099-01-01T00:00:00Z",
        "+84900000000",
        "FGSOS1"
    )

    private fun request(note: String = "Cần hỗ trợ") =
        CreateSosRequest(
            CreateSosLocation(16.0544, 108.2022),
            listOf("other", "injured"),
            2,
            "waist",
            note
        )

    private suspend fun prepare(): SosSubmission =
        sessions.getOrCreateSosSubmission(
            key,
            request(),
            1_000L,
            credential
        )

    @Before
    fun setup() = runTest {
        sessions = SessionManager(
            RuntimeEnvironment.getApplication()
        )

        sessions.clearSession()
        sessions.saveToken("TEST_ONLY_A")
        sessions.saveUser(
            SessionUser(id = "A", role = "resident")
        )

        key = sessions.getSosSmsSessionKey()!!
    }

    @After
    fun teardown() = runTest {
        sessions.clearSession()
    }

    @Test
    fun retryAndNewManagerKeepOriginalPayload() = runTest {
        val original = prepare()

        val retry = sessions.getOrCreateSosSubmission(
            key,
            request("Nội dung khác"),
            9_000L,
            null
        )

        val anotherManager = SessionManager(
            RuntimeEnvironment.getApplication()
        )

        val restored =
            anotherManager.getSosSubmission(key)!!

        assertEquals(original.request, retry.request)
        assertEquals(original.request, restored.request)
        assertEquals(1_000L, restored.capturedAtMillis)
        assertEquals(
            credential.credential,
            restored.smsCredential!!.credential
        )

        sessions.saveUser(
            SessionUser(
                id = "A",
                role = "resident",
                fullName = "Đổi tên"
            )
        )

        assertEquals(key, sessions.getSosSmsSessionKey())
        assertEquals(
            original.request,
            sessions.getSosSubmission(key)!!.request
        )
    }

    @Test
    fun parallelPreparationCreatesOneUuid() = runTest {
        val results = (1..10).map { index ->
            async {
                sessions.getOrCreateSosSubmission(
                    key,
                    request("Test $index"),
                    1_000L,
                    credential
                )
            }
        }.awaitAll()

        assertEquals(
            1,
            results.map {
                it.request.clientRequestId
            }.distinct().size
        )

        assertEquals(
            1,
            results.map { it.request }.distinct().size
        )
    }

    @Test
    fun uncertainSubmissionCannotBeDiscardedOrReplacedByStaleId() =
        runTest {
            val original = prepare()
            val id = original.request.clientRequestId!!

            val updated = sessions.updateSosSubmissionPhase(
                key,
                id,
                SosSubmissionPhase.UNCERTAIN
            )

            assertEquals(original.request, updated.request)
            assertEquals(
                original.capturedAtMillis,
                updated.capturedAtMillis
            )

            assertTrue(
                runCatching {
                    sessions.discardUnsentSosSubmission(key, id)
                }.isFailure
            )

            assertFalse(
                sessions.clearConfirmedSosSubmission(
                    key,
                    "WRONG-ID"
                )
            )

            assertTrue(
                runCatching {
                    sessions.updateSosSubmissionPhase(
                        key,
                        "WRONG-ID",
                        SosSubmissionPhase.REJECTED
                    )
                }.isFailure
            )

            assertEquals(
                SosSubmissionPhase.UNCERTAIN,
                sessions.getSosSubmission(key)!!.phase
            )
        }

    @Test
    fun newLoginAndLogoutClearPendingAndRejectOldSession() =
        runTest {
            prepare()
            val oldKey = key

            sessions.saveToken("TEST_ONLY_NEW_LOGIN")

            assertNull(sessions.getSosSmsSessionKey())

            sessions.saveUser(
                SessionUser(id = "A", role = "resident")
            )

            key = sessions.getSosSmsSessionKey()!!

            assertNotEquals(oldKey, key)
            assertNull(sessions.getSosSubmission(key))

            assertTrue(
                runCatching {
                    sessions.getSosSubmission(oldKey)
                }.isFailure
            )

            val pending = prepare()

            sessions.clearSession()
            sessions.saveToken("TEST_ONLY_B")
            sessions.saveUser(
                SessionUser(id = "B", role = "resident")
            )

            val b = sessions.getSosSmsSessionKey()!!

            assertNull(sessions.getSosSubmission(b))

            assertTrue(
                runCatching {
                    sessions.updateSosSubmissionPhase(
                        key,
                        pending.request.clientRequestId!!,
                        SosSubmissionPhase.SMS_OPENED
                    )
                }.isFailure
            )
        }

    @Test
    fun confirmedRemovalDoesNotRecreateFromOldPayload() =
        runTest {
            val original = prepare()

            assertTrue(
                sessions.clearConfirmedSosSubmission(
                    key,
                    original.request.clientRequestId!!
                )
            )

            assertNull(sessions.getSosSubmission(key))

            assertTrue(
                runCatching {
                    sessions.getOrCreateSosSubmission(
                        key,
                        original.request,
                        1_000L,
                        credential
                    )
                }.isFailure
            )

            assertNull(sessions.getSosSubmission(key))
        }

    @Test
    fun explicitDiscardOfUnsentAllowsANewUuid() = runTest {
        val first = prepare()

        assertTrue(
            sessions.discardUnsentSosSubmission(
                key,
                first.request.clientRequestId!!
            )
        )

        val second = prepare()

        assertNotEquals(
            first.request.clientRequestId,
            second.request.clientRequestId
        )
    }
    @Test
    fun lastLocationSurvivesNewManagerWithOriginalTime() =
        runTest {
            val point = SosCachedLocation(
                latitude = 16.0544,
                longitude = 108.2022,
                capturedAtMillis = 1_000L,
                accuracyMeters = 12f
            )

            sessions.saveSosLastLocation(key, point)

            val anotherManager = SessionManager(
                RuntimeEnvironment.getApplication()
            )

            val restored =
                anotherManager.getSosLastLocation(key)

            assertEquals(point, restored)
            assertEquals(1_000L, restored!!.capturedAtMillis)
        }

    @Test
    fun cachedGpsCannotReplaceNewerSavedGps() = runTest {
        val current = SosCachedLocation(
            16.0,
            108.0,
            5_000L
        )

        sessions.saveSosLastLocation(key, current)

        val older = SosCachedLocation(
            17.0,
            109.0,
            1_000L
        )

        assertEquals(
            current,
            sessions.saveSosLastLocation(
                key,
                older,
                fromCache = true
            )
        )

        val unknownTime = SosCachedLocation(
            18.0,
            110.0,
            null
        )

        assertEquals(
            current,
            sessions.saveSosLastLocation(
                key,
                unknownTime,
                fromCache = true
            )
        )

        val newer = SosCachedLocation(
            19.0,
            111.0,
            8_000L
        )

        assertEquals(
            newer,
            sessions.saveSosLastLocation(
                key,
                newer,
                fromCache = true
            )
        )
    }

    @Test
    fun freshGpsWithUnknownTimeDoesNotChangePendingPayload() =
        runTest {
            val pending = prepare()

            sessions.updateSosSubmissionPhase(
                key,
                pending.request.clientRequestId!!,
                SosSubmissionPhase.UNCERTAIN
            )

            sessions.saveSosLastLocation(
                key,
                SosCachedLocation(16.0, 108.0, 5_000L)
            )

            val fresh = SosCachedLocation(
                latitude = 17.0,
                longitude = 109.0,
                capturedAtMillis = null,
                accuracyMeters = Float.NaN
            )

            val chosen = sessions.saveSosLastLocation(
                key,
                fresh,
                fromCache = false
            )

            assertEquals(fresh.latitude, chosen.latitude)
            assertEquals(fresh.longitude, chosen.longitude)
            assertNull(chosen.capturedAtMillis)
            assertNull(chosen.accuracyMeters)

            val storedPending =
                sessions.getSosSubmission(key)!!

            assertEquals(pending.request, storedPending.request)
            assertEquals(
                pending.capturedAtMillis,
                storedPending.capturedAtMillis
            )
        }

    @Test
    fun invalidOrOtherAccountGpsIsNotUsed() = runTest {
        val invalidPoints = listOf(
            SosCachedLocation(),
            SosCachedLocation(latitude = 16.0),
            SosCachedLocation(longitude = 108.0),
            SosCachedLocation(Double.NaN, 108.0),
            SosCachedLocation(91.0, 108.0),
            SosCachedLocation(16.0, 181.0),
            SosCachedLocation(16.0, 108.0, -1L)
        )

        invalidPoints.forEach { point ->
            assertTrue(
                runCatching {
                    sessions.saveSosLastLocation(key, point)
                }.isFailure
            )
        }

        assertNull(sessions.getSosLastLocation(key))

        // Tọa độ 0,0 thật vẫn hợp lệ; thiếu tọa độ dùng null.
        assertTrue(SosCachedLocation(0.0, 0.0).isValid())

        sessions.saveSosLastLocation(
            key,
            SosCachedLocation(16.0, 108.0, 1_000L)
        )

        sessions.clearSession()
        sessions.saveToken("TEST_ONLY_B")
        sessions.saveUser(
            SessionUser(id = "B", role = "resident")
        )

        val b = sessions.getSosSmsSessionKey()!!

        assertNull(sessions.getSosLastLocation(b))

        assertTrue(
            runCatching {
                sessions.getSosLastLocation(key)
            }.isFailure
        )
    }
    @Test
    fun atomicLoginStartsNewSosSessionAndClearsOldState() =
        runTest {
            val oldKey = key
            val oldSnapshot = sessions.getSessionSnapshot()!!

            sessions.saveSosSmsCredential(oldKey, credential)
            prepare()

            sessions.saveSosLastLocation(
                oldKey,
                SosCachedLocation(16.0, 108.0, 1_000L)
            )

            val generation = sessions.getGeneration()

            assertTrue(
                sessions.saveAuthenticatedSession(
                    token = "TEST_ONLY_NEW_ATOMIC_LOGIN",
                    user = SessionUser(
                        id = "A",
                        role = "resident"
                    ),
                    expectedGeneration = generation
                )
            )

            val newKey = sessions.getSosSmsSessionKey()!!
            val newSnapshot = sessions.getSessionSnapshot()!!

            assertNotEquals(oldKey, newKey)
            assertEquals(
                generation + 1L,
                sessions.getGeneration()
            )

            assertFalse(sessions.isCurrentSession(oldSnapshot))
            assertTrue(sessions.isCurrentSession(newSnapshot))

            assertNull(sessions.getSosSmsCredential(newKey))
            assertNull(sessions.getSosSubmission(newKey))
            assertNull(sessions.getSosLastLocation(newKey))

            assertTrue(
                runCatching {
                    sessions.getSosSubmission(oldKey)
                }.isFailure
            )
        }

    @Test
    fun staleLoginAndLogoutCannotClearCurrentSosSubmission() =
        runTest {
            val oldSnapshot = sessions.getSessionSnapshot()!!
            val oldGeneration = oldSnapshot.generation

            assertTrue(
                sessions.saveAuthenticatedSession(
                    token = "TEST_ONLY_ACCOUNT_B",
                    user = SessionUser(
                        id = "B",
                        role = "resident"
                    ),
                    expectedGeneration = oldGeneration
                )
            )

            key = sessions.getSosSmsSessionKey()!!

            sessions.saveSosSmsCredential(key, credential)
            val pending = prepare()

            sessions.saveSosLastLocation(
                key,
                SosCachedLocation(16.0, 108.0, 1_000L)
            )

            assertFalse(
                sessions.saveAuthenticatedSession(
                    token = "TEST_ONLY_LATE_ACCOUNT_A",
                    user = SessionUser(
                        id = "A",
                        role = "resident"
                    ),
                    expectedGeneration = oldGeneration
                )
            )

            assertFalse(
                sessions.clearSession(
                    expectedGeneration = oldGeneration
                )
            )

            assertNull(
                sessions.endCurrentSession(oldSnapshot) {
                    true
                }
            )

            assertEquals(key, sessions.getSosSmsSessionKey())
            assertEquals(
                pending.request.clientRequestId,
                sessions.getSosSubmission(key)!!
                    .request.clientRequestId
            )

            val currentSnapshot =
                sessions.getSessionSnapshot()!!

            assertTrue(
                sessions.endCurrentSession(currentSnapshot) {
                    true
                } == true
            )

            assertNull(sessions.getSosSmsSessionKey())
            assertNull(sessions.getSessionSnapshot())

            assertTrue(
                sessions.saveAuthenticatedSession(
                    token = "TEST_ONLY_RELOGIN_B",
                    user = SessionUser(
                        id = "B",
                        role = "resident"
                    ),
                    expectedGeneration =
                        sessions.getGeneration()
                )
            )

            val newKey = sessions.getSosSmsSessionKey()!!

            assertNull(sessions.getSosSmsCredential(newKey))
            assertNull(sessions.getSosSubmission(newKey))
            assertNull(sessions.getSosLastLocation(newKey))
        }
}