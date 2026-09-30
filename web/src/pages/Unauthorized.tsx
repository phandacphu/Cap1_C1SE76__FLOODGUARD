import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const Unauthorized: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleReturn = () => {
    if (user?.role === 'ADMIN') {
      navigate('/admin/dashboard', { replace: true });
    } else if (user?.role === 'RESCUE_STAFF') {
      navigate('/rescue/dashboard', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  };

  return (
    <div style={{ textAlign: 'center', marginTop: '100px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '50px', color: '#dc2626' }}>403</h1>
      <h2>Không có quyền truy cập</h2>
      <p>Tài khoản của bạn ({user?.role}) không có quyền truy cập vào đường dẫn này.</p>
      <button 
        onClick={handleReturn}
        style={{ padding: '8px 16px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
      >
        Quay lại Bảng điều khiển
      </button>
    </div>
  );
};