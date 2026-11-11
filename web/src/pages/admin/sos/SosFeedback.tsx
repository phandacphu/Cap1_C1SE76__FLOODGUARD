import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { Icon } from "../../../components/ui/Icon";
import type { SosCondition } from "./sosTypes";

export function SosModeNotice({ mock }: { mock: boolean }) {
  return mock ? (
    <div role="note" className="rounded-xl border border-warn/50 bg-warn/10 px-4 py-3 text-sm text-warn">
      <strong>DỮ LIỆU MẪU · CHỈ MÔI TRƯỜNG PHÁT TRIỂN</strong>
      <p className="mt-1">Tên, thông tin và thống kê bên dưới chỉ để thử giao diện; chưa dùng để nghiệm thu API thật.</p>
    </div>
  ) : (
    <div role="note" className="rounded-xl border border-border bg-card/80 px-4 py-3 text-sm text-muted">
      <strong className="text-text">Nguồn: Backend SOS v2 · Admin chỉ xem và theo dõi</strong>
      <p className="mt-1">Thông tin liên hệ chưa có trong API Admin hiện tại. Dữ liệu cũ có thể thiếu tình huống, GPS hoặc người xác nhận; không tự suy đoán giá trị.</p>
    </div>
  );
}

export function SosConditionBadge({ condition }: { condition: SosCondition | null }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
      condition === "rescued" ? "border-safe/30 bg-safe/10 text-safe" :
      condition === "active" ? "border-warn/30 bg-warn/10 text-warn" : "border-border text-muted"
    }`}>
      {condition === "rescued" ? "Đã cứu" : condition === "active" ? "Chờ cứu hộ" :
        condition === "legacy_other" ? "Trạng thái cũ khác" : "Chưa có trạng thái"}
    </span>
  );
}

export function SosErrorPanel({ error, retry }: {
  error: { status: number; message: string }; retry?: () => void;
}) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const message = error.status === 401 ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." :
    error.status === 403 ? "Bạn không có quyền xem dữ liệu Admin SOS." :
    error.status === 404 ? "SOS không tồn tại hoặc không còn được cung cấp." :
    error.status === 400 ? `Tham số hoặc hợp đồng API SOS chưa hợp lệ: ${error.message}` : error.message;
  return (
    <div role="alert" className="rounded-xl border border-sos/40 bg-sos/10 p-4">
      <div className="flex items-start gap-3"><Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-sos" />
        <p className="break-words text-sm text-text">{message}</p></div>
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        {error.status === 401 ? (
          <button className="rounded-lg bg-water px-3 py-2 font-semibold text-bg" onClick={() => {
            logout(); navigate("/login", { replace: true });
          }}>Đăng nhập lại</button>
        ) : error.status === 403 ? <Link className="text-water underline" to="/admin/dashboard">Về tổng quan</Link> : (
          <>
            {retry && <button type="button" onClick={retry} className="rounded-lg border border-sos/40 px-3 py-2 text-text">Thử lại</button>}
            {error.status === 404 && <Link className="self-center text-water underline" to="/admin/sos">Về danh sách SOS</Link>}
          </>
        )}
      </div>
    </div>
  );
}
