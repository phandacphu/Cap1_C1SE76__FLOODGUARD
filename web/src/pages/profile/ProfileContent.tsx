import { Icon } from "../../components/ui/Icon";
import type { UserProfile } from "./profileApi";

interface ProfileContentProps {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  accent?: "water" | "safe";
}

const ROLE_LABELS = {
  ADMIN: "Quản trị viên",
  RESCUE_STAFF: "Nhân viên cứu hộ",
  RESIDENT: "Người dân",
};

export function ProfileContent({
  profile,
  loading,
  error,
  onRefresh,
  accent = "water",
}: ProfileContentProps) {
  const accentClass =
    accent === "water"
      ? "bg-water/15 text-water"
      : "bg-safe/15 text-safe";

  const statusLabel =
    profile?.isActive === true
      ? "Đang hoạt động"
      : profile?.isActive === false
        ? "Đã vô hiệu hóa"
        : "Chưa có thông tin";

  const statusClass =
    profile?.isActive === true
      ? "text-safe"
      : profile?.isActive === false
        ? "text-sos"
        : "text-muted";

  const fields = profile
    ? [
        ["Họ và tên", profile.fullName ?? "Chưa cập nhật"],
        ["Email", profile.email ?? "Chưa cập nhật"],
        ["Số điện thoại", profile.phone ?? "Chưa cập nhật"],
        ["Mã tài khoản", profile.id],
        ["Vai trò", ROLE_LABELS[profile.role]],
      ]
    : [];

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm transition hover:border-water/50 disabled:cursor-wait disabled:opacity-60"
        >
          <Icon
            name="refresh"
            className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />
          {loading ? "Đang tải..." : error ? "Thử lại" : "Làm mới"}
        </button>
      </div>

      {loading && (
        <div
          role="status"
          className="rounded-xl border border-border bg-card p-8 text-center text-muted"
        >
          Đang tải thông tin hồ sơ...
        </div>
      )}

      {!loading && error && (
        <div
          role="alert"
          className="rounded-xl border border-sos/40 bg-sos/10 p-5 text-sm text-red-200"
        >
          {error}
        </div>
      )}

      {!loading && !error && profile && (
        <div className="grid items-start gap-5 lg:grid-cols-3">
          <section className="rounded-2xl border border-border bg-card p-6">
            <div
              className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${accentClass}`}
            >
              <Icon name="user" className="h-10 w-10" />
            </div>

            <h2 className="mt-4 break-words text-center text-xl font-bold">
              {profile.fullName ?? "Chưa cập nhật họ tên"}
            </h2>

            <p className="mt-2 break-all text-center text-sm text-muted">
              {profile.email ?? "Chưa cập nhật email"}
            </p>

            <div className="mt-4 flex justify-center">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${accentClass}`}
              >
                {ROLE_LABELS[profile.role]}
              </span>
            </div>

            <div className="mt-6 border-t border-border pt-4">
              <p className="text-xs text-muted">Trạng thái tài khoản</p>
              <p className={`mt-2 text-sm font-semibold ${statusClass}`}>
                {statusLabel}
              </p>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-border bg-card lg:col-span-2">
            <div className="border-b border-border px-6 py-4">
              <h2 className="font-semibold">Thông tin cá nhân</h2>
            </div>

            <dl className="grid gap-x-6 gap-y-5 p-6 sm:grid-cols-2">
              {fields.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="mt-2 break-words text-sm font-medium [overflow-wrap:anywhere]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      )}
    </div>
  );
}