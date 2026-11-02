// File: web/src/pages/admin/flood-area/floodAreaService.ts
// "mock": simulated areas kept in memory (CCF-119, UI only). Switch to "api" in CCF-124.

import { FloodAreaError, type FloodAreaInput, type FloodAreaItem } from "./floodAreaTypes";

export const DATA_SOURCE: "mock" | "api" = "mock";

const MOCK: FloodAreaItem[] = [
  {
    id: "mock-area-1",
    name: "Vùng trũng ven sông (TEST ONLY)",
    description: "Dữ liệu mô phỏng để kiểm thử giao diện, không phải vùng ngập thực tế.",
    severity: "high",
    status: "active",
    source: "TEST ONLY",
    geometry: {
      type: "polygon",
      points: [
        { latitude: 16.062, longitude: 108.195 },
        { latitude: 16.07, longitude: 108.215 },
        { latitude: 16.055, longitude: 108.225 },
        { latitude: 16.048, longitude: 108.205 },
      ],
    },
    linkedAlerts: 0,
  },
  {
    id: "mock-area-2",
    name: "Khu dân cư có cảnh báo liên kết (TEST ONLY)",
    description: "Mô phỏng vùng đang được cảnh báo tham chiếu: xóa sẽ bị từ chối (409).",
    severity: "critical",
    status: "active",
    source: "TEST ONLY",
    geometry: {
      type: "polygon",
      points: [
        { latitude: 16.04, longitude: 108.18 },
        { latitude: 16.045, longitude: 108.19 },
        { latitude: 16.035, longitude: 108.195 },
      ],
    },
    linkedAlerts: 2,
  },
  {
    id: "mock-area-3",
    name: "Vùng đã hết nguy cơ (TEST ONLY)",
    description: "Mô phỏng vùng đã ngừng hoạt động.",
    severity: "low",
    status: "inactive",
    source: "TEST ONLY",
    geometry: {
      type: "polygon",
      points: [
        { latitude: 16.08, longitude: 108.16 },
        { latitude: 16.085, longitude: 108.17 },
        { latitude: 16.075, longitude: 108.175 },
      ],
    },
    linkedAlerts: 0,
  },
];

let store: FloodAreaItem[] = MOCK.map((a) => ({ ...a, geometry: { ...a.geometry, points: a.geometry.points.map((p) => ({ ...p })) } }));
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
let seq = 0;

export async function listAreas(): Promise<FloodAreaItem[]> {
  await wait(250);
  return store.map((a) => ({ ...a }));
}

export async function createArea(input: FloodAreaInput): Promise<FloodAreaItem> {
  await wait(250);
  seq += 1;
  const created: FloodAreaItem = { ...input, id: `mock-area-new-${seq}`, linkedAlerts: 0 };
  store = [created, ...store];
  return { ...created };
}

export async function updateArea(id: string, patch: Partial<FloodAreaInput>): Promise<FloodAreaItem> {
  await wait(250);
  const current = store.find((a) => a.id === id);
  if (!current) throw new FloodAreaError("Không tìm thấy vùng ngập này (có thể đã bị xóa).", 404);
  const next = { ...current, ...patch };
  store = store.map((a) => (a.id === id ? next : a));
  return { ...next };
}

/** A real API answers 409 when alerts still reference the area; the mock reproduces that. */
export async function deleteArea(id: string): Promise<void> {
  await wait(250);
  const current = store.find((a) => a.id === id);
  if (!current) throw new FloodAreaError("Không tìm thấy vùng ngập này (có thể đã bị xóa).", 404);
  if ((current.linkedAlerts ?? 0) > 0) {
    throw new FloodAreaError(`Vùng này đang có ${current.linkedAlerts} cảnh báo liên kết nên không thể xóa.`, 409);
  }
  store = store.filter((a) => a.id !== id);
}
