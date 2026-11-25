import { useMemo, useRef, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { useAuth } from "../../../context/AuthContext";
import { AdminUiPreview, PreviewBadge, PreviewPanel, PreviewStat, previewInputClass, previewSecondaryButton } from "../ui-preview/AdminUiPreview";
import { describeUserError, fetchUserDetail, patchUser, UserApiError, type User } from "../user-management/userApi";
import { useUserManagement } from "../user-management/useUserManagement";

type Filter = "all" | "active" | "inactive";
const button = "rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50";
const nameOf = (u: User) => u.fullName || u.email || u.phone || u.id;
const dateOf = (v: string | null) => v && Number.isFinite(Date.parse(v))
  ? new Date(v).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "—";

/** Account activation is different from on-duty/online status. */
export default function RescueStaffUiScreen() {
  const { token, logout } = useAuth();
  const { users, error, loading, refresh } = useUserManagement();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<User | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [locked, setLocked] = useState(false);
  const [notice, setNotice] = useState("");
  const detailGeneration = useRef(0);
  const inFlight = useRef(false);
  const rescue = useMemo(() => (users || []).filter((u) => u.role === "rescue"), [users]);
  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("vi-VN");
    return rescue.filter((u) => (filter === "all" || u.isActive === (filter === "active")) &&
      (!q || [u.id, u.fullName, u.email, u.phone].some((v) => (v || "").toLocaleLowerCase("vi-VN").includes(q))));
  }, [rescue, search, filter]);
  const available = users !== null && !locked;
  const kpi = (n: number) => available ? String(n) : "—";

  function permission(error: unknown) {
    if (!(error instanceof UserApiError)) return false;
    if (error.status === 401) { detailGeneration.current++; logout(); return true; }
    if (error.status === 403) {
      detailGeneration.current++; setLocked(true); setSelectedId(null); setDetail(null);
      setNotice("Không đủ quyền quản lý Rescue Staff. Đã khóa các thao tác.");
      return true;
    }
    return false;
  }
  function close() {
    if (inFlight.current) return;
    detailGeneration.current++; setSelectedId(null); setDetail(null);
    setDetailLoading(false); setDetailError(""); setConfirm(false); setUncertain(false);
  }
  async function open(id: string) {
    if (!token || locked || inFlight.current) return;
    const ticket = ++detailGeneration.current;
    setSelectedId(id); setDetail(null); setConfirm(false); setDetailError(""); setDetailLoading(true);
    try {
      const account = await fetchUserDetail(token, id);
      if (ticket !== detailGeneration.current) return;
      if (account.role !== "rescue") throw new UserApiError("Tài khoản không thuộc nhóm Rescue.", -1);
      setDetail(account);
    } catch (error) {
      if (ticket !== detailGeneration.current || permission(error)) return;
      setDetailError(describeUserError(error, "Không thể tải chi tiết tài khoản."));
    } finally { if (ticket === detailGeneration.current) setDetailLoading(false); }
  }
  async function reconcile() {
    if (!selectedId || !token || inFlight.current || locked) return;
    const id = selectedId;
    inFlight.current = true; setSaving(true); setDetailError("");
    try {
      const fresh = await fetchUserDetail(token, id);
      if (selectedId !== id) return;
      if (fresh.role !== "rescue") { setDetail(null); setDetailError("Tài khoản không còn thuộc nhóm Rescue."); return; }
      setDetail(fresh); setUncertain(false); setNotice("Đã đối chiếu trạng thái mới. Vui lòng kiểm tra trước thao tác tiếp theo."); refresh();
    } catch (error) {
      if (!permission(error)) setDetailError(`Đối chiếu thất bại: ${describeUserError(error, "Lỗi tải chi tiết.")}`);
    } finally { inFlight.current = false; setSaving(false); }
  }
  async function changeStatus() {
    if (!token || !detail || !confirm || inFlight.current || loading || error || uncertain || locked) return;
    const id = detail.id;
    inFlight.current = true; setSaving(true); setConfirm(false); setDetailError("");
    try {
      const current = await fetchUserDetail(token, id);
      if (current.role !== "rescue" || current.isActive !== detail.isActive) {
        setDetail(current.role === "rescue" ? current : null);
        setDetailError("Tài khoản đã thay đổi; kiểm tra trạng thái mới trước khi thao tác."); return;
      }
      const saved = await patchUser(token, id, { isActive: !detail.isActive });
      if (saved.id !== id || saved.role !== "rescue" || saved.isActive === detail.isActive) throw new UserApiError("Phản hồi cập nhật sai ID/trạng thái.", -1);
      setDetail(saved); refresh(); setNotice(`Đã cập nhật tài khoản ${nameOf(saved)}.`);
    } catch (error) {
      if (permission(error)) return;
      if (!(error instanceof UserApiError) || error.status === 0 || error.status === -1 || error.status >= 500) {
        setUncertain(true); setDetailError("Kết quả cập nhật chưa xác định. Phải đối chiếu thành công trước khi thao tác tiếp.");
      } else setDetailError(describeUserError(error, "Cập nhật thất bại."));
    } finally { inFlight.current = false; setSaving(false); }
  }

  return <AdminUiPreview preview={false} title="Quản lý Rescue Staff" subtitle="Quản lý tài khoản nhân viên cứu hộ."
    action={<button className={button} disabled={loading || locked} onClick={refresh}>{loading ? "Đang làm mới…" : "Làm mới"}</button>}>
    {notice && <p role="status" className="rounded-xl border border-water/40 bg-water/10 p-3 text-sm">{notice}</p>}
    {error && <p role="alert" className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">{available ? "Chưa cập nhật — đang giữ dữ liệu cũ. " : "Không tải được danh sách. "}{error} <button className={button} onClick={refresh}>Thử lại</button></p>}
    {locked && <p role="alert" className="rounded-xl border border-sos/40 p-3">Không đủ quyền quản lý Rescue Staff.</p>}
    <div className="grid gap-3 sm:grid-cols-3"><PreviewStat title="Tổng tài khoản Rescue" value={kpi(rescue.length)} detail="Nhân viên cứu hộ" />
      <PreviewStat title="Được kích hoạt" value={kpi(rescue.filter((u) => u.isActive).length)} detail="Trạng thái tài khoản" tone="safe" />
      <PreviewStat title="Đã vô hiệu hóa" value={kpi(rescue.filter((u) => !u.isActive).length)} detail="Trạng thái tài khoản" tone="warn" /></div>
    <PreviewPanel title="Danh sách tài khoản Rescue" extra={<PreviewBadge tone="muted">{available ? filtered.length : "—"} kết quả</PreviewBadge>}>
      <div className="grid gap-3 p-5 sm:grid-cols-[minmax(0,1fr)_210px]">
        <label className="relative block"><span className="sr-only">Tìm nhân viên Rescue</span><span className="pointer-events-none absolute left-3 top-3 text-slate-500"><Icon name="search" className="h-4 w-4" /></span>
          <input className={`${previewInputClass} pl-9`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm ID, tên, email hoặc điện thoại…" /></label>
        <select className={previewInputClass} aria-label="Lọc trạng thái tài khoản" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="all">Tất cả trạng thái</option><option value="active">Được kích hoạt</option><option value="inactive">Đã vô hiệu hóa</option></select>
      </div>
      {loading && <p role="status" className="px-5 pb-3 text-sm text-muted">Đang tải tài khoản Rescue…</p>}
      {available && <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-bg/60 text-xs uppercase text-slate-400"><tr>
        <th className="px-5 py-3">Tài khoản</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Số điện thoại</th><th className="px-5 py-3">Trạng thái</th><th className="px-5 py-3">Thao tác</th>
      </tr></thead><tbody className="divide-y divide-border/80">{filtered.map((u) => <tr key={u.id}>
        <td className="px-5 py-4"><strong>{nameOf(u)}</strong><p className="font-mono text-xs text-muted">{u.id}</p></td><td className="px-5 py-4">{u.email || "—"}</td><td className="px-5 py-4">{u.phone || "—"}</td>
        <td className="px-5 py-4"><PreviewBadge tone={u.isActive ? "safe" : "warn"}>{u.isActive ? "Được kích hoạt" : "Đã vô hiệu hóa"}</PreviewBadge></td>
        <td className="px-5 py-4"><button className={button} disabled={loading || saving || !!error} onClick={() => void open(u.id)}>Xem chi tiết</button></td>
      </tr>)}</tbody></table>{filtered.length === 0 && <p className="p-8 text-center text-sm text-muted">Không có tài khoản Rescue phù hợp.</p>}</div>}
    </PreviewPanel>
    {selectedId && !locked && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6" role="presentation"><section role="dialog" aria-modal="true" aria-label="Chi tiết tài khoản Rescue" className="w-full max-w-xl space-y-4 rounded-2xl border border-border bg-card p-6">
      <div className="flex justify-between"><h2 className="text-xl font-bold">Chi tiết nhân viên cứu hộ</h2><button className={previewSecondaryButton} disabled={saving} onClick={close}>Đóng</button></div>
      {detailLoading && <p role="status">Đang tải chi tiết…</p>}{detailError && <p role="alert" className="rounded border border-sos/40 p-3 text-sm">{detailError}</p>}
      {!detail && !detailLoading && <button className={button} onClick={() => void open(selectedId)}>Thử lại</button>}
      {detail && <><dl className="grid gap-3 text-sm sm:grid-cols-2">{[["ID", detail.id], ["Họ tên", detail.fullName || "—"], ["Email", detail.email || "—"], ["Số điện thoại", detail.phone || "—"], ["Vai trò", "Rescue Staff"], ["Trạng thái tài khoản", detail.isActive ? "Được kích hoạt" : "Đã vô hiệu hóa"], ["Ngày tạo", dateOf(detail.createdAt)], ["Cập nhật", dateOf(detail.updatedAt)]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>)}</dl>
        {uncertain ? <button className={button} disabled={saving} onClick={() => void reconcile()}>Đối chiếu trạng thái</button> :
          <button className={button} disabled={saving || loading || !!error || !!detailError} onClick={() => setConfirm(true)}>{detail.isActive ? "Vô hiệu hóa tài khoản" : "Kích hoạt tài khoản"}</button>}</>}
      {confirm && detail && <div role="alertdialog" aria-label="Xác nhận thay đổi tài khoản" className="rounded-lg border border-warn/40 p-4 text-sm"><p>Xác nhận {detail.isActive ? "vô hiệu hóa" : "kích hoạt"} tài khoản “{nameOf(detail)}”?</p>
        <div className="mt-3 flex gap-2"><button className={previewSecondaryButton} onClick={() => setConfirm(false)}>Hủy</button><button className={button} disabled={saving} onClick={() => void changeStatus()}>Xác nhận</button></div></div>}
    </section></div>}
  </AdminUiPreview>;
}
