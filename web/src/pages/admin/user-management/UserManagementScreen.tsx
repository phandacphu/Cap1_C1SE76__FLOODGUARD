// File: web/src/pages/admin/user-management/UserManagementScreen.tsx

import { useMemo, useState } from "react";
import { AdminHeader } from "../../../components/layout/AdminHeader";
import { AppShell } from "../../../components/layout/AppShell";
import { ADMIN_NAV } from "../../../components/layout/navConfig";
import { useAuth } from "../../../context/AuthContext";
import { USER_ROLES, type User, type UserPatch, type UserRole } from "./userApi";
import { useUserManagement } from "./useUserManagement";

const ROLE_LABEL: Record<UserRole, string> = {
  resident: "RESIDENT",
  rescue: "RESCUE",
  admin: "ADMIN",
};

function isUserRole(role: string | null): role is UserRole {
  return role !== null && (USER_ROLES as string[]).includes(role);
}

/** Never calls string methods on a null/unknown role. */
function roleText(role: string | null): string {
  if (isUserRole(role)) return ROLE_LABEL[role];
  return role ? role.toUpperCase() : "KHÔNG RÕ";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour12: false,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function UserManagementScreen() {
  const { user: currentUser } = useAuth();
  const { users, error, loading, refresh, update } = useUserManagement();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editRole, setEditRole] = useState<string>("");
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const list = useMemo(() => users ?? [], [users]);
  // First load failed: there is nothing to show, so the error replaces the table (never "0 users").
  const loadFailed = users === null && error !== null && !loading;

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return list.filter((u) => {
      const matchSearch =
        term === "" ||
        (u.fullName ?? "").toLowerCase().includes(term) ||
        (u.phone ?? "").includes(term) ||
        (u.email ?? "").toLowerCase().includes(term);
      const matchRole = roleFilter === "all" || u.role === roleFilter;
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && u.isActive) ||
        (statusFilter === "inactive" && !u.isActive);
      return matchSearch && matchRole && matchStatus;
    });
  }, [list, search, roleFilter, statusFilter]);

  const handleEditClick = (user: User) => {
    setSelectedUser(user);
    setEditRole(user.role ?? "");
    setEditIsActive(user.isActive);
    setModalError(null);
  };

  const handleCloseModal = () => {
    if (submitting) return;
    setSelectedUser(null);
    setModalError(null);
  };

  const isSelfEditing =
    currentUser !== null && selectedUser !== null && String(currentUser.id) === String(selectedUser.id);

  // Only the fields that really changed are sent (role / isActive).
  const payload: UserPatch = {};
  if (selectedUser) {
    if (isUserRole(editRole) && editRole !== selectedUser.role) payload.role = editRole;
    if (editIsActive !== selectedUser.isActive) payload.isActive = editIsActive;
  }
  const hasChanges = Object.keys(payload).length > 0;

  const handleUpdateUser = async () => {
    if (!selectedUser || isSelfEditing || !hasChanges) return;
    setSubmitting(true);
    setModalError(null);
    const result = await update(selectedUser.id, payload);
    setSubmitting(false);
    if (result.ok) {
      setNotice(`Đã cập nhật tài khoản ${selectedUser.fullName ?? selectedUser.email ?? selectedUser.id}.`);
      setSelectedUser(null);
    } else {
      setModalError(result.error ?? "Cập nhật thất bại.");
    }
  };

  const kpi = (n: number) => (users === null ? "—" : String(n));

  return (
    <AppShell
      nav={ADMIN_NAV}
      brandSub="ADMIN COMMAND"
      roleLabel="QUẢN TRỊ VIÊN"
      accent="water"
      header={<AdminHeader title="Quản lý người dùng" />}
    >
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
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-60"
          >
            {loading ? "Đang tải..." : "Làm mới"}
          </button>
        </div>

        {notice && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300"
          >
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-xs underline">
              Đóng
            </button>
          </div>
        )}

        {/* The list on screen is older than the server: say so instead of hiding the failure. */}
        {users !== null && error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300"
          >
            <span>
              <strong>Không làm mới được danh sách:</strong> {error} Đang hiển thị dữ liệu tải lần trước, có thể đã cũ.
            </span>
            <button
              type="button"
              onClick={refresh}
              className="rounded border border-amber-500/40 px-3 py-1 font-mono text-xs"
            >
              Thử lại
            </button>
          </div>
        )}

        {/* KPI CARDS */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-slate-800 border border-slate-700 p-5">
            <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">Tổng người dùng (API)</div>
            <div className="text-3xl font-bold text-white">{kpi(list.length)}</div>
          </div>
          <div className="rounded-xl bg-slate-800 border border-slate-700 p-5">
            <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">Cư dân (Residents)</div>
            <div className="text-3xl font-bold text-blue-400">{kpi(list.filter((u) => u.role === "resident").length)}</div>
          </div>
          <div className="rounded-xl bg-slate-800 border border-slate-700 p-5">
            <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">Đội cứu hộ (Rescue)</div>
            <div className="text-3xl font-bold text-amber-400">{kpi(list.filter((u) => u.role === "rescue").length)}</div>
          </div>
          <div className="rounded-xl bg-slate-800 border border-red-900/50 p-5">
            <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">Tài khoản bị khóa</div>
            <div className="text-3xl font-bold text-red-400">{kpi(list.filter((u) => !u.isActive).length)}</div>
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
              aria-label="Lọc theo trạng thái"
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
          {users === null && !loadFailed ? (
            <div className="px-6 py-16 text-center text-slate-400 font-mono animate-pulse">
              Đang tải dữ liệu người dùng từ Render server (có thể mất 30-50s nếu server sleep)...
            </div>
          ) : loadFailed ? (
            <div role="alert" className="px-6 py-12 text-center text-red-400 space-y-2">
              <p className="font-semibold">Không tải được danh sách người dùng</p>
              <p className="text-sm bg-red-500/10 border border-red-500/20 p-3 rounded max-w-md mx-auto">{error}</p>
              <p className="text-xs text-slate-400">Đây là lỗi tải dữ liệu, không có nghĩa là hệ thống chưa có người dùng.</p>
              <button onClick={refresh} className="mt-2 px-4 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white">Thử lại</button>
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
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                      Hệ thống chưa có người dùng nào.
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
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
                            u.role === "resident" ? "bg-blue-500/20 text-blue-400" :
                            "bg-slate-500/20 text-slate-400"}`}>
                          {roleText(u.role)}
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
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Chỉnh sửa tài khoản"
              className="w-full max-w-md rounded-2xl bg-slate-800 border border-slate-700 shadow-2xl overflow-hidden"
            >
              <div className="border-b border-slate-700 bg-slate-900/50 px-6 py-4 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-white">Chỉnh sửa Tài khoản (API)</h3>
                <button onClick={handleCloseModal} aria-label="Đóng" className="text-slate-400 hover:text-white">✕</button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Họ và tên</label>
                  <input type="text" readOnly value={selectedUser.fullName || ""} placeholder="Chưa cập nhật tên" className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-300 opacity-70 cursor-not-allowed" />
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs font-mono text-slate-400">
                  <div>
                    <p>Email</p>
                    <p className="mt-1 break-all text-sm text-slate-300">{selectedUser.email || "—"}</p>
                  </div>
                  <div>
                    <p>Số điện thoại</p>
                    <p className="mt-1 text-sm text-slate-300">{selectedUser.phone || "—"}</p>
                  </div>
                  <div>
                    <p>Ngày tạo</p>
                    <p className="mt-1 text-sm text-slate-300">{formatDate(selectedUser.createdAt)}</p>
                  </div>
                  <div>
                    <p>Cập nhật lần cuối</p>
                    <p className="mt-1 text-sm text-slate-300">{formatDate(selectedUser.updatedAt)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="edit-role" className="block text-xs font-mono text-slate-400 mb-1">Phân quyền (Role)</label>
                    <select
                      id="edit-role"
                      value={editRole}
                      disabled={isSelfEditing || submitting}
                      onChange={(e) => setEditRole(e.target.value)}
                      className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:border-blue-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {!isUserRole(selectedUser.role) && (
                        <option value="">{selectedUser.role ? `${selectedUser.role} (không rõ)` : "Chưa xác định"}</option>
                      )}
                      <option value="resident">resident</option>
                      <option value="rescue">rescue</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="edit-active" className="block text-xs font-mono text-slate-400 mb-1">Trạng thái (isActive)</label>
                    <select
                      id="edit-active"
                      value={editIsActive ? "true" : "false"}
                      disabled={isSelfEditing || submitting}
                      onChange={(e) => setEditIsActive(e.target.value === "true")}
                      className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:border-blue-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="true">Đang hoạt động (true)</option>
                      <option value="false">Khóa tài khoản (false)</option>
                    </select>
                  </div>
                </div>

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

                {modalError && (
                  <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded p-3 text-xs text-red-300">
                    <strong>Cập nhật thất bại:</strong> {modalError}
                  </div>
                )}
              </div>
              <div className="border-t border-slate-700 p-4 flex justify-end gap-3 bg-slate-900/50">
                <button onClick={handleCloseModal} disabled={submitting} className="px-4 py-2 rounded text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700">Hủy</button>
                <button
                  onClick={() => {
                    if (window.confirm("Bạn có chắc chắn muốn cập nhật thông tin tài khoản này không?")) {
                      void handleUpdateUser();
                    }
                  }}
                  disabled={submitting || isSelfEditing || !hasChanges}
                  className="px-4 py-2 rounded text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Đang lưu..." : "Xác nhận Cập nhật"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
