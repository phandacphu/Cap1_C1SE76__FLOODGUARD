// File: web/src/pages/admin/flood-warning/FloodWarningManagementScreen.tsx

import { useState, useMemo } from "react";

export interface FloodWarning {
  id: string;
  title: string;
  areaId: string;
  areaName: string;
  severity: "Khẩn cấp" | "Cao" | "Trung bình" | "Thấp";
  status: "active" | "inactive";
  startAt: string;
  endAt: string;
  content: string;
}

const MOCK_WARNINGS: FloodWarning[] = [
  {
    id: "ALER-01",
    title: "Cảnh báo lũ khẩn cấp thượng lưu sông Cu Đê",
    areaId: "VN-014",
    areaName: "Sông Cu Đê - Hòa Bắc",
    severity: "Khẩn cấp",
    status: "active",
    startAt: "2026-10-28T06:00:00Z",
    endAt: "2026-10-29T18:00:00Z",
    content: "Mực nước dâng nhanh trên báo động 3, yêu cầu sơ tán người dân vùng thấp trũng.",
  },
  {
    id: "ALER-02",
    title: "Cảnh báo ngập úng đô thị khu vực Liên Chiểu",
    areaId: "VN-008",
    areaName: "Vùng trũng kiệt Mẹ Suốt",
    severity: "Cao",
    status: "active",
    startAt: "2026-10-28T08:00:00Z",
    endAt: "2026-10-29T12:00:00Z",
    content: "Ngập úng cục bộ tại các tuyến đường giao thông chính do triều cường kết hợp mưa lớn.",
  },
  {
    id: "ALER-03",
    title: "Cảnh báo lũ quét và sạt lở đất Đại Lộc",
    areaId: "VN-015",
    areaName: "Rốn lũ Đại Cường - Đại Lộc",
    severity: "Khẩn cấp",
    status: "inactive",
    startAt: "2026-10-20T00:00:00Z",
    endAt: "2026-10-22T00:00:00Z",
    content: "Cảnh báo đã hết hiệu lực. Khu vực đang trong giai đoạn khắc phục.",
  },
];

