
package com.example.floodguard.ui.screens.sos

import android.location.Location
import com.example.floodguard.data.remote.api.RescueRequestApi
import com.example.floodguard.data.remote.dto.rescue.CreateSosRequest
import com.example.floodguard.data.remote.dto.rescue.CreatedSosDto
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.test.resetMain
import java.io.IOException
import com.example.floodguard.data.repository.RescueRequestRepository
import org.junit.Assert.*
import org.junit.Test
import org.junit.Before
import org.junit.After
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
@OptIn(ExperimentalCoroutinesApi::class)
class SendSosViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    // CCF-83: Tạo Repository dành riêng cho Unit Test.
    // Không thực hiện request thật trong các bài test validation.
    private fun createViewModel(
        onCreate: (suspend (CreateSosRequest) -> Result<CreatedSosDto>)? = null,
        nowMillis: () -> Long = System::currentTimeMillis
    ): SendSosViewModel {
        val retrofit = Retrofit.Builder()
            .baseUrl("http://127.0.0.1:65535/")
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        val api = retrofit.create(
            RescueRequestApi::class.java
        )

        val repository = RescueRequestRepository(api)

        return if (onCreate == null) {
            SendSosViewModel(repository, nowMillis = nowMillis)
        } else {
            SendSosViewModel(repository, onCreate, nowMillis)
        }
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

    private fun validViewModel(
        onCreate: suspend (CreateSosRequest) -> Result<CreatedSosDto>,
        nowMillis: () -> Long = System::currentTimeMillis
    ): SendSosViewModel = createViewModel(onCreate, nowMillis).also { vm ->
        fillRequiredFields(vm)
        vm.updateLocation(createLocation(timestamp = nowMillis()))
        assertTrue(vm.validateForm())
    }

    private fun createdSos() = CreatedSosDto(
        id = "test-sos-123",
        status = "submitted",
        urgency = "high",
        numberOfPeople = 1
    )

    @Test
    fun exactPeopleCount_errorRemainsUntilValidValue() {
        val vm = createViewModel()
        fillRequiredFields(vm)
        vm.updateExactPeopleCount("0")
        assertNotNull(vm.uiState.value.validationErrors.exactPeopleCount)

        vm.updateExactPeopleCount("4")
        assertNotNull(vm.uiState.value.validationErrors.exactPeopleCount)

        vm.updateExactPeopleCount("-1")
        assertNotNull(vm.uiState.value.validationErrors.exactPeopleCount)

        vm.updateExactPeopleCount("1a")
        assertNotNull(vm.uiState.value.validationErrors.exactPeopleCount)

        vm.updateExactPeopleCount("1")
        assertNull(vm.uiState.value.validationErrors.exactPeopleCount)
    }

    @Test
    fun changingPeopleGroup_revalidatesExactCount() {
        val vm = createViewModel()
        fillRequiredFields(vm) // ONE, exact = 1
        vm.selectPeopleCount(SosPeopleCount.TWO_THREE)
        assertNotNull(vm.uiState.value.validationErrors.exactPeopleCount)

        vm.updateExactPeopleCount("2")
        assertNull(vm.uiState.value.validationErrors.exactPeopleCount)
        vm.selectPeopleCount(SosPeopleCount.ONE)
        assertNotNull(vm.uiState.value.validationErrors.exactPeopleCount)
    }

    @Test
    fun submitSos_successAndDuplicateAfterSuccessBlocked() = runTest(testDispatcher) {
        var calls = 0
        var received: CreateSosRequest? = null
        val vm = validViewModel({ request ->
            calls++
            received = request
            Result.success(createdSos())
        })

        vm.submitSos()
        assertTrue(vm.uiState.value.isSubmitting)
        runCurrent()
        assertFalse(vm.uiState.value.isSubmitting)
        assertNull(vm.uiState.value.submitError)
        assertEquals("test-sos-123", vm.uiState.value.submittedSosId)
        assertEquals(1, calls)
        assertEquals("high", received?.urgency)
        assertEquals(1, received?.numberOfPeople)

        vm.submitSos()
        runCurrent()
        assertEquals(1, calls)
    }

    @Test
    fun submitSos_backendErrorKeepsFormAndShowsError() = runTest(testDispatcher) {
        val vm = validViewModel({
            Result.failure(IllegalStateException("HTTP 409: SOS đang xử lý"))
        })
        vm.submitSos()
        runCurrent()
        assertFalse(vm.uiState.value.isSubmitting)
        assertNull(vm.uiState.value.submittedSosId)
        assertTrue(vm.uiState.value.submitError.orEmpty().contains("409"))
        assertEquals("1", vm.uiState.value.exactPeopleCount)
        assertNotNull(vm.uiState.value.latitude)
    }

    @Test
    fun submitSos_networkErrorAndTimeoutKeepForm() = runTest(testDispatcher) {
        val vm = validViewModel({ throw IOException("timeout: trạng thái chưa xác định") })
        vm.submitSos()
        runCurrent()
        assertFalse(vm.uiState.value.isSubmitting)
        assertNull(vm.uiState.value.submittedSosId)
        assertTrue(vm.uiState.value.submitError.orEmpty().contains("timeout"))
        assertEquals(SosPeopleCount.ONE, vm.uiState.value.peopleCount)
        assertEquals("1", vm.uiState.value.exactPeopleCount)
    }

    @Test
    fun submitSos_blocksDoubleTapWhilePending() = runTest(testDispatcher) {
        val response = CompletableDeferred<Result<CreatedSosDto>>()
        var calls = 0
        val vm = validViewModel({
            calls++
            response.await()
        })
        vm.submitSos()
        vm.submitSos()
        runCurrent()
        assertTrue(vm.uiState.value.isSubmitting)
        assertEquals(1, calls)

        response.complete(Result.success(createdSos()))
        advanceUntilIdle()
        assertEquals(1, calls)
        assertEquals("test-sos-123", vm.uiState.value.submittedSosId)
    }

    @Test
    fun submitSos_formAndGpsCannotMutateWhileSubmitting() = runTest(testDispatcher) {
        val response = CompletableDeferred<Result<CreatedSosDto>>()
        val vm = validViewModel({ response.await() })
        vm.submitSos()
        runCurrent()
        val original = vm.uiState.value

        vm.updateNote("Thay ghi chú")
        vm.updateExactPeopleCount("999")
        vm.selectUrgency(SosUrgency.CRITICAL)
        vm.selectPeopleCount(SosPeopleCount.FOUR_SIX)
        vm.selectWaterLevel(SosWaterLevel.CHEST)
        vm.toggleSituation(SosSituation.INJURED)
        vm.startLocationLoading()
        vm.setLocationError("GPS đã tắt")
        vm.updateLocation(createLocation(latitude = 20.0))
        vm.resetForm()

        assertEquals(original, vm.uiState.value)
        response.complete(Result.success(createdSos()))
        advanceUntilIdle()
    }

    @Test
    fun submitSos_rechecksGpsAtActualPostTime() = runTest(testDispatcher) {
        var now = 1_900_000_000_000L
        var calls = 0
        val vm = validViewModel({
            calls++
            Result.success(createdSos())
        }, nowMillis = { now })

        vm.submitSos() // First validation passes, coroutine has not run yet.
        assertTrue(vm.uiState.value.isSubmitting)
        now += 31_000L
        runCurrent() // GPS is expired immediately before Repository POST.

        assertEquals(0, calls)
        assertFalse(vm.uiState.value.isSubmitting)
        assertNull(vm.uiState.value.submittedSosId)
        assertNotNull(vm.uiState.value.validationErrors.location)
        assertTrue(vm.uiState.value.submitError.orEmpty().contains("GPS"))
    }

    @Test
    fun submitSos_resetWhileSubmittingDoesNotClearRequest() = runTest(testDispatcher) {
        val response = CompletableDeferred<Result<CreatedSosDto>>()
        val vm = validViewModel({ response.await() })
        vm.submitSos()
        runCurrent()
        vm.resetForm()
        assertTrue(vm.uiState.value.isSubmitting)
        assertEquals("1", vm.uiState.value.exactPeopleCount)

        response.complete(Result.success(createdSos()))
        advanceUntilIdle()
        vm.resetForm()
        assertEquals("test-sos-123", vm.uiState.value.submittedSosId)
    }

}
