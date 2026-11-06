package com.example.floodguard.debug

import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.example.floodguard.data.model.*
import com.example.floodguard.data.remote.api.*
import com.example.floodguard.data.repository.*
import com.example.floodguard.ui.navigation.AppRoutes
import com.example.floodguard.ui.screens.map.FloodMapRoute
import com.example.floodguard.ui.screens.map.FloodMapViewModel
import com.example.floodguard.ui.screens.safe_location.SafeLocationDetailScreen
import com.example.floodguard.ui.screens.safe_location.SafeLocationDetailViewModel
import com.example.floodguard.ui.theme.FloodGuardTheme
import com.google.gson.Gson
import retrofit2.Response

class CitizenMapFixtureActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val fixtureApi = CitizenMapFixtureApi()
        val shelterRepository = SafeLocationRepository(fixtureApi)

        setContent {
            FloodGuardTheme {
                val navController = rememberNavController()

                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color(0xFF06111F))
                        .systemBarsPadding()
                ) {
                    Text(
                        text = "KIỂM THỬ CÔ LẬP — DỮ LIỆU MẪU",
                        color = Color(0xFFFFC107),
                        fontSize = 12.sp,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(10.dp)
                    )

                    NavHost(
                        navController = navController,
                        startDestination = AppRoutes.MAP,
                        modifier = Modifier.weight(1f)
                    ) {
                        composable(AppRoutes.MAP) { entry ->
                            val mapVm: FloodMapViewModel = viewModel(
                                viewModelStoreOwner = entry
                            ) {
                                FloodMapViewModel(
                                    floodAreaRepository =
                                        FloodAreaRepository(fixtureApi),
                                    floodAlertRepository =
                                        FloodAlertRepository(fixtureApi),
                                    safeLocationRepository =
                                        shelterRepository,
                                    floodHistoryRepository =
                                        FloodHistoryRepository(fixtureApi)
                                ).apply {
                                    // Giữ camera ở vùng chứa dữ liệu kiểm thử.
                                    toggleUserLayer()
                                }
                            }

                            FloodMapRoute(
                                viewModel = mapVm,
                                onBack = { finish() },
                                onShelterDetailClick = { id ->
                                    navController.navigate(
                                        "${AppRoutes.SAFE_LOCATION_DETAIL}/" +
                                                Uri.encode(id)
                                    )
                                },
                                onSosClick = { showFixtureMessage() },
                                onBottomNavigate = { route ->
                                    if (route != AppRoutes.MAP) {
                                        showFixtureMessage()
                                    }
                                }
                            )
                        }

                        composable(
                            "${AppRoutes.SAFE_LOCATION_DETAIL}/{locationId}"
                        ) { entry ->
                            val id = entry.arguments
                                ?.getString("locationId")
                                .orEmpty()

                            val detailVm: SafeLocationDetailViewModel =
                                viewModel(
                                    viewModelStoreOwner = entry
                                ) {
                                    SafeLocationDetailViewModel(
                                        repository = shelterRepository
                                    )
                                }

                            LaunchedEffect(id) {
                                detailVm.loadLocation(id)
                            }

                            val detailState by detailVm.uiState
                                .collectAsStateWithLifecycle()

                            Column(
                                modifier = Modifier.fillMaxSize()
                            ) {
                                Text(
                                    text = "ID yêu cầu: $id\n" +
                                            "ID tải được: ${
                                                detailState.location?.id
                                                    ?: "Đang tải hoặc chưa tìm thấy"
                                            }",
                                    color = Color.White,
                                    fontSize = 12.sp,
                                    modifier = Modifier.padding(10.dp)
                                )

                                Box(
                                    modifier = Modifier.weight(1f)
                                ) {
                                    SafeLocationDetailScreen(
                                        viewModel = detailVm,
                                        onBack = {
                                            navController.popBackStack()
                                        },
                                        onDirections = {
                                            showFixtureMessage()
                                        },
                                        onContactClick = {
                                            showFixtureMessage()
                                        },
                                        onBottomNavigate = { route ->
                                            if (route == AppRoutes.MAP) {
                                                navController.popBackStack(
                                                    AppRoutes.MAP,
                                                    false
                                                )
                                            } else {
                                                showFixtureMessage()
                                            }
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private fun showFixtureMessage() {
        Toast.makeText(
            this,
            "Màn kiểm thử chỉ hỗ trợ bản đồ và chi tiết điểm tránh trú.",
            Toast.LENGTH_SHORT
        ).show()
    }
}

private class CitizenMapFixtureApi :
    FloodAreaApi,
    FloodAlertApi,
    SafeLocationApi,
    FloodHistoryApi {

    override suspend fun getFloodAreas(): Response<FloodAreasResponse> =
        fixtureResponse(
            FIXTURE_AREAS_JSON,
            FloodAreasResponse::class.java
        )

    override suspend fun getFloodAlerts(): Response<FloodAlertsResponse> =
        emptyAlerts()

    override suspend fun getActiveFloodAlerts():
            Response<FloodAlertsResponse> = emptyAlerts()

    private fun emptyAlerts(): Response<FloodAlertsResponse> =
        fixtureResponse(
            """{"success":true,"message":"fixture","data":{"floodAlerts":[]}}""",
            FloodAlertsResponse::class.java
        )

    override suspend fun getSafeLocations():
            Response<SafeLocationsResponse> =
        fixtureResponse(
            FIXTURE_SHELTERS_JSON,
            SafeLocationsResponse::class.java
        )

    override suspend fun getNearbySafeLocations(
        latitude: Double,
        longitude: Double,
        radiusKm: Double,
        type: String?
    ): Response<SafeLocationsResponse> = getSafeLocations()

    override suspend fun getPoints(): Response<FloodHistoryResponse> =
        historyResponse("points", FIXTURE_HISTORY_FEATURES)

    override suspend fun getBuffers(): Response<FloodHistoryResponse> =
        historyResponse("buffers")

    override suspend fun getRadar(): Response<FloodHistoryResponse> =
        historyResponse("radar", FIXTURE_RADAR_FEATURES)

    private fun historyResponse(
        layer: String,
        features: String = "[]"
    ): Response<FloodHistoryResponse> {
        return fixtureResponse(
            """
            {
              "success":true,
              "message":"fixture",
              "data":{
                "layer":"$layer",
                "geojson":{
                  "type":"FeatureCollection",
                  "features":$features
                }
              }
            }
            """.trimIndent(),
            FloodHistoryResponse::class.java
        )
    }
}

private fun <T> fixtureResponse(
    json: String,
    type: Class<T>
): Response<T> =
    Response.success(Gson().fromJson(json, type))

private const val FIXTURE_AREAS_JSON = """
{
  "success":true,
  "message":"Isolated debug fixture",
  "data":{
    "floodAreas":[
      {
        "id":"FIXTURE-FLOOD-1",
        "name":"Vùng ngập kiểm thử",
        "description":"Dữ liệu kiểm thử cô lập",
        "source":"Isolated debug fixture",
        "areaType":"flood",
        "geometry":{
          "type":"polygon",
          "points":[
            {"latitude":16.04,"longitude":108.18},
            {"latitude":16.04,"longitude":108.195},
            {"latitude":16.05,"longitude":108.195},
            {"latitude":16.05,"longitude":108.18}
          ]
        }
      },
      {
        "id":"FIXTURE-LOW-LYING-1",
        "name":"Vùng trũng kiểm thử",
        "description":"Dữ liệu kiểm thử cô lập",
        "source":"Isolated debug fixture",
        "areaType":"low_lying",
        "geometry":{
          "type":"polygon",
          "points":[
            {"latitude":16.04,"longitude":108.21},
            {"latitude":16.04,"longitude":108.225},
            {"latitude":16.05,"longitude":108.225},
            {"latitude":16.05,"longitude":108.21}
          ]
        }
      }
    ]
  }
}
"""

private const val FIXTURE_SHELTERS_JSON = """
{
  "success":true,
  "message":"Isolated debug fixture",
  "data":{
    "safeLocations":[
      {
        "id":"FIXTURE-SHELTER-A",
        "name":"Điểm kiểm thử A",
        "address":"Địa chỉ kiểm thử A",
        "description":"CHỈ DÙNG KIỂM THỬ CÔ LẬP",
        "location":{"latitude":16.0544,"longitude":108.2022},
        "type":"shelter",
        "capacity":10,
        "status":"active",
        "services":[]
      },
      {
        "id":"FIXTURE-SHELTER-B",
        "name":"Điểm kiểm thử B",
        "address":"Địa chỉ kiểm thử B",
        "description":"CHỈ DÙNG KIỂM THỬ CÔ LẬP",
        "location":{"latitude":16.066,"longitude":108.215},
        "type":"shelter",
        "capacity":20,
        "status":"active",
        "services":[]
      }
    ]
  }
}
"""

private const val FIXTURE_HISTORY_FEATURES = """
[
  {
    "type":"Feature",
    "properties":{
      "id":"HIST-FIXTURE-1",
      "name":"Ngập lịch sử kiểm thử",
      "data_period":"KIỂM THỬ",
      "coordinate_status":"landmark_reference"
    },
    "geometry":{
      "type":"Point",
      "coordinates":[108.19,16.07]
    }
  }
]
"""

private const val FIXTURE_RADAR_FEATURES = """
[
  {
    "type": "Feature",
    "properties": {},
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [[108.18,16.055],[108.195,16.055],[108.195,16.065],[108.18,16.065],[108.18,16.055]],
        [[108.184,16.058],[108.190,16.058],[108.190,16.062],[108.184,16.062],[108.184,16.058]]
      ]
    }
  }
]
"""