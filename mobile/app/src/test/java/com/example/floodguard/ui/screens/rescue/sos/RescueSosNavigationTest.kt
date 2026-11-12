package com.example.floodguard.ui.screens.rescue.sos
import com.example.floodguard.ui.navigation.*
import org.junit.Assert.*
import org.junit.Test
class RescueSosNavigationTest {
    @Test fun rescueListAndDetailStayInsideRoleGuard() {
        assertTrue(isRescueRoute(AppRoutes.RESCUE_SOS))
        assertTrue(isRescueRoute("${AppRoutes.RESCUE_SOS_DETAIL}/{requestId}"))
        assertTrue(isRescueRoute("${AppRoutes.RESCUE_SOS_DETAIL}/A"))
    }
    @Test fun residentRoutesAndLookalikesAreRejected() {
        assertFalse(isRescueRoute(AppRoutes.SEND_SOS)); assertFalse(isRescueRoute(AppRoutes.SOS_STATUS))
        assertFalse(isRescueRoute("rescue_sos_detail_fake/A")); assertFalse(isRescueRoute(null))
    }
    @Test fun roleHomesAreUnchanged() {
        assertEquals(AppRoutes.RESCUE_HOME, homeRouteForRole("rescue"))
        assertEquals(AppRoutes.HOME, homeRouteForRole("resident"))
        assertEquals(AppRoutes.ACCESS_DENIED, homeRouteForRole("admin"))
        assertEquals(AppRoutes.ACCESS_DENIED, homeRouteForRole(null))
    }
}
