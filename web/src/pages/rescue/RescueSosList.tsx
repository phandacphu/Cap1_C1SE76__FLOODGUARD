import { SosOperationsMap } from './components/SosOperationsMap';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { RescueLayout } from '../../components/layout/RescueLayout';
import type { SosState, SosSort } from '../../types/rescueDirect';
import { DirectSosFeedback } from './components/DirectSosFeedback';
import { useRescueRequests } from './useRescue';
import { dateBoundary, MISSING, STATE_LABEL, WATER_LABEL, situationsLabel, sosCode, timeLabel } from './sosDirect';

export function RescueSosList() {
  const [query, setQuery] = useSearchParams();
  const requestedState = query.get('state');
  const state: SosState | undefined = requestedState === 'all' ? undefined : requestedState === 'rescued' || requestedState === 'legacy_other' ? requestedState : 'active';
  const setState = (value: SosState | 'all') => setQuery({ state: value });
  const [view, setView] = useState<'list' | 'map' | 'both'>('both');
  const [sort, setSort] = useState<SosSort>('newest');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const datesInvalid = Boolean(from && to && from > to);
  const result = useRescueRequests({
    state, sort,
    from: dateBoundary(from, false),
    to: dateBoundary(to, true),
  });
  const term = search.trim().toLocaleLowerCase('vi');
  const rows = result.requests?.filter(item =>
    [item.id, item.residentId, item.note, situationsLabel(item.situations)]
      .join(' ').toLocaleLowerCase('vi').includes(term));
  return (
    <RescueLayout loading={result.loading} onRefresh={result.refresh} updatedAt={result.updatedAt}>
      <div className="mx-auto max-w-7xl space-y-5">
        <h1 className="text-2xl font-bold">Yêu cầu SOS</h1>
        <p className="text-sm text-muted">Xem yêu cầu, đến cứu và xác nhận đã cứu tại trang chi tiết.</p>
        <div className="flex flex-wrap gap-2" aria-label="Nhóm SOS">
          <button type="button" aria-pressed={state === undefined} onClick={() => setState('all')}
            className={`rounded-lg border px-4 py-2 ${state === undefined ? 'border-safe bg-safe/20' : 'border-border'}`}>Tất cả</button>
          {(Object.keys(STATE_LABEL) as SosState[]).map(value => (
            <button key={value} type="button" aria-pressed={state === value} onClick={() => setState(value)}
              className={`rounded-lg border px-4 py-2 ${state === value ? 'border-safe bg-safe/20' : 'border-border'}`}>
              {STATE_LABEL[value]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <label>Tìm trong tập đã tải<input value={search} onChange={event => setSearch(event.target.value)}
            className="ml-2 rounded border border-border bg-bg p-2" placeholder="Mã SOS, ghi chú…" /></label>
          <label>Thứ tự<select value={sort} onChange={event => setSort(event.target.value as SosSort)}
            className="ml-2 rounded border border-border bg-bg p-2">
            <option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option>
          </select></label>
          <label>Từ ngày (giờ Việt Nam)<input type="date" value={from} onChange={event => setFrom(event.target.value)}
            className="ml-2 rounded border border-border bg-bg p-2" /></label>
          <label>Đến ngày (giờ Việt Nam)<input type="date" value={to} onChange={event => setTo(event.target.value)}
            className="ml-2 rounded border border-border bg-bg p-2" /></label>
          <button type="button" disabled={result.loading} onClick={result.refresh} className="rounded border border-border px-3 py-2">Làm mới</button>
        </div>
        <div className="flex gap-2" aria-label="Chế độ hiển thị">
          {(['both', 'list', 'map'] as const).map(mode => <button type="button" key={mode} aria-pressed={view === mode}
            className={`rounded border border-border px-4 py-2 ${view === mode ? 'bg-safe/20' : ''}`}
            onClick={() => setView(mode)}>{mode === 'both' ? 'Bản đồ và danh sách' : mode === 'map' ? 'Bản đồ' : 'Danh sách'}</button>)}
        </div>
        {view !== 'list' && <SosOperationsMap items={rows ?? null} />}
        {datesInvalid && <p role="alert" className="text-red-300">Ngày bắt đầu phải trước ngày kết thúc.</p>}
        <DirectSosFeedback {...result} stale={Boolean(result.requests)} retry={result.refresh} />
        {rows && <p className="text-xs text-muted">
          {rows.length} kết quả trong {result.requests!.length} yêu cầu đã tải theo bộ lọc.
          {' '}Cập nhật lúc {result.updatedAt?.toLocaleString('vi-VN')}.
        </p>}
        {rows?.length === 0 && <p className="rounded-xl border border-border p-8 text-center">Không có yêu cầu phù hợp.</p>}
        {view !== 'map' && rows && rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="min-w-full text-left text-sm">
              <thead><tr>{['Mã SOS / Thời điểm gửi', 'Số người', 'Tình huống', 'Mức nước', 'Trạng thái', 'Backend nhận vị trí lúc', 'Thao tác']
                .map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
              <tbody>{rows.map(item => (
                <tr key={item.id} className="border-t border-border">
                  <td className="p-3"><span className="font-mono">{sosCode(item.id)}</span><p className="text-xs text-muted">{timeLabel(item.createdAt)}</p></td>
                  <td className="p-3">{item.numberOfPeople ?? MISSING}</td>
                  <td className="max-w-xs p-3">{situationsLabel(item.situations)}</td>
                  <td className="p-3">{item.waterLevel ? WATER_LABEL[item.waterLevel] ?? MISSING : MISSING}</td>
                  <td className="p-3">{item.state ? STATE_LABEL[item.state] : MISSING}</td>
                  <td className="p-3">{timeLabel(item.locationReceivedAt)}</td>
                  <td className="p-3"><Link className="text-water underline" to={`/rescue/sos/${encodeURIComponent(item.id)}`}>Xem chi tiết</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </RescueLayout>
  );
}
export default RescueSosList;
