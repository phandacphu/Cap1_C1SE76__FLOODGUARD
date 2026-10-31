// File: web/src/pages/admin/user-management/UserManagementScreen.tsx

import { useState, useMemo } from "react";
import { MOCK_USERS, type User } from "./userManagementMock";

export default function UserManagementScreen() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Lọc local dữ liệu
  const filteredUsers = useMemo(() => {
    return MOCK_USERS.filter((user) => {
      const matchSearch =
        user.fullName.toLowerCase().includes(search.toLowerCase()) ||
        user.phone.includes(search) ||
        user.email.toLowerCase().includes(search.toLowerCase());
      const matchRole = roleFilter === "all" || user.role === roleFilter;
      const matchStatus = statusFilter === "all" || user.status === statusFilter;
      return matchSearch && matchRole && matchStatus;
    });
  }, [search, roleFilter, statusFilter]);

  // UI Handlers
  const handleEditClick = (user: User) => {
    setSelectedUser(user);
  };

  const handleCloseModal = () => {
    setSelectedUser(null);
  };

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
              ● CSDL DÂN CƯ TRỰC TUYẾN
            </span>
            <span className="rounded bg-amber-500/20 px-2 py-1 text-amber-400">
              TEST ONLY / DỮ LIỆU MÔ PHỎNG
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-400 max-w-2xl">
            Quản trị hồ sơ cư dân địa phương, kiểm soát quyền truy cập cứu hộ và giám sát
            mức độ gửi yêu cầu SOS trên địa bàn thiên tai lũ lụt theo thời gian thực.
          </p>
        </div>
      </div>

      {/* KPI CARDS (Solid/Flat Design) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-slate-800 border border-slate-700 p-5">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">Tổng người dùng</div>
          <div className="text-3xl font-bold text-white">34,820</div>
        </div>
        <div className="rounded-xl bg-slate-800 border border-slate-700 p-5">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">Cư dân (Residents)</div>
          <div className="text-3xl font-bold text-blue-400">33,940</div>
        </div>
        <div className="rounded-xl bg-slate-800 border border-slate-700 p-5">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">Tài khoản hoạt động</div>
          <div className="text-3xl font-bold text-emerald-400">33,415</div>
        </div>
        <div className="rounded-xl bg-slate-800 border border-red-900/50 p-5">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">Tài khoản bị khóa</div>
          <div className="text-3xl font-bold text-red-400">525</div>
        </div>
      </div>

      {/* TABS & FILTER BAR */}
      <div className="rounded-xl bg-slate-800 border border-slate-700 p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-700 pb-4">
          <button 
            onClick={() => setRoleFilter("all")} 
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${roleFilter === "all" ? "bg-slate-600 text-white" : "text-slate-400 hover:bg-slate-700"}`}
          >
            Tất cả
          </button>
          <button 
            onClick={() => setRoleFilter("resident")} 
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${roleFilter === "resident" ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-700"}`}
          >
            Cư dân
          </button>
          <button 
            onClick={() => setRoleFilter("rescue_staff")} 
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${roleFilter === "rescue_staff" ? "bg-amber-600 text-white" : "text-slate-400 hover:bg-slate-700"}`}
          >
            Đội cứu hộ
          </button>
          <button 
            onClick={() => setRoleFilter("admin")} 
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${roleFilter === "admin" ? "bg-purple-600 text-white" : "text-slate-400 hover:bg-slate-700"}`}
          >
            Quản trị viên
          </button>
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

      {/* DATA TABLE */}
      <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-800">
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
                    <div className="font-semibold text-white">{u.fullName}</div>
                    <div className="font-mono text-xs text-slate-500">#{u.id}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium 
                      ${u.role === "admin" ? "bg-purple-500/20 text-purple-400" : 
                        u.role === "rescue_staff" ? "bg-amber-500/20 text-amber-400" : 
                        "bg-blue-500/20 text-blue-400"}`}>
                      {u.role.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium 
                      ${u.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${u.status === "active" ? "bg-emerald-500" : "bg-red-500"}`}></span>
                      {u.status === "active" ? "Active" : "Locked"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-slate-300">{u.phone}</div>
                    <div className="text-xs text-slate-500">{u.email}</div>
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
      </div>

      {/* EDIT MODAL SHELL (Sẽ tích hợp call API PATCH sau này ở Task CCF-123) */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-800 border border-slate-700 shadow-2xl overflow-hidden">
            <div className="border-b border-slate-700 bg-slate-900/50 px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-white">Chỉnh sửa Tài khoản</h3>
              <button onClick={handleCloseModal} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Họ và tên</label>
                <input type="text" readOnly value={selectedUser.fullName} className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-300 opacity-70 cursor-not-allowed" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Phân quyền</label>
                  <select defaultValue={selectedUser.role} className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:border-blue-500 outline-none">
                    <option value="resident">Cư dân</option>
                    <option value="rescue_staff">Đội cứu hộ</option>
                    <option value="admin">Quản trị viên</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Trạng thái</label>
                  <select defaultValue={selectedUser.status} className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:border-blue-500 outline-none">
                    <option value="active">Đang hoạt động</option>
                    <option value="inactive">Khóa tài khoản</option>
                  </select>
                </div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded p-3 text-xs text-amber-400">
                Lưu ý: Bạn đang thao tác trên dữ liệu <strong>MÔ PHỎNG</strong>. Form sẽ được nối API PATCH ở task CCF-123.
              </div>
            </div>
            <div className="border-t border-slate-700 p-4 flex justify-end gap-3 bg-slate-900/50">
              <button onClick={handleCloseModal} className="px-4 py-2 rounded text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700">Hủy</button>
              <button onClick={handleCloseModal} className="px-4 py-2 rounded text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 transition">Cập nhật (Demo)</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}