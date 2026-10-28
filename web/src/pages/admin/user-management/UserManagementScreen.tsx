// File: web/src/pages/admin/user-management/UserManagementScreen.tsx

import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../../../context/AuthContext";

const BASE_URL = "https://floodguard-backend-demo.onrender.com/api";

export interface User {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: "resident" | "rescue" | "admin";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function UserManagementScreen() {
  const { user: currentUser, token } = useAuth();
  
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${BASE_URL}/admin/users`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) throw new Error("Token hết hạn hoặc không hợp lệ (401)");
      if (response.status === 403) throw new Error("Không có quyền truy cập (403)");
      if (!response.ok) throw new Error(`Lỗi hệ thống: ${response.status}`);

      const data = await response.json();
      if (data && data.users) {
        setUsers(data.users);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(String(err));
      }
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchUsers();
    }
  }, [token, fetchUsers]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        u.fullName?.toLowerCase().includes(search.toLowerCase()) ||
        u.email?.toLowerCase().includes(search.toLowerCase()) ||
        u.phone?.includes(search);
      const matchRole = roleFilter === "all" || u.role === roleFilter;
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && u.isActive) ||
        (statusFilter === "inactive" && !u.isActive);

      return matchSearch && matchRole && matchStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const handlePatchUser = async (userId: string, payload: Partial<User>) => {
    setActionLoadingId(userId);
    try {
      const response = await fetch(`${BASE_URL}/admin/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 403) {
        alert("Thất bại: Không có quyền hoặc bạn đang tự sửa chính mình (403).");
        return;
      }
      if (!response.ok) throw new Error("Cập nhật thất bại.");

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...payload } : u))
      );
      alert("Cập nhật thành công!");
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message);
      } else {
        alert(String(err));
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const confirmChangeRole = (user: User, newRole: "resident" | "rescue" | "admin") => {
    if (window.confirm(`Xác nhận đổi vai trò của ${user.fullName} thành ${newRole.toUpperCase()}?`)) {
      handlePatchUser(user.id, { role: newRole });
    }
  };

  const confirmToggleStatus = (user: User) => {
    const action = user.isActive ? "KHÓA" : "MỞ KHÓA";
    if (window.confirm(`Bạn có chắc chắn muốn ${action} tài khoản ${user.email}?`)) {
      handlePatchUser(user.id, { isActive: !user.isActive });
    }
  };

  return (
    <div className="min-h-screen bg-[#0B1121] text-slate-300 font-sans p-4 lg:p-6">
      
      {/* HEADER */}
      <div className="mb-6 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-3 text-[10px] font-mono font-bold tracking-wider mb-3">
          <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">Hệ thống tác chiến C4I</span>
          <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">LIVE API INTEGRATION</span>
        </div>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white uppercase tracking-wide">Quản lý người dùng hệ thống (CCF-123)</h1>
            <p className="mt-1 text-sm text-slate-400">Kiểm soát truy cập, phân quyền lực lượng cứu hộ và cư dân toàn tuyến.</p>
          </div>
          <button 
            onClick={fetchUsers}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded border border-slate-700 transition-colors"
          >
            ↻ Làm mới dữ liệu
          </button>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="flex flex-wrap gap-3 items-center mb-4">
        <input 
          type="text" 
          placeholder="Tìm tên, email, SĐT..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-4 py-2 bg-[#111827] border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
        <select 
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 bg-[#111827] border border-slate-700 rounded text-sm text-slate-300 focus:outline-none focus:border-blue-500"
        >
          <option value="all">Tất cả vai trò</option>
          <option value="admin">Admin (Quản trị)</option>
          <option value="rescue">Rescue (Cứu hộ)</option>
          <option value="resident">Resident (Cư dân)</option>
        </select>
        <select 
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-[#111827] border border-slate-700 rounded text-sm text-slate-300 focus:outline-none focus:border-blue-500"
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="active">Đang hoạt động</option>
          <option value="inactive">Đã khóa</option>
        </select>
      </div>

      {/* TRẠNG THÁI LOADING / ERROR */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-400 bg-[#111827] rounded-lg border border-slate-800">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          Đang tải dữ liệu từ máy chủ Render...
        </div>
      ) : error ? (
        <div className="p-6 text-center text-rose-400 bg-rose-500/10 rounded-lg border border-rose-500/20">
          <h3 className="font-bold mb-2">Lỗi kết nối API</h3>
          <p>{error}</p>
        </div>
      ) : (
        /* DATA TABLE */
        <div className="bg-[#111827] border border-slate-800 rounded-lg overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#0B1120] text-[10px] font-mono uppercase text-slate-500 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3 font-semibold">Người dùng</th>
                <th className="px-4 py-3 font-semibold">Vai trò (Role)</th>
                <th className="px-4 py-3 font-semibold">Trạng thái (Active)</th>
                <th className="px-4 py-3 font-semibold">Ngày tạo</th>
                <th className="px-4 py-3 font-semibold text-right">Thao tác Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Không tìm thấy dữ liệu người dùng.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isSelf = currentUser?.id === u.id;
                  const isProcessing = actionLoadingId === u.id;

                  return (
                    <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-4">
                        <div className="font-semibold text-white">{u.fullName}</div>
                        <div className="text-xs text-slate-400 mt-1">{u.email} • {u.phone}</div>
                        {isSelf && <span className="inline-block mt-1 px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] font-bold rounded">TÀI KHOẢN CỦA BẠN</span>}
                      </td>
                      <td className="px-4 py-4">
                        <select
                          disabled={isSelf || isProcessing}
                          value={u.role}
                          onChange={(e) => confirmChangeRole(u, e.target.value as User["role"])}
                          className={`px-2 py-1 rounded text-xs font-bold uppercase border bg-transparent focus:outline-none ${
                            u.role === 'admin' ? 'text-rose-400 border-rose-500/30' :
                            u.role === 'rescue' ? 'text-amber-400 border-amber-500/30' :
                            'text-slate-400 border-slate-600'
                          } ${isSelf ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-800'}`}
                        >
                          <option value="admin" className="bg-slate-900 text-white">ADMIN</option>
                          <option value="rescue" className="bg-slate-900 text-white">RESCUE</option>
                          <option value="resident" className="bg-slate-900 text-white">RESIDENT</option>
                        </select>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase border ${
                          u.isActive 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                            : 'bg-slate-800 text-slate-500 border-slate-700'
                        }`}>
                          {u.isActive ? "HOẠT ĐỘNG" : "ĐÃ KHÓA"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs font-mono text-slate-400">
                        {new Date(u.createdAt).toLocaleDateString("vi-VN")}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          disabled={isSelf || isProcessing}
                          onClick={() => confirmToggleStatus(u)}
                          className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${
                            isSelf 
                              ? 'bg-slate-800 text-slate-600 cursor-not-allowed' 
                              : u.isActive 
                                ? 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border border-rose-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'
                          }`}
                        >
                          {isProcessing ? "ĐANG XỬ LÝ..." : u.isActive ? "KHÓA TÀI KHOẢN" : "MỞ KHÓA"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}