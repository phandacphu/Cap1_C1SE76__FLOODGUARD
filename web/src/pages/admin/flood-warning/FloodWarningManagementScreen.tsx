// File: web/src/pages/admin/flood-warning/FloodWarningManagementScreen.tsx

import React, { useState, useMemo } from "react";

export interface FloodWarning {
  id: string;
  code: string;
  title: string;
  district: string;
  waterLevel: string;
  trend: string;
  severity: "Khẩn cấp" | "Cao" | "Trung bình" | "Thấp";
  status: "Đang ngập sâu" | "Nước rút dần" | "Ngập vừa" | "Ổn định";
}

const MOCK_WARNINGS: FloodWarning[] = [
  {
    id: "ALER-01",
    code: "VN-014",
    title: "Sông Cu Đê - Hòa Bắc",
    district: "Hòa Vang",
    waterLevel: "2.10m",
    trend: "+18cm/h",
    severity: "Khẩn cấp",
    status: "Đang ngập sâu",
  },
  {
    id: "ALER-02",
    code: "VN-008",
    title: "Vùng trũng kiệt Mẹ Suốt",
    district: "Liên Chiểu",
    waterLevel: "1.65m",
    trend: "+8cm/h",
    severity: "Khẩn cấp",
    status: "Đang ngập sâu",
  },
  {
    id: "ALER-03",
    code: "VN-012",
    title: "Vùng ven sông Cầu Đỏ",
    district: "Cẩm Lệ",
    waterLevel: "1.20m",
    trend: "Đang hạ",
    severity: "Cao",
    status: "Nước rút dần",
  },
  {
    id: "ALER-04",
    code: "VN-015",
    title: "Rốn lũ Đại Cường - Đại Lộc",
    district: "Đại Lộc",
    waterLevel: "1.85m",
    trend: "+25cm/h",
    severity: "Khẩn cấp",
    status: "Đang ngập sâu",
  },
  {
    id: "ALER-05",
    code: "VN-003",
    title: "Vùng trũng thấp Hòa Khương",
    district: "Hòa Vang",
    waterLevel: "0.75m",
    trend: "- Ổn định",
    severity: "Trung bình",
    status: "Ngập vừa",
  },
  {
    id: "ALER-06",
    code: "VN-006",
    title: "Cánh đồng Hòa Tiến",
    district: "Hòa Vang",
    waterLevel: "0.42m",
    trend: "-4cm/h",
    severity: "Thấp",
    status: "Nước rút dần",
  }
];

