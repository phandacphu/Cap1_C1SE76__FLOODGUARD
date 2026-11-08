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
import { SosMonitoringScreen } from './pages/admin/sos/SosMonitoringScreen';
import { SosDetailScreen } from './pages/admin/sos/SosDetailScreen';
import { RescueDashboard } from './pages/rescue/RescueDashboard';
import { RescueSosList } from './pages/rescue/RescueSosList';
import { RescueSosDetail } from './pages/rescue/RescueSosDetail';
import { FloodMapView } from './pages/map/FloodMapView';

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
            <Route path="/admin/users" element={<UserManagementScreen />} />
            <Route path="/admin/flood-areas" element={<FloodAreaManagementScreen />} />
            <Route path="/admin/historical-map" element={<HistoricalMapScreen />} />
            <Route path="/admin/sos" element={<SosMonitoringScreen />} />
            <Route path="/admin/sos/:id" element={<SosDetailScreen />} />
          </Route>
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route element={<ProtectedRoute allowedRoles={['RESCUE_STAFF']} />}>
            <Route path="/rescue/dashboard" element={<RescueDashboard />} />
            <Route path="/rescue/sos" element={<RescueSosList />} />
            <Route path="/rescue/sos/:id" element={<RescueSosDetail />} />
          </Route>
          <Route path="/rescue" element={<Navigate to="/rescue/dashboard" replace />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;