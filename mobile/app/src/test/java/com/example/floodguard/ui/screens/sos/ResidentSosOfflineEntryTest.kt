package com.example.floodguard.ui.screens.sos

import com.example.floodguard.data.remote.dto.rescue.CreateSosLocation
import com.example.floodguard.data.remote.dto.rescue.CreateSosRequest
import com.example.floodguard.data.repository.ResidentSosApiException
import com.example.floodguard.data.repository.ResidentSosNetworkException
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ResidentSosOfflineEntryTest {

    private val dispatcher = StandardTestDispatcher()

    private fun networkError() =
        ResidentSosNetworkException(
            IOException("TEST_ONLY_OFFLINE")
        )

    private fun request() = CreateSosRequest(
        location = CreateSosLocation(16.0544, 108.2022),
        situations = listOf("trapped"),
        numberOfPeople = 2,
        waterLevel = "waist",
        note = "Cần hỗ trợ"
    )

    @Before
    fun setup() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun teardown() {
        Dispatchers.resetMain()
    }

    @Test
    fun offlineEntryOpensFormWithoutPosting() = runTest {
        var posts = 0

        val model = ResidentSosSubmissionViewModel(
            loadActive = {
                Result.failure(networkError())
            },
            createRemote = {
                posts++
                Result.failure(networkError())
            }
        )

        advanceUntilIdle()

        assertTrue(model.state.value.formAllowed)
        assertFalse(model.state.value.isChecking)
        assertNull(model.state.value.openSosId)
        assertNotNull(model.state.value.error)
        assertEquals(0, posts)
    }

    @Test
    fun accessDeniedDoesNotOpenForm() = runTest {
        for (status in listOf(401, 403)) {
            val model = ResidentSosSubmissionViewModel(
                loadActive = {
                    Result.failure(
                        ResidentSosApiException(
                            statusCode = status,
                            code = null,
                            activeRequestId = null,
                            message = "TEST_ONLY_ACCESS_DENIED"
                        )
                    )
                },
                createRemote = {
                    error("Không được gọi POST.")
                }
            )

            advanceUntilIdle()

            assertFalse(model.state.value.formAllowed)
            assertFalse(model.state.value.isChecking)
        }
    }

    @Test
    fun initial5xxOpensFormAndRepeatedChecksDoNotPost() = runTest {
        for (status in listOf(500, 502, 503, 504, 599)) {
            var posts = 0
            val model = ResidentSosSubmissionViewModel(
                loadActive = {
                    Result.failure(ResidentSosApiException(
                        status, null, null, "TEST_ONLY_SERVER_ERROR"
                    ))
                },
                createRemote = {
                    posts++
                    error("Không được tự POST sau 5xx.")
                }
            )
            advanceUntilIdle()
            assertTrue("HTTP $status", model.state.value.formAllowed)
            model.checkActive()
            advanceUntilIdle()
            assertTrue(model.state.value.formAllowed)
            assertTrue(model.submit(request()).exceptionOrNull()
                is ResidentSosNotPostedException)
            assertEquals(0, posts)
            assertNull(model.state.value.openSosId)
        }
    }

    @Test
    fun later401Or403StillBlocksFormAfterInitial503() = runTest {
        for (denied in listOf(401, 403)) {
            var status = 503
            val model = ResidentSosSubmissionViewModel(
                loadActive = {
                    Result.failure(ResidentSosApiException(
                        status, null, null, "TEST_ONLY_ERROR"
                    ))
                },
                createRemote = { error("Không được tự POST.") }
            )
            advanceUntilIdle()
            assertTrue(model.state.value.formAllowed)
            status = denied
            model.checkActive()
            advanceUntilIdle()
            assertFalse(model.state.value.formAllowed)
            assertFalse(model.state.value.isChecking)
            assertTrue(model.submit(request()).exceptionOrNull()
                is ResidentSosNotPostedException)
        }
    }

    @Test
    fun failedPreflightDoesNotCallCreate() = runTest {
        var reads = 0
        var posts = 0

        val model = ResidentSosSubmissionViewModel(
            loadActive = {
                reads++

                if (reads == 1) {
                    Result.success(emptyList())
                } else {
                    Result.failure(networkError())
                }
            },
            createRemote = {
                posts++
                Result.failure(networkError())
            }
        )

        advanceUntilIdle()

        val result = model.submit(request())

        assertTrue(
            result.exceptionOrNull()
                    is ResidentSosNotPostedException
        )
        assertEquals(0, posts)
    }

    @Test
    fun invalidLocationStopsBeforePost() = runTest {
        var posts = 0

        val model = ResidentSosSubmissionViewModel(
            loadActive = {
                Result.success(emptyList())
            },
            createRemote = {
                posts++
                Result.failure(networkError())
            }
        )

        advanceUntilIdle()

        val result = model.submit(
            request = request(),
            isLocationFresh = { false }
        )

        assertTrue(
            result.exceptionOrNull()
                    is ResidentSosNotPostedException
        )
        assertEquals(0, posts)
    }

    @Test
    fun uncertainResultAndLaterChecksNeverAutoPost() = runTest {
        var posts = 0

        val model = ResidentSosSubmissionViewModel(
            loadActive = {
                Result.success(emptyList())
            },
            createRemote = {
                posts++
                Result.failure(networkError())
            }
        )

        advanceUntilIdle()

        val result = model.submit(request())

        assertTrue(
            result.exceptionOrNull()
                    is ResidentSosUncertainSubmissionException
        )
        assertEquals(1, posts)

        model.checkActive()
        advanceUntilIdle()

        model.checkActive()
        advanceUntilIdle()

        assertEquals(1, posts)
        assertNull(model.state.value.openSosId)
    }
}