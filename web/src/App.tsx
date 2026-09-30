import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";

import { Login } from "./pages/Login";
import { Unauthorized } from "./pages/Unauthorized";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { RescueDashboard } from "./pages/rescue/RescueDashboard";

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<Unauthorized />} />

          {/* Tuyến đường chỉ dành cho RESCUE_STAFF */}
          <Route element={<ProtectedRoute allowedRoles={["RESCUE_STAFF"]} />}>
            <Route path="/rescue/dashboard" element={<RescueDashboard />} />
          </Route>

          {/* Tuyến đường chỉ dành cho ADMIN */}
          <Route element={<ProtectedRoute allowedRoles={["ADMIN"]} />}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
          </Route>

          {/* Mặc định điều hướng về login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
