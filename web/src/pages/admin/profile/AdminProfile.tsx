import { Navigate } from "react-router-dom";
import { AdminHeader } from "../../../components/layout/AdminHeader";
import { AppShell } from "../../../components/layout/AppShell";
import { ADMIN_NAV } from "../../../components/layout/navConfig";
import { useAuth } from "../../../context/AuthContext";
import { ProfileContent } from "../../profile/ProfileContent";
import { useProfile } from "../../profile/useProfile";

export function AdminProfile() {
  const { token, logout } = useAuth();
  const { profile, loading, error, refresh } = useProfile(token, logout);

  if (profile && profile.role !== "ADMIN") {
    return <Navigate to="/unauthorized" replace />;
  }

  return (
    <AppShell
      nav={ADMIN_NAV}
      brandSub="COMMAND C4I"
      brandTag="ADMIN"
      roleLabel="QUẢN TRỊ VIÊN C4I"
      accent="water"
      header={<AdminHeader title="Hồ sơ quản trị viên" />}
    >
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h1 className="text-2xl font-bold">Hồ sơ quản trị viên</h1>
          <p className="mt-2 text-sm text-muted">
            Thông tin tài khoản đang đăng nhập.
          </p>
        </section>

        <ProfileContent
          profile={profile}
          loading={loading}
          error={error}
          onRefresh={refresh}
          accent="water"
        />
      </div>
    </AppShell>
  );
}