export default function FloodWarningManagementScreen() {
  const [warnings] = useState<FloodWarning[]>(MOCK_WARNINGS);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Xử lý lọc danh sách phía client
  const filteredWarnings = useMemo(() => {
    return warnings.filter((item) => {
      const matchSearch =
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        item.areaId.toLowerCase().includes(search.toLowerCase()) ||
        item.areaName.toLowerCase().includes(search.toLowerCase());
      
      const matchSeverity = severityFilter === "all" || item.severity === severityFilter;
      const matchStatus = statusFilter === "all" || item.status === statusFilter;

      return matchSearch && matchSeverity && matchStatus;
    });
  }, [warnings, search, severityFilter, statusFilter]);

  // Kiểm tra thời gian hiệu lực thực tế so với hiện tại
  const checkValidity = (startAt: string, endAt: string, status: string) => {
    if (status !== "active") return { label: "Đã vô hiệu", color: "bg-slate-500/10 text-slate-400" };
    const now = new Date().getTime();
    const start = new Date(startAt).getTime();
    const end = new Date(endAt).getTime();

    if (now < start) return { label: "Sắp tới", color: "bg-blue-500/10 text-blue-400" };
    if (now > end) return { label: "Đã hết hạn", color: "bg-red-500/10 text-red-400" };
    return { label: "Đang hiệu lực", color: "bg-emerald-500/10 text-emerald-400" };
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 text-slate-200">
      {/* HEADER */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-700/60 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 mb-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            QUẢN TRỊ HỆ THỐNG • CẢNH BÁO THIÊN TAI & LŨ LỤT
          </div>
          <h1 className="text-2xl font-bold text-white uppercase tracking-wide">
            Quản lý cảnh báo lũ (Flood Warning Management)
          </h1>
          <p className="mt-1 text-sm text-slate-400 max-w-3xl">
            Phát hành, theo dõi thời gian hiệu lực và quản lý các bản tin cảnh báo rủi ro thiên tai phục vụ cộng đồng.
          </p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="rounded bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition flex items-center gap-2"
        >
          <span>+ Phát hành cảnh báo mới</span>
        </button>
      </div>

      {/* KPI STATS CARDS (FLAT DESIGN - NO GRADIENT) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-800 border border-slate-700 p-5">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-1">Tổng bản tin cảnh báo</div>
          <div className="text-3xl font-bold text-white">{warnings.length}</div>
          <div className="mt-2 text-xs text-slate-400">Dữ liệu quản trị hệ thống</div>
        </div>
        <div className="rounded-xl bg-slate-800 border border-emerald-500/30 p-5">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-1">Đang hoạt động (Active)</div>
          <div className="text-3xl font-bold text-emerald-400">
            {warnings.filter(w => w.status === 'active').length}
          </div>
          <div className="mt-2 text-xs text-emerald-300">Sẵn sàng đồng bộ mobile</div>
        </div>
        <div className="rounded-xl bg-slate-800 border border-slate-700 p-5">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-1">Đã lưu trữ / Vô hiệu</div>
          <div className="text-3xl font-bold text-slate-400">
            {warnings.filter(w => w.status === 'inactive').length}
          </div>
          <div className="mt-2 text-xs text-slate-400">Không hiển thị công khai</div>
        </div>
      </div>

      {/* TOOLBAR & FILTERS */}
      <div className="rounded-xl bg-slate-800 border border-slate-700 p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Tìm theo tiêu đề cảnh báo, mã vùng (VD: VN-014), tên lưu vực..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-400">Mức độ:</span>
              <select 
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="all">Tất cả</option>
                <option value="Khẩn cấp">Khẩn cấp</option>
                <option value="Cao">Cao</option>
                <option value="Trung bình">Trung bình</option>
                <option value="Thấp">Thấp</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-400">Trạng thái:</span>
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="all">Tất cả</option>
                <option value="active">Active (Hoạt động)</option>
                <option value="inactive">Inactive (Vô hiệu)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* DATA TABLE */}
      <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-800">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-900/60 text-xs font-mono uppercase text-slate-400">
            <tr>
              <th className="px-5 py-3.5 font-medium">Tiêu đề bản tin & Khu vực</th>
              <th className="px-5 py-3.5 font-medium">Mức độ</th>
              <th className="px-5 py-3.5 font-medium">Trạng thái hệ thống</th>
              <th className="px-5 py-3.5 font-medium">Khung thời gian hiệu lực (UTC)</th>
              <th className="px-5 py-3.5 font-medium text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {filteredWarnings.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-slate-400">
                  Không tìm thấy bản tin cảnh báo nào phù hợp.
                </td>
              </tr>
            ) : (
              filteredWarnings.map((item) => {
                const validity = checkValidity(item.startAt, item.endAt, item.status);
                return (
                  <tr key={item.id} className="hover:bg-slate-700/30 transition">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-white">{item.title}</div>
                      <div className="font-mono text-xs text-slate-400">
                        Vùng ID: <span className="text-blue-400">{item.areaId}</span> ({item.areaName})
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium 
                        ${item.severity === "Khẩn cấp" ? "bg-red-500/20 text-red-400" : 
                          item.severity === "Cao" ? "bg-amber-500/20 text-amber-400" : 
                          "bg-blue-500/20 text-blue-400"}`}>
                        {item.severity}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${validity.color}`}>
                          {validity.label}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">({item.status})</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-300">
                      <div>Từ: {new Date(item.startAt).toLocaleString()}</div>
                      <div>Đến: {new Date(item.endAt).toLocaleString()}</div>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button 
                        onClick={() => alert(`Xem chi tiết bản tin: ${item.id}`)}
                        className="rounded bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-600 transition"
                      >
                        Chỉnh sửa
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <div className="border-t border-slate-700 bg-slate-900/40 px-5 py-3 text-xs font-mono text-slate-400 flex justify-between items-center">
          <span>Hiển thị {filteredWarnings.length} / {warnings.length} bản tin cảnh báo</span>
          <span>(Lưu ý: Backend không hỗ trợ DELETE bản tin warning)</span>
        </div>
      </div>

      {/* CREATE MODAL SIMULATION */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-slate-800 border border-slate-700 shadow-2xl overflow-hidden">
            <div className="border-b border-slate-700 bg-slate-900/50 px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-white">Phát hành Bản tin Cảnh báo Mới (CCF-120 UI)</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Tiêu đề cảnh báo</label>
                <input type="text" placeholder="Ví dụ: Cảnh báo lũ dâng cao tại khu vực..." className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:border-blue-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Mã khu vực (areaId)</label>
                  <select className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:border-blue-500 outline-none">
                    <option value="VN-014">VN-014 (Sông Cu Đê)</option>
                    <option value="VN-008">VN-008 (Mẹ Suốt)</option>
                    <option value="VN-015">VN-015 (Đại Lộc)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Mức độ (severity)</label>
                  <select className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:border-blue-500 outline-none">
                    <option value="Khẩn cấp">Khẩn cấp</option>
                    <option value="Cao">Cao</option>
                    <option value="Trung bình">Trung bình</option>
                    <option value="Thấp">Thấp</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Thời gian bắt đầu (StartAt)</label>
                  <input type="datetime-local" className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Thời gian kết thúc (EndAt)</label>
                  <input type="datetime-local" className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:border-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Nội dung chi tiết</label>
                <textarea rows={3} placeholder="Nhập thông tin chi tiết chỉ đạo ứng phó..." className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"></textarea>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded p-3 text-xs text-amber-400">
                Quy chuẩn CCF-120: Bản tin sau khi tạo sẽ được liên kết trực tiếp với areaId đã chọn và hiển thị trạng thái hiệu lực theo thời gian thực.
              </div>
            </div>
            <div className="border-t border-slate-700 p-4 flex justify-end gap-3 bg-slate-900/50">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700">Hủy</button>
              <button onClick={() => { alert("Đã tạo bản tin cảnh báo mẫu thành công!"); setIsModalOpen(false); }} className="px-4 py-2 rounded text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 transition">Phát hành</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}