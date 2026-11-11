import { ApiError } from "../../../api/http";
import type { SafeLocation, SafeLocationSource } from "./safeLocationTypes";

const delay = () => new Promise((resolve) => setTimeout(resolve, 350));

/** Isolated development fixture; the real Admin route must never fall back to this on API errors. */
export function createSafeLocationDemo(): SafeLocationSource {
  let locations: SafeLocation[] = [
    {
      id: "TEST-SAFE-01", name: "Điểm sơ tán mô phỏng A", address: "Địa chỉ giả lập A",
      type: "shelter", description: "Dữ liệu TEST ONLY", location: { latitude: 16.0426, longitude: 108.2028 },
      createdAt: null, updatedAt: null,
    },
    {
      id: "TEST-SAFE-02", name: "Trường học mô phỏng B", address: "Địa chỉ giả lập B",
      type: "school", description: null, location: { latitude: 16.0721, longitude: 108.2151 },
      createdAt: null, updatedAt: null,
    },
  ];
  return {
    demo: true,
    async list() {
      await delay();
      return [...locations];
    },
    async save(id, fields) {
      await delay();
      const old = id ? locations.find((location) => location.id === id) : null;
      if (id && !old) throw new ApiError("Địa điểm không tồn tại.", 404);
      const saved: SafeLocation = {
        ...fields,
        id: id ?? `TEST-SAFE-${crypto.randomUUID().slice(0, 8)}`,
        createdAt: old?.createdAt ?? null,
        updatedAt: null,
      };
      locations = id
        ? locations.map((location) => location.id === id ? saved : location)
        : [saved, ...locations];
      return saved;
    },
    async remove(id) {
      await delay();
      if (!locations.some((location) => location.id === id)) throw new ApiError("Địa điểm không tồn tại.", 404);
      locations = locations.filter((location) => location.id !== id);
    },
  };
}
