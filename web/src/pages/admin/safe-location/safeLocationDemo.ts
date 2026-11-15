import { ApiError } from "../../../api/http";
import type { SafeLocation, SafeLocationSource } from "./safeLocationTypes";

const delay = () => new Promise((resolve) => setTimeout(resolve, 250));

const sample: SafeLocation[] = [
  {
    id: "TEST-SAFE-01", name: "Điểm an toàn mô phỏng A", address: "Địa chỉ mẫu A",
    type: "shelter", description: "Chỉ là dữ liệu mẫu", location: { latitude: 16.0426, longitude: 108.2028 },
    createdAt: null, updatedAt: null,
  },
  {
    id: "TEST-SAFE-02", name: "Trường học mô phỏng B", address: "Địa chỉ mẫu B",
    type: "school", description: null, location: { latitude: 16.0721, longitude: 108.2151 },
    createdAt: null, updatedAt: null,
  },
];

/**
 * Session-scoped, isolated source; NEVER touches the API or Firebase.
 * A tombstone is retained internally so delete mimics soft deletion, not hard deletion.
 * Passing [] allows isolated empty-state tests without a fake API or extra UI controls.
 */
export function createSafeLocationDemo(seed: SafeLocation[] = sample): SafeLocationSource {
  let records = seed.map((item) => ({ item: { ...item, location: item.location ? { ...item.location } : null }, deleted: false }));
  return {
    demo: true,
    async list() {
      await delay();
      return records.filter((record) => !record.deleted).map((record) => ({ ...record.item }));
    },
    async get(id) {
      await delay();
      const record = records.find((candidate) => candidate.item.id === id && !candidate.deleted);
      if (!record) throw new ApiError("Địa điểm không còn được cung cấp.", 404);
      return { ...record.item, location: record.item.location ? { ...record.item.location } : null };
    },
    async save(id, fields) {
      await delay();
      const previous = id ? records.find((record) => record.item.id === id && !record.deleted) : null;
      if (id && !previous) throw new ApiError("Điểm an toàn không tồn tại.", 404);
      const saved: SafeLocation = {
        ...fields,
        location: { ...fields.location },
        id: id ?? `TEST-SAFE-${crypto.randomUUID().slice(0, 8)}`,
        createdAt: previous?.item.createdAt ?? null,
        updatedAt: null,
      };
      if (previous) previous.item = saved;
      else records = [{ item: saved, deleted: false }, ...records];
      return { ...saved };
    },
    async remove(id) {
      await delay();
      const record = records.find((candidate) => candidate.item.id === id && !candidate.deleted);
      if (!record) throw new ApiError("Điểm an toàn không tồn tại.", 404);
      record.deleted = true;
    },
  };
}
