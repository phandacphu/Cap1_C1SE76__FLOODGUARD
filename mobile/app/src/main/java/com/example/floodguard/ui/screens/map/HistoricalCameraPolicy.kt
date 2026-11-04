
package com.example.floodguard.ui.screens.map

internal fun areHistoricalLayersSettled(
    state: FloodMapUiState
): Boolean {

    fun finished(status: HistoricalLoadStatus): Boolean {
        return status == HistoricalLoadStatus.SUCCESS ||
                status == HistoricalLoadStatus.FAILED
    }

    return (
            !state.isHistoryPointsLayerEnabled ||
                    finished(state.historyPointsLoadStatus)
            ) && (
            !state.isHistoryBuffersLayerEnabled ||
                    finished(state.historyBuffersLoadStatus)
            ) && (
            !state.isHistoryRadarLayerEnabled ||
                    finished(state.historyRadarLoadStatus)
            )
}

internal fun shouldAutoFitHistoricalCamera(
    state: FloodMapUiState,
    isMapLoaded: Boolean,
    hasFittedHistoryBounds: Boolean,
    hasUserInteractedWithMap: Boolean
): Boolean {
    return isMapLoaded &&
            !hasFittedHistoryBounds &&
            !hasUserInteractedWithMap &&
            areHistoricalLayersSettled(state)
}
