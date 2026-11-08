import type { SosFilters, SosItem, SosSummary } from "./sosTypes.ts";

/** Synthetic UI fixtures only. These names, IDs and business labels are not an API proposal. */
export function createMockSos(now = new Date()): SosItem[] {
  const at = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
  return [
    {
      id: "DEMO-SOS-003", residentId: "DEMO-RESIDENT-03", senderName: "Người dân mẫu 03",
      contact: "Liên hệ minh họa", createdAt: at(0.5), updatedAt: at(0.05),
      situations: ["Bị cô lập do ngập", "Có người cần hỗ trợ di chuyển"], numberOfPeople: 4,
      waterLevel: "Khoảng 1 m (minh họa)", note: "Dữ liệu mẫu: gia đình đang ở tầng hai.",
      condition: "active", location: { latitude: 16.061, longitude: 108.201 },
      locationUpdatedAt: at(0.05), confirmedBy: null, completedAt: null, source: "mock",
    },
    {
      id: "DEMO-SOS-002", residentId: "DEMO-RESIDENT-02", senderName: "Người dân mẫu 02",
      contact: null, createdAt: at(3), updatedAt: at(0.75),
      situations: ["Cần sơ tán"], numberOfPeople: 2, waterLevel: "Ngang đầu gối (minh họa)",
      note: "Dữ liệu mẫu: đã được đưa đến vị trí an toàn.", condition: "rescued",
      location: { latitude: 16.038, longitude: 108.215 }, locationUpdatedAt: at(1),
      confirmedBy: "Nhân viên cứu hộ mẫu 01", completedAt: at(0.75), source: "mock",
    },
    {
      id: "DEMO-SOS-001", residentId: "DEMO-RESIDENT-01", senderName: null, contact: null,
      createdAt: at(26), updatedAt: at(25), situations: ["Bị cô lập do ngập"], numberOfPeople: 1,
      waterLevel: null, note: null, condition: "active",
      location: { latitude: 16.075, longitude: 108.19 }, locationUpdatedAt: at(25),
      confirmedBy: null, completedAt: null, source: "mock",
    },
  ];
}

/** Filters apply to the entire fixture dataset, never to one page. */
export function filterMockSos(items: SosItem[], filters: SosFilters): SosItem[] {
  const search = filters.search.trim().toLocaleLowerCase("vi");
  // Match the displayed Vietnam calendar (UTC+7), including the entire selected final day.
  const from = filters.from ? Date.parse(`${filters.from}T00:00:00+07:00`) : -Infinity;
  const to = filters.to ? Date.parse(`${filters.to}T00:00:00+07:00`) + 86_400_000 : Infinity;
  return items.filter(item => {
    const time = item.createdAt ? Date.parse(item.createdAt) : NaN;
    return (filters.condition === "all" || item.condition === filters.condition) &&
      (!filters.from && !filters.to || time >= from && time < to) &&
      (!search || [item.id, item.senderName, item.contact].some(value => value?.toLocaleLowerCase("vi").includes(search)));
  }).sort((a, b) => {
    const difference = Date.parse(a.createdAt ?? "") - Date.parse(b.createdAt ?? "");
    return (filters.sort === "oldest" ? difference : -difference) || a.id.localeCompare(b.id);
  });
}

export function summarizeMockSos(items: SosItem[]): SosSummary {
  return { total: items.length, active: items.filter(item => item.condition === "active").length,
    rescued: items.filter(item => item.condition === "rescued").length, source: "mock" };
}

// One dataset per page session: navigating or refreshing must not recreate SOS event times.
const sessionData = createMockSos();

export function getMockSos(): SosItem[] {
  return structuredClone(sessionData);
}
