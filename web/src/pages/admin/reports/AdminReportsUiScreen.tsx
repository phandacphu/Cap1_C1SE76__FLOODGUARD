import { useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import {
  AdminUiPreview,
  PreviewBadge,
  PreviewPanel,
  PreviewStat,
  previewSecondaryButton,
} from "../ui-preview/AdminUiPreview";

type ReportRange = "7d" | "30d" | "90d";

interface ReportPreview {
  requests: number;
  completed: number;
  pending: number;
  warnings: number;
  trend: { label: string; value: number }[];
}

// Display-only figures; replace with validated reporting data when available.
const previewReports: Record<ReportRange, ReportPreview> = {
  "7d": {
    requests: 42, completed: 31, pending: 11, warnings: 8,
    trend: [
      { label: "T2", value: 3 }, { label: "T3", value: 5 }, { label: "T4", value: 4 },
      { label: "T5", value: 8 }, { label: "T6", value: 6 }, { label: "T7", value: 9 }, { label: "CN", value: 7 },
    ],
  },
  "30d": {
    requests: 165, completed: 128, pending: 37, warnings: 29,
    trend: [
      { label: "Tuần 1", value: 42 }, { label: "Tuần 2", value: 36 },
      { label: "Tuần 3", value: 39 }, { label: "Tuần 4", value: 48 },
    ],
  },
  "90d": {
    requests: 472, completed: 389, pending: 83, warnings: 86,
    trend: [
      { label: "Tháng 1", value: 152 }, { label: "Tháng 2", value: 174 },
      { label: "Tháng 3", value: 146 },
    ],
  },
};

export default function AdminReportsUiScreen() {
  const [range, setRange] = useState<ReportRange>("7d");
  const current = previewReports[range];
  const maxValue = Math.max(...current.trend.map((item) => item.value), 1);
  const completion = current.requests === 0 ? 0 : Math.round((current.completed / current.requests) * 100);

  return (
    <AdminUiPreview
      title="Báo cáo & thống kê"
      subtitle="Tổng hợp yêu cầu SOS, kết quả cứu hộ và tình hình cảnh báo lũ."
      action={
        <button
          type="button"
          disabled
          title="Xuất báo cáo"
          className={`${previewSecondaryButton} inline-flex cursor-not-allowed items-center gap-2 opacity-50`}
        >
          <Icon name="download" className="h-4 w-4" /> Xuất báo cáo
        </button>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4">
        <p className="text-sm font-semibold text-white">Khoảng thời gian</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Chọn khoảng thời gian báo cáo">
          {([
            ["7d", "7 ngày"], ["30d", "30 ngày"], ["90d", "90 ngày"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={range === value}
              onClick={() => setRange(value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${range === value ? "bg-water text-slate-950" : "bg-slate-800 text-slate-400 hover:text-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PreviewStat title="Tổng SOS" value={current.requests} detail="Trong kỳ báo cáo" />
        <PreviewStat title="Đã hoàn thành" value={current.completed} detail={`${completion}% tổng yêu cầu`} tone="safe" />
        <PreviewStat title="Đang xử lý" value={current.pending} detail="Chưa hoàn thành" tone="warn" />
        <PreviewStat title="Cảnh báo lũ" value={current.warnings} detail="Trong kỳ báo cáo" />
      </div>

      <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(310px,0.85fr)]">
        <PreviewPanel title="Biểu đồ yêu cầu SOS" extra={<PreviewBadge tone="muted">{range === "7d" ? "Theo ngày" : range === "30d" ? "Theo tuần" : "Theo tháng"}</PreviewBadge>}>
          <div className="p-5 sm:p-6">
            <div className="mb-8 flex items-center gap-2 text-xs text-slate-400"><span className="h-2.5 w-2.5 rounded-sm bg-water" />Số yêu cầu SOS</div>
            <div
              className="grid h-64 items-end gap-3 border-b border-slate-700/80 pb-2 sm:gap-5"
              style={{ gridTemplateColumns: `repeat(${current.trend.length}, minmax(0, 1fr))` }}
            >
              {current.trend.map((entry) => (
                <div key={entry.label} className="flex h-full min-w-0 flex-col items-center justify-end gap-2">
                  <span className="font-mono text-xs text-slate-300">{entry.value}</span>
                  <div
                    role="img"
                    aria-label={`${entry.label}: ${entry.value} yêu cầu SOS`}
                    className="w-full max-w-16 rounded-t-lg bg-gradient-to-t from-cyan-600 to-water shadow-sm shadow-water/10 transition-all duration-300"
                    style={{ height: `${Math.max(8, (entry.value / maxValue) * 180)}px` }}
                  />
                  <span className="whitespace-nowrap text-[11px] font-medium text-slate-400">{entry.label}</span>
                </div>
              ))}
            </div>
          </div>
        </PreviewPanel>

        <PreviewPanel title="Tiến độ xử lý SOS" extra={<PreviewBadge tone="safe">{completion}% hoàn thành</PreviewBadge>}>
          <div className="flex flex-col items-center gap-6 p-6">
            <div
              role="img"
              aria-label={`${completion}% yêu cầu đã hoàn thành`}
              className="relative flex h-44 w-44 items-center justify-center rounded-full"
              style={{ background: `conic-gradient(#2ee88a 0% ${completion}%, #f59e0b ${completion}% 100%)` }}
            >
              <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-card">
                <span className="text-3xl font-bold text-white">{completion}%</span>
                <span className="mt-1 text-xs text-slate-400">Đã hoàn thành</span>
              </div>
            </div>
            <div className="w-full space-y-3">
              {([
                { title: "Đã hoàn thành", value: current.completed, color: "bg-safe" },
                { title: "Đang tiếp nhận / xử lý", value: current.pending, color: "bg-warn" },
              ]).map((category) => (
                <div key={category.title} className="flex items-center justify-between gap-4 text-sm">
                  <span className="flex items-center gap-2 text-slate-300"><span className={`h-2.5 w-2.5 rounded-sm ${category.color}`} />{category.title}</span>
                  <span className="font-mono font-semibold text-white">{category.value}</span>
                </div>
              ))}
            </div>
          </div>
        </PreviewPanel>
      </div>
    </AdminUiPreview>
  );
}
