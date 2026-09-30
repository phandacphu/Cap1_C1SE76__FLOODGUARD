import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleTestLogin = (role: "ADMIN" | "RESCUE_STAFF") => {
    login("mock-jwt-token-floodguard", {
      id: "usr-12345",
      fullName: role === "ADMIN" ? "Quản Trị Viên" : "Nhân Viên Cứu Hộ",
      email: `${role.toLowerCase()}@floodguard.local`,
      role: role,
    });
    navigate(role === "ADMIN" ? "/admin/dashboard" : "/rescue/dashboard");
  };

  return (
    <div
      style={{ padding: "40px", textAlign: "center", fontFamily: "sans-serif" }}
    >
      <h2>Hệ Thống Quản Trị & Cứu Hộ FLOODGUARD</h2>
      <p>Chọn vai trò để kiểm thử bảo vệ tuyến đường (Task CCF-40):</p>
      <div
        style={{
          display: "flex",
          gap: "16px",
          justifyContent: "center",
          marginTop: "20px",
        }}
      >
        <button
          onClick={() => handleTestLogin("RESCUE_STAFF")}
          style={{
            padding: "10px 20px",
            backgroundColor: "#0284c7",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Đăng nhập vai trò Rescue Staff
        </button>
        <button
          onClick={() => handleTestLogin("ADMIN")}
          style={{
            padding: "10px 20px",
            backgroundColor: "#b91c1c",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Đăng nhập vai trò Admin
        </button>
      </div>
    </div>
  );
};
