package com.example.floodguard.core.notifications

import com.example.floodguard.data.local.AuthenticatedSessionSnapshot
import com.example.floodguard.data.local.SessionUser
import java.net.InetAddress
import java.util.UUID
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.HttpException

class FloodWarningPushRepositoryFactoryTest {
    private lateinit var server: MockWebServer

    @Before
    fun startServer() {
        server = MockWebServer()
        server.start(InetAddress.getByName("127.0.0.1"), 0)
    }

    @After
    fun stopServer() {
        server.shutdown()
    }

    private fun session(
        account: String,
        generation: Long
    ) = AuthenticatedSessionSnapshot(
        generation = generation,
        registrationId = UUID.randomUUID().toString(),
        user = SessionUser(id = account, role = "resident"),
        accessToken = "test-token-$account"
    )

    private fun baseUrl() =
        "http://127.0.0.1:${server.port}/"

    private fun detailResponse() = MockResponse()
        .setHeader("Content-Type", "application/json")
        .setBody(
            """
            {
              "success": true,
              "data": {
                "floodAlert": {
                  "id": "test-alert",
                  "schemaVersion": 2,
                  "title": "Bản tin kiểm thử",
                  "content": "Nội dung kiểm thử.",
                  "status": "active",
                  "scope": "all_published_zones",
                  "startAt": "2026-11-24T09:00:00.000Z",
                  "endAt": null,
                  "createdAt": "2026-11-24T09:00:00.000Z",
                  "updatedAt": "2026-11-24T09:00:00.000Z",
                  "revision": 1
                }
              }
            }
            """.trimIndent()
        )

    @Test
    fun oldRepositoryKeepsAccountAJwtAfterAccountBRepositoryExists() =
        runBlocking {
            val repositoryA = FloodWarningPushRepositoryFactory.create(
                session("a", 1), baseUrl()
            )
            val repositoryB = FloodWarningPushRepositoryFactory.create(
                session("b", 3), baseUrl()
            )

            server.enqueue(detailResponse())
            server.enqueue(detailResponse())

            assertTrue(repositoryB.getAlert("test-alert").isSuccess)
            assertTrue(repositoryA.getAlert("test-alert").isSuccess)

            val requestB = server.takeRequest()
            val requestA = server.takeRequest()

            assertEquals(
                "Bearer test-token-b",
                requestB.getHeader("Authorization")
            )
            assertEquals(
                "Bearer test-token-a",
                requestA.getHeader("Authorization")
            )
            assertEquals(
                "/api/flood-alerts/test-alert",
                requestA.path
            )
        }

    @Test
    fun unauthorizedDoesNotRetryOrSwitchAccount() = runBlocking {
        val repository = FloodWarningPushRepositoryFactory.create(
            session("a", 1), baseUrl()
        )

        server.enqueue(
            MockResponse()
                .setResponseCode(401)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"success":false,"code":"UNAUTHORIZED"}""")
        )

        val result = repository.getAlert("test-alert")
        val error = result.exceptionOrNull()

        assertTrue(error is HttpException)
        assertEquals(401, (error as HttpException).code())
        assertEquals(1, server.requestCount)

        assertEquals(
            "Bearer test-token-a",
            server.takeRequest().getHeader("Authorization")
        )
    }

    @Test
    fun activeListUsesApiPathWithoutDuplicatingApiPrefix() = runBlocking {
        val repository = FloodWarningPushRepositoryFactory.create(
            session("a", 1), baseUrl()
        )

        server.enqueue(
            MockResponse()
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """
                    {
                      "success": true,
                      "data": {
                        "schemaVersion": 2,
                        "floodAlerts": []
                      }
                    }
                    """.trimIndent()
                )
        )

        assertTrue(repository.getActiveAlerts().isSuccess)

        val request = server.takeRequest()

        assertEquals("/api/flood-alerts/active", request.path)
        assertEquals(
            "Bearer test-token-a",
            request.getHeader("Authorization")
        )
    }
}