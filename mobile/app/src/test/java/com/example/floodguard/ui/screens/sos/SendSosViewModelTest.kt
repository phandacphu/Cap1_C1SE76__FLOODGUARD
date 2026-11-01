
package com.example.floodguard.ui.screens.sos

import android.location.Location
import com.example.floodguard.data.remote.api.RescueRequestApi
import com.example.floodguard.data.repository.RescueRequestRepository
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class SendSosViewModelTest {

    // CCF-83: Tạo Repository dành riêng cho Unit Test.
    // Không thực hiện request thật trong các bài test validation.
    private fun createViewModel(): SendSosViewModel {
        val retrofit = Retrofit.Builder()
            .baseUrl("http://127.0.0.1:65535/")
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        val api = retrofit.create(
            RescueRequestApi::class.java
        )

        val repository = RescueRequestRepository(api)

        return SendSosViewModel(repository)
    }

    // Tạo tọa độ GPS giả lập cho Unit Test.
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

    // Điền tất cả trường bắt buộc của CCF-82 và CCF-83.
    private fun fillRequiredFields(
        viewModel: SendSosViewModel
    ) {
        viewModel.toggleSituation(SosSituation.TRAPPED)
        viewModel.selectPeopleCount(SosPeopleCount.ONE)
        viewModel.selectWaterLevel(SosWaterLevel.WAIST)

        // Trường mới của CCF-83
        viewModel.selectUrgency(SosUrgency.HIGH)
        viewModel.updateExactPeopleCount("1")
    }

    @Test
    fun emptyForm_isInvalid() {
        val viewModel = createViewModel()

        assertFalse(viewModel.validateForm())

        val errors = viewModel.uiState.value.validationErrors

        assertNotNull(errors.situations)
        assertNotNull(errors.peopleCount)
        assertNotNull(errors.waterLevel)
        assertNotNull(errors.location)

        // CCF-83
        assertNotNull(errors.urgency)
        assertNotNull(errors.exactPeopleCount)
    }

    @Test
    fun completeFormWithFreshGps_isValid() {
        val viewModel = createViewModel()

        fillRequiredFields(viewModel)
        viewModel.updateLocation(createLocation())

        assertTrue(viewModel.validateForm())

        assertFalse(
            viewModel.uiState.value.validationErrors.hasErrors()
        )
    }

    @Test
    fun expiredGps_isInvalid() {
        val viewModel = createViewModel()

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
        val viewModel = createViewModel()

        fillRequiredFields(viewModel)

        viewModel.setLocationError("GPS đang tắt")

        assertFalse(viewModel.validateForm())

        assertNotNull(
            viewModel.uiState.value.validationErrors.location
        )
    }

    @Test
    fun loadingGps_isInvalid() {
        val viewModel = createViewModel()

        fillRequiredFields(viewModel)

        viewModel.startLocationLoading()

        assertFalse(viewModel.validateForm())

        assertNotNull(
            viewModel.uiState.value.validationErrors.location
        )
    }

    @Test
    fun resetForm_clearsFieldsAndGps() {
        val viewModel = createViewModel()

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

        // CCF-83
        assertNull(state.urgency)
        assertEquals("", state.exactPeopleCount)
    }

    @Test
    fun validationErrors_clearAfterCorrection() {
        val viewModel = createViewModel()

        assertFalse(viewModel.validateForm())

        viewModel.toggleSituation(SosSituation.TRAPPED)
        viewModel.selectPeopleCount(SosPeopleCount.ONE)
        viewModel.selectWaterLevel(SosWaterLevel.WAIST)

        // CCF-83
        viewModel.selectUrgency(SosUrgency.HIGH)
        viewModel.updateExactPeopleCount("1")

        viewModel.updateLocation(createLocation())

        val errors = viewModel.uiState.value.validationErrors

        assertNull(errors.situations)
        assertNull(errors.peopleCount)
        assertNull(errors.waterLevel)
        assertNull(errors.location)
        assertNull(errors.urgency)
        assertNull(errors.exactPeopleCount)

        assertTrue(viewModel.validateForm())
    }

    @Test
    fun deniedLocationPermissionState_isInvalid() {
        val viewModel = createViewModel()

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
        val viewModel = createViewModel()

        fillRequiredFields(viewModel)

        viewModel.updateLocation(
            createLocation(latitude = 95.0)
        )

        assertFalse(viewModel.validateForm())

        assertNotNull(
            viewModel.uiState.value.validationErrors.location
        )
    }

    @Test
    fun missingUrgency_isInvalid() {
        val vm = createViewModel()

        vm.toggleSituation(SosSituation.TRAPPED)
        vm.selectPeopleCount(SosPeopleCount.ONE)
        vm.selectWaterLevel(SosWaterLevel.WAIST)
        vm.updateExactPeopleCount("1")
        vm.updateLocation(createLocation())

        assertFalse(vm.validateForm())
        assertNotNull(vm.uiState.value.validationErrors.urgency)
    }

    @Test
    fun missingExactPeopleCount_isInvalid() {
        val vm = createViewModel()

        vm.toggleSituation(SosSituation.TRAPPED)
        vm.selectPeopleCount(SosPeopleCount.ONE)
        vm.selectWaterLevel(SosWaterLevel.WAIST)
        vm.selectUrgency(SosUrgency.HIGH)
        vm.updateLocation(createLocation())

        assertFalse(vm.validateForm())
        assertNotNull(
            vm.uiState.value.validationErrors.exactPeopleCount
        )
    }

    @Test
    fun zeroPeopleCount_isInvalid() {
        val vm = createViewModel()

        fillRequiredFields(vm)
        vm.updateExactPeopleCount("0")
        vm.updateLocation(createLocation())

        assertFalse(vm.validateForm())
        assertNotNull(
            vm.uiState.value.validationErrors.exactPeopleCount
        )
    }

    @Test
    fun peopleCountMismatch_isInvalid() {
        val vm = createViewModel()

        fillRequiredFields(vm)

        // Nhóm ONE chỉ chấp nhận đúng 1 người.
        vm.updateExactPeopleCount("3")
        vm.updateLocation(createLocation())

        assertFalse(vm.validateForm())
        assertNotNull(
            vm.uiState.value.validationErrors.exactPeopleCount
        )
    }

}
