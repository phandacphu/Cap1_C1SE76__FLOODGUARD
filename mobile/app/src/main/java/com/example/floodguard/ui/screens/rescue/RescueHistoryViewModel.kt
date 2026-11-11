package com.example.floodguard.ui.screens.rescue

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.floodguard.core.config.AppConfig
import com.google.gson.JsonObject
import com.google.android.gms.maps.model.LatLng
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.GET
import retrofit2.http.Path
import java.util.concurrent.TimeUnit

internal interface RescueHistoryApi {
    @GET("api/flood-history/{layer}")
    suspend fun load(@Path("layer") layer: String): JsonObject
}

internal data class RescueHistoryMapPolygon(
    val outer: List<LatLng>,
    val holes: List<List<LatLng>>
)

internal data class RescueHistoryLayerState(
    val points: List<LatLng> = emptyList(),
    val polygons: List<RescueHistoryMapPolygon> = emptyList(),
    val loading: Boolean = true,
    val error: Boolean = false
)

internal class RescueHistoryViewModel : ViewModel() {
    private val api = Retrofit.Builder()
        .baseUrl(AppConfig.BASE_URL)
        .client(OkHttpClient.Builder().connectTimeout(60, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS).build())
        .addConverterFactory(GsonConverterFactory.create())
        .build().create(RescueHistoryApi::class.java)

    private val mutableLayers = MutableStateFlow(
        listOf("points", "areas", "buffers", "radar").associateWith { RescueHistoryLayerState() }
    )
    val layers = mutableLayers.asStateFlow()
    private val jobs = mutableMapOf<String, Job>()

    init { refresh() }

    fun refresh() {
        listOf("points", "areas", "buffers", "radar").forEach { layer ->
            jobs[layer]?.cancel()
            // Keep the previous successful layer visible while refreshing.
            mutableLayers.update { it + (layer to it.getValue(layer).copy(loading = true, error = false)) }
            jobs[layer] = viewModelScope.launch {
                try {
                    val response = api.load(layer)
                    val preparedLayer = withContext(Dispatchers.Default) {
                        require(response.get("success")?.asBoolean == true)
                        val data = response.getAsJsonObject("data") ?: error("Missing data")
                        require(data.get("layer")?.asString == layer)
                        val geometry = parseRescueHistoryLayer(
                            data.getAsJsonObject("geojson") ?: error("Missing GeoJSON"), layer)
                        // Prepare SDK coordinates once, off the UI thread. Store only
                        // the prepared data; recomposition and tab restoration reuse it.
                        RescueHistoryLayerState(
                            points = geometry.points.map { LatLng(it.latitude, it.longitude) },
                            polygons = geometry.polygons.map { polygon ->
                                RescueHistoryMapPolygon(
                                    outer = polygon.outer.map { LatLng(it.latitude, it.longitude) },
                                    holes = polygon.holes.map { ring ->
                                        ring.map { LatLng(it.latitude, it.longitude) }
                                    }
                                )
                            },
                            loading = false
                        )
                    }
                    mutableLayers.update {
                        it + (layer to preparedLayer)
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (_: Exception) {
                    mutableLayers.update {
                        it + (layer to it.getValue(layer).copy(loading = false, error = true))
                    }
                }
            }
        }
    }
}
