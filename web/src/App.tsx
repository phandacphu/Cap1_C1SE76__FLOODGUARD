import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Login } from './pages/Login';
import { Unauthorized } from './pages/Unauthorized';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { RescueDashboard } from './pages/rescue/RescueDashboard';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Mở trực tiếp màn hình Rescue Dashboard không cần Login */}
          <Route path="/" element={<RescueDashboard />} />
          <Route path="/rescue/dashboard" element={<RescueDashboard />} />

          {/* Các tuyến đường dự án khác */}
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />

          {/* Điều hướng mặc định */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}; 

export default App;