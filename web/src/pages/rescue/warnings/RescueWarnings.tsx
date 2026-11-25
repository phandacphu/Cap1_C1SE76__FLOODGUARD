import { useCallback, useState } from "react";
import { Link, useParams, useSearchParams, Navigate } from "react-router-dom";
import { RescueLayout } from "../../../components/layout/RescueLayout";
import { Icon } from "../../../components/ui/Icon";
import { useWarningList, useWarnings } from "./WarningContext";
import { useWarningResource } from "./useWarningResource";
import { WarningFeedback } from "./WarningFeedback";
import { filterWarnings, warningTime } from "./warningData";
import type { FloodWarning, WarningStatus } from "./warningData";
import "./rescueWarnings.css";
import { FloodMapView } from "../../map/FloodMapView";

const route = (id: string) => `/rescue/flood-warnings/${encodeURIComponent(id)}`;
const mapRoute = (id: string) => `/map?warning=${encodeURIComponent(id)}`;

function Badge({ item }: { item: FloodWarning }) {
  return (
    <span className={`rw-badge ${item.status === "inactive" ? "rw-inactive" : ""}`}>
      <span aria-hidden="true">●</span>{" "}
      {item.status === "active" ? "Đang bật" : "Đã tắt"}
    </span>
  );
}

export function WarningDetail({ id, refreshKey }: { id: string; refreshKey: number }) {
  const { source, identity } = useWarnings();
  const [params] = useSearchParams();
  const load = useCallback(
    (signal: AbortSignal) => source.detail(id, signal),
    [source, id],
  );
  const resource = useWarningResource(
    identity ? `${identity}:${id}` : "",
    load,
    refreshKey,
  );
  const item = resource.data;
  if (item && params.get("view") === "map") {
    return <Navigate to={mapRoute(item.id)} replace />;
  }
  return (
    <div className="rw-detail">
      <Link className="rw-back" to="/rescue/flood-warnings">
        ← Danh sách bản tin
      </Link>
      <WarningFeedback resource={resource} noun="chi tiết bản tin" />
      {resource.errorStatus === 404 && (
        <p className="rw-caption">Không còn mở được bản tin có mã: {id}.</p>
      )}
      {item && (
        <article className="rw-panel rw-detail-card" aria-label="Chi tiết bản tin">
          <div className="rw-detail-top">
            <Badge item={item} />
            <button type="button" disabled={resource.loading} onClick={resource.refresh}>
              Làm mới chi tiết
            </button>
          </div>
          <h2>{item.title}</h2>
          <dl className="rw-times">
            <div>
              <dt>Bắt đầu (GMT+7)</dt>
              <dd>{warningTime(item.startAt)}</dd>
            </div>
            <div>
              <dt>Kết thúc (GMT+7)</dt>
              <dd>{warningTime(item.endAt)}</dd>
            </div>
          </dl>
          <h3>Nội dung và hướng dẫn</h3>
          <p className="rw-content">{item.content}</p>
          <div className="rw-scope">
            <Icon name="map" className="h-5 w-5" />
            <p>Phạm vi: toàn bộ vùng hệ thống đang công bố.</p>
          </div>
          {item.status === "inactive" && (
            <p role="note" className="rw-caption">
              Bản tin đã tắt. Bản đồ sử dụng bộ vùng hiện tại, không phải bản đồ tại thời điểm bản tin kết thúc.
            </p>
          )}
          <Link className="rw-primary" to={mapRoute(item.id)}>
            Xem vùng trên bản đồ
          </Link>
        </article>
      )}
    </div>
  );
}

export function RescueWarnings() {
  return <RescueWarningPage />;
}

