import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { homePathForRole } from './api/authApi';
import { Login } from './pages/Login';
import { Unauthorized } from './pages/Unauthorized';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import FloodAreaManagementScreen from './pages/admin/flood-area/FloodAreaManagementScreen';
import HistoricalMapScreen from './pages/admin/flood-area/components/HistoricalMapScreen';
import UserManagementScreen from './pages/admin/user-management/UserManagementScreen';
import FloodWarningManagementScreen from './pages/admin/flood-warning/FloodWarningManagementScreen';
import { createFloodWarningDemo } from './pages/admin/flood-warning/floodWarningDemo';
import SafeLocationManagementScreen from './pages/admin/safe-location/SafeLocationManagementScreen';
import { createSafeLocationDemo } from './pages/admin/safe-location/safeLocationDemo';
import { RescueDashboard } from './pages/rescue/RescueDashboard';
import { RescueSosList } from './pages/rescue/RescueSosList';
import { RescueSosDetail } from './pages/rescue/RescueSosDetail';

// Demo sources are restricted to development until the real API adapters are connected.
const warningDemo = import.meta.env.DEV ? createFloodWarningDemo() : null;
const safeLocationDemo = import.meta.env.DEV ? createSafeLocationDemo() : null;

/** "/" sends a logged-in user to their dashboard and everybody else to the login page. */
const RootRedirect: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated && user ? homePathForRole(user.role) : '/login'} replace />;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<Unauthorized />} />

          {/* Only Rescue Staff may open the rescue screens */}
          <Route element={<ProtectedRoute allowedRoles={['RESCUE_STAFF']} />}>
            <Route path="/rescue/dashboard" element={<RescueDashboard />} />
            <Route path="/rescue/sos" element={<RescueSosList />} />
            <Route path="/rescue/sos/:id" element={<RescueSosDetail />} />
          </Route>

          {/* Only Admin may open the admin screens */}
          <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<UserManagementScreen />} />
            <Route path="/admin/flood-areas" element={<FloodAreaManagementScreen />} />
            {warningDemo && <Route path="/admin/flood-warnings" element={<FloodWarningManagementScreen source={warningDemo} />} />}
            {safeLocationDemo && <Route path="/admin/safe-locations" element={<SafeLocationManagementScreen source={safeLocationDemo} />} />}
            <Route path="/admin/historical-map" element={<HistoricalMapScreen />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;