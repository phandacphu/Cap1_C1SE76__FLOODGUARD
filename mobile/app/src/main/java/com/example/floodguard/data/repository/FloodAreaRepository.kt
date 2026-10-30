package com.example.floodguard.data.repository

import com.example.floodguard.data.model.FloodAreaDto
import com.example.floodguard.data.remote.api.FloodAreaApi
import kotlinx.coroutines.CancellationException

class FloodAreaRepository(
    private val floodAreaApi: FloodAreaApi
) {

    suspend fun getFloodAreas(): Result<List<FloodAreaDto>> {

        return try {

            val response =
                floodAreaApi.getFloodAreas()

            if (response.isSuccessful) {

                val body = response.body()

                if (
                    body != null &&
                    body.success
                ) {

                    Result.success(
                        body.data.floodAreas
                    )

                } else {

                    Result.failure(
                        Exception(
                            body?.message
                                ?: "Không thể lấy dữ liệu vùng ngập"
                        )
                    )
                }

            } else {

                Result.failure(
                    Exception(
                        "HTTP ${response.code()}"
                    )
                )
            }

        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}