import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Icon } from '../ui/Icon';
import { useRescueRequests } from '../../pages/rescue/useRescue';
import { sosCode, timeLabel } from '../../pages/rescue/sosDirect';
import { useWarningList, useWarnings } from '../../pages/rescue/warnings/WarningContext';

function NotificationPanel({ onClose, id }: { onClose: () => void; id: string }) {
  const sos = useRescueRequests({ state: 'active', sort: 'newest' });
  const warnings = useWarningList({ status: 'active' });
  const { source } = useWarnings();
  const { logout } = useAuth();
  const denied = [sos.status, warnings.errorStatus].find(
    status => status === 401 || status === 403,
  );
  const refresh = () => {
    sos.refresh();
    warnings.refresh();
  };

  return (
    <section
      id={id}
      role="dialog"
      aria-label="Thông báo cứu hộ"
      className="fixed right-4 top-20 z-50 max-h-[75dvh] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-border bg-card p-4 text-text shadow-2xl"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold">Thông báo cứu hộ</h2>
        <button type="button" autoFocus onClick={onClose}
          className="text-sm text-muted underline">
          Đóng
        </button>
      </div>

      <button type="button" onClick={refresh}
        disabled={sos.loading || warnings.loading}
        className="my-3 text-sm text-water underline disabled:opacity-50">
        Làm mới thông báo
      </button>

      {denied ? (
        <div role="alert" className="text-sm text-amber-300">
          <p>{denied === 401
            ? 'Phiên đăng nhập đã hết hạn.'
            : 'Bạn không có quyền xem dữ liệu thông báo.'}</p>
          {denied === 401 && (
            <Link to="/login" onClick={() => { logout(); onClose(); }}
              className="underline">
              Đăng nhập lại
            </Link>
          )}
        </div>
      ) : (
        <>
          <h3 className="text-sm font-semibold">SOS đang chờ cứu hộ</h3>

          {sos.loading && (
            <p role="status" className="py-2 text-sm text-muted">Đang tải SOS…</p>
          )}
          {sos.error && (
            <p role="alert" className="py-2 text-sm text-amber-300">
              {sos.error}
              {sos.requests ? ' Dữ liệu bên dưới có thể đã cũ.' : ''}
            </p>
          )}
          {!sos.loading && !sos.error && sos.requests?.length === 0 && (
            <p className="py-2 text-sm text-muted">Không có SOS đang chờ.</p>
          )}

          <ul className="divide-y divide-border">
            {sos.requests?.map(item => (
              <li key={item.id}>
                <Link onClick={onClose}
                  to={`/rescue/sos/${encodeURIComponent(item.id)}`}
                  className="block rounded px-2 py-3 hover:bg-bg">
                  <strong className="text-sm text-water">
                    {sosCode(item.id)} — Chờ cứu hộ
                  </strong>
                  <p className="text-xs text-muted">
                    {item.numberOfPeople ?? 'Chưa rõ số'} người · {timeLabel(item.createdAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          <h3 className="mt-4 text-sm font-semibold">
            Cảnh báo đang bật{source.demo ? ' · DỮ LIỆU MẪU' : ''}
          </h3>

          {warnings.loading && (
            <p role="status" className="py-2 text-sm text-muted">
              Đang tải cảnh báo…
            </p>
          )}
          {warnings.error && (
            <p role="alert" className="py-2 text-sm text-amber-300">
              {warnings.error}
              {warnings.data ? ' Dữ liệu bên dưới có thể đã cũ.' : ''}
            </p>
          )}
          {!warnings.loading && !warnings.error && warnings.data?.length === 0 && (
            <p className="py-2 text-sm text-muted">Không có bản tin đang bật.</p>
          )}

          <ul className="divide-y divide-border">
            {warnings.data?.map(item => (
              <li key={item.id}>
                <Link onClick={onClose}
                  to={`/rescue/flood-warnings/${encodeURIComponent(item.id)}`}
                  className="block rounded px-2 py-3 hover:bg-bg">
                  <strong className="text-sm text-water">{item.title}</strong>
                  <p className="text-xs text-muted">{timeLabel(item.startAt)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function RescueNotificationBell({ waitingCount }: { waitingCount?: number }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };

    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div ref={container} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-label="Mở thông báo cứu hộ"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen(value => !value)}
        title={waitingCount === undefined
          ? 'Thông báo cứu hộ'
          : `${waitingCount} SOS đang chờ`}
        className="relative rounded-lg p-2 text-muted transition hover:bg-card hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safe"
      >
        <Icon name="bell" className="h-5 w-5" />
        {waitingCount !== undefined && waitingCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-sos px-1 font-mono text-[10px] font-bold text-white">
            {waitingCount}
          </span>
        )}
      </button>

      {open && <NotificationPanel id={panelId} onClose={() => setOpen(false)} />}
    </div>
  );
}
