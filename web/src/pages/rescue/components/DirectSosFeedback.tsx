import { Link } from 'react-router-dom';

export function DirectSosFeedback({ error, status, stale, loading, retry }: {
  error: string | null; status: number | null; stale: boolean; loading: boolean; retry: () => void;
}) {
  return (
    <>
      {loading && <p role="status" className="text-sm text-muted">Đang tải SOS…</p>}
      {error && (
        <div role="alert" className="space-y-2 rounded-xl border border-red-500/50 bg-red-950/30 p-4 text-sm text-red-200">
          <p>{error}</p>
          {stale && <p>Đang hiển thị dữ liệu cũ. Chưa cập nhật được vị trí và trạng thái mới nhất.</p>}
          {status === 401 ? <Link to="/login" className="underline">Đăng nhập lại</Link> :
            <button type="button" disabled={loading} onClick={retry} className="underline disabled:opacity-50">Thử lại</button>}
        </div>
      )}
    </>
  );
}
