package com.example.floodguard.ui.screens.sos

import android.location.Location
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.remote.dto.rescue.CreateSosLocation
import com.example.floodguard.data.remote.dto.rescue.CreateSosRequest
import com.example.floodguard.data.remote.dto.rescue.CreatedSosDto
import com.example.floodguard.data.repository.RescueRequestRepository
import com.example.floodguard.data.local.SessionManager
import com.example.floodguard.data.local.SosSmsSessionKey
import com.example.floodguard.data.model.SosCachedLocation
import com.example.floodguard.data.model.SosSubmission
import com.example.floodguard.data.model.SosSubmissionCodec
import com.example.floodguard.data.model.SosSubmissionPhase
import com.example.floodguard.data.remote.dto.rescue.RescueRequestDto
import com.example.floodguard.data.repository.ResidentSosApiException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.Job

class SendSosViewModel(
    repository: RescueRequestRepository? = null,
    createSosRequest:
    (suspend (CreateSosRequest) -> Result<CreatedSosDto>)? = null,
    private val nowMillis: () -> Long = System::currentTimeMillis,
    private val submitValidatedSos:
    (suspend (
        CreateSosRequest,
        () -> Boolean
    ) -> Result<CreatedSosDto>)? = null,
    private val sessionManager: SessionManager? = null,
    private val loadSubmittedRequests:
    (suspend () -> Result<List<RescueRequestDto>>)? = null
) : ViewModel() {

    private val createSosRequest:
            (suspend (CreateSosRequest) -> Result<CreatedSosDto>)? =
        createSosRequest ?: repository?.let { it::createSos }

    init {
        require(
            this.createSosRequest != null ||
                    submitValidatedSos != null
        ) {
            "Cần cung cấp Repository hoặc hàm gửi SOS."
        }
    }

    private val _uiState = MutableStateFlow(
        SendSosUiState(
            isRestoringLocation = sessionManager != null
        )
    )

    val uiState: StateFlow<SendSosUiState> =
        _uiState.asStateFlow()

    private var locationSessionKey: SosSmsSessionKey? = null
    private var locationVersion = 0L
    private val locationWriteMutex = Mutex()
    private var pendingSubmission: SosSubmission? = null
    private var operationJob: Job? = null

    init {
        sessionManager?.let { sessions ->
            viewModelScope.launch {
                try {
                    val key = checkNotNull(
                        sessions.getSosSmsSessionKey()
                    ) {
                        "Phiên đăng nhập không hợp lệ. Hãy mở lại SOS."
                    }

                    locationSessionKey = key

                    val saved = sessions.getSosLastLocation(key)
                    val pending = sessions.getSosSubmission(key)
                    pendingSubmission = pending

                    _uiState.update { current ->
                        val restored = if (saved != null) {
                            current.withLocation(
                                saved,
                                fromCache = true
                            )
                        } else {
                            current
                        }

                        val withPending = if (pending != null) {
                            restored.withSubmission(pending)
                        } else {
                            restored
                        }

                        withPending.copy(
                            isRestoringLocation = false
                        )
                    }

                    sessions.sosSmsSessionFlow.collect { activeKey ->
                        if (activeKey != key) {
                            invalidateLocationSession(
                                "Phiên đăng nhập đã thay đổi. Hãy mở lại SOS."
                            )
                        }
                    }
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    invalidateLocationSession(
                        error.message
                            ?: "Không thể khôi phục SOS. Hãy mở lại màn hình."
                    )
                }
            }
        }
    }

    private fun invalidateLocationSession(message: String) {
        locationSessionKey = null
        pendingSubmission = null
        operationJob?.cancel()
        locationVersion++

        _uiState.update {
            it.copy(
                isRestoringLocation = false,
                isLoadingLocation = false,
                selectedSituations = emptySet(),
                waterLevel = null,
                exactPeopleCount = "",
                note = "",
                pendingClientRequestId = null,
                pendingPhase = null,
                smsStatus = null,
                latitude = null,
                longitude = null,
                locationAccuracyMeters = null,
                locationTimestampMillis = null,
                isLocationFromCache = false,
                locationText = "Chưa có vị trí cho phiên hiện tại",
                locationSessionError = message,
                locationStorageWarning = null
            )
        }
    }

    private fun SendSosUiState.cachedLocationOrNull():
            SosCachedLocation? =
        SosCachedLocation(
            latitude = latitude,
            longitude = longitude,
            capturedAtMillis = locationTimestampMillis,
            accuracyMeters = locationAccuracyMeters
        ).takeIf { it.isValid() }

    private fun SendSosUiState.withLocation(
        point: SosCachedLocation,
        fromCache: Boolean
    ): SendSosUiState =
        copy(
            latitude = point.latitude,
            longitude = point.longitude,
            locationTimestampMillis = point.capturedAtMillis,
            locationAccuracyMeters = point.accuracyMeters
                ?.takeIf { it.isFinite() && it >= 0f },
            isLocationFromCache = fromCache,
            isLoadingLocation = false,
            locationError = null,
            locationText = if (fromCache) {
                "Đang dùng vị trí gần nhất"
            } else {
                "Đã xác định vị trí GPS"
            },
            validationErrors = validationErrors.copy(
                location = null
            )
        )

    private fun persistLocation(
        point: SosCachedLocation,
        fromCache: Boolean,
        version: Long
    ) {
        val sessions = sessionManager ?: return
        val key = locationSessionKey ?: return

        viewModelScope.launch {
            try {
                val chosen = locationWriteMutex.withLock {
                    sessions.saveSosLastLocation(
                        sessionKey = key,
                        location = point,
                        fromCache = fromCache
                    )
                }

                if (
                    version == locationVersion &&
                    locationSessionKey == key
                ) {
                    _uiState.update { current ->
                        if (!canEdit(current)) {
                            current
                        } else {
                            current.withLocation(
                                chosen,
                                fromCache = fromCache || chosen != point
                            ).copy(
                                locationStorageWarning = null
                            )
                        }
                    }
                }
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                if (
                    version == locationVersion &&
                    locationSessionKey == key
                ) {
                    _uiState.update {
                        it.copy(
                            locationStorageWarning =
                                "Chưa lưu được vị trí xuống thiết bị. " +
                                        "Vị trí hiện tại vẫn được giữ trên màn hình."
                        )
                    }
                }
            }
        }
    }

    private fun canAct(state: SendSosUiState): Boolean =
        !state.isSubmitting &&
                state.submittedSosId == null &&
                !state.isRestoringLocation &&
                state.locationSessionError == null

    private fun canEdit(state: SendSosUiState): Boolean =
        canAct(state) &&
                state.pendingClientRequestId == null

    private fun exactPeopleCountError(value: String): String? {
        val count = value.trim().toIntOrNull()

        return if (count == null || count <= 0) {
            "Vui lòng nhập số người chính xác, lớn hơn 0."
        } else {
            null
        }
    }

    private fun hasUsableLocation(
        state: SendSosUiState
    ): Boolean =
        !state.isRestoringLocation &&
                state.locationSessionError == null &&
                _uiState.value.locationSessionError == null &&
                state.cachedLocationOrNull() != null

    fun toggleSituation(situation: SosSituation) {
        _uiState.update { current ->
            if (!canEdit(current)) return@update current
            val updated = current.selectedSituations.toMutableSet()
            if (!updated.add(situation)) updated.remove(situation)
            current.copy(
                selectedSituations = updated,
                validationErrors = current.validationErrors.copy(
                    situations = if (updated.isNotEmpty()) null
                    else current.validationErrors.situations
                )
            )
        }
    }

    fun updateExactPeopleCount(value: String) {
        _uiState.update { current ->
            if (!canEdit(current)) return@update current

            current.copy(
                exactPeopleCount = value,
                submitError = null,
                validationErrors = current.validationErrors.copy(
                    exactPeopleCount = exactPeopleCountError(value)
                )
            )
        }
    }

    fun selectWaterLevel(level: SosWaterLevel) {
        _uiState.update { current ->
            if (!canEdit(current)) return@update current
            current.copy(
                waterLevel = level,
                validationErrors = current.validationErrors.copy(waterLevel = null)
            )
        }
    }

    fun updateNote(note: String) {
        _uiState.update { current ->
            if (!canEdit(current)) current else current.copy(note = note.take(200))
        }
    }

    // GPS callbacks can arrive after submission starts; ignore them rather than changing
    // the submitted request's location while the HTTP call is in flight.
    fun startLocationLoading() {
        _uiState.update { current ->
            if (!canEdit(current)) return@update current

            val hasSavedPoint =
                current.cachedLocationOrNull() != null

            current.copy(
                isLoadingLocation = true,
                locationError = null,
                isLocationFromCache = hasSavedPoint,
                locationText = if (hasSavedPoint) {
                    "Đang cập nhật GPS; vẫn giữ vị trí gần nhất"
                } else {
                    "Đang lấy vị trí GPS..."
                }
            )
        }
    }

    fun updateLocation(
        location: Location,
        fromCache: Boolean = false
    ) {
        if (!canEdit(_uiState.value)) return

        val point = SosCachedLocation(
            latitude = location.latitude,
            longitude = location.longitude,
            capturedAtMillis = location.time.takeIf { it > 0L },
            accuracyMeters = if (location.hasAccuracy()) {
                location.accuracy.takeIf {
                    it.isFinite() && it >= 0f
                }
            } else {
                null
            }
        )

        if (!point.isValid()) {
            setLocationError(
                "Tọa độ thiết bị trả về không hợp lệ."
            )
            return
        }

        val version = ++locationVersion

        _uiState.update { current ->
            if (!canEdit(current)) return@update current

            val existing = current.cachedLocationOrNull()
            val candidateTime = point.capturedAtMillis
            val existingTime = existing?.capturedAtMillis

            val keepExisting =
                fromCache &&
                        existing != null &&
                        (
                                candidateTime == null ||
                                        (
                                                existingTime != null &&
                                                        candidateTime <= existingTime
                                                )
                                )

            if (keepExisting) {
                current.withLocation(
                    checkNotNull(existing),
                    fromCache = current.isLocationFromCache
                )
            } else {
                current.withLocation(point, fromCache)
            }
        }

        persistLocation(point, fromCache, version)
    }

    fun setLocationError(message: String) {
        _uiState.update { current ->
            if (!canEdit(current)) return@update current

            val hasSavedPoint =
                current.cachedLocationOrNull() != null

            current.copy(
                isLoadingLocation = false,
                locationError = message,
                isLocationFromCache = hasSavedPoint,
                locationText = if (hasSavedPoint) {
                    "Đang dùng vị trí gần nhất"
                } else {
                    "Chưa xác định được vị trí GPS"
                },
                validationErrors = current.validationErrors.copy(
                    location = if (hasSavedPoint) {
                        null
                    } else {
                        current.validationErrors.location
                    }
                )
            )
        }
    }

    fun validateForm(): Boolean {
        val current = _uiState.value
        if (!canAct(current)) return false
        if (pendingSubmission != null) return true

        val errors = SosFormErrors(
            situations = if (current.selectedSituations.isEmpty()) {
                "Vui lòng chọn ít nhất một tình huống."
            } else {
                null
            },
            waterLevel = if (current.waterLevel == null) {
                "Vui lòng chọn mức nước ước tính."
            } else {
                null
            },
            location = if (!hasUsableLocation(current)) {
                "Chưa có tọa độ hợp lệ. Vui lòng lấy vị trí GPS."
            } else {
                null
            },
            exactPeopleCount =
                exactPeopleCountError(current.exactPeopleCount)
        )

        _uiState.update { latest ->
            if (!canEdit(latest)) {
                latest
            } else {
                latest.copy(validationErrors = errors)
            }
        }

        return !errors.hasErrors() && canEdit(_uiState.value)
    }
    private fun SendSosUiState.withSubmission(
        saved: SosSubmission
    ): SendSosUiState {
        val request = saved.request

        val situations = request.situations.map { code ->
            when (code) {
                "trapped" -> SosSituation.TRAPPED
                "evacuation" -> SosSituation.EVACUATION
                "injured" -> SosSituation.INJURED
                "vulnerable" -> SosSituation.VULNERABLE
                "other" -> SosSituation.OTHER
                else -> error(
                    "Tình huống trong bản gửi không hợp lệ."
                )
            }
        }.toSet()

        val level = when (request.waterLevel) {
            "below_knee" -> SosWaterLevel.BELOW_KNEE
            "waist" -> SosWaterLevel.WAIST
            "chest" -> SosWaterLevel.CHEST
            "above_two_meters" -> SosWaterLevel.DANGEROUS
            else -> error(
                "Mực nước trong bản gửi không hợp lệ."
            )
        }

        return copy(
            selectedSituations = situations,
            waterLevel = level,
            exactPeopleCount = request.numberOfPeople.toString(),
            note = request.note.orEmpty(),
            latitude = request.location.latitude,
            longitude = request.location.longitude,
            locationTimestampMillis = saved.capturedAtMillis,
            locationAccuracyMeters = null,
            isLoadingLocation = false,
            isLocationFromCache = true,
            locationText = "Vị trí cố định của bản SOS đã lưu",
            locationError = null,
            validationErrors = SosFormErrors(),
            pendingClientRequestId = request.clientRequestId,
            pendingPhase = saved.phase,
            smsStatus = if (
                saved.phase == SosSubmissionPhase.SMS_OPENED
            ) {
                "Bản này đã chuyển sang bước SMS; " +
                        "chưa xác nhận hệ thống đã nhận."
            } else {
                smsStatus
            }
        )
    }

    private fun buildRequest(
        state: SendSosUiState
    ): CreateSosRequest =
        CreateSosRequest(
            location = CreateSosLocation(
                latitude = checkNotNull(state.latitude),
                longitude = checkNotNull(state.longitude)
            ),
            situations = SosSituation.entries
                .filter { it in state.selectedSituations }
                .map {
                    when (it) {
                        SosSituation.TRAPPED -> "trapped"
                        SosSituation.EVACUATION -> "evacuation"
                        SosSituation.INJURED -> "injured"
                        SosSituation.VULNERABLE -> "vulnerable"
                        SosSituation.OTHER -> "other"
                    }
                },
            numberOfPeople = checkNotNull(
                state.exactPeopleCount.trim().toIntOrNull()
            ),
            waterLevel = when (
                checkNotNull(state.waterLevel)
            ) {
                SosWaterLevel.BELOW_KNEE -> "below_knee"
                SosWaterLevel.WAIST -> "waist"
                SosWaterLevel.CHEST -> "chest"
                SosWaterLevel.DANGEROUS -> "above_two_meters"
            },
            note = state.note.trim().ifBlank { null }
        )

    private suspend fun prepareSubmission(
        form: SendSosUiState
    ): SosSubmission {
        pendingSubmission?.let { return it }

        val request = buildRequest(form)
        val sessions = sessionManager

        val saved = if (sessions != null) {
            val key = checkNotNull(locationSessionKey) {
                "Phiên đăng nhập không còn hợp lệ. Hãy mở lại SOS."
            }

            val credential = sessions.getSosSmsCredential(key)

            sessions.getOrCreateSosSubmission(
                sessionKey = key,
                request = request,
                capturedAtMillis = form.locationTimestampMillis,
                smsCredential = credential
            )
        } else {
            // Hỗ trợ unit test không sử dụng Android DataStore.
            SosSubmissionCodec.newSubmission(
                request,
                form.locationTimestampMillis,
                null
            )
        }

        check(
            _uiState.value.locationSessionError == null
        ) {
            "Phiên đăng nhập đã thay đổi. Hãy mở lại SOS."
        }

        pendingSubmission = saved
        _uiState.update { it.withSubmission(saved) }

        return saved
    }

    private fun requireCurrentSubmission(
        saved: SosSubmission
    ) {
        check(
            _uiState.value.locationSessionError == null &&
                    pendingSubmission?.request?.clientRequestId ==
                    saved.request.clientRequestId &&
                    (
                            sessionManager == null ||
                                    locationSessionKey != null
                            )
        ) {
            "Bản gửi hoặc phiên đăng nhập đã thay đổi. " +
                    "Hãy mở lại SOS."
        }

        SosSubmissionCodec.validateRequest(saved.request)
    }

    private suspend fun changePhase(
        saved: SosSubmission,
        phase: SosSubmissionPhase
    ): SosSubmission {
        requireCurrentSubmission(saved)

        val updated = sessionManager?.let { sessions ->
            sessions.updateSosSubmissionPhase(
                sessionKey = checkNotNull(locationSessionKey),
                clientRequestId = checkNotNull(
                    saved.request.clientRequestId
                ),
                phase = phase,
                expectedRevision = saved.revision
            )
        } ?: saved.withPhase(phase)

        requireCurrentSubmission(saved)

        pendingSubmission = updated
        _uiState.update {
            it.copy(pendingPhase = updated.phase)
        }

        return updated
    }

    private fun runSubmissionAction(
        action: suspend () -> Unit
    ) {
        if (!canAct(_uiState.value)) return

        // Khóa ngay để chặn bấm liên tiếp.
        _uiState.update {
            it.copy(
                isSubmitting = true,
                submitError = null
            )
        }

        operationJob = viewModelScope.launch {
            try {
                action()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                _uiState.update {
                    it.copy(
                        submitError = error.message
                            ?: "Không thể xử lý bản SOS."
                    )
                }
            } finally {
                _uiState.update {
                    it.copy(isSubmitting = false)
                }
            }
        }
    }

    private suspend fun finishConfirmedSubmission(
        saved: SosSubmission,
        serverId: String
    ) {
        requireCurrentSubmission(saved)

        require(serverId.isNotBlank()) {
            "Chưa nhận được mã SOS hợp lệ."
        }

        var warning: String? = null

        val removed = try {
            sessionManager?.clearConfirmedSosSubmission(
                sessionKey = checkNotNull(locationSessionKey),
                clientRequestId = checkNotNull(
                    saved.request.clientRequestId
                )
            ) ?: true
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            warning =
                "Đã xác nhận SOS nhưng chưa dọn được " +
                        "bản lưu trên thiết bị."
            false
        }

        requireCurrentSubmission(saved)

        if (removed) {
            pendingSubmission = null
        }

        _uiState.update {
            it.copy(
                submittedSosId = serverId,
                pendingClientRequestId = if (removed) {
                    null
                } else {
                    saved.request.clientRequestId
                },
                pendingPhase = if (removed) {
                    null
                } else {
                    pendingSubmission?.phase
                },
                submitError = warning,
                smsStatus = null
            )
        }
    }

    fun submitSos() {
        if (!validateForm()) return

        val form = _uiState.value

        runSubmissionAction {
            val saved = prepareSubmission(form)
            val originalPhase = saved.phase

            // Lưu trạng thái trước khi bắt đầu gọi luồng gửi.
            val attempted = changePhase(
                saved,
                SosSubmissionPhase.UNCERTAIN
            )

            requireCurrentSubmission(saved)

            val result = if (submitValidatedSos != null) {
                submitValidatedSos.invoke(saved.request) {
                    _uiState.value.locationSessionError == null &&
                            pendingSubmission?.request?.clientRequestId ==
                            saved.request.clientRequestId
                }
            } else {
                requireNotNull(createSosRequest)
                    .invoke(saved.request)
            }

            result.fold(
                onSuccess = { created ->
                    if (created.id.isBlank()) {
                        error(
                            "Chưa xác nhận được kết quả SOS. " +
                                    "Bản gửi được giữ nguyên."
                        )
                    }

                    finishConfirmedSubmission(
                        saved,
                        created.id
                    )
                },
                onFailure = { error ->
                    val nextPhase = when {
                        error is ResidentSosNotPostedException ->
                            originalPhase

                        originalPhase in setOf(
                            SosSubmissionPhase.PREPARED,
                            SosSubmissionPhase.REJECTED
                        ) &&
                                error is ResidentSosApiException &&
                                error.statusCode in setOf(
                            400, 401, 403, 422
                        ) ->
                            SosSubmissionPhase.REJECTED

                        else ->
                            SosSubmissionPhase.UNCERTAIN
                    }

                    changePhase(attempted, nextPhase)

                    _uiState.update {
                        it.copy(
                            submitError = error.message
                                ?: "Chưa xác nhận được kết quả SOS."
                        )
                    }
                }
            )
        }
    }

    fun openSms(
        launchComposer: (recipient: String, body: String) -> Unit
    ) {
        if (!validateForm()) return

        val form = _uiState.value

        runSubmissionAction {
            val saved = prepareSubmission(form)

            val body = SosSubmissionCodec.encodeSms(
                saved,
                nowMillis()
            )

            val recipient =
                checkNotNull(saved.smsCredential).recipientPhone

            requireCurrentSubmission(saved)

            // Lưu trước khi chuyển sang ứng dụng SMS.
            changePhase(
                saved,
                SosSubmissionPhase.SMS_OPENED
            )

            requireCurrentSubmission(saved)

            launchComposer(recipient, body)

            _uiState.update {
                it.copy(
                    smsStatus =
                        "Đã mở trình soạn SMS. Bạn cần bấm Gửi " +
                                "trong ứng dụng SMS. Chưa xác nhận " +
                                "hệ thống đã nhận SOS."
                )
            }
        }
    }

    fun checkPendingSubmission() {
        val saved = pendingSubmission ?: return

        runSubmissionAction {
            requireCurrentSubmission(saved)

            val loader = checkNotNull(loadSubmittedRequests) {
                "Chưa cấu hình thao tác kiểm tra kết quả SOS."
            }

            val requests = loader().getOrThrow()

            requireCurrentSubmission(saved)

            val matches = requests.filter {
                it.clientRequestId ==
                        saved.request.clientRequestId
            }

            check(matches.size <= 1) {
                "Có nhiều bản ghi cùng mã cầu cứu. " +
                        "Cần kiểm tra dữ liệu hệ thống."
            }

            val matched = matches.singleOrNull()

            if (matched == null) {
                _uiState.update {
                    it.copy(
                        submitError =
                            "Chưa tìm thấy SOS khớp mã của bản gửi này. " +
                                    "Bản gửi vẫn được giữ nguyên " +
                                    "để kiểm tra lại."
                    )
                }
            } else {
                val id = checkNotNull(matched.id)

                require(id.isNotBlank()) {
                    "Mã SOS phản hồi không hợp lệ."
                }

                finishConfirmedSubmission(saved, id)
            }
        }
    }

    fun discardUnsentSubmission() {
        val saved = pendingSubmission ?: return

        if (
            saved.phase !in setOf(
                SosSubmissionPhase.PREPARED,
                SosSubmissionPhase.REJECTED
            )
        ) {
            _uiState.update {
                it.copy(
                    submitError =
                        "SOS có thể đã được gửi. " +
                                "Hãy kiểm tra kết quả trước."
                )
            }
            return
        }

        runSubmissionAction {
            requireCurrentSubmission(saved)

            val removed =
                sessionManager?.discardUnsentSosSubmission(
                    sessionKey =
                        checkNotNull(locationSessionKey),
                    clientRequestId = checkNotNull(
                        saved.request.clientRequestId
                    )
                ) ?: true

            check(removed) {
                "Bản lưu đã thay đổi. " +
                        "Hãy mở lại SOS để kiểm tra."
            }

            requireCurrentSubmission(saved)

            pendingSubmission = null

            val point =
                _uiState.value.cachedLocationOrNull()

            _uiState.value = if (point != null) {
                SendSosUiState(
                    isSubmitting = true
                ).withLocation(
                    point,
                    fromCache = true
                )
            } else {
                SendSosUiState(isSubmitting = true)
            }
        }
    }

    fun resetForm() {
        val current = _uiState.value
        if (!canEdit(current)) return

        val point = current.cachedLocationOrNull()

        _uiState.value = if (point != null) {
            SendSosUiState().withLocation(
                point,
                fromCache = true
            ).copy(
                locationStorageWarning =
                    current.locationStorageWarning
            )
        } else {
            SendSosUiState()
        }
    }
}
