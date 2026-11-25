import { RescueHistory } from './pages/rescue/history/RescueHistory';
import { RescueSafeLocations } from './pages/rescue/safe-locations/RescueSafeLocations';
import React from 'react';
import { RescueWarningProvider } from './pages/rescue/warnings/WarningContext';
import { RescueWarnings } from './pages/rescue/warnings/RescueWarnings';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { homePathForRole } from './api/authApi';
import { Login } from './pages/Login';
import { Unauthorized } from './pages/Unauthorized';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminProfile } from './pages/admin/profile/AdminProfile';
import FloodAreaManagementScreen from './pages/admin/flood-area/FloodAreaManagementScreen';
import HistoricalMapScreen from './pages/admin/flood-area/components/HistoricalMapScreen';
import UserManagementScreen from './pages/admin/user-management/UserManagementScreen';
import FloodWarningManagementScreen from './pages/admin/flood-warning/FloodWarningManagementScreen';
import { floodWarningApi } from './pages/admin/flood-warning/floodWarningApi';
import { createFloodWarningDemo } from './pages/admin/flood-warning/floodWarningDemo';
import SafeLocationManagementScreen from './pages/admin/safe-location/SafeLocationManagementScreen';
import { safeLocationApi } from './pages/admin/safe-location/safeLocationApi';
import { SosMonitoringScreen } from './pages/admin/sos/SosMonitoringScreen';
import { SosDetailScreen } from './pages/admin/sos/SosDetailScreen';
import RescueStaffUiScreen from './pages/admin/rescue-staff/RescueStaffUiScreen';
import AdminNotificationsUiScreen from './pages/admin/notifications/AdminNotificationsUiScreen';
import AdminReportsUiScreen from './pages/admin/reports/AdminReportsUiScreen';
import AdminSettingsUiScreen from './pages/admin/settings/AdminSettingsUiScreen';
import { RescueDashboard } from './pages/rescue/RescueDashboard';
import { RescueProfile } from './pages/rescue/profile/RescueProfile';
import { RescueSosList } from './pages/rescue/RescueSosList';
import { RescueSosDetail } from './pages/rescue/RescueSosDetail';
import { FloodMapView } from './pages/map/FloodMapView';

// Development-only, opt-in, stable for the lifetime of this loaded module.
// No API fallback: a demo failure remains a demo failure.
const warningSource = import.meta.env.DEV && import.meta.env.VITE_ADMIN_FLOOD_WARNING_MOCK === 'true'
  ? createFloodWarningDemo()
  : floodWarningApi;

/** "/" sends a logged-in user to their dashboard and everybody else to the login page. */
const RootRedirect: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated && user ? homePathForRole(user.role) : '/login'} replace />;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RescueWarningProvider>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<Unauthorized />} />

          {/* Web Map Routes */}
          <Route
            path="/map"
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'RESCUE_STAFF']}>
                <FloodMapView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/map"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <FloodMapView />
              </ProtectedRoute>
            }
          />

          <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/profile" element={<AdminProfile />} />
            <Route path="/admin/users" element={<UserManagementScreen />} />
            <Route path="/admin/flood-areas" element={<FloodAreaManagementScreen />} />
            <Route path="/admin/flood-warnings" element={<FloodWarningManagementScreen source={warningSource} />} />
            <Route path="/admin/safe-locations" element={<SafeLocationManagementScreen source={safeLocationApi} />} />
            <Route path="/admin/historical-map" element={<HistoricalMapScreen />} />
            <Route path="/admin/sos" element={<SosMonitoringScreen />} />
            <Route path="/admin/sos/:id" element={<SosDetailScreen />} />
            <Route path="/admin/rescue-staff" element={<RescueStaffUiScreen />} />
            <Route path="/admin/notifications" element={<AdminNotificationsUiScreen />} />
            <Route path="/admin/reports" element={<AdminReportsUiScreen />} />
            <Route path="/admin/settings" element={<AdminSettingsUiScreen />} />
          </Route>
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route element={<ProtectedRoute allowedRoles={['RESCUE_STAFF']} />}>
            <Route path="/rescue/safe-locations" element={<RescueSafeLocations />} />
            <Route path="/rescue/flood-warnings" element={<RescueWarnings />} />
            <Route path="/rescue/flood-warnings/:id" element={<RescueWarnings />} />
            <Route path="/rescue/dashboard" element={<RescueDashboard />} />
            <Route path="/rescue/profile" element={<RescueProfile />} />
            <Route path="/rescue/sos" element={<RescueSosList />} />
            <Route path="/rescue/history" element={<RescueHistory />} />
            <Route path="/rescue/sos/:id" element={<RescueSosDetail />} />
          </Route>
          <Route path="/rescue" element={<Navigate to="/rescue/dashboard" replace />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </RescueWarningProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
