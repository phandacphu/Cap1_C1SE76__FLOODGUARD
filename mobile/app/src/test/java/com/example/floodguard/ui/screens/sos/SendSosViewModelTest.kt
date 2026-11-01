
package com.example.floodguard.ui.screens.sos

import android.location.Location
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class SendSosViewModelTest {

    private fun createLocation(
        latitude: Double = 16.0544,
        longitude: Double = 108.2022,
        timestamp: Long = System.currentTimeMillis()
    ): Location {
        return Location("test").apply {
            this.latitude = latitude
            this.longitude = longitude
            time = timestamp
        }
    }

    private fun fillRequiredFields(
        viewModel: SendSosViewModel
    ) {
        viewModel.toggleSituation(SosSituation.TRAPPED)
        viewModel.selectPeopleCount(SosPeopleCount.ONE)
        viewModel.selectWaterLevel(SosWaterLevel.WAIST)
    }

    @Test
    fun emptyForm_isInvalid() {
        val viewModel = SendSosViewModel()

        assertFalse(viewModel.validateForm())

        val errors = viewModel.uiState.value.validationErrors

        assertNotNull(errors.situations)
        assertNotNull(errors.peopleCount)
        assertNotNull(errors.waterLevel)
        assertNotNull(errors.location)
    }

    @Test
    fun completeFormWithFreshGps_isValid() {
        val viewModel = SendSosViewModel()

        fillRequiredFields(viewModel)
        viewModel.updateLocation(createLocation())

        assertTrue(viewModel.validateForm())
        assertFalse(
            viewModel.uiState.value.validationErrors.hasErrors()
        )
    }

    @Test
    fun expiredGps_isInvalid() {
        val viewModel = SendSosViewModel()

        fillRequiredFields(viewModel)

        viewModel.updateLocation(
            createLocation(
                timestamp = System.currentTimeMillis() - 31_000L
            )
        )

        assertFalse(viewModel.validateForm())
        assertNotNull(
            viewModel.uiState.value.validationErrors.location
        )
    }

    @Test
    fun locationError_isInvalid() {
        val viewModel = SendSosViewModel()

        fillRequiredFields(viewModel)
        viewModel.setLocationError("GPS đang tắt")

        assertFalse(viewModel.validateForm())
        assertNotNull(
            viewModel.uiState.value.validationErrors.location
        )
    }

    @Test
    fun loadingGps_isInvalid() {
        val viewModel = SendSosViewModel()

        fillRequiredFields(viewModel)
        viewModel.startLocationLoading()

        assertFalse(viewModel.validateForm())
        assertNotNull(
            viewModel.uiState.value.validationErrors.location
        )
    }

    @Test
    fun resetForm_clearsFieldsAndGps() {
        val viewModel = SendSosViewModel()

        fillRequiredFields(viewModel)
        viewModel.updateNote("Cần cứu hộ")
        viewModel.updateLocation(createLocation())

        viewModel.resetForm()

        val state = viewModel.uiState.value

        assertTrue(state.selectedSituations.isEmpty())
        assertNull(state.peopleCount)
        assertNull(state.waterLevel)
        assertEquals("", state.note)
        assertNull(state.latitude)
        assertNull(state.longitude)
        assertNull(state.locationTimestampMillis)
    }

    @Test
    fun validationErrors_clearAfterCorrection() {
        val viewModel = SendSosViewModel()

        assertFalse(viewModel.validateForm())

        viewModel.toggleSituation(SosSituation.TRAPPED)
        viewModel.selectPeopleCount(SosPeopleCount.ONE)
        viewModel.selectWaterLevel(SosWaterLevel.WAIST)
        viewModel.updateLocation(createLocation())

        val errors = viewModel.uiState.value.validationErrors

        assertNull(errors.situations)
        assertNull(errors.peopleCount)
        assertNull(errors.waterLevel)
        assertNull(errors.location)

        assertTrue(viewModel.validateForm())
    }

    @Test
    fun deniedLocationPermissionState_isInvalid() {
        val viewModel = SendSosViewModel()

        fillRequiredFields(viewModel)
        viewModel.setLocationError(
            "Chưa được cấp quyền truy cập vị trí."
        )

        assertFalse(viewModel.validateForm())
        assertNotNull(
            viewModel.uiState.value.validationErrors.location
        )
    }

    @Test
    fun invalidCoordinates_areRejected() {
        val viewModel = SendSosViewModel()

        fillRequiredFields(viewModel)

        viewModel.updateLocation(
            createLocation(latitude = 95.0)
        )

        assertFalse(viewModel.validateForm())
        assertNotNull(
            viewModel.uiState.value.validationErrors.location
        )
    }
}
