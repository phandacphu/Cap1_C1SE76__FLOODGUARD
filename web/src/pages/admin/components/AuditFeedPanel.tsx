import { MOCK_AUDIT } from "../adminMock";

const TAG_STYLE: Record<string, string> = {
  "CẢNH BÁO": "bg-warn/15 text-warn",
  "HỆ THỐNG": "bg-water/15 text-water",
  "CỨU HỘ": "bg-safe/15 text-safe",
  "ĐỊA ĐIỂM": "bg-text/10 text-muted",
  "BẢO MẬT": "bg-sos/15 text-sos",
};

/** Audit feed. There is no read API for the audit log yet, so this is simulated. */
export function AuditFeedPanel() {
  return (
    <ul className="divide-y divide-border">
      {MOCK_AUDIT.map((entry) => (
        <li key={entry.time} className="py-3 first:pt-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-muted">{entry.time}</span>
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${TAG_STYLE[entry.tag]}`}
            >
              {entry.tag}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-text/90">
            <strong className="font-semibold text-water">[{entry.actor}]</strong> {entry.text}
          </p>
        </li>
      ))}
    </ul>
  );
}
