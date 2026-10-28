import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { homePathForRole } from './api/authApi';
import { Login } from './pages/Login';
import { Unauthorized } from './pages/Unauthorized';
import { AdminDashboard } from './pages/admin/AdminDashboard';
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

          {/* Admin Routes */}
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />

          {/* Rescue Routes */}
          <Route
            path="/rescue/dashboard"
            element={
              <ProtectedRoute allowedRoles={['RESCUE_STAFF']}>
                <RescueDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/rescue" element={<Navigate to="/rescue/dashboard" replace />} />
          <Route
            path="/rescue/sos"
            element={
              <ProtectedRoute allowedRoles={['RESCUE_STAFF']}>
                <RescueSosList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rescue/sos/:id"
            element={
              <ProtectedRoute allowedRoles={['RESCUE_STAFF']}>
                <RescueSosDetail />
              </ProtectedRoute>
            }
          />

          {/* Web Map - RBAC ADMIN & RESCUE_STAFF */}
          <Route
            path="/map"
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'RESCUE_STAFF']}>
                <FloodMapView />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
