package com.example.floodguard.data.repository

import com.example.floodguard.data.remote.api.RescueRequestApi
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class SosHistoryResponseValidationTest {
    private lateinit var server: MockWebServer
    private lateinit var repository: RescueRequestRepository

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()

        val retrofit = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        repository = RescueRequestRepository(
            retrofit.create(RescueRequestApi::class.java)
        )
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun malformedHistory_isRejected() = runBlocking {
        val invalidBodies = listOf(
            """{"success":true,"data":null}""",
            """{"success":true,"data":{}}""",
            """{"success":true,"data":{"rescueRequests":null}}""",
            """{"success":true,"data":{"rescueRequests":[null]}}""",
            """{"success":true,"data":{"rescueRequests":[{}]}}""",
            """{"success":true,"data":{"rescueRequests":[{"id":" "}]}}""",
            """{"success":true,"data":{"rescueRequests":{}}}"""
        )

        for (body in invalidBodies) {
            server.enqueue(
                MockResponse().setResponseCode(200).setBody(body)
            )
            assertTrue(
                "Phải từ chối: $body",
                repository.getRescueRequests().isFailure
            )
        }
    }

    @Test
    fun explicitEmptyHistory_isValid() = runBlocking {
        server.enqueue(
            MockResponse().setBody(
                """{"success":true,"data":{"rescueRequests":[]}}"""
            )
        )

        val result = repository.getRescueRequests()

        assertTrue(result.isSuccess)
        assertTrue(result.getOrThrow().isEmpty())
    }

    @Test
    fun validHistory_keepsExactId() = runBlocking {
        server.enqueue(
            MockResponse().setBody(
                """
                {
                  "success":true,
                  "data":{
                    "rescueRequests":[
                      {"id":"SOS-B","numberOfPeople":5}
                    ]
                  }
                }
                """.trimIndent()
            )
        )

        val requests = repository.getRescueRequests().getOrThrow()

        assertEquals("SOS-B", requests.single().id)
        assertEquals(5, requests.single().numberOfPeople)
    }
}