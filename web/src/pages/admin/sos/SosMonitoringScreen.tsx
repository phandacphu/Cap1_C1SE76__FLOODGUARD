import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { useAuth } from "../../../context/AuthContext";
import { fetchSosList, SOS_MOCK_ENABLED } from "./sosApi";
import { DEFAULT_FILTERS, type SosFilters } from "./sosTypes";
import { useSosResource } from "./useSosResource";
import { SosFrame } from "./SosFrame";
import { SosConditionBadge, SosErrorPanel, SosModeNotice } from "./SosFeedback";
import { SosSummaryCards } from "./SosSummaryCards";
import { formatSosSituations, formatSosTime, formatSosWaterLevel } from "./sosFormat";

const INPUT = "mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text [color-scheme:dark] disabled:cursor-not-allowed disabled:opacity-50";

export function SosMonitoringScreen() {
  const { token } = useAuth();
  const [draft, setDraft] = useState<SosFilters>({ ...DEFAULT_FILTERS });
  const [filters, setFilters] = useState<SosFilters>({ ...DEFAULT_FILTERS });
  // Search is deliberately client-side over ALL rows returned by the selected API filters.
  const apiFilters = useMemo<SosFilters>(() => ({
    condition: filters.condition, from: filters.from, to: filters.to,
    sort: filters.sort, search: "",
  }), [filters.condition, filters.from, filters.to, filters.sort]);
  const load = useCallback(() => fetchSosList(token, apiFilters), [token, apiFilters]);
  const resource = useSosResource(JSON.stringify([token, apiFilters]), load);
  const invalidDates = Boolean(draft.from && draft.to && draft.from > draft.to);
  const hasFilters = filters.condition !== "all" || Boolean(filters.from || filters.to || filters.search.trim());
  const data = resource.data;
  const search = filters.search.trim().toLocaleLowerCase("vi");
  const visible = useMemo(() => (data?.items ?? []).filter(item =>
    !search || [item.id, item.residentId].some(value => value?.toLocaleLowerCase("vi").includes(search))),
  [data, search]);

  const update = <K extends keyof SosFilters>(key: K, value: SosFilters[K]) =>
    setDraft(previous => ({ ...previous, [key]: value }));

  const applyFilters = (next: SosFilters) => {
    setFilters(current => current.condition === next.condition &&
      current.from === next.from && current.to === next.to &&
      current.search === next.search && current.sort === next.sort ? current : { ...next });
  };

  return (
    <SosFrame>
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-card/80 p-5">
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-wider text-water">Admin · Theo dõi SOS</p>
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
      {data && resource.error && <p role="status" className="text-sm text-warn">
        Đang giữ dữ liệu lần tải thành công lúc {formatSosTime(resource.updatedAt)}. Chưa xác nhận có cập nhật mới.
      </p>}
      <SosSummaryCards summary={data?.summary ?? null} loading={resource.loading} />
      {data?.summaryError && !resource.loading && <div role="alert" className="rounded-xl border border-warn/50 bg-warn/10 p-4 text-sm text-warn">
        Không tải được thống kê SOS: {data.summaryError.message}.
        Danh sách SOS đã tải thành công vẫn được hiển thị. Các số liệu thống kê chưa được xác nhận; bấm Làm mới để thử lại.
      </div>}
      <section className="rounded-2xl border border-border bg-card/80 p-4" aria-label="Bộ lọc SOS">
        <form onSubmit={event => { event.preventDefault(); if (!invalidDates) applyFilters(draft); }}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <label className="text-xs text-muted">Tình trạng SOS
              <select aria-label="Tình trạng SOS" className={INPUT} value={draft.condition}
                onChange={event => update("condition", event.target.value as SosFilters["condition"])}>
                <option value="all">Tất cả</option>
                <option value="active">Chờ cứu hộ</option>
                <option value="rescued">Đã cứu</option>
                <option value="legacy_other">Trạng thái cũ khác</option>
              </select>
            </label>
            <label className="text-xs text-muted">Gửi từ ngày (ICT)
              <input aria-label="Gửi từ ngày" type="date" className={INPUT} value={draft.from}
                onChange={event => update("from", event.target.value)} />
            </label>
            <label className="text-xs text-muted">Đến hết ngày (ICT)
              <input aria-label="Đến hết ngày" type="date" className={INPUT} value={draft.to}
                onChange={event => update("to", event.target.value)} />
            </label>
            <label className="text-xs text-muted">Tìm mã SOS / mã Resident
              <input aria-label="Tìm mã SOS hoặc mã Resident" type="search" className={INPUT}
                placeholder="Chỉ tìm trong dữ liệu đã tải" value={draft.search}
                onChange={event => update("search", event.target.value)} />
            </label>
            <label className="text-xs text-muted">Thời gian gửi
              <select aria-label="Thời gian gửi" className={INPUT} value={draft.sort}
                onChange={event => update("sort", event.target.value as SosFilters["sort"])}>
                <option value="newest">Mới nhất trước</option>
                <option value="oldest">Cũ nhất trước</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={invalidDates} className="rounded-lg bg-water px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">Áp dụng</button>
            <button type="button" className="rounded-lg border border-border px-4 py-2 text-sm" onClick={() => {
              setDraft({ ...DEFAULT_FILTERS }); applyFilters(DEFAULT_FILTERS);
            }}>Xóa bộ lọc</button>
            {invalidDates && <p role="alert" className="text-sm text-sos">Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.</p>}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted">
            Trạng thái, khoảng ngày và thứ tự được lọc trên toàn bộ dữ liệu qua Backend. Thẻ thống kê dùng cùng bộ lọc API với danh sách.
            Tìm mã SOS/Resident là lọc cục bộ trên danh sách đã tải, không thay đổi số liệu thống kê.
          </p>
        </form>
      </section>
      <section aria-label="Danh sách SOS" aria-busy={resource.loading} className="overflow-hidden rounded-2xl border border-border bg-card/80">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="font-semibold">Danh sách yêu cầu SOS</h2>
          <p className="text-xs text-muted">{data ? `${visible.length} / ${data.items.length} dòng từ API${hasFilters ? " · Đã áp dụng bộ lọc" : ""}` : "Chưa có dữ liệu đã tải"}</p>
        </div>
        {resource.loading && <p role="status" className="p-5 text-sm text-muted">
          Đang tải dữ liệu SOS…{data ? " Giữ thông tin lần tải trước trong lúc làm mới." : ""}
        </p>}
        {!resource.loading && data && visible.length === 0 && <div className="p-12 text-center">
          <Icon name="sos" className="mx-auto mb-3 h-8 w-8 text-muted" />
          <h3 className="font-semibold">{hasFilters ? "Không có kết quả theo bộ lọc" : "Không có SOS"}</h3>
          <p className="mt-2 text-sm text-muted">{hasFilters ? "Thử thay đổi tiêu chí hoặc xóa bộ lọc." : "Danh sách sẽ cập nhật khi có yêu cầu và bạn làm mới."}</p>
        </div>}
        {data && visible.length > 0 && <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-bg/60 text-xs text-muted"><tr>
              {["Mã SOS", "Mã Resident", "Thời gian gửi", "Tình huống", "Số người", "Mức nước", "Tình trạng", "Backend nhận GPS", "Thao tác"]
                .map(label => <th key={label} scope="col" className="px-4 py-3 font-medium">{label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-border">{visible.map(item => <tr key={item.id} className="align-top even:bg-bg/25">
              <td className="max-w-48 break-words px-4 py-4 font-mono text-xs text-water">{item.id}</td>
              <td className="max-w-44 break-words px-4 py-4 font-mono text-xs">{item.residentId ?? "Chưa được cung cấp"}</td>
              <td className="min-w-40 px-4 py-4 text-xs text-muted">{formatSosTime(item.createdAt)}</td>
              <td className="max-w-56 px-4 py-4 text-xs">{formatSosSituations(item.situations)}</td>
              <td className="px-4 py-4 font-mono">{item.numberOfPeople ?? "—"}</td>
              <td className="px-4 py-4 text-xs text-muted">{formatSosWaterLevel(item.waterLevel)}</td>
              <td className="px-4 py-4"><SosConditionBadge condition={item.condition} />
                {item.status && item.condition === "legacy_other" && <span className="mt-1 block text-xs text-muted">{item.status}</span>}
              </td>
              <td className="min-w-40 px-4 py-4 text-xs text-muted">{formatSosTime(item.locationReceivedAt ?? null)}</td>
              <td className="px-4 py-4"><Link to={`/admin/sos/${encodeURIComponent(item.id)}`}
                className="inline-flex whitespace-nowrap rounded-lg border border-water/40 px-3 py-1.5 text-xs text-water"
                aria-label={`Xem chi tiết SOS ${item.id}`}>Xem chi tiết</Link></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
      {resource.updatedAt && <p className="text-xs text-muted">
        Lần tải thành công: {formatSosTime(resource.updatedAt)} · Làm mới để đọc lại dữ liệu Backend.
      </p>}
    </SosFrame>
  );
}
