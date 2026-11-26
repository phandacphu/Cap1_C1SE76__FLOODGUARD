import { SosOperationsMap } from './components/SosOperationsMap';
import { Link, useSearchParams } from 'react-router-dom';
import { RescueLayout } from '../../components/layout/RescueLayout';
import type { SosState } from '../../types/rescueDirect';
import { DirectSosFeedback } from './components/DirectSosFeedback';
import { useRescueRequests } from './useRescue';
import { MISSING, STATE_LABEL, WATER_LABEL, situationsLabel, sosCode, sourceLabel, timeLabel } from './sosDirect';

export function RescueSosList() {
  const [query, setQuery] = useSearchParams();
  const requestedState = query.get('state');
  const state: SosState = requestedState === 'rescued' ? 'rescued' : 'active';
  const setState = (value: SosState) => setQuery({ state: value });
  const result = useRescueRequests({ state, sort: 'newest' });
  const rows = result.requests;
  return (
    <RescueLayout loading={result.loading} onRefresh={result.refresh} updatedAt={result.updatedAt}>
      <div className="mx-auto max-w-7xl space-y-5">
        <h1 className="text-2xl font-bold">Yêu cầu SOS</h1>
        <div className="flex flex-wrap gap-2" aria-label="Nhóm SOS">
          {(['active', 'rescued'] as const).map(value => (
            <button key={value} type="button" aria-pressed={state === value} onClick={() => setState(value)}
              className={`rounded-lg border px-4 py-2 ${state === value ? 'border-safe bg-safe/20' : 'border-border'}`}>
              {STATE_LABEL[value]}
            </button>
          ))}
        </div>
        <SosOperationsMap items={rows ?? null} />
        <DirectSosFeedback {...result} stale={Boolean(result.requests)} retry={result.refresh} />
        {rows?.length === 0 && <p className="rounded-xl border border-border p-8 text-center">Không có yêu cầu phù hợp.</p>}
        {rows && rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="min-w-full text-left text-sm">
              <thead><tr>{['Mã SOS / Thời điểm gửi', 'Số người', 'Tình huống', 'Mức nước', 'Trạng thái', 'Thời gian', 'Thao tác']
                .map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
              <tbody>{rows.map(item => (
                <tr key={item.id} className="border-t border-border">
                  <td className="p-3"><span className="font-mono">{sosCode(item.id)}</span><p className="mt-1 text-xs text-water">{sourceLabel(item.source)}</p><p className="text-xs text-muted">{timeLabel(item.createdAt)}</p></td>
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
