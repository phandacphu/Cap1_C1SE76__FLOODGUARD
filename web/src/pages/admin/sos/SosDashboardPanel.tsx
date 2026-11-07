import { Link } from "react-router-dom";
import { Panel } from "../components/Panel";
import { SosErrorPanel, SosModeNotice } from "./SosFeedback";
import { SosSummaryCards } from "./SosSummaryCards";
import type { SosSummary } from "./sosTypes";

export function SosDashboardPanel({ summary, errorStatus, loading, retry }: {
  summary: SosSummary | null; errorStatus: number | null; loading: boolean; retry: () => void;
}) {
  return (
    <Panel title="Theo dõi và thống kê SOS" subtitle={summary?.source === "mock" ? "Toàn bộ dữ liệu mẫu · Chỉ phát triển" : "Toàn bộ SOS · Số liệu từ API tổng hợp"} icon="sos">
      <div className="space-y-4">
        {errorStatus !== null && <SosErrorPanel error={{ status: errorStatus, message: "Không tải được thống kê SOS. Vui lòng thử lại." }} retry={retry} />}
        {summary && <SosModeNotice mock={summary.source === "mock"} />}
        <SosSummaryCards summary={summary} loading={loading} />
        <Link to="/admin/sos" className="inline-flex rounded-lg border border-water/40 px-4 py-2 text-sm text-water">Mở danh sách SOS →</Link>
      </div>
    </Panel>
  );
}
