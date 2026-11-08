import { KpiCard } from "../components/KpiCard";
import { formatSosCount } from "./sosFormat";
import type { SosSummary } from "./sosTypes";

export function SosSummaryCards({ summary, loading = false }: { summary: SosSummary | null; loading?: boolean }) {
  return (
    <section aria-label="Thống kê SOS" aria-busy={loading} className="grid gap-4 md:grid-cols-3">
      <KpiCard label="Tổng số SOS" icon="sos" tone="water" value={formatSosCount(summary?.total)}
        sub={loading ? "Đang tải thống kê..." : summary ? "Theo phạm vi đang áp dụng" : "Chưa tải được thống kê"} />
      <KpiCard label="Còn hoạt động / chờ cứu" icon="clock" tone="warn" value={formatSosCount(summary?.active)}
        sub={summary?.active == null ? "Chưa có dữ liệu tình trạng mới" : "Đã gửi — chờ cứu hộ"} />
      <KpiCard label="Đã cứu" icon="shield" tone="safe" value={formatSosCount(summary?.rescued)}
        sub={summary?.rescued == null ? "Chưa có dữ liệu tình trạng mới" : "Đã xác nhận hoàn tất"} />
    </section>
  );
}
