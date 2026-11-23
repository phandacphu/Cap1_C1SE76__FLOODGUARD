import { useMemo, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import {
  AdminUiPreview,
  PreviewBadge,
  PreviewPanel,
  PreviewStat,
  previewInputClass,
  previewPrimaryButton,
  previewSecondaryButton,
} from "../ui-preview/AdminUiPreview";

type StaffStatus = "on-duty" | "ready" | "offline";

interface StaffPreview {
  id: string;
  name: string;
  area: string;
  team: string;
  shift: string;
  status: StaffStatus;
}

// UI fixture only. Replace this source with an Admin Rescue Staff API adapter later.
const previewStaff: StaffPreview[] = [
  { id: "RS-M01", name: "Nhân sự mẫu 01", area: "Hải Châu", team: "Đội cứu hộ A", shift: "Ca sáng", status: "on-duty" },
  { id: "RS-M02", name: "Nhân sự mẫu 02", area: "Thanh Khê", team: "Đội cứu hộ A", shift: "Ca sáng", status: "ready" },
  { id: "RS-M03", name: "Nhân sự mẫu 03", area: "Liên Chiểu", team: "Đội cứu hộ B", shift: "Ca chiều", status: "on-duty" },
  { id: "RS-M04", name: "Nhân sự mẫu 04", area: "Cẩm Lệ", team: "Đội cứu hộ B", shift: "Ca tối", status: "offline" },
  { id: "RS-M05", name: "Nhân sự mẫu 05", area: "Sơn Trà", team: "Đội cứu hộ C", shift: "Ca tối", status: "ready" },
];

const statusLabel: Record<StaffStatus, string> = {
  "on-duty": "Đang trực",
  ready: "Sẵn sàng",
  offline: "Ngoại tuyến",
};

const statusTone: Record<StaffStatus, "safe" | "water" | "muted"> = {
  "on-duty": "safe",
  ready: "water",
  offline: "muted",
};

export default function RescueStaffUiScreen() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StaffStatus | "all">("all");
  const [selected, setSelected] = useState<StaffPreview | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("vi-VN");
    return previewStaff.filter((staff) => {
      const matchesStatus = filter === "all" || staff.status === filter;
      const matchesSearch = [staff.id, staff.name, staff.area, staff.team]
        .some((value) => value.toLocaleLowerCase("vi-VN").includes(query));
      return matchesStatus && matchesSearch;
    });
  }, [filter, search]);

  const closeDialog = () => { setSelected(null); setAddOpen(false); };

  return (
    <AdminUiPreview
      title="Quản lý Rescue Staff"
      subtitle="Theo dõi danh sách nhân sự cứu hộ, khu vực phụ trách và ca trực."
      action={
        <button type="button" onClick={() => setAddOpen(true)} className={previewPrimaryButton}>
          + Thêm nhân sự
        </button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PreviewStat title="Tổng nhân sự" value={previewStaff.length} detail="Dữ liệu minh họa" />
        <PreviewStat title="Đang trực" value={previewStaff.filter((s) => s.status === "on-duty").length} detail="Dữ liệu minh họa" tone="safe" />
        <PreviewStat title="Sẵn sàng" value={previewStaff.filter((s) => s.status === "ready").length} detail="Dữ liệu minh họa" />
        <PreviewStat title="Ngoại tuyến" value={previewStaff.filter((s) => s.status === "offline").length} detail="Dữ liệu minh họa" tone="warn" />
      </div>

      <PreviewPanel title="Danh sách nhân sự" extra={<PreviewBadge tone="muted">{filtered.length} kết quả</PreviewBadge>}>
        <div className="grid gap-3 p-5 sm:grid-cols-[minmax(0,1fr)_210px]">
          <label className="relative block">
            <span className="sr-only">Tìm nhân sự</span>
            <span className="pointer-events-none absolute left-3 top-3 text-slate-500"><Icon name="search" className="h-4 w-4" /></span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm mã, nhân sự, đội hoặc khu vực..."
              className={`${previewInputClass} pl-9`}
            />
          </label>
          <select
            aria-label="Lọc trạng thái nhân sự"
            value={filter}
            onChange={(event) => setFilter(event.target.value as StaffStatus | "all")}
            className={previewInputClass}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="on-duty">Đang trực</option>
            <option value="ready">Sẵn sàng</option>
            <option value="offline">Ngoại tuyến</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-bg/60 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-3 font-medium">Nhân sự</th>
                <th className="px-5 py-3 font-medium">Đội</th>
                <th className="px-5 py-3 font-medium">Khu vực</th>
                <th className="px-5 py-3 font-medium">Ca trực</th>
                <th className="px-5 py-3 font-medium">Trạng thái</th>
                <th className="px-5 py-3 text-right font-medium">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/80">
              {filtered.map((staff) => (
                <tr key={staff.id} className="transition hover:bg-slate-800/35">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-100">{staff.name}</p>
                    <p className="mt-1 font-mono text-xs text-slate-500">{staff.id}</p>
                  </td>
                  <td className="px-5 py-4 text-slate-300">{staff.team}</td>
                  <td className="px-5 py-4 text-slate-300">{staff.area}</td>
                  <td className="px-5 py-4 text-slate-300">{staff.shift}</td>
                  <td className="px-5 py-4"><PreviewBadge tone={statusTone[staff.status]}>{statusLabel[staff.status]}</PreviewBadge></td>
                  <td className="px-5 py-4 text-right">
                    <button type="button" onClick={() => setSelected(staff)} className="text-sm font-medium text-water hover:underline">Xem</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="px-5 py-12 text-center text-sm text-slate-400">Không tìm thấy nhân sự phù hợp.</p>}
        </div>
      </PreviewPanel>

      {(selected || addOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) closeDialog();
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="staff-preview-title" className="w-full max-w-xl rounded-2xl border border-slate-700 bg-card p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-wider text-water">Quản lý nhân sự</p>
                <h2 id="staff-preview-title" className="mt-1 text-xl font-bold text-white">{selected ? "Chi tiết nhân sự" : "Thêm nhân sự"}</h2>
              </div>
              <button type="button" aria-label="Đóng" onClick={closeDialog} className="rounded-lg p-2 text-slate-400 hover:bg-slate-700 hover:text-white">
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                ["Mã nhân sự", selected?.id ?? "Tự động cấp khi kết nối API"],
                ["Họ tên", selected?.name ?? ""],
                ["Đội cứu hộ", selected?.team ?? ""],
                ["Khu vực phụ trách", selected?.area ?? ""],
                ["Ca trực", selected?.shift ?? ""],
                ["Trạng thái", selected ? statusLabel[selected.status] : ""],
              ].map(([label, value]) => (
                <label key={label} className="space-y-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                  <span>{label}</span>
                  <input value={value} readOnly placeholder={selected ? undefined : label} className={`${previewInputClass} cursor-default text-slate-300`} />
                </label>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
              <p className="text-xs text-slate-400">Bản xem trước • Chưa kết nối API nhân sự</p>
              <button type="button" onClick={closeDialog} className={previewSecondaryButton}>Đóng</button>
            </div>
          </section>
        </div>
      )}
    </AdminUiPreview>
  );
}
