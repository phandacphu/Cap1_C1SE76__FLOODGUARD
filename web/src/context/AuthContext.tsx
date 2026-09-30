/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState } from "react";
import type { User, AuthContextType } from "../types/auth";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // Khởi tạo state trực tiếp từ localStorage để tránh cascading renders trong useEffect
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem("floodguard_token");
  });

  const [user, setUser] = useState<User | null>(() => {
    const storedUser = localStorage.getItem("floodguard_user");
    if (storedUser) {
      try {
        return JSON.parse(storedUser);
      } catch (err) {
        console.error("Lỗi khi đọc session từ localStorage:", err);
        localStorage.removeItem("floodguard_token");
        localStorage.removeItem("floodguard_user");
      }
    }
    return null;
  });

  // Khi khởi tạo đồng bộ từ localStorage thì không cần cờ chờ
  const isLoading = false;

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem("floodguard_token", newToken);
    localStorage.setItem("floodguard_user", JSON.stringify(newUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("floodguard_token");
    localStorage.removeItem("floodguard_user");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth phải được sử dụng bên trong AuthProvider");
  }
  return context;
};