export function RescueWarningPage() {
  const { source } = useWarnings();
  const { id } = useParams();
  const [status, setStatus] = useState<WarningStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [refreshRound, setRefreshRound] = useState(0);
  const list = useWarningList(
    { status: status === "all" ? undefined : status, q: query.trim() || undefined },
    !id,
  );
  const refresh = () => {
    if (!id) list.refresh();
    setRefreshRound((value) => value + 1);
  };
  const rows = filterWarnings(list.data ?? [], status, query);
  const filtered = status !== "all" || Boolean(query.trim());
  return (
    <RescueLayout
      loading={list.loading}
      onRefresh={refresh}
      updatedAt={list.updatedAt}
      syncHint="Bản tin · làm mới thủ công"
    >
      <main className="rw-page">
        <div className="rw-page-heading">
          <div>
            <p className="rw-kicker">RESCUE · THEO DÕI TÌNH HÌNH</p>
            <h1>Cảnh báo mưa lớn và nguy cơ ngập</h1>
            <p>Theo dõi bản tin và các vùng cần chú ý để hỗ trợ công tác cứu hộ.</p>
          </div>
          <button type="button" disabled={list.loading} onClick={refresh}>
            <Icon name="refresh" className="h-4 w-4" /> Làm mới bản tin
          </button>
        </div>
        {id ? (
          <WarningDetail key={id} id={id} refreshKey={refreshRound} />
        ) : (
          <>
            <div className="rw-toolbar">
              <label className="rw-search">
                <Icon name="search" className="h-5 w-5" />
                <span className="sr-only">Tìm trong tiêu đề và nội dung</span>
                <input
                  type="search"
                  maxLength={180}
                  placeholder="Tìm tiêu đề hoặc nội dung bản tin…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className="rw-tabs" aria-label="Lọc trạng thái">
                {([
                  ["all", "Tất cả"],
                  ["active", "Đang bật"],
                  ["inactive", "Đã tắt"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={status === value}
                    onClick={() => setStatus(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <WarningFeedback resource={list} noun="danh sách bản tin" />
            <div className="rw-layout">
              <section aria-label="Danh sách bản tin" className="rw-list">
                {list.data !== null && (
                  <p className="rw-caption">{rows.length} bản tin · Mới nhất trước</p>
                )}
                {list.data !== null && rows.length === 0 && (
                  <div className="rw-panel rw-empty">
                    <Icon name="bell" className="h-8 w-8" />
                    <h2>{filtered ? "Không có bản tin khớp bộ lọc" : "Chưa có bản tin"}</h2>
                    <p>{filtered ? "Thử trạng thái khác hoặc thay từ khóa tìm kiếm." : "Chưa có bản tin được công bố trong dữ liệu đã tải."}</p>
                    {filtered && (
                      <button type="button" onClick={() => { setStatus("all"); setQuery(""); }}>
                        Xóa bộ lọc
                      </button>
                    )}
                  </div>
                )}
                {rows.map((item) => (
                  <article
                    className={`rw-panel rw-card ${item.status === "active" ? "rw-card-active" : ""}`}
                    key={item.id}
                  >
                    <div className="rw-card-top">
                      <Badge item={item} />
                      <span>Bản tin FLOODGUARD</span>
                    </div>
                    <h2><Link to={route(item.id)}>{item.title}</Link></h2>
                    <p className="rw-excerpt">{item.content}</p>
                    <p className="rw-card-time">
                      <Icon name="clock" className="h-4 w-4" /> Bắt đầu{" "}
                      {warningTime(item.startAt)} · GMT+7
                    </p>
                    {item.status === "inactive" && (
                      <p className="rw-caption">Kết thúc {warningTime(item.endAt)} · GMT+7</p>
                    )}
                    <div className="rw-card-actions">
                      <Link to={route(item.id)}>Xem chi tiết →</Link>
                      <Link to={mapRoute(item.id)}>Xem vùng trên bản đồ</Link>
                    </div>
                  </article>
                ))}
              </section>
              <aside className="rw-map-aside">
                <section className="rw-panel rw-map-preview" aria-label="Các vùng trên bản đồ">
                  <div className="rw-panel-heading">
                    <div>
                      <h2>Các vùng trên bản đồ</h2>
                      <p>Theo dõi các vùng ngập, vùng trũng và ngập lịch sử.</p>
                    </div>
                    <Icon name="map" className="h-5 w-5" />
                  </div>
                  <FloodMapView embedded />
                  <p className="rw-caption rw-map-note">
                    Bản đồ dùng chung cho tất cả bản tin. Ngập lịch sử và vùng trũng
                    không phải xác nhận ngập hiện tại.
                  </p>
                </section>
              </aside>
            </div>
          </>
        )}
        <footer className="rw-footer">
          FLOODGUARD · Nguồn bản tin: Admin{" "}
          <span>{source.demo ? "Dữ liệu mẫu · GMT+7" : "GMT+7"}</span>
        </footer>
      </main>
    </RescueLayout>
  );
}
