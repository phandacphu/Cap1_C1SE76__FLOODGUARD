package com.example.floodguard.ui.screens.sos

import android.location.Location
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import com.example.floodguard.data.local.SessionManager
import com.example.floodguard.data.local.SessionUser
import com.example.floodguard.data.model.SosSubmission
import com.example.floodguard.data.model.SosSubmissionPhase
import com.example.floodguard.data.remote.dto.rescue.CreateSosLocation
import com.example.floodguard.data.remote.dto.rescue.CreateSosRequest
import com.example.floodguard.data.remote.dto.rescue.CreatedSosDto
import com.example.floodguard.data.remote.dto.rescue.RescueRequestDto
import com.example.floodguard.data.remote.dto.rescue.SosSmsCredential
import com.example.floodguard.data.remote.api.ResidentSosApi
import com.example.floodguard.data.repository.ResidentSosRepository
import com.example.floodguard.data.repository.SosSmsCredentialCoordinator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.test.TestScope
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class ResidentSosFrozenSubmissionTest {
    private val dispatcher = StandardTestDispatcher()
    private val stores = mutableListOf<ViewModelStore>()

    private lateinit var sessions: SessionManager

    private val credential = SosSmsCredential(
        "TEST_ONLY_NOT_REAL",
        "2099-01-01T00:00:00Z",
        "+84900000000",
        "FGSOS1"
    )

    @Before
    fun setup() {
        Dispatchers.setMain(dispatcher)
        sessions = SessionManager(
            RuntimeEnvironment.getApplication()
        )
    }

    @After
    fun teardown() = runTest {
        try {
            stores.forEach { it.clear() }
            sessions.clearSession()
        } finally {
            Dispatchers.resetMain()
        }
    }

    private suspend fun login() {
        sessions.clearSession()
        sessions.saveToken("TEST_ONLY_A")
        sessions.saveUser(
            SessionUser(id = "A", role = "resident")
        )
        sessions.saveSosSmsCredential(
            checkNotNull(sessions.getSosSmsSessionKey()),
            credential
        )
    }

    private fun request() = CreateSosRequest(
        location = CreateSosLocation(16.0544, 108.2022),
        situations = listOf("trapped"),
        numberOfPeople = 2,
        waterLevel = "waist",
        note = "Cần hỗ trợ"
    )

    private suspend fun seed(
        phase: SosSubmissionPhase = SosSubmissionPhase.PREPARED,
        smsCredential: SosSmsCredential? = credential
    ): SosSubmission {
        val key = checkNotNull(
            sessions.getSosSmsSessionKey()
        )

        val saved = sessions.getOrCreateSosSubmission(
            key,
            request(),
            1_000L,
            smsCredential
        )

        return sessions.updateSosSubmissionPhase(
            key,
            checkNotNull(saved.request.clientRequestId),
            phase
        )
    }

    private fun model(
        post: suspend (CreateSosRequest) -> Result<CreatedSosDto> = {
            Result.failure(
                ResidentSosNotPostedException(
                    "TEST_ONLY_NOT_POSTED"
                )
            )
        },
        lookup: suspend () -> Result<List<RescueRequestDto>> = {
            Result.success(emptyList())
        }
    ): SendSosViewModel {
        val store = ViewModelStore()
        stores.add(store)

        val factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(
                modelClass: Class<T>
            ): T =
                SendSosViewModel(
                    sessionManager = sessions,
                    nowMillis = { 1_000_000L },
                    submitValidatedSos = { payload, isValid ->
                        check(isValid())
                        post(payload)
                    },
                    loadSubmittedRequests = lookup
                ) as T
        }

        return ViewModelProvider(
            store,
            factory
        )[SendSosViewModel::class.java]
    }

    private suspend fun TestScope.awaitReady(
        model: SendSosViewModel
    ) {
        model.uiState.first {
            !it.isRestoringLocation && !it.isSubmitting
        }
        advanceUntilIdle()
    }

    private fun fill(model: SendSosViewModel) {
        model.toggleSituation(SosSituation.TRAPPED)
        model.updateExactPeopleCount("2")
        model.selectWaterLevel(SosWaterLevel.WAIST)
        model.updateNote("Cần hỗ trợ")

        model.updateLocation(
            Location("TEST_ONLY").apply {
                latitude = 16.0544
                longitude = 108.2022
                time = 1_000L
            }
        )
    }

    private suspend fun TestScope.assertCredentialRefreshAndRestore(
        oldCredential: SosSmsCredential?
    ) {
        login()
        val key = checkNotNull(sessions.getSosSmsSessionKey())
        sessions.clearSosSmsCredential(key)
        val original = seed(
            SosSubmissionPhase.UNCERTAIN,
            oldCredential
        )
        var posts = 0
        val firstModel = model(post = {
            posts++
            error("Không được POST SOS khi làm mới credential.")
        })
        awaitReady(firstModel)

        val server = MockWebServer()
        server.start()
        try {
            server.enqueue(MockResponse().setBody(
                """{"success":true,"data":{"credential":"TEST_ONLY_REFRESHED","expiresAt":"2099-01-01T00:00:00Z","recipientPhone":"+84900000001","format":"FGSOS1"}}"""
            ))
            val repository = ResidentSosRepository(
                Retrofit.Builder()
                    .baseUrl(server.url("/"))
                    .addConverterFactory(GsonConverterFactory.create())
                    .build()
                    .create(ResidentSosApi::class.java)
            )
            val coordinator = SosSmsCredentialCoordinator(
                sessions, repository, key,
                nowMillis = { 1_000_000L },
                elapsedMillis = { 0L }
            )
            coordinator.refresh(hasInternet = true)
            assertTrue(coordinator.state.value.ready)
            val refresh = server.takeRequest(1, TimeUnit.SECONDS)
            assertNotNull(refresh)
            assertEquals("POST", refresh!!.method)
            assertEquals("/sos-sms/credential", refresh.path)

            val bodies = mutableListOf<String>()
            firstModel.openSms { phone, body ->
                assertEquals("+84900000001", phone)
                bodies.add(body)
            }
            awaitReady(firstModel)

            val saved = checkNotNull(sessions.getSosSubmission(key))
            assertEquals(original.request, saved.request)
            assertEquals(original.capturedAtMillis, saved.capturedAtMillis)
            assertEquals("TEST_ONLY_REFRESHED", saved.smsCredential!!.credential)
            assertEquals(SosSubmissionPhase.SMS_OPENED, saved.phase)
            assertEquals(1, bodies.size)
            assertEquals("TEST_ONLY_REFRESHED", bodies.single().split('|')[1])
            assertNull(firstModel.uiState.value.submittedSosId)

            stores.last().clear()
            val reopened = model(post = {
                posts++
                error("Không được POST SOS khi khôi phục.")
            })
            awaitReady(reopened)
            assertEquals(original.request.clientRequestId,
                reopened.uiState.value.pendingClientRequestId)
            reopened.openSms { _, body -> bodies.add(body) }
            awaitReady(reopened)

            assertEquals(2, bodies.size)
            assertEquals(bodies[0], bodies[1])
            assertEquals(original.request,
                sessions.getSosSubmission(key)!!.request)
            assertEquals(1, server.requestCount)
            assertEquals(0, posts)
            assertNull(reopened.uiState.value.submittedSosId)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun missingSavedCredentialRefreshesAndSurvivesReopen() = runTest {
        assertCredentialRefreshAndRestore(null)
    }

    @Test
    fun expiredSavedCredentialRefreshesAndSurvivesReopen() = runTest {
        assertCredentialRefreshAndRestore(SosSmsCredential(
            "TEST_ONLY_EXPIRED", "1970-01-01T00:00:01Z",
            "+84900000000", "FGSOS1"
        ))
    }

    @Test
    fun missingFreshCredentialKeepsSavedRequestWithoutLaunchingSms() = runTest {
        login()
        val key = checkNotNull(sessions.getSosSmsSessionKey())
        sessions.clearSosSmsCredential(key)
        val original = seed(SosSubmissionPhase.UNCERTAIN, null)
        var opened = false
        val model = model()
        awaitReady(model)
        model.openSms { _, _ -> opened = true }
        awaitReady(model)

        val saved = checkNotNull(sessions.getSosSubmission(key))
        assertFalse(opened)
        assertEquals(original.request, saved.request)
        assertEquals(original.capturedAtMillis, saved.capturedAtMillis)
        assertEquals(original.phase, saved.phase)
        assertEquals(original.revision, saved.revision)
        assertNull(saved.smsCredential)
        assertNotNull(model.uiState.value.submitError)
    }

    @Test
    fun credentialReplacementPreservesPayloadAndRejectsStalePhaseWrite() = runTest {
        login()
        val key = checkNotNull(sessions.getSosSmsSessionKey())
        val original = seed(SosSubmissionPhase.UNCERTAIN, null)
        val id = checkNotNull(original.request.clientRequestId)
        assertTrue(runCatching {
            sessions.refreshSosSubmissionCredential(key, "WRONG_ID", 1_000_000L)
        }.isFailure)

        val refreshed = sessions.refreshSosSubmissionCredential(
            key, id, 1_000_000L
        )
        assertEquals(original.request, refreshed.request)
        assertEquals(original.capturedAtMillis, refreshed.capturedAtMillis)
        assertEquals(original.phase, refreshed.phase)
        assertEquals(original.revision + 1L, refreshed.revision)

        assertTrue(runCatching {
            sessions.updateSosSubmissionPhase(
                key, id, SosSubmissionPhase.PREPARED,
                expectedRevision = original.revision
            )
        }.isFailure)
        val reopened = SessionManager(RuntimeEnvironment.getApplication())
        val restored = checkNotNull(reopened.getSosSubmission(key))
        assertEquals(original.request, restored.request)
        assertEquals(credential.credential, restored.smsCredential!!.credential)
        assertEquals(refreshed.revision,
            reopened.refreshSosSubmissionCredential(key, id, 1_000_000L).revision)
    }

    @Test
    fun credentialRefreshRejectsOldSessionForSameOrDifferentAccount() = runTest {
        for (nextUser in listOf("A", "B")) {
            login()
            val oldKey = checkNotNull(sessions.getSosSmsSessionKey())
            val old = seed(SosSubmissionPhase.UNCERTAIN, null)
            assertTrue(sessions.saveAuthenticatedSession(
                "TEST_ONLY_NEW_SESSION",
                SessionUser(id = nextUser, role = "resident"),
                sessions.getGeneration()
            ))
            val newKey = checkNotNull(sessions.getSosSmsSessionKey())
            val newCredential = SosSmsCredential(
                "TEST_ONLY_NEW_SESSION_CREDENTIAL", "2099-01-01T00:00:00Z",
                "+84900000001", "FGSOS1"
            )
            assertTrue(sessions.saveSosSmsCredential(newKey, newCredential))
            val current = sessions.getOrCreateSosSubmission(
                newKey, request(), 2_000L, null
            )
            assertFalse(sessions.saveSosSmsCredential(oldKey, credential))
            for (id in listOf(old.request.clientRequestId!!,
                current.request.clientRequestId!!)) {
                assertTrue(runCatching {
                    sessions.refreshSosSubmissionCredential(oldKey, id, 1_000_000L)
                }.isFailure)
            }
            val unchanged = checkNotNull(sessions.getSosSubmission(newKey))
            assertEquals(current.request, unchanged.request)
            assertEquals(current.revision, unchanged.revision)
            assertNull(unchanged.smsCredential)
            assertEquals(newCredential.credential,
                sessions.getSosSmsCredential(newKey)!!.credential)
        }
    }

    @Test
    fun initial503AllowsSmsButFailedPreflightNeverPostsSos() = runTest {
        login()
        var posts = 0
        val server = MockWebServer()
        server.start()
        try {
            repeat(2) {
                server.enqueue(MockResponse().setResponseCode(503))
            }
            val repository = ResidentSosRepository(
                Retrofit.Builder()
                    .baseUrl(server.url("/"))
                    .addConverterFactory(GsonConverterFactory.create())
                    .build()
                    .create(ResidentSosApi::class.java)
            )
            val entry = ResidentSosSubmissionViewModel(
                loadActive = { repository.getActive() },
                createRemote = {
                    posts++
                    error("Không được POST sau GET 503.")
                }
            )
            entry.state.first { !it.isChecking }
            assertTrue(entry.state.value.formAllowed)
            val model = model(post = { entry.submit(it) })
            awaitReady(model)
            fill(model)
            var body: String? = null
            model.openSms { _, value -> body = value }
            awaitReady(model)
            assertTrue(body!!.startsWith("FGSOS1|"))
            val key = checkNotNull(sessions.getSosSmsSessionKey())
            val saved = checkNotNull(sessions.getSosSubmission(key))

            model.submitSos()
            awaitReady(model)
            assertEquals(0, posts)
            assertEquals(saved.request, sessions.getSosSubmission(key)!!.request)
            assertEquals(SosSubmissionPhase.SMS_OPENED,
                sessions.getSosSubmission(key)!!.phase)
            assertNull(model.uiState.value.submittedSosId)
            assertEquals(2, server.requestCount)
            repeat(2) {
                val read = server.takeRequest(1, TimeUnit.SECONDS)
                assertNotNull(read)
                assertEquals("GET", read!!.method)
                assertTrue(read.path!!.startsWith("/rescue-requests?"))
            }
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun restorationDoesNotPostAndLocksPayloadAndGps() = runTest {
        login()
        val original = seed(SosSubmissionPhase.UNCERTAIN)
        var posts = 0

        val model = model(post = {
            posts++
            error("Không được tự POST.")
        })

        awaitReady(model)

        assertEquals(
            original.request.clientRequestId,
            model.uiState.value.pendingClientRequestId
        )

        model.updateNote("Nội dung mới")
        model.updateExactPeopleCount("99")
        model.updateLocation(
            Location("TEST_ONLY_NEW").apply {
                latitude = 20.0
                longitude = 110.0
                time = 9_000L
            }
        )
        model.resetForm()

        assertEquals("Cần hỗ trợ", model.uiState.value.note)
        assertEquals("2", model.uiState.value.exactPeopleCount)
        assertEquals(
            16.0544,
            model.uiState.value.latitude!!,
            0.0
        )
        assertEquals(
            1_000L,
            model.uiState.value.locationTimestampMillis
        )
        assertEquals(0, posts)
    }

    @Test
    fun retriesUseOneFrozenRequestAndDoubleTapStartsOnePost() =
        runTest {
            login()
            val posted = mutableListOf<CreateSosRequest>()

            val model = model(post = {
                posted.add(it)
                Result.failure(
                    ResidentSosUncertainSubmissionException(
                        "TEST_ONLY_UNCERTAIN"
                    )
                )
            })

            awaitReady(model)
            fill(model)

            model.submitSos()
            model.submitSos()
            awaitReady(model)

            assertEquals(1, posted.size)

            model.updateNote("Không được đổi nội dung")
            model.submitSos()
            awaitReady(model)

            assertEquals(2, posted.size)
            assertEquals(posted[0], posted[1])
            assertNotNull(posted[0].clientRequestId)
            assertEquals(
                SosSubmissionPhase.UNCERTAIN,
                model.uiState.value.pendingPhase
            )
        }

    @Test
    fun smsUsesSavedUuidAndBodyWithoutHttpOrSuccessClaim() =
        runTest {
            login()
            val original = seed(SosSubmissionPhase.UNCERTAIN)
            var posts = 0

            val model = model(post = {
                posts++
                error("Không được POST khi mở SMS.")
            })

            awaitReady(model)

            val bodies = mutableListOf<String>()
            var phone: String? = null

            repeat(2) {
                model.openSms { recipient, body ->
                    phone = recipient
                    bodies.add(body)
                }
                awaitReady(model)
            }

            assertEquals(0, posts)
            assertEquals("+84900000000", phone)
            assertEquals(2, bodies.size)
            assertEquals(bodies[0], bodies[1])

            assertTrue(
                bodies[0].contains(
                    checkNotNull(original.request.clientRequestId)
                )
            )
            assertTrue(
                bodies[0].contains("1970-01-01T00:00:01Z")
            )
            assertEquals(
                SosSubmissionPhase.SMS_OPENED,
                model.uiState.value.pendingPhase
            )
            assertNull(model.uiState.value.submittedSosId)
        }

    @Test
    fun expiredCredentialDoesNotOpenComposerOrPost() = runTest {
        login()
        val key = checkNotNull(
            sessions.getSosSmsSessionKey()
        )

        sessions.saveSosSmsCredential(
            key,
            SosSmsCredential(
                "TEST_ONLY_EXPIRED",
                "1970-01-01T00:00:01Z",
                "+84900000000",
                "FGSOS1"
            )
        )

        var opened = false
        var posts = 0

        val model = model(post = {
            posts++
            error("Không được POST.")
        })

        awaitReady(model)
        fill(model)

        model.openSms { _, _ -> opened = true }
        awaitReady(model)

        assertFalse(opened)
        assertEquals(0, posts)
        assertEquals(
            SosSubmissionPhase.PREPARED,
            model.uiState.value.pendingPhase
        )
        assertNotNull(model.uiState.value.submitError)
    }

    @Test
    fun preflightFailureCannotEraseEarlierUncertaintyOrAllowDiscard() =
        runTest {
            login()
            val original = seed(SosSubmissionPhase.UNCERTAIN)
            val model = model()

            awaitReady(model)
            model.submitSos()
            awaitReady(model)

            model.discardUnsentSubmission()
            awaitReady(model)

            val stored = sessions.getSosSubmission(
                checkNotNull(sessions.getSosSmsSessionKey())
            )

            assertEquals(
                original.request.clientRequestId,
                stored!!.request.clientRequestId
            )
            assertEquals(
                SosSubmissionPhase.UNCERTAIN,
                stored.phase
            )
        }

    @Test
    fun matchingClientIdIsRequiredAndCompletedRequestCanConfirm() =
        runTest {
            login()
            val original = seed(SosSubmissionPhase.UNCERTAIN)

            var listed = listOf(
                RescueRequestDto(
                    id = "OTHER",
                    state = "active",
                    clientRequestId = "OTHER_ID"
                )
            )

            val model = model(
                lookup = { Result.success(listed) }
            )

            awaitReady(model)
            model.checkPendingSubmission()
            awaitReady(model)

            assertEquals(
                original.request.clientRequestId,
                model.uiState.value.pendingClientRequestId
            )
            assertNull(model.uiState.value.submittedSosId)

            listed = listOf(
                RescueRequestDto(
                    id = "MATCHED",
                    state = "rescued",
                    clientRequestId =
                        original.request.clientRequestId
                )
            )

            model.checkPendingSubmission()
            awaitReady(model)

            assertEquals(
                "MATCHED",
                model.uiState.value.submittedSosId
            )
            assertNull(
                sessions.getSosSubmission(
                    checkNotNull(sessions.getSosSmsSessionKey())
                )
            )
        }

    @Test
    fun definiteSuccessClearsOnlyItsSavedSubmission() = runTest {
        login()

        val model = model(post = {
            Result.success(
                CreatedSosDto(
                    id = "SERVER_1",
                    status = "pending"
                )
            )
        })

        awaitReady(model)
        fill(model)
        model.submitSos()
        awaitReady(model)

        assertEquals(
            "SERVER_1",
            model.uiState.value.submittedSosId
        )
        assertNull(model.uiState.value.pendingClientRequestId)
        assertNull(
            sessions.getSosSubmission(
                checkNotNull(sessions.getSosSmsSessionKey())
            )
        )
    }

    @Test
    fun explicitDiscardOfPreparedSubmissionNeedsAnotherActionForNewUuid() =
        runTest {
            login()
            val original = seed()
            val model = model()

            awaitReady(model)
            model.discardUnsentSubmission()
            awaitReady(model)

            val key = checkNotNull(
                sessions.getSosSmsSessionKey()
            )

            assertNull(sessions.getSosSubmission(key))
            assertNull(model.uiState.value.pendingClientRequestId)

            fill(model)
            model.openSms { _, _ -> }
            awaitReady(model)

            assertNotEquals(
                original.request.clientRequestId,
                model.uiState.value.pendingClientRequestId
            )
        }

    @Test
    fun oldViewModelCannotOpenSmsAfterAccountSwitch() = runTest {
        login()
        seed(SosSubmissionPhase.UNCERTAIN)

        val model = model()
        awaitReady(model)

        sessions.clearSession()
        sessions.saveToken("TEST_ONLY_B")
        sessions.saveUser(
            SessionUser(id = "B", role = "resident")
        )

        model.uiState.first {
            it.locationSessionError != null
        }
        awaitReady(model)

        var opened = false

        model.openSms { _, _ -> opened = true }
        awaitReady(model)

        assertFalse(opened)
        assertNotNull(model.uiState.value.locationSessionError)
        assertNull(
            sessions.getSosSubmission(
                checkNotNull(sessions.getSosSmsSessionKey())
            )
        )
    }

    @Test
    fun stalePhaseUpdateCannotEraseANewerSmsHandoff() = runTest {
        login()
        val original = seed()

        val key = checkNotNull(
            sessions.getSosSmsSessionKey()
        )
        val id = checkNotNull(
            original.request.clientRequestId
        )

        val attempted = sessions.updateSosSubmissionPhase(
            key,
            id,
            SosSubmissionPhase.UNCERTAIN,
            expectedRevision = original.revision
        )

        val newer = sessions.updateSosSubmissionPhase(
            key,
            id,
            SosSubmissionPhase.SMS_OPENED,
            expectedRevision = attempted.revision
        )

        assertTrue(
            runCatching {
                sessions.updateSosSubmissionPhase(
                    key,
                    id,
                    SosSubmissionPhase.PREPARED,
                    expectedRevision = attempted.revision
                )
            }.isFailure
        )

        val stored = checkNotNull(
            sessions.getSosSubmission(key)
        )

        assertEquals(
            SosSubmissionPhase.SMS_OPENED,
            stored.phase
        )
        assertEquals(newer.revision, stored.revision)

        assertTrue(
            runCatching {
                sessions.discardUnsentSosSubmission(key, id)
            }.isFailure
        )
    }
}