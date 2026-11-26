package com.example.floodguard.data.local

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE)
class SessionGenerationTest {

    private fun manager() =
        SessionManager(RuntimeEnvironment.getApplication())

    @Test
    fun reopeningSessionKeepsRegistration() = runBlocking {
        val session = manager()
        session.clearSession()

        assertTrue(
            session.saveAuthenticatedSession(
                token = "test-token-a",
                user = SessionUser(id = "account-a", role = "resident"),
                expectedGeneration = session.getGeneration()
            )
        )

        val first = requireNotNull(session.getSessionSnapshot())
        val reopened = requireNotNull(manager().getSessionSnapshot())

        assertEquals(first.registrationId, reopened.registrationId)
        assertEquals(first.generation, reopened.generation)
        assertTrue(session.isCurrentSession(first))
    }

    @Test
    fun lateLoginCannotRestoreLoggedOutSession() = runBlocking {
        val session = manager()
        session.clearSession()

        val requestGeneration = session.getGeneration()
        session.clearSession(expectedGeneration = requestGeneration)

        assertFalse(
            session.saveAuthenticatedSession(
                token = "late-token",
                user = SessionUser(id = "account-a", role = "resident"),
                expectedGeneration = requestGeneration
            )
        )
        assertFalse(session.isLoggedIn())
    }

    @Test
    fun oldLogoutCannotClearNewAccount() = runBlocking {
        val session = manager()
        session.clearSession()

        assertTrue(
            session.saveAuthenticatedSession(
                token = "test-token-a",
                user = SessionUser(id = "account-a", role = "resident"),
                expectedGeneration = session.getGeneration()
            )
        )
        val accountA = requireNotNull(session.getSessionSnapshot())

        assertTrue(
            session.saveAuthenticatedSession(
                token = "test-token-b",
                user = SessionUser(id = "account-b", role = "resident"),
                expectedGeneration = session.getGeneration()
            )
        )
        val accountB = requireNotNull(session.getSessionSnapshot())

        assertFalse(
            session.clearSession(
                expectedGeneration = accountA.generation
            )
        )
        assertFalse(session.isCurrentSession(accountA))
        assertTrue(session.isCurrentSession(accountB))
        assertNotEquals(accountA.registrationId, accountB.registrationId)
        assertEquals("account-b", session.getUser().id)
    }
}