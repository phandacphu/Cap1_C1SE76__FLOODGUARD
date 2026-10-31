// File: web/src/pages/admin/user-management/UserManagementScreen.tsx

import { useState, useEffect, useMemo } from "react";
// Giả định hook useAuth nằm ở đường dẫn này trong project của bạn (hãy điều chỉnh lại path nếu cần)
import { useAuth } from "../../../context/AuthContext"; 

export interface User {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  role: "resident" | "rescue" | "admin";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function UserManagementScreen() {
  // 1. Lấy token và thông tin user đang đăng nhập từ useAuth() chuẩn của app
  const { token, user: currentUser } = useAuth();
  
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editRole, setEditRole] = useState<"resident" | "rescue" | "admin">("resident");
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const apiBase = import.meta.env.VITE_API_URL 
    ? import.meta.env.VITE_API_URL.replace(/\/+$/, "") 
    : "https://floodguard-backend-demo.onrender.com/api";

  // GET: Lấy danh sách người dùng từ API thật
  useEffect(() => {
    let isMounted = true;

    const loadUsers = async () => {
      if (!token) {
        if (isMounted) {
          setErrorMsg("Không tìm thấy phiên đăng nhập hợp lệ từ useAuth().");
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setErrorMsg(null);
      try {
        const response = await fetch(`${apiBase}/admin/users`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || `Lỗi HTTP: ${response.status}`);
        }

        if (isMounted && data && data.data && Array.isArray(data.data.users)) {
          setUsers(data.data.users);
        } else if (isMounted) {
          setUsers([]);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (isMounted) {
          setErrorMsg(message || "Không thể tải danh sách người dùng từ hệ thống.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadUsers();

    return () => {
      isMounted = false;
    };
  }, [apiBase, token]);

  // 2. Xử lý an toàn dữ liệu nullable cho tìm kiếm phía client
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const name = u.fullName || "";
      const phone = u.phone || "";
      const email = u.email || "";

      const matchSearch =
        name.toLowerCase().includes(search.toLowerCase()) ||
        phone.includes(search) ||
        email.toLowerCase().includes(search.toLowerCase());
      
      const matchRole = roleFilter === "all" || u.role === roleFilter;
      
      const matchStatus = 
        statusFilter === "all" || 
        (statusFilter === "active" && u.isActive) || 
        (statusFilter === "inactive" && !u.isActive);

      return matchSearch && matchRole && matchStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const handleEditClick = (user: User) => {
    setSelectedUser(user);
    setEditRole(user.role);
    setEditIsActive(user.isActive);
  };

  const handleCloseModal = () => {
    setSelectedUser(null);
  };

  const reloadUsers = async () => {
    if (!token) return;
    try {
      const response = await fetch(`${apiBase}/admin/users`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await response.json();
      if (response.ok && data?.data?.users) {
        setUsers(data.data.users);
      }
    } catch {
      // Bỏ qua lỗi ngầm khi reload
    }
  };

  // PATCH: Cập nhật vai trò hoặc trạng thái tài khoản
  const handleUpdateUser = async () => {
    if (!selectedUser || !token) return;

    // 3. Kiểm tra bảo mật chống tự sửa chính mình ở client
    if (currentUser && currentUser.id === selectedUser.id) {
      alert("Hành động bị từ chối: Bạn không được tự thay đổi role hoặc khóa tài khoản của chính mình!");
      return;
    }
    
    setSubmitting(true);
    try {
      const payload: { role?: string; isActive?: boolean } = {};
      if (editRole !== selectedUser.role) {
        payload.role = editRole;
      }
      if (editIsActive !== selectedUser.isActive) {
        payload.isActive = editIsActive;
      }

      if (Object.keys(payload).length === 0) {
        alert("Không có thay đổi nào được thực hiện.");
        setSubmitting(false);
        return;
      }

      const response = await fetch(`${apiBase}/admin/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Lỗi cập nhật (HTTP ${response.status})`);
      }

      alert("Cập nhật tài khoản thành công!");
      setSelectedUser(null);
      reloadUsers();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert(`Thất bại: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Kiểm tra xem user đang chọn có phải là chính Admin hiện tại không
  const isSelfEditing = currentUser && selectedUser && currentUser.id === selectedUser.id;

  return (
    <div className="mx-auto max-w-7xl space-y-6 text-slate-200">
      {/* HEADER */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white uppercase tracking-wide">
            Quản lý người dùng toàn hệ thống
          </h1>
          <div className="mt-1 flex items-center gap-3 text-xs font-mono">
            <span className="rounded bg-emerald-500/20 px-2 py-1 text-emerald-400">
              ● KẾT NỐI API CHÍNH THỨC (RENDER)
            </span>
            <span className="rounded bg-amber-500/20 px-2 py-1 text-amber-400">
              ADMIN PANEL / CCF-123
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-400 max-w-2xl">
            Quản trị hồ sơ cư dân địa phương, phân quyền lực lượng cứu hộ và kiểm soát trạng thái hoạt động theo thời gian thực.
          </p>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-slate-800 border border-slate-700 p-5">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">Tổng người dùng (API)</div>
          <div className="text-3xl font-bold text-white">{users.length}</div>
        </div>
        <div className="rounded-xl bg-slate-800 border border-slate-700 p-5">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">Cư dân (Residents)</div>
          <div className="text-3xl font-bold text-blue-400">{users.filter(u => u.role === 'resident').length}</div>
        </div>
        <div className="rounded-xl bg-slate-800 border border-slate-700 p-5">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">Đội cứu hộ (Rescue)</div>
          <div className="text-3xl font-bold text-amber-400">{users.filter(u => u.role === 'rescue').length}</div>
        </div>
        <div className="rounded-xl bg-slate-800 border border-red-900/50 p-5">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">Tài khoản bị khóa</div>
          <div className="text-3xl font-bold text-red-400">{users.filter(u => !u.isActive).length}</div>
        </div>
      </div>

      {/* TABS & FILTER BAR */}
      <div className="rounded-xl bg-slate-800 border border-slate-700 p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-700 pb-4">
          <button onClick={() => setRoleFilter("all")} className={`px-4 py-2 text-sm font-medium rounded-md transition ${roleFilter === "all" ? "bg-slate-600 text-white" : "text-slate-400 hover:bg-slate-700"}`}>Tất cả</button>
          <button onClick={() => setRoleFilter("resident")} className={`px-4 py-2 text-sm font-medium rounded-md transition ${roleFilter === "resident" ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-700"}`}>Cư dân</button>
          <button onClick={() => setRoleFilter("rescue")} className={`px-4 py-2 text-sm font-medium rounded-md transition ${roleFilter === "rescue" ? "bg-amber-600 text-white" : "text-slate-400 hover:bg-slate-700"}`}>Đội cứu hộ</button>
          <button onClick={() => setRoleFilter("admin")} className={`px-4 py-2 text-sm font-medium rounded-md transition ${roleFilter === "admin" ? "bg-purple-600 text-white" : "text-slate-400 hover:bg-slate-700"}`}>Quản trị viên</button>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Tìm theo họ tên, số điện thoại, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">Trạng thái: Tất cả</option>
            <option value="active">Đang hoạt động</option>
            <option value="inactive">Đã bị khóa</option>
          </select>
        </div>
      </div>

      {/* DATA TABLE & ERROR / LOADING STATES */}
      <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-800">
        {loading ? (
          <div className="px-6 py-16 text-center text-slate-400 font-mono animate-pulse">
            Đang tải dữ liệu người dùng từ Render server (có thể mất 30-50s nếu server sleep)...
          </div>
        ) : errorMsg ? (
          <div className="px-6 py-12 text-center text-red-400 space-y-2">
            <p className="font-semibold">Lỗi kết nối API:</p>
            <p className="text-sm bg-red-500/10 border border-red-500/20 p-3 rounded max-w-md mx-auto">{errorMsg}</p>
            <button onClick={() => window.location.reload()} className="mt-2 px-4 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white">Thử lại</button>
          </div>
        ) : (
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-900/50 text-xs font-mono uppercase text-slate-400">
              <tr>
                <th className="px-6 py-4 font-medium">Họ tên & Tài khoản</th>
                <th className="px-6 py-4 font-medium">Vai trò</th>
                <th className="px-6 py-4 font-medium">Trạng thái</th>
                <th className="px-6 py-4 font-medium">Liên hệ</th>
                <th className="px-6 py-4 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    Không tìm thấy dữ liệu người dùng phù hợp.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-700/30 transition">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-white">{u.fullName || "Chưa cập nhật tên"}</div>
                      <div className="font-mono text-xs text-slate-500">ID: {u.id}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium 
                        ${u.role === "admin" ? "bg-purple-500/20 text-purple-400" : 
                          u.role === "rescue" ? "bg-amber-500/20 text-amber-400" : 
                          "bg-blue-500/20 text-blue-400"}`}>
                        {u.role.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium 
                        ${u.isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${u.isActive ? "bg-emerald-500" : "bg-red-500"}`}></span>
                        {u.isActive ? "Active" : "Locked"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-300">{u.phone || "Chưa cập nhật SĐT"}</div>
                      <div className="text-xs text-slate-500">{u.email || "Chưa cập nhật Email"}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleEditClick(u)}
                        className="rounded bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-600 transition"
                      >
                        Xem / Sửa
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* EDIT MODAL SHELL */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-800 border border-slate-700 shadow-2xl overflow-hidden">
            <div className="border-b border-slate-700 bg-slate-900/50 px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-white">Chỉnh sửa Tài khoản (API)</h3>
              <button onClick={handleCloseModal} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Họ và tên</label>
                <input type="text" readOnly value={selectedUser.fullName || ""} className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-300 opacity-70 cursor-not-allowed" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Phân quyền (Role)</label>
                  <select 
                    value={editRole} 
                    disabled={Boolean(isSelfEditing)}
                    onChange={(e) => setEditRole(e.target.value as "resident" | "rescue" | "admin")}
                    className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:border-blue-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="resident">resident</option>
                    <option value="rescue">rescue</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Trạng thái (isActive)</label>
                  <select 
                    value={editIsActive ? "true" : "false"} 
                    disabled={Boolean(isSelfEditing)}
                    onChange={(e) => setEditIsActive(e.target.value === "true")}
                    className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:border-blue-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="true">Đang hoạt động (true)</option>
                    <option value="false">Khóa tài khoản (false)</option>
                  </select>
                </div>
              </div>

              {/* 3. Hiển thị cảnh báo rõ ràng nếu Admin đang cố sửa chính mình */}
              {isSelfEditing && (
                <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-xs text-red-400">
                  <strong>Bảo mật hệ thống:</strong> Đây là tài khoản Admin bạn đang sử dụng để đăng nhập. Bạn không thể tự thay đổi vai trò hoặc tự khóa tài khoản của chính mình.
                </div>
              )}

              {!isSelfEditing && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded p-3 text-xs text-amber-400">
                  Lưu ý: Hệ thống yêu cầu xác nhận trước khi cập nhật. Payload gửi lên chỉ chứa các trường thay đổi (`role` / `isActive`).
                </div>
              )}
            </div>
            <div className="border-t border-slate-700 p-4 flex justify-end gap-3 bg-slate-900/50">
              <button onClick={handleCloseModal} disabled={submitting} className="px-4 py-2 rounded text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700">Hủy</button>
              <button 
                onClick={() => {
                  if (window.confirm("Bạn có chắc chắn muốn cập nhật thông tin tài khoản này không?")) {
                    handleUpdateUser();
                  }
                }} 
                disabled={submitting || Boolean(isSelfEditing)}
                className="px-4 py-2 rounded text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Đang lưu..." : "Xác nhận Cập nhật"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}