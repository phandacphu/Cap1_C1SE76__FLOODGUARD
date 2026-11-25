package com.example.floodguard.ui.screens.warning

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.data.repository.FloodWarningV2
import com.example.floodguard.data.repository.FloodWarningV2Repository
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.HttpException

enum class FloodWarningV2Filter(
    val apiValue: String?,
    val label: String
) {
    ALL(null, "Tất cả"),
    ACTIVE("active", "Đang bật"),
    INACTIVE("inactive", "Đã tắt")
}

data class FloodWarningV2ListState(
    val filter: FloodWarningV2Filter = FloodWarningV2Filter.ALL,
    val items: List<FloodWarningV2> = emptyList(),
    val loading: Boolean = false,
    val loaded: Boolean = false,
    val stale: Boolean = false,
    val error: String? = null
)

data class FloodWarningV2OverviewState(
    val activeAlerts: List<FloodWarningV2> = emptyList(),
    val loading: Boolean = false,
    val loaded: Boolean = false,
    val stale: Boolean = false,
    val error: String? = null
) {
    // null khi chưa tải được; không hiển thị số 0 giả.
    val activeCount: Int?
        get() = if (loaded) activeAlerts.size else null

    val latest: FloodWarningV2?
        get() = activeAlerts.firstOrNull()
}

data class FloodWarningV2DetailState(
    val requestedId: String? = null,
    val alert: FloodWarningV2? = null,
    val loading: Boolean = false,
    val stale: Boolean = false,
    val notFound: Boolean = false,
    val error: String? = null
)

class FloodWarningV2ViewModel(
    private val repository: FloodWarningV2Repository
) : ViewModel() {
    private val _list = MutableStateFlow(FloodWarningV2ListState())
    val list = _list.asStateFlow()

    private val _overview = MutableStateFlow(FloodWarningV2OverviewState())
    val overview = _overview.asStateFlow()

    private val _detail = MutableStateFlow(FloodWarningV2DetailState())
    val detail = _detail.asStateFlow()

    private var listJob: Job? = null
    private var overviewJob: Job? = null
    private var detailJob: Job? = null

    private var listRequest = 0L
    private var overviewRequest = 0L
    private var detailRequest = 0L

    private var accountEpoch = 0L

    fun selectFilter(filter: FloodWarningV2Filter) {
        if (_list.value.filter == filter && _list.value.loaded) return
        loadList(filter)
    }

    fun refreshList() = loadList(_list.value.filter)

    private fun loadList(filter: FloodWarningV2Filter) {
        val epoch = accountEpoch
        val request = ++listRequest
        listJob?.cancel()

        val previous = _list.value
        _list.value = if (previous.filter == filter) {
            previous.copy(loading = true, error = null)
        } else {
            FloodWarningV2ListState(filter = filter, loading = true)
        }

        listJob = viewModelScope.launch {
            val result = repository.getAlerts(status = filter.apiValue)
            if (epoch != accountEpoch) return@launch
            if (result.exceptionOrNull()?.let(::handleAccountError) == true) {
                return@launch
            }
            if (request != listRequest) return@launch

            result.fold(
                onSuccess = { items ->
                    _list.value = FloodWarningV2ListState(
                        filter = filter,
                        items = items,
                        loaded = true
                    )
                },
                onFailure = { error ->
                    val state = _list.value
                    _list.value = state.copy(
                        loading = false,
                        stale = state.loaded,
                        error = "Chưa thể cập nhật bản tin. Vui lòng thử lại."
                    )
                }
            )
        }
    }

    fun refreshOverview() {
        val epoch = accountEpoch
        val request = ++overviewRequest
        overviewJob?.cancel()
        _overview.value = _overview.value.copy(
            loading = true,
            error = null
        )

        overviewJob = viewModelScope.launch {
            val result = repository.getActiveAlerts()
            if (epoch != accountEpoch) return@launch
            if (result.exceptionOrNull()?.let(::handleAccountError) == true) {
                return@launch
            }
            if (request != overviewRequest) return@launch

            result.fold(
                onSuccess = { items ->
                    _overview.value = FloodWarningV2OverviewState(
                        activeAlerts = items,
                        loaded = true
                    )
                },
                onFailure = { error ->
                    val state = _overview.value
                    _overview.value = state.copy(
                        loading = false,
                        stale = state.loaded,
                        error = "Chưa thể cập nhật bản tin đang bật."
                    )
                }
            )
        }
    }

    fun openDetail(id: String) {
        val epoch = accountEpoch
        val request = ++detailRequest
        detailJob?.cancel()

        val previous = _detail.value
        _detail.value = if (previous.requestedId == id) {
            previous.copy(
                loading = true,
                notFound = false,
                error = null
            )
        } else {
            FloodWarningV2DetailState(
                requestedId = id,
                loading = true
            )
        }

        detailJob = viewModelScope.launch {
            val result = repository.getAlert(id)
            if (epoch != accountEpoch) return@launch
            if (result.exceptionOrNull()?.let(::handleAccountError) == true) {
                return@launch
            }
            if (request != detailRequest) return@launch

            result.fold(
                onSuccess = { alert ->
                    _detail.value = FloodWarningV2DetailState(
                        requestedId = id,
                        alert = alert
                    )
                },
                onFailure = { error ->

                    if ((error as? HttpException)?.code() == 404) {
                        _detail.value = FloodWarningV2DetailState(
                            requestedId = id,
                            notFound = true,
                            error = "Không tìm thấy bản tin hoặc bản tin không còn truy cập được."
                        )
                    } else {
                        val state = _detail.value
                        _detail.value = state.copy(
                            loading = false,
                            stale = state.alert != null,
                            error = "Chưa thể cập nhật chi tiết bản tin."
                        )
                    }
                }
            )
        }
    }

    fun closeDetail() {
        ++detailRequest
        detailJob?.cancel()
        _detail.value = FloodWarningV2DetailState()
    }

    // Gọi khi logout/đổi tài khoản trước khi dùng phiên mới.
    fun clearAccount() {
        ++accountEpoch
        ++listRequest
        ++overviewRequest
        ++detailRequest
        listJob?.cancel()
        overviewJob?.cancel()
        detailJob?.cancel()
        _list.value = FloodWarningV2ListState()
        _overview.value = FloodWarningV2OverviewState()
        _detail.value = FloodWarningV2DetailState()
    }

    private fun handleAccountError(error: Throwable): Boolean {
        val code = (error as? HttpException)?.code()
        if (code != 401 && code != 403) return false

        val message = if (code == 401) {
            "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại."
        } else {
            "Tài khoản không có quyền truy cập bản tin."
        }
        val requestedId = _detail.value.requestedId
        clearAccount()
        _list.value = FloodWarningV2ListState(error = message)
        _overview.value = FloodWarningV2OverviewState(error = message)
        _detail.value = FloodWarningV2DetailState(
            requestedId = requestedId,
            error = message
        )
        return true
    }
}