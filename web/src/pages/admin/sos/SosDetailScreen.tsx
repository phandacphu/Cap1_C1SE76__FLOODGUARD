import { useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { useAuth } from "../../../context/AuthContext";
import { fetchSosDetail, SOS_MOCK_ENABLED } from "./sosApi";
import { useSosResource } from "./useSosResource";
import { SosFrame } from "./SosFrame";
import { SosConditionBadge, SosErrorPanel, SosModeNotice } from "./SosFeedback";
import { formatSosTime } from "./sosFormat";
import { SosLocationMap } from "./SosLocationMap";

export function SosDetailScreen() {
  const { id = "" } = useParams();
  const { token } = useAuth();
  const load = useCallback(() => fetchSosDetail(token, id), [token, id]);
  const resource = useSosResource(JSON.stringify([token, id]), load);
  const item = resource.data;
  return (
    <SosFrame detail>
      <Link className="inline-flex text-sm text-water hover:underline" to="/admin/sos">← Danh sách SOS</Link>
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-card/80 p-5">
        <div className="min-w-0"><h1 className="text-2xl font-bold">Chi tiết yêu cầu SOS</h1>
          <p className="mt-2 break-words font-mono text-sm text-water">{id}</p>
          <p className="mt-2 text-xs text-muted">Admin chỉ đọc · Giờ Việt Nam (UTC+7)</p>
        </div>
        <button type="button" disabled={resource.loading} onClick={resource.refresh} className="flex items-center gap-2 rounded-lg border border-water/40 px-3 py-2 text-sm text-water disabled:opacity-50">
          <Icon name="refresh" className={`h-4 w-4 ${resource.loading ? "animate-spin" : ""}`} />{resource.loading ? "Đang tải..." : "Làm mới chi tiết"}
        </button>
      </section>
      <SosModeNotice mock={SOS_MOCK_ENABLED} />
      {resource.error && <SosErrorPanel error={resource.error} retry={resource.refresh} />}
      {resource.loading && <p role="status" className="text-sm text-muted">Đang tải chi tiết SOS…</p>}
      {item && <>
        {resource.error && <p role="status" className="text-sm text-warn">Đang giữ thông tin và vị trí lần tải thành công lúc {formatSosTime(resource.updatedAt)}. Chưa xác nhận có dữ liệu mới.</p>}
        <div className="grid items-start gap-5 xl:grid-cols-[1fr_1.2fr]">
          <div className="min-w-0 space-y-5">
            <section className="rounded-2xl border border-border bg-card/80 p-5">
              <h2 className="mb-4 font-semibold">Thông tin SOS</h2>
              <SosConditionBadge condition={item.condition} />
              <dl className="mt-4 space-y-4 text-sm">
                {[
                  ["Mã SOS", item.id],
                  ["Người gửi", item.senderName ?? (item.residentId ? `ID: ${item.residentId}` : null)],
                  ["Thông tin liên hệ", item.contact], ["Thời gian gửi", formatSosTime(item.createdAt)],
                  ["Tình huống đã chọn", item.situations?.join(" · ")],
                  ["Số người cần cứu hộ", item.numberOfPeople?.toLocaleString("vi-VN")],
                  ["Mức nước ước tính", item.waterLevel], ["Ghi chú", item.note],
                  ["Cập nhật thông tin SOS", formatSosTime(item.updatedAt)],
                ].map(([label, value]) => <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{value ?? "Chưa được cung cấp"}</dd></div>)}
              </dl>
            </section>
            {item.condition === "rescued" && <section className="rounded-2xl border border-safe/40 bg-safe/5 p-5">
              <h2 className="font-semibold text-safe">Kết quả cứu hộ · Đã cứu</h2>
              <dl className="mt-4 space-y-3 text-sm"><div><dt className="text-xs text-muted">Nhân viên xác nhận</dt><dd className="mt-1">{item.confirmedBy ?? "Chưa được cung cấp"}</dd></div>
                <div><dt className="text-xs text-muted">Thời gian hoàn tất</dt><dd className="mt-1">{formatSosTime(item.completedAt)}</dd></div></dl>
            </section>}
          </div>
          <div className="min-w-0 space-y-5">
            <section className="rounded-2xl border border-border bg-card/80 p-5">
              <h2 className="mb-4 font-semibold">Vị trí cuối đã nhận</h2>
              <SosLocationMap item={item} />
              <dl className="mt-4 space-y-3 text-sm"><div><dt className="text-xs text-muted">Tọa độ</dt><dd className="mt-1 font-mono">{item.location ? `${item.location.latitude.toFixed(6)}, ${item.location.longitude.toFixed(6)}` : "Chưa có tọa độ hợp lệ"}</dd></div>
                <div><dt className="text-xs text-muted">Thời điểm cập nhật vị trí</dt><dd className="mt-1">{formatSosTime(item.locationUpdatedAt)}</dd></div></dl>
              <p className="mt-4 text-xs leading-5 text-muted">Vị trí được giữ lại khi chưa nhận được bản cập nhật. Thời gian cập nhật SOS không thay thế thời gian cập nhật vị trí.</p>
            </section>
            <section className="rounded-2xl border border-border bg-card/80 p-5">
              <h2 className="font-semibold">Lịch sử gửi và xác nhận đã cứu</h2>
              <ol className="mt-4 space-y-4 border-l border-border pl-4 text-sm">
                {item.createdAt && <li><p>Đã gửi SOS</p><time className="text-xs text-muted" dateTime={item.createdAt}>{formatSosTime(item.createdAt)}</time></li>}
                {item.condition === "rescued" && <li><p className="text-safe">Đã cứu</p><p className="mt-1 text-xs text-muted">{formatSosTime(item.completedAt)} · {item.confirmedBy ?? "Chưa có thông tin nhân viên"}</p></li>}
              </ol>
              {item.source === "api" && <p className="mt-4 text-xs text-muted">Lịch sử xác nhận đã cứu đang chờ hợp đồng API mới. Các bước trung gian của luồng cũ không được ánh xạ sang kết quả mới.</p>}
            </section>
          </div>
        </div>
        <p className="text-xs text-muted">Lần tải thành công: {formatSosTime(resource.updatedAt)}. Làm mới để kiểm tra vị trí và kết quả mới nhất đã được Backend nhận.</p>
      </>}
    </SosFrame>
  );
}
