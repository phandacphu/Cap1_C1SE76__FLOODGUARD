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
        val model = ResidentSosSubmissionViewModel(
            loadActive = {
                Result.failure(
                    ResidentSosApiException(
                        statusCode = 403,
                        code = null,
                        activeRequestId = null,
                        message = "TEST_ONLY_FORBIDDEN"
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