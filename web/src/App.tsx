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

          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          {/* Rescue Routes của Huy */}
          <Route
            path="/rescue"
            element={
              <ProtectedRoute allowedRoles={['RESCUE_STAFF']}>
                <RescueDashboard />
              </ProtectedRoute>
            }
          />
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

          {/* Web Map - CCF-56 & CCF-57 của Khoa */}
          <Route path="/map" element={<FloodMapView />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
