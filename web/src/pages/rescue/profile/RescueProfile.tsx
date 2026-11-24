import { Navigate } from "react-router-dom";
import { RescueLayout } from "../../../components/layout/RescueLayout";
import { useAuth } from "../../../context/AuthContext";
import { ProfileContent } from "../../profile/ProfileContent";
import { useProfile } from "../../profile/useProfile";

export function RescueProfile() {
  const { token, logout } = useAuth();
  const { profile, loading, error, refresh } = useProfile(token, logout);

  if (profile && profile.role !== "RESCUE_STAFF") {
    return <Navigate to="/unauthorized" replace />;
  }

  return (
    <RescueLayout
      loading={loading}
      onRefresh={refresh}
      updatedAt={null}
    >
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h1 className="text-2xl font-bold">
            Hồ sơ nhân viên cứu hộ
          </h1>
          <p className="mt-2 text-sm text-muted">
            Thông tin tài khoản đang đăng nhập.
          </p>
        </section>

        <ProfileContent
          profile={profile}
          loading={loading}
          error={error}
          onRefresh={refresh}
          accent="safe"
        />
      </div>
    </RescueLayout>
  );
}