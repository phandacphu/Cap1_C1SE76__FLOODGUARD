import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RescueLayout } from '../../../components/layout/RescueLayout';
import { useAuth } from '../../../context/AuthContext';
import type { SosSort } from '../../../types/rescueDirect';
import { DirectSosFeedback } from '../components/DirectSosFeedback';
import { SosOperationsMap } from '../components/SosOperationsMap';
import { useRescueRequests } from '../useRescue';
import { MISSING, situationsLabel, sosCode, timeLabel } from '../sosDirect';
import { hasMapLocation } from '../sosMapData';
import { filterHistory } from './historyData';

export function RescueHistory() {
  const { user } = useAuth();
  // No new endpoint or extra /history polling: detail already contains its events.
  const result = useRescueRequests({ state: 'rescued', sort: 'newest' });
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [mine, setMine] = useState(false);
  const [sort, setSort] = useState<SosSort>('newest');
  const [showMap, setShowMap] = useState(false);
  const invalidDates = Boolean(from && to && from > to);
  const rows = result.requests === null ? null : filterHistory(result.requests, {
    search, from, to, mine, sort, userId: user?.id ?? null,
  });
  const hasFilters = Boolean(search.trim() || from || to || mine);
  const clear = () => { setSearch(''); setFrom(''); setTo(''); setMine(false); setSort('newest'); };
  const field = 'mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2.5';
  return <RescueLayout loading={result.loading} onRefresh={result.refresh} updatedAt={result.updatedAt}>
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Lịch sử cứu hộ</h1>
          <p className="mt-1 text-sm text-muted">Các SOS Backend đã xác nhận Đã cứu. Thời gian hiển thị theo giờ Việt Nam.</p></div>
        <Link to="/rescue/sos?state=active" className="rounded-lg border border-safe px-4 py-2 text-safe">Xem SOS chờ cứu hộ →</Link>
      </header>
      <section aria-label="Lọc lịch sử cứu hộ" className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap gap-2" aria-label="Phạm vi lịch sử">
          <button type="button" aria-pressed={!mine} onClick={() => setMine(false)} className={`rounded-lg border px-4 py-2 ${!mine ? 'border-safe bg-safe/20' : 'border-border'}`}>Tất cả đã cứu</button>
          <button type="button" aria-pressed={mine} onClick={() => setMine(true)} className={`rounded-lg border px-4 py-2 ${mine ? 'border-safe bg-safe/20' : 'border-border'}`}>Tôi xác nhận</button>
        </div>
        <div className="grid items-end gap-3 text-sm sm:grid-cols-2 xl:grid-cols-12">
          <label className="xl:col-span-4">Tìm kiếm<input type="search" value={search} onChange={e => setSearch(e.target.value)} className={field} placeholder="Mã SOS, ghi chú, ID người xác nhận…" /></label>
          <label className="xl:col-span-2">Hoàn tất từ ngày<input type="date" value={from} onChange={e => setFrom(e.target.value)} className={field} /></label>
          <label className="xl:col-span-2">Đến ngày<input type="date" value={to} onChange={e => setTo(e.target.value)} className={field} /></label>
          <label className="xl:col-span-2">Thời gian hoàn tất<select value={sort} onChange={e => setSort(e.target.value as SosSort)} className={field}><option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option></select></label>
          <button type="button" disabled={result.loading} onClick={result.refresh} className="rounded-lg border border-border px-4 py-2.5 disabled:opacity-50 xl:col-span-2">{result.loading ? 'Đang tải…' : 'Làm mới'}</button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <p>Tìm kiếm, ngày hoàn tất và “Tôi xác nhận” lọc trong dữ liệu đã tải.</p>
          {hasFilters && <button type="button" onClick={clear} className="text-water underline">Xóa bộ lọc</button>}
        </div>
        {invalidDates && <p role="alert" className="text-sm text-red-300">Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.</p>}
      </section>
      <DirectSosFeedback {...result} stale={Boolean(result.requests)} retry={result.refresh} />
      {rows && !invalidDates && <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-bold">{rows.length} SOS đã cứu phù hợp</h2>
            <p className="text-xs text-muted">Trong {result.requests!.filter(item => item.state === 'rescued').length} SOS đã cứu được tải · Cập nhật {timeLabel(result.updatedAt?.toISOString() ?? null)}</p></div>
          <button type="button" aria-expanded={showMap} aria-controls="history-map" onClick={() => setShowMap(value => !value)} className="rounded-lg border border-border px-4 py-2">{showMap ? 'Ẩn bản đồ' : 'Hiện bản đồ'}</button>
        </div>
        {rows.length === 0 ? <div className="rounded-xl border border-border bg-card p-10 text-center">
          <h2 className="font-bold">{hasFilters ? 'Không có lịch sử phù hợp bộ lọc' : 'Chưa có SOS đã cứu'}</h2>
          <p className="mt-2 text-sm text-muted">{hasFilters ? 'Thử đổi từ khóa hoặc khoảng ngày hoàn tất.' : 'SOS sẽ xuất hiện tại đây sau khi Backend xác nhận đã cứu.'}</p>
        </div> : <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Danh sách SOS đã cứu, người xác nhận và thời gian từ Backend</caption>
            <thead className="text-xs text-muted"><tr>{['Mã SOS / Thời điểm gửi', 'Thông tin yêu cầu', 'Trạng thái', 'Hoàn tất lúc', 'Người xác nhận (ID)', 'Thao tác'].map(label => <th key={label} scope="col" className="p-4">{label}</th>)}</tr></thead>
            <tbody>{rows.map(item => <tr key={item.id} className="border-t border-border align-top hover:bg-safe/5">
              <th scope="row" className="p-4 font-normal"><span className="font-mono font-bold" title={item.id}>{sosCode(item.id)}</span><p className="mt-1 whitespace-nowrap text-xs text-muted">{timeLabel(item.createdAt)}</p></th>
              <td className="max-w-xs p-4"><p>{situationsLabel(item.situations)}</p><p className="mt-1 text-xs text-muted">Số người trong yêu cầu: {item.numberOfPeople ?? MISSING}</p>{!hasMapLocation(item) && <p className="mt-1 text-xs text-amber-300">Chưa có tọa độ hợp lệ</p>}</td>
              <td className="p-4"><span className="whitespace-nowrap rounded-full border border-safe/40 bg-safe/10 px-2 py-1 text-xs text-safe">✓ Đã cứu</span></td>
              <td className="whitespace-nowrap p-4">{timeLabel(item.completedAt)}</td>
              <td className="max-w-48 break-all p-4 font-mono text-xs">{item.completedBy || MISSING}</td>
              <td className="p-4"><Link to={`/rescue/sos/${encodeURIComponent(item.id)}?from=history`} className="whitespace-nowrap text-water underline">Xem chi tiết</Link></td>
            </tr>)}</tbody>
          </table>
        </div>}
        {showMap && <div id="history-map"><p className="mb-2 text-xs text-muted">Vị trí lưu gần nhất của các SOS trong bảng; không thể hiện tình trạng ngập hiện tại. SOS thiếu tọa độ vẫn có trong danh sách.</p><SosOperationsMap items={rows} /></div>}
      </>}
    </div>
  </RescueLayout>;
}