export default function FloodWarningManagementScreen() {
  const [warnings] = useState<FloodWarning[]>(MOCK_WARNINGS);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>("ALER-01");

  // Lọc dữ liệu
  const filteredWarnings = useMemo(() => {
    return warnings.filter((item) =>
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.code.toLowerCase().includes(search.toLowerCase())
    );
  }, [warnings, search]);

  const selectedWarning = warnings.find(w => w.id === selectedId) || warnings[0];

  return (
    <div className="min-h-screen bg-[#0B1121] text-slate-300 font-sans p-4 lg:p-6">
      
      {/* --- HEADER --- */}
      <div className="mb-6 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-3 text-[10px] font-mono font-bold tracking-wider mb-3">
          <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">Hệ thống tác chiến C4I</span>
          <span className="px-2 py-1 rounded bg-slate-800 text-slate-400 border border-slate-700 uppercase">Dữ liệu mô phỏng</span>
          <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">SENTINEL-1B SAR / IOT TELEMETRY ACTIVE</span>
        </div>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white uppercase tracking-wide">Quản lý cảnh báo lũ & Lưu vực sông</h1>
            <p className="mt-1 text-sm text-slate-400">Giám sát, phân vùng ngập úng, đo đạc cao trình thủy văn và phát hành cảnh báo sơ tán khẩn cấp.</p>
          </div>
          <div className="flex gap-3">
            <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded border border-slate-700 transition-colors">
              Đồng bộ trạm IoT
            </button>
            <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded border border-slate-700 transition-colors">
              Xuất GeoJSON
            </button>
          </div>
        </div>
      </div>

      {/* --- KPI CARDS --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
          <div className="text-[10px] font-mono uppercase text-slate-500 mb-1 flex justify-between">
            <span>Tổng vùng cảnh báo</span>
            <span className="text-slate-400">🌊</span>
          </div>
          <div className="text-3xl font-bold text-white flex items-baseline gap-2">
            14 <span className="text-sm font-normal text-slate-400">phân vùng</span>
          </div>
          <div className="mt-2 text-xs text-emerald-400 flex justify-between">
            <span>+2 vùng mới (3h qua)</span>
            <span className="text-slate-500">DỮ LIỆU MÔ PHỎNG</span>
          </div>
        </div>

        <div className="bg-[#111827] border border-rose-900/30 rounded-lg p-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/5 rounded-bl-full"></div>
          <div className="text-[10px] font-mono uppercase text-rose-500 mb-1 flex justify-between">
            <span>Ngập khẩn cấp {'>'} 1.5m</span>
            <span className="text-rose-500">⚠️</span>
          </div>
          <div className="text-3xl font-bold text-rose-400 flex items-baseline gap-2">
            04 <span className="text-sm font-normal text-slate-400">vùng cô lập</span>
          </div>
          <div className="mt-2 text-xs text-rose-400 flex justify-between">
            <span>BÁO ĐỘNG DI DỜI DÂN CƯ</span>
            <span className="text-slate-500">DỮ LIỆU MÔ PHỎNG</span>
          </div>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
          <div className="text-[10px] font-mono uppercase text-cyan-500 mb-1 flex justify-between">
            <span>Diện tích ngập ước tính</span>
            <span className="text-cyan-500">📐</span>
          </div>
          <div className="text-3xl font-bold text-white flex items-baseline gap-2">
            68.4 <span className="text-sm font-normal text-slate-400">km²</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex justify-between">
            <span>Lưu vực Cu Đê - Túy Loan</span>
            <span className="text-slate-500">DỮ LIỆU MÔ PHỎNG</span>
          </div>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
          <div className="text-[10px] font-mono uppercase text-amber-500 mb-1 flex justify-between">
            <span>Dân cư vùng nguy hiểm</span>
            <span className="text-amber-500">👥</span>
          </div>
          <div className="text-3xl font-bold text-white flex items-baseline gap-2">
            82.450 <span className="text-sm font-normal text-slate-400">người</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex justify-between">
            <span>19.200 hộ gia đình</span>
            <span className="text-slate-500">DỮ LIỆU MÔ PHỎNG</span>
          </div>
        </div>
      </div>

      {/* --- MAIN CONTENT SPLIT --- */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: TOOLBAR & TABLE */}
        <div className="xl:col-span-7 flex flex-col gap-4">
          
          {/* Toolbar */}
          <div className="flex flex-wrap gap-3 items-center">
            <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded shadow-none transition-colors">
              + Thêm vùng ngập
            </button>
            <input 
              type="text" 
              placeholder="Tìm tên vùng ngập, lưu vực, mã ID..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[200px] px-4 py-2 bg-[#111827] border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <select className="px-3 py-2 bg-[#111827] border border-slate-700 rounded text-sm text-slate-300 focus:outline-none">
              <option>Mức độ: Tất cả</option>
              <option>Khẩn cấp</option>
            </select>
            <select className="px-3 py-2 bg-[#111827] border border-slate-700 rounded text-sm text-slate-300 focus:outline-none">
              <option>Trạng thái: Tất cả</option>
            </select>
          </div>

          {/* Table */}
          <div className="bg-[#111827] border border-slate-800 rounded-lg overflow-x-auto flex-1">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-[#0B1120] text-[10px] font-mono uppercase text-slate-500 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3 font-semibold">Tên vùng cảnh báo & Mã ID</th>
                  <th className="px-4 py-3 font-semibold">Khu vực</th>
                  <th className="px-4 py-3 font-semibold">Mực nước (Biến thiên)</th>
                  <th className="px-4 py-3 font-semibold">Mức độ</th>
                  <th className="px-4 py-3 font-semibold">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredWarnings.map((item) => {
                  const isSelected = selectedId === item.id;
                  return (
                    <tr 
                      key={item.id} 
                      onClick={() => setSelectedId(item.id)}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-900/10 border-l-2 border-l-blue-500' : 'hover:bg-slate-800/40 border-l-2 border-l-transparent'}`}
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{item.title}</span>
                          {isSelected && <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[10px] font-mono">ĐANG CHỌN</span>}
                        </div>
                        <div className="text-xs font-mono text-slate-500 mt-1">#{item.code}</div>
                      </td>
                      <td className="px-4 py-4 text-slate-300">{item.district}</td>
                      <td className="px-4 py-4">
                        <div className="text-white font-mono">{item.waterLevel}</div>
                        <div className={`text-[10px] font-mono ${item.trend.includes('+') ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {item.trend.includes('+') ? '↑' : '↓'} {item.trend.replace(/[-+]/g, '')}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase border ${
                          item.severity === 'Khẩn cấp' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                          item.severity === 'Cao' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                          item.severity === 'Trung bình' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                          'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                        }`}>
                          {item.severity}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`text-xs font-medium ${
                          item.status === 'Đang ngập sâu' ? 'text-rose-400' :
                          item.status === 'Nước rút dần' ? 'text-blue-400' :
                          'text-slate-400'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          <div className="text-xs font-mono text-slate-500 mt-2">
            Hiển thị 1 - {filteredWarnings.length} của 14 vùng ngập • Trang 1/3
          </div>
        </div>

        {/* RIGHT COLUMN: MAP PREVIEW & DETAILS */}
        <div className="xl:col-span-5 flex flex-col gap-4">
          
          <div className="bg-[#111827] border border-slate-800 rounded-lg overflow-hidden flex flex-col">
            
            {/* Map Toolbar */}
            <div className="p-3 border-b border-slate-800 flex flex-wrap gap-2 justify-between items-center bg-[#0B1120]/50">
              <div className="text-[10px] font-mono text-slate-400 uppercase">
                Chế độ số hóa đa giác<br/>(Polygon GIS)
              </div>
              <div className="flex gap-2">
                <button className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded border border-slate-700">✎ Chỉnh sửa đỉnh</button>
                <button className="px-3 py-1.5 bg-emerald-600/20 text-emerald-400 text-xs rounded border border-emerald-500/30">✓ Lưu tọa độ</button>
              </div>
            </div>

            {/* Map Simulation Container */}
            <div className="relative w-full h-64 bg-[#0B1121] flex items-center justify-center overflow-hidden">
              {/* Grid Background */}
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(#334155 1px, transparent 1px), linear-gradient(90deg, #334155 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
              
              {/* Simulated Polygon Map Vector */}
              <svg className="absolute w-64 h-64 text-rose-500" viewBox="0 0 100 100" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1">
                <polygon points="40,20 80,30 90,70 50,85 20,60" strokeDasharray="2 1" />
                <circle cx="40" cy="20" r="2" fill="#f43f5e" />
                <circle cx="80" cy="30" r="2" fill="#f43f5e" />
                <circle cx="90" cy="70" r="2" fill="#f43f5e" />
                <circle cx="50" cy="85" r="2" fill="#f43f5e" />
                <circle cx="20" cy="60" r="2" fill="#f43f5e" />
              </svg>
              
              {/* Map Floating UI */}
              <div className="absolute top-3 left-3 bg-[#0B1121]/90 border border-slate-700 p-2 rounded text-[10px] font-mono text-slate-300">
                <div>⌖ TÂM VÙNG: 16°04'12.8"N 108°11'05.4"E</div>
                <div className="text-slate-500 mt-1">DT: 18.6 km² • CHU VI: 22.4 km • ĐỈNH: 12 nodes</div>
              </div>

              {/* Central Alert Marker */}
              <div className="absolute z-10 flex flex-col items-center">
                <div className="w-4 h-4 bg-rose-500 rounded-full animate-ping absolute opacity-75"></div>
                <div className="w-3 h-3 bg-rose-500 border-2 border-white rounded-full relative z-10"></div>
                <div className="mt-2 px-2 py-1 bg-[#0B1121]/90 border border-rose-500/50 rounded text-[10px] font-bold font-mono text-rose-400 text-center">
                  [!] VÙNG NGẬP KHẨN CẤP {selectedWarning.code}<br/>
                  MỰC NƯỚC: {selectedWarning.waterLevel} ({selectedWarning.trend})
                </div>
              </div>
            </div>

            {/* Warning Detail Info */}
            <div className="p-5 flex flex-col gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-rose-500/20 text-rose-400 text-[10px] font-bold rounded uppercase border border-rose-500/30">Báo động đỏ</span>
                  <span className="text-[10px] font-mono text-slate-500">MÃ HỒ SƠ: {selectedWarning.code}-CB-2026</span>
                </div>
                <h3 className="text-lg font-bold text-white leading-snug">#{selectedWarning.code} - Vùng cảnh báo lũ <br/>{selectedWarning.title}</h3>
                <div className="text-xs text-slate-400 mt-1 uppercase font-mono tracking-wider">Dữ liệu mô phỏng</div>
              </div>

              <div className="grid grid-cols-3 gap-3 border-t border-slate-800 pt-4">
                <div>
                  <div className="text-[10px] font-mono text-slate-500 mb-1">TRẠM QUAN TRẮC</div>
                  <div className="text-sm font-bold text-slate-200">Cu Đê TB-04</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Tự động 5 phút/lần</div>
                </div>
                <div>
                  <div className="text-[10px] font-mono text-slate-500 mb-1">DÂN SỐ ẢNH HƯỞNG</div>
                  <div className="text-sm font-bold text-rose-400">2.450 hộ dân</div>
                  <div className="text-[10px] text-rose-500/70 mt-0.5">8.120 nhân khẩu rủi ro</div>
                </div>
                <div>
                  <div className="text-[10px] font-mono text-slate-500 mb-1">DỰ BÁO ĐỈNH LŨ</div>
                  <div className="text-sm font-bold text-orange-400">2.45m (+35cm)</div>
                  <div className="text-[10px] text-orange-500/70 mt-0.5">Đỉnh điểm vào 18:30</div>
                </div>
              </div>

              <div className="flex gap-3 mt-2">
                <button className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded transition-colors">
                  Cập nhật ranh giới
                </button>
                <button className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold rounded shadow-none transition-colors">
                  Ban hành cảnh báo ngay
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}