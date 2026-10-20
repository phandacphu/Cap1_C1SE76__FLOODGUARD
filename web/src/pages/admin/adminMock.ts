/**
 * Simulated data for dashboard blocks that have no API yet
 * (audit feed, infrastructure) or whose API is not reachable
 * (admin SOS list / users). Every block that shows it carries a "MÔ PHỎNG" tag.
 */
import type { StatusCounts, HourlyPoint } from "./adminStats";

export interface AuditEntry {
  time: string;
  tag: "CẢNH BÁO" | "HỆ THỐNG" | "CỨU HỘ" | "ĐỊA ĐIỂM" | "BẢO MẬT";
  actor: string;
  text: string;
}

export const MOCK_AUDIT: AuditEntry[] = [
  {
    time: "14:52:10 ICT",
    tag: "CẢNH BÁO",
    actor: "Quản trị viên",
    text: "ban hành khẩn cấp Cảnh báo lũ lưu vực sông.",
  },
  {
    time: "14:48:05 ICT",
    tag: "HỆ THỐNG",
    actor: "IoT Gateway",
    text: "tự động đồng bộ số liệu quan trắc trạm Cẩm Lệ.",
  },
  {
    time: "14:41:22 ICT",
    tag: "CỨU HỘ",
    actor: "Rescue Staff",
    text: "Đội ca nô ST-40 hoàn thành tiếp cận và sơ tán nạn nhân.",
  },
  {
    time: "14:35:10 ICT",
    tag: "ĐỊA ĐIỂM",
    actor: "Quản trị viên",
    text: "cập nhật số liệu tiếp nhận điểm an toàn.",
  },
  {
    time: "14:20:44 ICT",
    tag: "BẢO MẬT",
    actor: "Security",
    text: "phiên đăng nhập hợp lệ từ IP nội bộ.",
  },
];

export interface InfraRow {
  name: string;
  detail: string;
}

export const MOCK_INFRA: InfraRow[] = [
  { name: "Realtime Sync (DB)", detail: "42ms · Trực tuyến" },
  { name: "GIS Map CDN", detail: "38ms · Trực tuyến" },
  { name: "SMS / Zalo SOS API", detail: "110ms · Sẵn sàng" },
  { name: "IoT Radar Thủy văn", detail: "48/48 Trạm OK" },
];

export const MOCK_RESOURCES = [
  { label: "CPU LOAD", value: 24 },
  { label: "RAM USAGE", value: 26 },
  { label: "STORAGE SSD", value: 38 },
];

export const MOCK_STATUS_COUNTS: StatusCounts = {
  submitted: 60,
  received: 146,
  in_progress: 218,
  assisted: 842,
  cancelled: 18,
};

export const MOCK_SERIES: HourlyPoint[] = [
  4, 6, 9, 14, 22, 35, 52, 71, 84, 66, 41, 30, 26, 24, 33, 47, 58, 62, 55, 49, 52, 58, 64, 60,
].map((created, i) => ({
  hour: i,
  created,
  assisted: Math.round(created * 0.62),
}));
