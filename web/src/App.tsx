import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Unauthorized from './pages/Unauthorized';
import RescueDashboard from './pages/rescue/RescueDashboard';
import RescueSosListPage from './pages/rescue/RescueSosListPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/unauthorized" element={<Unauthorized />} />

        {/* 2 màn hình tách biệt theo đúng kiến trúc của Huy */}
        <Route path="/rescue" element={<RescueDashboard />} />
        <Route path="/rescue/sos" element={<RescueSosListPage />} />

        <Route path="*" element={<Navigate to="/rescue" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
