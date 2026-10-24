import type { ReactNode } from "react";
import { AppShell } from "./AppShell";
import { RescueHeader } from "./RescueHeader";
import { RESCUE_NAV } from "./navConfig";

interface RescueLayoutProps {
  loading: boolean;
  onRefresh: () => void;
  updatedAt: Date | null;
  /** Requests waiting for a rescuer; leave out when the page does not know it. */
  waitingCount?: number;
  children: ReactNode;
}

/** Frame shared by every Rescue Staff screen. */
export function RescueLayout({
  loading,
  onRefresh,
  updatedAt,
  waitingCount,
  children,
}: RescueLayoutProps) {
  return (
    <AppShell
      nav={RESCUE_NAV}
      brandSub="RESCUE STAFF"
      roleLabel="NHÂN VIÊN CỨU HỘ"
      accent="safe"
      badges={{ "/rescue/sos": waitingCount ?? 0 }}
      header={
        <RescueHeader
          loading={loading}
          onRefresh={onRefresh}
          updatedAt={updatedAt}
          waitingCount={waitingCount ?? 0}
        />
      }
    >
      {children}
    </AppShell>
  );
}
