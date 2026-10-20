import type { IconName } from "../ui/Icon";

export interface NavItem {
  label: string;
  icon: IconName;
  /** Route to open. Items without `to` are shown as "coming soon". */
  to?: string;
}

/** Admin sidebar (Figma: Admin Command C4I). Only finished screens have a route. */
export const ADMIN_NAV: NavItem[] = [
  { label: "Tổng quan", icon: "dashboard", to: "/admin/dashboard" },
  { label: "Bản đồ trực quan", icon: "map" },
  { label: "Theo dõi SOS", icon: "sos" },
  { label: "Quản lý cảnh báo lũ", icon: "alert" },
  { label: "Quản lý vùng ngập", icon: "flood" },
  { label: "Quản lý địa điểm an toàn", icon: "shield" },
  { label: "Quản lý người dùng", icon: "users" },
  { label: "Quản lý Rescue Staff", icon: "staff" },
  { label: "Thông báo", icon: "bell" },
  { label: "Báo cáo", icon: "report" },
  { label: "Audit Log", icon: "audit" },
  { label: "Cài đặt hệ thống", icon: "settings" },
  { label: "Dữ liệu demo/hệ thống", icon: "database" },
];

/** Rescue sidebar (Figma: Rescue Staff). Used by the Rescue screens. */
export const RESCUE_NAV: NavItem[] = [
  { label: "Tổng quan cứu hộ", icon: "dashboard", to: "/rescue/dashboard" },
  { label: "Bản đồ trực quan", icon: "map" },
  { label: "Yêu cầu SOS", icon: "sos", to: "/rescue/sos" },
  { label: "Cảnh báo lũ", icon: "alert" },
  { label: "Địa điểm an toàn", icon: "shield" },
  { label: "Lịch sử cứu hộ", icon: "history" },
];
