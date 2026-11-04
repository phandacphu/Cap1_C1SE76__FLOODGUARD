
package com.example.floodguard.ui.screens.map

import org.junit.Assert.*
import org.junit.Test

class HistoricalCameraPolicyTest {

    private fun readyState() = FloodMapUiState(
        historyPointsLoadStatus = HistoricalLoadStatus.SUCCESS,
        historyBuffersLoadStatus = HistoricalLoadStatus.SUCCESS,
        historyRadarLoadStatus = HistoricalLoadStatus.SUCCESS
    )

    @Test
    fun successWithEmptyData_isSettled() {
        val state = readyState()

        assertTrue(state.historyPoints.isEmpty())
        assertTrue(state.historyBufferPolygons.isEmpty())
        assertTrue(state.historyRadarPolygons.isEmpty())
        assertTrue(areHistoricalLayersSettled(state))
    }

    @Test
    fun oneLayerFailed_doesNotBlockRemainingLayers() {
        val state = readyState().copy(
            historyRadarLoadStatus = HistoricalLoadStatus.FAILED
        )

        assertTrue(areHistoricalLayersSettled(state))
    }

    @Test
    fun loadingLayer_blocksInitialFit() {
        val state = readyState().copy(
            historyRadarLoadStatus = HistoricalLoadStatus.LOADING
        )

        assertFalse(areHistoricalLayersSettled(state))
    }

    @Test
    fun retrySuccess_becomesSettledAgain() {
        val failed = readyState().copy(
            historyRadarLoadStatus = HistoricalLoadStatus.FAILED
        )

        val retrying = failed.copy(
            historyRadarLoadStatus = HistoricalLoadStatus.LOADING
        )

        val succeeded = retrying.copy(
            historyRadarLoadStatus = HistoricalLoadStatus.SUCCESS
        )

        assertTrue(areHistoricalLayersSettled(failed))
        assertFalse(areHistoricalLayersSettled(retrying))
        assertTrue(areHistoricalLayersSettled(succeeded))
    }

    @Test
    fun userInteracted_preventsAutomaticFit() {
        assertFalse(
            shouldAutoFitHistoricalCamera(
                state = readyState(),
                isMapLoaded = true,
                hasFittedHistoryBounds = false,
                hasUserInteractedWithMap = true
            )
        )
    }

    @Test
    fun mapNotLoaded_preventsAutomaticFit() {
        assertFalse(
            shouldAutoFitHistoricalCamera(
                state = readyState(),
                isMapLoaded = false,
                hasFittedHistoryBounds = false,
                hasUserInteractedWithMap = false
            )
        )
    }

    @Test
    fun alreadyFitted_preventsRepeatedAutomaticFit() {
        assertFalse(
            shouldAutoFitHistoricalCamera(
                state = readyState(),
                isMapLoaded = true,
                hasFittedHistoryBounds = true,
                hasUserInteractedWithMap = false
            )
        )
    }

    @Test
    fun allLayersSettled_allowsInitialFit() {
        assertTrue(
            shouldAutoFitHistoricalCamera(
                state = readyState(),
                isMapLoaded = true,
                hasFittedHistoryBounds = false,
                hasUserInteractedWithMap = false
            )
        )
    }
}
