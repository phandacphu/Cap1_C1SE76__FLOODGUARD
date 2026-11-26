package com.example.floodguard.ui.screens.rescue.sos

import com.example.floodguard.data.remote.dto.rescue.sos.SosHistoryWire
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.time.Instant
import java.text.Collator
import java.util.Locale

internal data class SosResource<T>(val data: T? = null, val loading: Boolean = false,
    val error: String? = null, val loadedAt: Long? = null)
internal data class RescueSosState(
    val active: SosResource<List<RescueSos>> = SosResource(),
    val rescued: SosResource<List<RescueSos>> = SosResource(),
    val detailId: String? = null, val detail: SosResource<RescueSos> = SosResource(),
    val history: SosResource<List<SosHistoryWire>> = SosResource(),
    val completingId: String? = null, val uncertainId: String? = null,
    val actionMessage: String? = null, val accessError: String? = null
) {
    fun list(filter: SosFilter) = if (filter == SosFilter.ACTIVE) active else rescued
    val canComplete get() = accessError == null && completingId == null &&
        detail.data?.id == detailId && detail.data?.state == "active" &&
        !detail.loading && detail.error == null && detailId != uncertainId
}
/** Session-owned, no background polling/location. All writes reconcile with server truth. */
internal class RescueSosStore(private val source: RescueSosSource, private val scope: CoroutineScope,
    private val now: () -> Long = System::currentTimeMillis) {
    private val mutable = MutableStateFlow(RescueSosState())
    val state = mutable.asStateFlow()
    private val listJobs = mutableMapOf<SosFilter, Job>()
    private val listVersions = mutableMapOf<SosFilter, Int>()
    private var detailJob: Job? = null
    private var historyJob: Job? = null
    private var completionJob: Job? = null
    private var detailVersion = 0
    private var historyVersion = 0
    private var detailRequestId: String? = null
    private var historyRequestId: String? = null
    private var closed = false
    private val completedIds = mutableSetOf<String>()

    // Observations made while the current rescued-list read is in flight.
    // A delayed list response must not erase these confirmed completions.
    private var rescuedReadObservations = mutableMapOf<String, RescueSos>()

    // A missing detail is not a confirmed completion.
    // Suppress it only in the active-list snapshot already in flight.
    private var activeMissingObservations = mutableSetOf<String>()

    private val idCollator = Collator.getInstance(Locale.US)
    fun refresh(filter: SosFilter) {
        if (closed || listJobs[filter]?.isActive == true) return
        val version = (listVersions[filter] ?: 0) + 1; listVersions[filter] = version
        listJobs[filter]?.cancel()

        val missingObservations = if (filter == SosFilter.ACTIVE) {
            mutableSetOf<String>().also {
                activeMissingObservations = it
            }
        } else null

        val observations = if (filter == SosFilter.RESCUED) {
            mutableMapOf<String, RescueSos>().also {
                rescuedReadObservations = it
            }
        } else null

        changeList(filter) { it.copy(loading = true, error = null) }
        listJobs[filter] = scope.launch {
            try {
                val items = source.list(filter)
                if (closed || listVersions[filter] != version) return@launch
                val visible = if (filter == SosFilter.ACTIVE) {
                    items.filterNot {
                        it.id in completedIds ||
                            it.id in missingObservations.orEmpty()
                    }
                } else {
                    val cached = mutable.value.rescued.data.orEmpty()
                        .associateBy { it.id }

                    val reconciled = items.map { item ->
                        cached[item.id]?.let { previous ->
                            mergeRescuedItem(previous, item)
                        } ?: item
                    }

                    mergeRescued(reconciled, observations.orEmpty().values)
                }
                changeList(filter) { SosResource(data = visible, loadedAt = now()) }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                if (closed || deny(e)) return@launch
                if (listVersions[filter] == version)
                    changeList(filter) { it.copy(loading = false, error = message(e)) }
            }
        }
    }
    fun openDetail(id: String) {
        if (closed) return
        val changed = mutable.value.detailId != id
        mutable.update { it.copy(detailId = id, detail = if (changed) SosResource() else it.detail,
            history = if (changed) SosResource() else it.history,
            actionMessage = if (changed) null else it.actionMessage) }
        refreshDetail(id); refreshHistory(id)
    }
    fun refreshDetail(id: String? = mutable.value.detailId) {
        if (id == null || closed || mutable.value.detailId != id) return
        if (detailJob?.isActive == true && detailRequestId == id) return
        detailRequestId = id
        val version = ++detailVersion; detailJob?.cancel()
        mutable.update { it.copy(detail = it.detail.copy(loading = true, error = null)) }
        detailJob = scope.launch {
            try {
                val item = source.detail(id)
                if (closed || detailVersion != version || mutable.value.detailId != id) return@launch
                if (id in completedIds && item.state == "active")
                    throw RescueSosFailure(message = "Trạng thái vừa thay đổi. Vui lòng tải lại chi tiết.")
                val reconciledCompletion =
                    item.state == "rescued" && mutable.value.uncertainId == id
                if (item.state == "rescued") {
                    if (reconciledCompletion) {
                        applyCompleted(item)
                    } else {
                        observeCompleted(item)
                    }
                }
                mutable.update { it.copy(detail = SosResource(data = item, loadedAt = now()),
                    uncertainId = if (it.uncertainId == id) null else it.uncertainId,
                    actionMessage = if (it.uncertainId == id) {
                        if (item.state == "rescued") "Máy chủ ghi nhận SOS $id đã cứu. Xem người và thời gian xác nhận bên dưới."
                        else "Đã đối chiếu: SOS $id vẫn chưa hoàn tất. Có thể xác nhận lại sau khi đã cứu thực tế."
                    } else it.actionMessage) }
                if (reconciledCompletion) {
                    refresh(SosFilter.ACTIVE)
                    refresh(SosFilter.RESCUED)
                    historyJob?.cancel()
                    historyJob = null
                    refreshHistory(id)
                }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                if (closed || deny(e)) return@launch
                if (detailVersion != version || mutable.value.detailId != id) return@launch
                val missing = (e as? RescueSosFailure)?.httpStatus == 404
                if (missing) observeMissingActive(id)
                mutable.update { it.copy(detail = it.detail.copy(data = if (missing) null else it.detail.data,
                    loading = false, error = message(e))) }
            }
        }
    }
    fun refreshHistory(id: String? = mutable.value.detailId) {
        if (id == null || closed || mutable.value.detailId != id) return
        if (historyJob?.isActive == true && historyRequestId == id) return
        historyRequestId = id; historyJob?.cancel()
        val version = ++historyVersion
        mutable.update { it.copy(history = it.history.copy(loading = true, error = null)) }
        historyJob = scope.launch {
            try {
                val history = source.history(id)
                if (!closed && mutable.value.detailId == id && version == historyVersion)
                    mutable.update { it.copy(history = SosResource(data = history, loadedAt = now())) }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                if (closed || deny(e)) return@launch
                if (mutable.value.detailId == id && version == historyVersion)
                    mutable.update { it.copy(history = it.history.copy(loading = false, error = message(e))) }
            }
        }
    }
    fun complete(id: String) {
        if (closed || !mutable.value.canComplete || mutable.value.detailId != id) return
        mutable.update { it.copy(completingId = id, actionMessage = null) }
        completionJob = scope.launch {
            try {
                val item = source.complete(id)
                if (closed) return@launch
                applyCompleted(item)
                if (mutable.value.detailId == id) {
                    detailVersion++; detailJob?.cancel()
                    mutable.update { it.copy(detail = SosResource(data = item, loadedAt = now())) }
                }
                mutable.update { it.copy(completingId = null, uncertainId = null,
                    actionMessage = "Đã xác nhận SOS $id đã cứu trên máy chủ.") }
                refresh(SosFilter.ACTIVE); refresh(SosFilter.RESCUED)
                if (mutable.value.detailId == id) {
                    historyJob?.cancel(); historyJob = null; refreshHistory(id)
                }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                if (closed || deny(e)) return@launch
                mutable.update { it.copy(completingId = null, uncertainId = id,
                    actionMessage = "Chưa xác nhận được kết quả SOS $id. ${message(e)} Đọc lại chi tiết để đối chiếu trước khi thử lại.") }
                if (mutable.value.detailId == id) {
                    detailJob?.cancel(); detailJob = null; historyJob?.cancel(); historyJob = null
                    refreshDetail(id); refreshHistory(id)
                }
                refresh(SosFilter.ACTIVE); refresh(SosFilter.RESCUED)
            }
        }
    }
    private fun observeMissingActive(id: String) {
        if (mutable.value.active.loading) {
            activeMissingObservations.add(id)
        }

        // Preserve loading, error and loadedAt.
        // An unrelated SOS must still arrive through the pending read.
        changeList(SosFilter.ACTIVE) { resource ->
            resource.copy(data = resource.data?.filterNot { it.id == id })
        }
    }

    private fun removeActive(id: String) {
        listVersions[SosFilter.ACTIVE] = (listVersions[SosFilter.ACTIVE] ?: 0) + 1
        listJobs.remove(SosFilter.ACTIVE)?.cancel()
        changeList(SosFilter.ACTIVE) { it.copy(data = it.data?.filterNot { row -> row.id == id }, loading = false) }
    }
    private fun timestamp(value: String?): Long? =
        value?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }

    private fun recordTime(item: RescueSos): Long =
        timestamp(item.updatedAt)
            ?: timestamp(item.locationReceivedAt)
            ?: timestamp(item.createdAt)
            ?: Long.MIN_VALUE

    private fun locationTime(item: RescueSos): Long =
        timestamp(item.locationCapturedAt ?: item.createdAt)
            ?: Long.MIN_VALUE

    // The location and its timestamps must come from the same snapshot.
    // When record and location freshness differ, preserve each independently.
    private fun mergeRescuedItem(
        first: RescueSos,
        second: RescueSos
    ): RescueSos {
        val record = if (recordTime(second) >= recordTime(first)) {
            second
        } else {
            first
        }

        val position = when {
            first.location == null -> second
            second.location == null -> first
            locationTime(second) > locationTime(first) -> second
            locationTime(second) < locationTime(first) -> first
            else -> record
        }

        return record.copy(
            location = position.location,
            locationCapturedAt = position.locationCapturedAt,
            locationReceivedAt = position.locationReceivedAt
        )
    }

    private fun mergeRescued(
        rows: Iterable<RescueSos>,
        observations: Iterable<RescueSos>
    ): List<RescueSos> {
        val byId = linkedMapOf<String, RescueSos>()

        for (item in rows + observations) {
            val previous = byId[item.id]
            byId[item.id] = if (previous == null) {
                item
            } else {
                mergeRescuedItem(previous, item)
            }
        }

        // Backend newest: createdAt descending, invalid/missing = epoch 0,
        // then descending locale-aware ID comparison.
        return byId.values.sortedWith(Comparator { first, second ->
            val byCreatedAt = (timestamp(second.createdAt) ?: 0L)
                .compareTo(timestamp(first.createdAt) ?: 0L)

            if (byCreatedAt != 0) {
                byCreatedAt
            } else {
                val byIdLocale = idCollator.compare(second.id, first.id)
                if (byIdLocale != 0) byIdLocale
                else second.id.compareTo(first.id)
            }
        })
    }

    private fun observeCompleted(item: RescueSos) {
        completedIds.add(item.id)

        if (mutable.value.rescued.loading) {
            val previous = rescuedReadObservations[item.id]
            rescuedReadObservations[item.id] = if (previous == null) {
                item
            } else {
                mergeRescuedItem(previous, item)
            }
        }

        // Preserve loading/error state and any pending list request.
        changeList(SosFilter.ACTIVE) { resource ->
            resource.copy(data = resource.data?.filterNot {
                it.id == item.id
            })
        }

        // A single detail is not a complete list.
        changeList(SosFilter.RESCUED) { resource ->
            resource.copy(data = resource.data?.let { rows ->
                mergeRescued(rows, listOf(item))
            })
        }
    }

    // Used for a successful PATCH or confirmed timeout reconciliation.
    // Callers must refresh both lists after invalidating old requests.
    private fun applyCompleted(item: RescueSos) {
        completedIds.add(item.id); removeActive(item.id)
        listVersions[SosFilter.RESCUED] = (listVersions[SosFilter.RESCUED] ?: 0) + 1
        listJobs.remove(SosFilter.RESCUED)?.cancel()
        // One result is not a complete history list; only update a previously loaded cache.
        changeList(SosFilter.RESCUED) { it.copy(data = it.data?.let { rows ->
            mergeRescued(rows, listOf(item))
        }, loading = false) }
    }
    private fun changeList(filter: SosFilter, transform: (SosResource<List<RescueSos>>) -> SosResource<List<RescueSos>>) {
        mutable.update { if (filter == SosFilter.ACTIVE) it.copy(active = transform(it.active))
            else it.copy(rescued = transform(it.rescued)) }
    }
    private fun deny(error: Exception): Boolean {
        if ((error as? RescueSosFailure)?.accessDenied != true) return false
        close(); mutable.value = RescueSosState(accessError = error.message); return true
    }
    private fun message(error: Exception) = error.message ?: "Chưa thể cập nhật. Vui lòng thử lại."
    fun close() {
        closed = true; listJobs.values.forEach { it.cancel() }
        detailJob?.cancel(); historyJob?.cancel(); completionJob?.cancel()
        detailVersion++; historyVersion++; completedIds.clear()
        rescuedReadObservations.clear()
        activeMissingObservations.clear()
        mutable.value = RescueSosState()
    }
}
