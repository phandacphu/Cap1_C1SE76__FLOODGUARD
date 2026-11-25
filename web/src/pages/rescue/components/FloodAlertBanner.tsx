import { Link } from "react-router-dom";
import { useWarnings } from "../warnings/WarningContext";
import { WarningFeedback } from "../warnings/WarningFeedback";
import { warningTime, filterWarnings } from "../warnings/warningData";
import "../warnings/rescueWarnings.css";

/** Global V2 bulletins share the full published scope; never select by severity/area. */
export function FloodAlertBanner() {
  const { list, source } = useWarnings();
  const active = filterWarnings(list.data ?? [], "active", "");
  const latest = active[0];
  return (
    <section
      className="rw-page rw-panel rw-card"
      aria-label="Bản tin mưa lớn và nguy cơ ngập"
    >
      <p className="rw-kicker">
        CẢNH BÁO MƯA LỚN VÀ NGUY CƠ NGẬP {source?.demo && "· DỮ LIỆU MẪU"}
      </p>
      <WarningFeedback resource={list} noun="bản tin" />
      {list.data && (
        <>
          <p className="mt-2 font-semibold">{active.length} bản tin đang bật</p>
          {latest ? (
            <>
              <h2 className="mt-2">{latest.title}</h2>
              <p className="rw-excerpt">{latest.content}</p>
              <p className="rw-caption">
                Bản mới nhất · Bắt đầu {warningTime(latest.startAt)} (GMT+7) ·{" "}
                {warningTime(latest.endAt)}
              </p>
            </>
          ) : (
            <p className="rw-caption">
              Chưa có bản tin đang bật trong dữ liệu đã tải. Điều này không đồng
              nghĩa khu vực an toàn.
            </p>
          )}
        </>
      )}
      <Link className="rw-back" to="/rescue/flood-warnings">
        Xem đầy đủ các bản tin →
      </Link>
    </section>
  );
}
