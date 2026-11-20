import { KpiCard } from "../components/KpiCard";
import { formatSosCount } from "./sosFormat";
import type { SosSummary } from "./sosTypes";

export function SosSummaryCards({ summary, loading = false }: { summary: SosSummary | null; loading?: boolean }) {
  return (
    <section aria-label="Thống kê SOS theo bộ lọc API" aria-busy={loading}
      className={`grid gap-4 md:grid-cols-2 ${summary && summary.legacyOther > 0 ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
      <KpiCard label="Tổng SOS" icon="sos" tone="water" value={formatSosCount(summary?.total)}
      />
      <KpiCard label="Chờ cứu hộ" icon="clock" tone="warn" value={formatSosCount(summary?.active)}
      />
      <KpiCard label="Đã cứu" icon="shield" tone="safe" value={formatSosCount(summary?.rescued)}
      />
      {summary && summary.legacyOther > 0 && <KpiCard label="Trạng thái cũ khác" icon="history" tone="text"
        value={formatSosCount(summary.legacyOther)} />}
    </section>
  );
}
