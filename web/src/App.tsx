import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { homePathForRole } from './api/authApi';
import { Login } from './pages/Login';
import { Unauthorized } from './pages/Unauthorized';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import UserManagementScreen from './pages/admin/user-management/UserManagementScreen';
import { RescueDashboard } from './pages/rescue/RescueDashboard';
import { RescueSosList } from './pages/rescue/RescueSosList';
import { RescueSosDetail } from './pages/rescue/RescueSosDetail';

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
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;