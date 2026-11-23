import { WarningRequestError } from "./floodWarningApi";
import type { FloodWarning, WarningSource } from "./floodWarningTypes";
import { warningOrder } from "./floodWarningTypes";

export function createFloodWarningDemo(): WarningSource {
  const now = new Date().toISOString();
  let rows: FloodWarning[] = [
    { id: "TEST-V2-01", schemaVersion: 2, title: "TEST ONLY - Mưa lớn tại thành phố", content: "Bản tin giả lập, không phải cảnh báo thực tế.", status: "active", scope: "all_published_zones", startAt: now, endAt: null, createdAt: now, updatedAt: now, revision: 1 },
    { id: "TEST-V2-02", schemaVersion: 2, title: "TEST ONLY - Nguy cơ ngập diện rộng", content: "Theo dõi thông tin từ cơ quan chức năng (dữ liệu giả lập).", status: "active", scope: "all_published_zones", startAt: now, endAt: null, createdAt: now, updatedAt: now, revision: 1 },
    { id: "TEST-V2-03", schemaVersion: 2, title: "TEST ONLY - Đợt mưa đã kết thúc", content: "Bản tin lịch sử thử nghiệm.", status: "inactive", scope: "all_published_zones", startAt: now, endAt: now, createdAt: now, updatedAt: now, revision: 2 },
  ];
  const requests = new Map<string, { body: string; id: string }>();
  const get = (id: string) => { const row = rows.find((r) => r.id === id); if (!row) throw new WarningRequestError("Không tìm thấy bản tin.", 404, "ALERT_NOT_FOUND"); return { ...row }; };
  return {
    demo: true,
    async list(status, q) { return rows.filter((r) => (!status || r.status === status) && (!q || `${r.title} ${r.content}`.toLocaleLowerCase("vi").includes(q.toLocaleLowerCase("vi")))).sort(warningOrder).map((r) => ({ ...r })); },
    async summary() { return { total: rows.length, active: rows.filter((r) => r.status === "active").length, inactive: rows.filter((r) => r.status === "inactive").length }; },
    async detail(id) { return get(id); },
    async create(fields, key) {
      const body = JSON.stringify({ title: fields.title.trim(), content: fields.content.trim() });
      const old = requests.get(key);
      if (old) { if (old.body !== body) throw new WarningRequestError("Khóa đã dùng cho nội dung khác.", 409, "IDEMPOTENCY_CONFLICT"); return get(old.id); }
      const stamp = new Date().toISOString();
      const row: FloodWarning = { title: fields.title.trim(), content: fields.content.trim(), id: `TEST-${crypto.randomUUID()}`, schemaVersion: 2, scope: "all_published_zones", status: "active", startAt: stamp, endAt: null, createdAt: stamp, updatedAt: stamp, revision: 1 };
      rows = [row, ...rows]; requests.set(key, { id: row.id, body }); return { ...row };
    },
    async creationRequest(key) { const old = requests.get(key); if (!old) throw new WarningRequestError("Chưa ghi nhận.", 404, "CREATION_REQUEST_NOT_FOUND"); return get(old.id); },
    async update(id, revision, fields) {
      const row = get(id);
      if (row.status === "inactive") throw new WarningRequestError("Bản tin đã tắt.", 409, "ALERT_ALREADY_INACTIVE");
      if (row.revision !== revision) throw new WarningRequestError("Bản tin đã thay đổi.", 409, "ALERT_REVISION_CONFLICT");
      const title = fields.title?.trim() ?? row.title, content = fields.content?.trim() ?? row.content;
      const changed = title !== row.title || content !== row.content;
      const next = { ...row, title, content, revision: row.revision + (changed ? 1 : 0), updatedAt: changed ? new Date().toISOString() : row.updatedAt };
      rows = rows.map((r) => r.id === id ? next : r); return next;
    },
    async deactivate(id) {
      const row = get(id);
      if (row.status === "inactive") return row;
      const stamp = new Date().toISOString();
      const next: FloodWarning = { ...row, status: "inactive", endAt: stamp, updatedAt: stamp, revision: row.revision + 1 };
      rows = rows.map((r) => r.id === id ? next : r); return next;
    },
  };
}
