import { ApiError } from "../../../api/http";
import type { FloodWarning, FloodWarningSource } from "./floodWarningTypes";

export function createFloodWarningDemo(): FloodWarningSource {
  const areas = [
    { id: "TEST-AREA-01", name: "Lưu vực mô phỏng A" },
    { id: "TEST-AREA-02", name: "Vùng trũng mô phỏng B" },
  ];
  const now = Date.now();
  const hoursFromNow = (hours: number) => new Date(now + hours * 3_600_000).toISOString();
  let warnings: FloodWarning[] = [
    { id: "TEST-WARN-01", title: "Mực nước tăng tại lưu vực A", content: "Bản ghi giả lập dùng để kiểm thử màn hình.", severity: "high", status: "active", areaId: areas[0].id, startAt: hoursFromNow(-1), endAt: hoursFromNow(5) },
    { id: "TEST-WARN-02", title: "Theo dõi vùng trũng B", content: "Cảnh báo giả lập cho khung giờ sắp tới.", severity: "medium", status: "active", areaId: areas[1].id, startAt: hoursFromNow(2), endAt: hoursFromNow(8) },
    { id: "TEST-WARN-03", title: "Cảnh báo đợt mưa trước", content: "Bản ghi giả lập đã hết thời gian hiệu lực.", severity: "low", status: "active", areaId: areas[0].id, startAt: hoursFromNow(-30), endAt: hoursFromNow(-24) },
  ];

  return {
    demo: true,
    async list() {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return { warnings: [...warnings], areas };
    },
    async save(id, fields) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      if (!areas.some((area) => area.id === fields.areaId)) throw new ApiError("Vùng ngập không tồn tại.", 404);
      if (id && !warnings.some((warning) => warning.id === id)) throw new ApiError("Cảnh báo không tồn tại.", 404);
      const saved = { ...fields, id: id ?? `TEST-WARN-${crypto.randomUUID().slice(0, 8)}` };
      warnings = id ? warnings.map((warning) => warning.id === id ? saved : warning) : [saved, ...warnings];
      return saved;
    },
  };
}
