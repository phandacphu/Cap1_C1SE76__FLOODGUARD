package com.example.floodguard.ui.screens.sos

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.produceState
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import com.example.floodguard.core.network.ApiClient
import com.example.floodguard.data.local.SessionManager
import com.example.floodguard.data.remote.api.ResidentSosApi
import com.example.floodguard.data.repository.ResidentSosRepository
import com.example.floodguard.data.repository.SosSmsCredentialCoordinator
import com.example.floodguard.data.repository.SosSmsCredentialState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

// Chỉ chứa trạng thái mạng và thông tin an toàn để hiển thị.
data class SosSmsPreparationState(
    val hasInternet: Boolean = false,
    val credentialState: SosSmsCredentialState =
        SosSmsCredentialState()
)

@Composable
fun rememberSosSmsPreparation(
    sessionManager: SessionManager
): State<SosSmsPreparationState> {
    val appContext = LocalContext.current.applicationContext
    val lifecycleOwner = LocalLifecycleOwner.current

    return produceState(
        initialValue = SosSmsPreparationState(),
        key1 = sessionManager,
        key2 = lifecycleOwner
    ) {
        try {
            sessionManager.sosSmsSessionFlow.collectLatest { key ->
                // Logout hoặc đổi phiên: bỏ trạng thái của phiên trước.
                value = SosSmsPreparationState()

                if (key == null) return@collectLatest

                val token =
                    sessionManager.getSosSmsAccessToken(key)

                if (token.isNullOrBlank()) return@collectLatest

                val repository = createSmsCredentialRepository(
                    sessionManager = sessionManager,
                    accessToken = token
                )

                val coordinator = SosSmsCredentialCoordinator(
                    sessionManager = sessionManager,
                    repository = repository,
                    sessionKey = key
                )

                coroutineScope {
                    launch {
                        coordinator.state.collect { credentialState ->
                            value = value.copy(
                                credentialState = credentialState
                            )
                        }
                    }

                    lifecycleOwner.lifecycle.repeatOnLifecycle(
                        Lifecycle.State.STARTED
                    ) {
                        launch {
                            observeSosSmsInternet(appContext)
                                .collectLatest { hasInternet ->
                                    value = value.copy(
                                        hasInternet = hasInternet
                                    )

                                    coordinator.refresh(hasInternet)
                                }
                        }

                        launch {
                            while (true) {
                                delay(60_000L)

                                coordinator.refresh(
                                    hasInternet = value.hasInternet
                                )
                            }
                        }
                    }
                }
            }
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            value = SosSmsPreparationState(
                credentialState = SosSmsCredentialState(
                    message = "Chưa theo dõi được trạng thái " +
                            "chuẩn bị SMS SOS. Hãy mở lại ứng dụng."
                )
            )
        }
    }
}

private fun createSmsCredentialRepository(
    sessionManager: SessionManager,
    accessToken: String
): ResidentSosRepository {
    // Giữ JWT của đúng phiên đã tạo bộ điều phối.
    // Không đọc JWT của một tài khoản mới giữa lúc request đang chạy.
    val client = OkHttpClient.Builder()
        .connectTimeout(60, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .retryOnConnectionFailure(false)
        .followRedirects(false)
        .followSslRedirects(false)
        .addInterceptor { chain ->
            val request = chain.request()
                .newBuilder()
                .header(
                    "Authorization",
                    "Bearer $accessToken"
                )
                .build()

            chain.proceed(request)
        }
        .build()

    val retrofit =
        ApiClient.createResidentSosRetrofit(sessionManager)
            .newBuilder()
            .client(client)
            .build()

    return ResidentSosRepository(
        api = retrofit.create(ResidentSosApi::class.java)
    )
}

private fun observeSosSmsInternet(context: Context) =
    callbackFlow {
        val connectivityManager =
            context.getSystemService(
                ConnectivityManager::class.java
            )

        val validatedNetworks = mutableSetOf<Network>()
        val lock = Any()

        // Khi offline, vẫn phát trạng thái để đọc mã đã lưu.
        trySend(false)

        val callback =
            object : ConnectivityManager.NetworkCallback() {
                override fun onCapabilitiesChanged(
                    network: Network,
                    capabilities: NetworkCapabilities
                ) {
                    val hasInternet =
                        capabilities.hasCapability(
                            NetworkCapabilities.NET_CAPABILITY_INTERNET
                        ) &&
                                capabilities.hasCapability(
                                    NetworkCapabilities.NET_CAPABILITY_VALIDATED
                                )

                    synchronized(lock) {
                        if (hasInternet) {
                            validatedNetworks.add(network)
                        } else {
                            validatedNetworks.remove(network)
                        }

                        trySend(validatedNetworks.isNotEmpty())
                    }
                }

                override fun onLost(network: Network) {
                    synchronized(lock) {
                        validatedNetworks.remove(network)

                        trySend(validatedNetworks.isNotEmpty())
                    }
                }
            }

        val request = NetworkRequest.Builder()
            .addCapability(
                NetworkCapabilities.NET_CAPABILITY_INTERNET
            )
            .build()

        connectivityManager.registerNetworkCallback(
            request,
            callback
        )

        awaitClose {
            connectivityManager.unregisterNetworkCallback(
                callback
            )
        }
    }.distinctUntilChanged()