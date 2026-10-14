package com.example.floodguard.data.repository

import com.example.floodguard.data.model.FloodAlertDto
import com.example.floodguard.data.remote.api.FloodAlertApi

class FloodAlertRepository(
    private val floodAlertApi: FloodAlertApi
) {

    suspend fun getFloodAlerts(): Result<List<FloodAlertDto>> {

        return try {

            val response =
                floodAlertApi.getFloodAlerts()

            if (response.isSuccessful) {

                val body = response.body()

                if (
                    body != null &&
                    body.success
                ) {

                    Result.success(
                        body.data.floodAlerts
                    )

                } else {

                    Result.failure(
                        Exception(
                            body?.message
                                ?: "Không thể tải danh sách cảnh báo"
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

        } catch (e: Exception) {

            Result.failure(e)
        }
    }
}