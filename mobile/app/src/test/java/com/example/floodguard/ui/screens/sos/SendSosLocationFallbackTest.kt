package com.example.floodguard.ui.screens.sos

import android.location.Location
import com.example.floodguard.data.remote.dto.rescue.CreateSosRequest
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
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class SendSosLocationFallbackTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setup() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun teardown() {
        Dispatchers.resetMain()
    }

    private fun point(time: Long) =
        Location("TEST_ONLY").apply {
            latitude = 16.0544
            longitude = 108.2022
            this.time = time
            accuracy = 12f
        }

    private fun fillForm(model: SendSosViewModel) {
        model.toggleSituation(SosSituation.TRAPPED)
        model.updateExactPeopleCount("2")
        model.selectWaterLevel(SosWaterLevel.WAIST)
    }

    @Test
    fun olderGpsCanBeSubmittedWithOriginalTime() = runTest {
        var sent: CreateSosRequest? = null

        val model = SendSosViewModel(
            createSosRequest = {
                sent = it
                Result.failure(
                    IllegalStateException("TEST_ONLY_RESPONSE")
                )
            },
            nowMillis = { 1_000_000L }
        )

        fillForm(model)
        model.updateLocation(point(1_000L))

        assertTrue(model.validateForm())

        model.submitSos()
        advanceUntilIdle()

        assertNotNull(sent)
        assertEquals(
            16.0544,
            sent!!.location.latitude,
            0.0
        )
        assertEquals(
            1_000L,
            model.uiState.value.locationTimestampMillis
        )
    }

    @Test
    fun refreshAndGpsFailureKeepPreviousCoordinates() = runTest {
        val model = SendSosViewModel(
            createSosRequest = {
                error("Không được tự gửi.")
            }
        )

        fillForm(model)
        model.updateLocation(point(1_000L))

        model.startLocationLoading()

        assertEquals(
            16.0544,
            model.uiState.value.latitude!!,
            0.0
        )

        model.setLocationError("TEST_ONLY_GPS_FAILURE")

        assertEquals(
            108.2022,
            model.uiState.value.longitude!!,
            0.0
        )
        assertEquals(
            1_000L,
            model.uiState.value.locationTimestampMillis
        )
        assertTrue(model.uiState.value.isLocationFromCache)
        assertTrue(model.validateForm())

        model.resetForm()

        assertEquals(
            16.0544,
            model.uiState.value.latitude!!,
            0.0
        )
        assertEquals(
            1_000L,
            model.uiState.value.locationTimestampMillis
        )
    }

    @Test
    fun unknownGpsTimeStaysUnknown() = runTest {
        val model = SendSosViewModel(
            createSosRequest = {
                error("Không được tự gửi.")
            }
        )

        fillForm(model)
        model.updateLocation(
            point(0L),
            fromCache = true
        )

        assertNull(model.uiState.value.locationTimestampMillis)
        assertTrue(model.validateForm())
    }

    @Test
    fun missingCoordinatesNeverBecomeZeroZero() = runTest {
        var posts = 0

        val model = SendSosViewModel(
            createSosRequest = {
                posts++
                Result.failure(
                    IllegalStateException("TEST_ONLY")
                )
            }
        )

        fillForm(model)
        model.setLocationError("TEST_ONLY_NO_GPS")

        assertFalse(model.validateForm())

        model.submitSos()
        advanceUntilIdle()

        assertEquals(0, posts)
        assertNull(model.uiState.value.latitude)
        assertNull(model.uiState.value.longitude)
    }
}