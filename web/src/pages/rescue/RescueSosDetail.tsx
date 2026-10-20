import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { RescueLayout } from "../../components/layout/RescueLayout";
import { useClock } from "../../components/layout/useClock";
import { Icon } from "../../components/ui/Icon";
import { useAuth } from "../../context/AuthContext";
import { Panel } from "../admin/components/Panel";
import { SosCommandPanel } from "./components/SosCommandPanel";
import { SosPriorityBadge } from "./components/SosPriorityBadge";
import { SosStatusBadge } from "./components/SosStatusBadge";
import { SosTimeline } from "./components/SosTimeline";
import {
  formatCoords,
  formatElapsed,
  formatFullDateTime,
  isOpen,
  sosCode,
  timeAgo,
} from "./rescueStats";
import { useRescueActions } from "./useRescue";
import { useRescueDetail } from "./useRescueDetail";

/** CCF-104 / CCF-110 / CCF-111: SOS detail with status timeline and rescue actions. */
export function RescueSosDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const now = useClock();
  const { request, history, error, updatedAt, loading, refresh } = useRescueDetail(id);
  const actions = useRescueActions(user?.id, refresh);
  const [copied, setCopied] = useState(false);

  const mine =
    !!request && (request.assignment?.rescueStaffId === user?.id || actions.mineIds.has(request.id));
  const canProgress = !!request && (!request.assignment || mine);

  const copyCoords = async () => {
    if (!request) return;
    const text = `${request.location.latitude}, ${request.location.longitude}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the coordinates are still shown on screen.
    }
  };

  const open = request ? isOpen(request.status) : false;
  const elapsed = request
    ? open
      ? now.getTime() - new Date(request.createdAt).getTime()
      : new Date(request.updatedAt).getTime() - new Date(request.createdAt).getTime()
    : 0;

  const responder = !request
    ? "—"
    : mine
      ? "Bạn"
      : request.assignment
        ? `Nhân sự #${request.assignment.rescueStaffId.slice(0, 6)}`
        : "Chưa có người nhận";

  return (
    <RescueLayout loading={loading} onRefresh={refresh} updatedAt={updatedAt}>
      <div className="mx-auto max-w-7xl space-y-5">
        <nav aria-label="Đường dẫn" className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <Link to="/rescue/sos" className="text-water hover:underline">
            ← Quay lại danh sách
          </Link>
          <span>/</span>
          <span>Yêu cầu SOS</span>
          {request && (
            <>
              <span>/</span>
              <span className="rounded bg-card px-2 py-0.5 font-mono text-xs text-text">
                #{sosCode(request.id)}
              </span>
            </>
          )}
        </nav>

        {(error || actions.error) && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-xl border border-sos/50 bg-sos/10 p-3 text-sm text-red-200"
          >
            <span>{actions.error ?? error}</span>
            {actions.error && (
              <button type="button" onClick={actions.clearError} className="shrink-0 text-xs underline">
                Đóng
              </button>
            )}
          </div>
        )}

        {!request ? (
          <div className="rounded-2xl border border-border bg-card/80 p-10 text-center font-mono text-sm text-muted">
            {loading ? "Đang tải chi tiết yêu cầu..." : "Không tìm thấy yêu cầu SOS này."}
          </div>
        ) : (
          <>
            <section className="flex flex-wrap items-center gap-5 rounded-2xl border border-border bg-card/80 p-5">
              <span className="rounded-2xl bg-sos/15 p-4 text-sos">
                <Icon name="sos" className="h-8 w-8" />
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold leading-tight">
                  Yêu cầu cứu hộ <span className="font-mono text-water">#{sosCode(request.id)}</span>
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <SosPriorityBadge urgency={request.urgency} />
                  <SosStatusBadge status={request.status} />
                </div>
                <p className="mt-2 flex items-center gap-1.5 font-mono text-xs text-muted">
                  <Icon name="map" className="h-4 w-4" />
                  {formatCoords(request.location)}
                </p>
              </div>
              <dl className="flex gap-8 text-right">
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-wider text-muted">
                    Lực lượng tiếp cận
                  </dt>
                  <dd className="mt-1 font-semibold text-safe">{responder}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-wider text-muted">
                    {open ? "Đã chờ" : "Thời gian xử lý"}
                  </dt>
                  <dd className="mt-1 font-mono text-xl font-semibold text-water">
                    {formatElapsed(elapsed)}
                  </dd>
                </div>
              </dl>
            </section>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
              <div className="space-y-5">
                <Panel title="Thông tin người báo tin" icon="user">
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Mã cư dân</dt>
                      <dd className="break-all text-right font-mono text-xs">
                        #{request.residentId.slice(0, 12)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Thời điểm gửi</dt>
                      <dd className="text-right">
                        <span className="font-mono">{formatFullDateTime(request.createdAt)}</span>
                        <span className="block font-mono text-[11px] text-muted">
                          {timeAgo(request.createdAt, now)}
                        </span>
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-4 rounded-lg border border-dashed border-border p-3 font-mono text-[11px] text-muted">
                    Dữ liệu SOS chưa có họ tên và số điện thoại người báo tin.
                  </p>
                </Panel>

                <Panel title="Đánh giá tình huống" icon="alert">
                  <div className="rounded-xl bg-bg/60 p-4">
                    <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
                      Số lượng người cần cứu hộ
                    </p>
                    <p className="mt-1 font-mono text-3xl font-semibold text-sos">
                      {String(request.numberOfPeople).padStart(2, "0")}{" "}
                      <span className="text-base text-text/80">người</span>
                    </p>
                  </div>
                  <p className="mt-4 font-mono text-[11px] uppercase tracking-wider text-muted">
                    Ghi chú hiện trường
                  </p>
                  <blockquote className="mt-2 rounded-xl bg-bg/60 p-4 text-sm leading-relaxed text-text/90">
                    {request.note ? `“${request.note}”` : "Người báo tin không để lại ghi chú."}
                  </blockquote>
                </Panel>
              </div>

              <Panel title="Vị trí cần cứu hộ" icon="map">
                <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-border px-4 text-center font-mono text-xs text-muted">
                  Bản đồ tương tác sẽ hiển thị ở đây khi tích hợp Google Maps (CCF-105).
                </div>
                <div className="mt-4 rounded-xl bg-bg/60 p-4">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
                    Tọa độ vệ tinh (WGS84)
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold">
                    {request.location.latitude.toFixed(5)}, {request.location.longitude.toFixed(5)}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copyCoords()}
                    className="rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-bg/60"
                  >
                    {copied ? "✓ Đã sao chép" : "Sao chép tọa độ"}
                  </button>
                  <a
                    href={`https://www.google.com/maps?q=${request.location.latitude},${request.location.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-water/40 bg-water/10 px-3 py-2 text-sm text-water transition hover:bg-water/20"
                  >
                    Mở trong Google Maps ↗
                  </a>
                </div>
              </Panel>

              <div className="flex flex-col gap-5">
                <Panel title="Tiến trình tác chiến" icon="history">
                  <SosTimeline request={request} history={history} currentUserId={user?.id} />
                </Panel>
                <div className="order-first xl:order-none">
                  <Panel title="Lệnh điều hành tác chiến" icon="staff">
                    <SosCommandPanel
                      request={request}
                      canProgress={canProgress}
                      busy={actions.busyId === request.id}
                      onAccept={() => actions.accept(request.id)}
                      onAdvance={(next, note) => actions.advance(request.id, next, note)}
                    />
                  </Panel>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </RescueLayout>
  );
}

export default RescueSosDetail;
