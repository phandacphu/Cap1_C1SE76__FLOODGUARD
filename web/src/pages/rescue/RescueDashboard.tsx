import React from 'react';
import { useAuth } from '../../context/AuthContext';

export const RescueDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>
      <h1>Bảng Điều Khiển Cứu Hộ (Rescue Dashboard)</h1>
      <p>Xin chào: <strong>{user?.fullName}</strong> - Vai trò: <strong>{user?.role}</strong></p>
      <button onClick={logout} style={{ padding: '6px 12px', cursor: 'pointer' }}>Đăng xuất</button>
    </div>
  );
};