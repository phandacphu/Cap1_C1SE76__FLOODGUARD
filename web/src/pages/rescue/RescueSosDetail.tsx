import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RescueLayout } from '../../components/layout/RescueLayout';
import { useAuth } from '../../context/AuthContext';
import { confirmRescued, RescueApiError } from '../../api/rescueService';
import { applySosCompletion } from './sosDetailData';
import { DirectSosFeedback } from './components/DirectSosFeedback';
import { DirectSosFacts } from './components/DirectSosFacts';
import { DirectSosMap } from './components/DirectSosMap';
import { MISSING, STATE_LABEL, sosCode, timeLabel } from './sosDirect';
import { useRescueDetail } from './useRescueDetail';

export function RescueSosDetail() {
  const { id } = useParams<{ id: string }>();
  // Remount local completion/note state when moving directly to another SOS.
  return <SosDetail key={id} id={id} />;
}

function SosDetail({ id }: { id: string | undefined }) {
  const result = useRescueDetail(id);
  const { user } = useAuth();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);

  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [writeDenied, setWriteDenied] = useState(false);
  const [actionStatus, setActionStatus] = useState<number | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [failureRevision, setFailureRevision] = useState(0);
  const item = actionStatus === 401 ? null : result.request;
  const reconciledByRefresh = result.revision > failureRevision && !result.error &&
    (item?.state === 'active' || item?.state === 'rescued');
  const canComplete = item?.state === 'active' && user?.role === 'RESCUE_STAFF' &&
    !writeDenied && !result.error && !result.loading &&
    (!needsRefresh || reconciledByRefresh);

  const complete = async () => {
    if (!id || !canComplete || locked.current || note.trim().length > 200) return;
    if (!window.confirm('Bạn xác nhận đã hoàn tất cứu hộ cho yêu cầu này?')) return;
    locked.current = true;
    setBusy(true);
    setMessage(null);
    setActionError(null);
    setActionStatus(null);
    const finishUpdate = result.beginUpdate();
    let updated = false;
    try {
      const response = await confirmRescued(id, note);
      finishUpdate(current => applySosCompletion(current, response.request));
      updated = true;
      setMessage(response.message);
      setNeedsRefresh(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Chưa xác nhận được kết quả.');
      if (error instanceof RescueApiError) {
        setActionStatus(error.status);
        if (error.status === 403 || error.status === 404) setWriteDenied(true);
      }
      setNeedsRefresh(true);
      setFailureRevision(result.revision);
    } finally {
      setBusy(false);
      locked.current = false;
      if (!updated) finishUpdate();
    }
  };

  const events = result.history;
  const eventLabel: Record<string, string> = {
    submitted: 'Đã gửi yêu cầu', assisted: 'Xác nhận đã cứu',
    received: 'Sự kiện tiếp nhận trong dữ liệu cũ', in_progress: 'Sự kiện xử lý trong dữ liệu cũ',
    cancelled: 'Sự kiện hủy trong dữ liệu cũ',
  };
  return (
    <RescueLayout loading={result.loading} onRefresh={result.refresh} updatedAt={result.updatedAt}>
      <div className="mx-auto max-w-7xl space-y-5">
        <Link to="/rescue/sos" className="text-water underline">← Yêu cầu SOS</Link>
        <DirectSosFeedback {...result} stale={Boolean(item)} retry={result.refresh} />
        <DirectSosFeedback error={result.status === 401 ? null : actionError} status={actionStatus} stale={false} loading={busy} retry={result.refresh} />
        {message && <p role="status" className="rounded border border-water p-3">{message}</p>}
        {writeDenied && item && <p role="status" className="text-amber-300">Máy chủ từ chối thao tác xác nhận. Bạn vẫn có thể xem và làm mới dữ liệu được phép đọc.</p>}
        {item && (
          <>
            <h1 className="text-2xl font-bold">{sosCode(item.id)} — {item.state ? STATE_LABEL[item.state] : MISSING}</h1>
            <p className="break-all text-xs text-muted">Mã đầy đủ: {item.id}</p>
            <div className="grid gap-5 lg:grid-cols-3">
              <section className="rounded-xl border border-border bg-card p-4"><DirectSosFacts item={item} /></section>
              <section className="space-y-3 lg:col-span-2">
                <DirectSosMap key={item.id} items={[item]} detail />
                {item.location && (
                  <a target="_blank" rel="noopener noreferrer" className="inline-block rounded bg-water/20 px-4 py-2 text-water"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(item.location.latitude + ',' + item.location.longitude)}`}>
                    Mở chỉ đường đến vị trí mới nhất
                  </a>
                )}
                <p className="text-xs text-muted">Vị trí có thể đã cũ; đối chiếu thời gian Backend nhận GPS. Tuyến chỉ đường chưa được hệ thống đánh giá an toàn trước ngập.</p>
                {item.state === 'rescued' && <div className="rounded border border-safe p-4">
                  <p>Người xác nhận: {item.completedBy ?? MISSING}</p>
                  <p>Hoàn tất lúc: {timeLabel(item.completedAt)}</p>
                  <Link to="/rescue/sos?state=rescued" className="mt-2 inline-block text-water underline">Xem nhóm Đã cứu</Link>
                </div>}
                {item.state === 'active' && <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                  <label className="block text-sm">Ghi chú hoàn tất (không bắt buộc)
                    <textarea value={note} disabled={busy} onChange={event => setNote(event.target.value)}
                      className="mt-2 block w-full rounded border border-border bg-bg p-2" rows={3} />
                  </label>
                  <p className={`text-xs ${note.trim().length > 200 ? 'text-red-300' : 'text-muted'}`}>{note.trim().length}/200 đơn vị UTF-16 sau khi trim</p>
                  <button type="button" onClick={() => void complete()} disabled={!canComplete || busy || note.trim().length > 200}
                    className="rounded bg-safe px-4 py-2 font-semibold text-slate-950 disabled:opacity-40">
                    {busy ? 'Đang xác nhận…' : 'Xác nhận đã cứu'}
                  </button>
                </div>}
              </section>
            </div>
            <section className="space-y-3 rounded-xl border border-border bg-card p-4">
              <h2 className="font-bold">Lịch sử yêu cầu</h2>
              {result.historyError && <p role="status" className="text-amber-300">{result.historyError}</p>}
              {events === null && <p className="text-muted">Chưa tải được lịch sử.</p>}
              {events?.length === 0 && <p className="text-muted">Chưa có sự kiện lịch sử được cung cấp.</p>}
              <ol className="space-y-3">{events?.map(event => <li key={event.id} className="border-l-2 border-water pl-3 text-sm">
                <strong>{event.newStatus ? eventLabel[event.newStatus] ?? event.newStatus : MISSING}</strong>
                <p>{timeLabel(event.changedAt)} · Người ghi nhận: {event.changedBy ?? MISSING}</p>
                <p className="whitespace-pre-wrap">{event.note ?? MISSING}</p>
              </li>)}</ol>
            </section>
          </>
        )}
      </div>
    </RescueLayout>
  );
}
export default RescueSosDetail;
