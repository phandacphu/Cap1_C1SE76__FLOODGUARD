import { ApiError } from "../../../api/http";
import type { SafeLocation, SafeLocationSource } from "./safeLocationTypes";

const delay = () => new Promise((resolve) => setTimeout(resolve, 350));

export function createSafeLocationDemo(): SafeLocationSource {
  let locations: SafeLocation[] = [
    { id: "TEST-SAFE-01", name: "Điểm sơ tán mô phỏng A", address: "Địa chỉ giả lập A", type: "shelter", capacity: 120, status: "active", location: { latitude: 16.0426, longitude: 108.2028 } },
    { id: "TEST-SAFE-02", name: "Trường học mô phỏng B", address: "Địa chỉ giả lập B", type: "school", capacity: 80, status: "active", location: { latitude: 16.0721, longitude: 108.2151 } },
    { id: "TEST-SAFE-03", name: "Nhà văn hóa mô phỏng C", address: "Địa chỉ giả lập C", type: "community_center", capacity: 0, status: "inactive", location: { latitude: 16.0617, longitude: 108.1695 } },
  ];

  function update(id: string, changes: Partial<Omit<SafeLocation, "id">>) {
    const current = locations.find((location) => location.id === id);
    if (!current) throw new ApiError("Địa điểm không tồn tại.", 404);
    const saved = { ...current, ...changes };
    locations = locations.map((location) => location.id === id ? saved : location);
    return saved;
  }

  return {
    demo: true,
    async list() {
      await delay();
      return [...locations];
    },
    async save(id, fields) {
      await delay();
      if (id) return update(id, fields);
      const created = { ...fields, id: `TEST-SAFE-${crypto.randomUUID().slice(0, 8)}` };
      locations = [created, ...locations];
      return created;
    },
    async setStatus(id, status) {
      await delay();
      return update(id, { status });
    },
  };
}
