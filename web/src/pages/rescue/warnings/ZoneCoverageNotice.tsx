import type { ZoneBundle } from "./warningData";
import { coverageRows, coverageSummary } from "./zoneCoverage";
export function ZoneCoverageNotice({ bundle }: { bundle: ZoneBundle }) {
  if (bundle.coverage.status === "complete") return null;
  const rows = coverageRows(bundle);
  return (
    <div className="rw-feedback rw-history-note rw-coverage" role="status">
      <strong>
        {bundle.coverage.status === "partial"
          ? `Dữ liệu vùng chưa đầy đủ · ${bundle.coverage.evaluableZones}/${bundle.coverage.totalZones} vùng có ranh giới hợp lệ`
          : "Chưa có ranh giới vùng có thể hiển thị"}
      </strong>
      <p>{coverageSummary(bundle)}</p>
      {rows.length > 0 && (
        <details className="rw-coverage-details">
          <summary>Xem dữ liệu cần kiểm tra ({rows.length})</summary>
          <ul>
            {rows.map((row, index) => (
              <li key={row.id ?? `${row.source}:${index}`}>
                <strong>{row.name}</strong>
                <span>
                  {row.source} · {row.reason}
                </span>
                {row.id && <code>Mã vùng: {row.id}</code>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
