import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { useAuth } from "../../../context/AuthContext";
import { fetchSosList, SOS_MOCK_ENABLED } from "./sosApi";
import { DEFAULT_FILTERS, type SosFilters } from "./sosTypes";
import { useSosResource } from "./useSosResource";
import { SosFrame } from "./SosFrame";
import { SosConditionBadge, SosErrorPanel, SosModeNotice } from "./SosFeedback";
import { SosSummaryCards } from "./SosSummaryCards";
import { formatSosTime } from "./sosFormat";

const INPUT = "mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text [color-scheme:dark] disabled:cursor-not-allowed disabled:opacity-50";

export function SosMonitoringScreen() {
  const { token } = useAuth();
  const [draft, setDraft] = useState<SosFilters>({ ...DEFAULT_FILTERS });
  const [filters, setFilters] = useState<SosFilters>({ ...DEFAULT_FILTERS });
  const load = useCallback(() => fetchSosList(token, filters), [token, filters]);
  const resource = useSosResource(JSON.stringify([token, filters]), load);
  const invalidDates = Boolean(draft.from && draft.to && draft.from > draft.to);
  const filtered = filters.condition !== "all" || Boolean(filters.from || filters.to || filters.search.trim());
  const data = resource.data;
  const update = <K extends keyof SosFilters>(key: K, value: SosFilters[K]) => setDraft(previous => ({ ...previous, [key]: value }));
  return (
    <SosFrame>
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-card/80 p-5">
        <div><p className="mb-2 font-mono text-xs uppercase tracking-wider text-water">Admin · Theo dõi SOS</p>
          <h1 className="text-2xl font-bold uppercase tracking-wide">Giám sát &amp; theo dõi yêu cầu SOS</h1>
          <p className="mt-2 text-sm text-muted">Tra cứu yêu cầu, vị trí cuối đã nhận và kết quả cứu hộ.</p>
          <p className="mt-2 flex items-center gap-2 text-xs text-muted"><Icon name="shield" className="h-4 w-4" /> Chỉ đọc · Giờ Việt Nam (UTC+7)</p>
        </div>
        <button type="button" disabled={resource.loading} onClick={resource.refresh}
          className="flex items-center gap-2 rounded-lg border border-water/40 px-3 py-2 text-sm text-water disabled:opacity-50">
          <Icon name="refresh" className={`h-4 w-4 ${resource.loading ? "animate-spin" : ""}`} />
          {resource.loading ? "Đang tải..." : "Làm mới"}
        </button>
      </section>
      <SosModeNotice mock={SOS_MOCK_ENABLED} />
      {resource.error && <SosErrorPanel error={resource.error} retry={resource.refresh} />}
      {data && resource.error && <p role="status" className="text-sm text-warn">Đang giữ dữ liệu lần tải thành công lúc {formatSosTime(resource.updatedAt)}. Chưa xác nhận có cập nhật mới.</p>}
      <SosSummaryCards summary={data?.summary ?? null} loading={resource.loading} />
      {data?.summaryError && <SosErrorPanel error={{ ...data.summaryError, message: `Không tải được thống kê SOS. ${data.summaryError.message}` }} retry={resource.refresh} />}
      <section className="rounded-2xl border border-border bg-card/80 p-4" aria-label="Bộ lọc SOS">
        <form onSubmit={event => { event.preventDefault(); if (!invalidDates) setFilters({ ...draft }); }}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <label className="text-xs text-muted">Tình trạng SOS
              <select aria-label="Tình trạng SOS" className={INPUT} disabled={!SOS_MOCK_ENABLED} value={draft.condition} aria-describedby="sos-filter-support"
                onChange={event => update("condition", event.target.value as SosFilters["condition"])}>
                <option value="all">Tất cả</option><option value="active">Còn hoạt động</option><option value="rescued">Đã cứu</option>
              </select>
            </label>
            <label className="text-xs text-muted">Gửi từ ngày
              <input aria-label="Gửi từ ngày" type="date" className={INPUT} disabled={!SOS_MOCK_ENABLED} value={draft.from} aria-describedby="sos-filter-support"
                onChange={event => update("from", event.target.value)} />
            </label>
            <label className="text-xs text-muted">Đến hết ngày
              <input aria-label="Đến hết ngày" type="date" className={INPUT} disabled={!SOS_MOCK_ENABLED} value={draft.to} aria-describedby="sos-filter-support"
                onChange={event => update("to", event.target.value)} />
            </label>
            <label className="text-xs text-muted">Mã SOS, tên hoặc số điện thoại
              <input aria-label="Mã SOS, tên hoặc số điện thoại" type="search" className={INPUT} disabled={!SOS_MOCK_ENABLED} placeholder="Tìm kiếm SOS" value={draft.search} aria-describedby="sos-filter-support"
                onChange={event => update("search", event.target.value)} />
            </label>
            <label className="text-xs text-muted">Thời gian gửi
              <select aria-label="Thời gian gửi" className={INPUT} value={draft.sort} onChange={event => update("sort", event.target.value as SosFilters["sort"])}>
                <option value="newest">Mới nhất trước</option><option value="oldest">Cũ nhất trước</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={invalidDates} className="rounded-lg bg-water px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">Áp dụng</button>
            <button type="button" className="rounded-lg border border-border px-4 py-2 text-sm" onClick={() => {
              setDraft({ ...DEFAULT_FILTERS }); setFilters({ ...DEFAULT_FILTERS });
            }}>Xóa bộ lọc</button>
            {invalidDates && <p role="alert" className="text-sm text-sos">Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.</p>}
          </div>
          <p id="sos-filter-support" className="mt-3 text-xs leading-5 text-muted">
            {SOS_MOCK_ENABLED ? "Bộ lọc áp dụng trên toàn bộ dữ liệu mẫu; ba thẻ thống kê dùng cùng bộ lọc với danh sách." :
              "Lọc tình trạng mới, khoảng ngày và tìm kiếm đang chờ API hỗ trợ. Hiện có thể sắp xếp thời gian gửi; thống kê lấy từ API tổng hợp trên toàn bộ SOS."}
          </p>
        </form>
      </section>
      <section aria-label="Danh sách SOS" aria-busy={resource.loading} className="overflow-hidden rounded-2xl border border-border bg-card/80">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="font-semibold">Danh sách yêu cầu SOS</h2>
          <p className="text-xs text-muted">{data ? `${data.items.length} dòng hiển thị${filtered ? " · Đã áp dụng bộ lọc" : ""}` : "Chưa có dữ liệu đã tải"}</p>
        </div>
        {resource.loading && <p role="status" className="p-5 text-sm text-muted">Đang tải dữ liệu SOS…{data ? " Giữ thông tin lần tải trước trong lúc làm mới." : ""}</p>}
        {!resource.loading && data?.items.length === 0 && <div className="p-12 text-center">
          <Icon name="sos" className="mx-auto mb-3 h-8 w-8 text-muted" />
          <h3 className="font-semibold">{filtered ? "Không có kết quả theo bộ lọc" : "Không có SOS"}</h3>
          <p className="mt-2 text-sm text-muted">{filtered ? "Thử thay đổi tiêu chí hoặc xóa bộ lọc." : "Danh sách sẽ cập nhật khi có yêu cầu và bạn làm mới."}</p>
        </div>}
        {data && data.items.length > 0 && <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="bg-bg/60 text-xs text-muted"><tr>
              {["Mã SOS", "Người gửi", "Liên hệ", "Thời gian gửi", "Tình huống", "Số người", "Mức nước", "Tình trạng", "Thao tác"].map(label => <th key={label} scope="col" className="px-4 py-3 font-medium">{label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-border">{data.items.map(item => <tr key={item.id} className="align-top even:bg-bg/25">
              <td className="max-w-48 break-words px-4 py-4 font-mono text-xs text-water">{item.id}</td>
              <td className="max-w-44 break-words px-4 py-4">{item.senderName ?? (item.residentId ? `ID: ${item.residentId}` : "Chưa được cung cấp")}</td>
              <td className="px-4 py-4 text-muted">{item.contact ?? "Chưa được cung cấp"}</td>
              <td className="min-w-40 px-4 py-4 text-xs text-muted">{formatSosTime(item.createdAt)}</td>
              <td className="max-w-56 px-4 py-4 text-xs">{item.situations?.join(" · ") ?? "Chưa được cung cấp"}</td>
              <td className="px-4 py-4 font-mono">{item.numberOfPeople ?? "—"}</td>
              <td className="px-4 py-4 text-xs text-muted">{item.waterLevel ?? "Chưa được cung cấp"}</td>
              <td className="px-4 py-4"><SosConditionBadge condition={item.condition} /></td>
              <td className="px-4 py-4"><Link to={`/admin/sos/${encodeURIComponent(item.id)}`} className="inline-flex whitespace-nowrap rounded-lg border border-water/40 px-3 py-1.5 text-xs text-water" aria-label={`Xem chi tiết SOS ${item.id}`}>Xem chi tiết</Link></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
      {resource.updatedAt && <p className="text-xs text-muted">Lần tải thành công: {formatSosTime(resource.updatedAt)} · Làm mới để đọc lại dữ liệu từ nguồn đã chọn.</p>}
    </SosFrame>
  );
}
