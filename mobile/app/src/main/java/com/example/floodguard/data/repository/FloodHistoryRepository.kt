
package com.example.floodguard.data.repository

import com.example.floodguard.data.model.FloodHistoryResponse
import com.example.floodguard.data.remote.api.FloodHistoryApi
import com.google.gson.JsonObject
import kotlinx.coroutines.CancellationException
import retrofit2.Response

class FloodHistoryRepository(
    private val api: FloodHistoryApi
) {

    suspend fun getPoints(): Result<JsonObject> =
        fetchLayer("points") {
            api.getPoints()
        }

    suspend fun getBuffers(): Result<JsonObject> =
        fetchLayer("buffers") {
            api.getBuffers()
        }

    suspend fun getRadar(): Result<JsonObject> =
        fetchLayer("radar") {
            api.getRadar()
        }

    private suspend fun fetchLayer(
        expectedLayer: String,
        request: suspend () -> Response<FloodHistoryResponse>
    ): Result<JsonObject> {

        return try {
            val response = request()

            if (!response.isSuccessful) {
                return Result.failure(
                    Exception(
                        "Không thể tải $expectedLayer. " +
                                "HTTP ${response.code()}"
                    )
                )
            }

            val body = response.body()
            val data = body?.data
            val geojson = data?.geojson

            if (
                body?.success != true ||
                data?.layer != expectedLayer ||
                geojson == null ||
                geojson.get("type")?.asString !=
                "FeatureCollection" ||
                geojson.get("features")?.isJsonArray != true
            ) {
                return Result.failure(
                    Exception(
                        "Dữ liệu bản đồ ngập lịch sử " +
                                "không hợp lệ."
                    )
                )
            }

            Result.success(geojson)

        } catch (e: CancellationException) {
            throw e

        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
