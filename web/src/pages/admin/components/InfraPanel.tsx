import { MOCK_INFRA, MOCK_RESOURCES } from "../adminMock";
import { MockTag } from "./Panel";

interface InfraPanelProps {
  /** Measured round trip of GET /health, or null when unreachable. */
  apiLatencyMs: number | null;
}

/** Only the API row is measured for real; the other rows are simulated. */
export function InfraPanel({ apiLatencyMs }: InfraPanelProps) {
  const online = apiLatencyMs !== null;

  return (
    <div>
      <div
        className={`flex items-center gap-3 rounded-xl border p-3 ${
          online ? "border-safe/30 bg-safe/10" : "border-sos/30 bg-sos/10"
        }`}
      >
        <span className={`h-3 w-3 rounded-full ${online ? "bg-safe" : "bg-sos"}`} />
        <div>
          <p className={`text-sm font-bold ${online ? "text-safe" : "text-sos"}`}>
            {online ? "API BACKEND TRỰC TUYẾN" : "KHÔNG KẾT NỐI ĐƯỢC API"}
          </p>
          <p className="font-mono text-[10px] text-muted">
            {online ? `Độ trễ ${apiLatencyMs}ms (đo trực tiếp)` : "Kiểm tra mạng hoặc server demo"}
          </p>
        </div>
      </div>

      <div className="mb-2 mt-4 flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-wider text-muted">DỊCH VỤ KHÁC</span>
        <MockTag />
      </div>
      <ul className="space-y-2.5 text-sm">
        {MOCK_INFRA.map((row) => (
          <li key={row.name} className="flex items-center justify-between gap-3">
            <span className="text-text/90">{row.name}</span>
            <span className="font-mono text-xs text-muted">{row.detail}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 space-y-3 rounded-xl border border-border bg-bg/60 p-3">
        {MOCK_RESOURCES.map((resource) => (
          <div key={resource.label}>
            <div className="flex justify-between font-mono text-[10px] tracking-wider text-muted">
              <span>{resource.label}</span>
              <span>{resource.value}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-border">
              <div className="h-full rounded-full bg-water" style={{ width: `${resource.value}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
