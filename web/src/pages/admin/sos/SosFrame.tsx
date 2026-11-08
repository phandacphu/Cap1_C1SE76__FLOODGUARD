import type { ReactNode } from "react";
import { AppShell } from "../../../components/layout/AppShell";
import { AdminHeader } from "../../../components/layout/AdminHeader";
import { ADMIN_NAV } from "../../../components/layout/navConfig";

export function SosFrame({ children, detail = false }: { children: ReactNode; detail?: boolean }) {
  return (
    <AppShell nav={ADMIN_NAV} brandSub="COMMAND C4I" brandTag="ADMIN" roleLabel="QUẢN TRỊ VIÊN C4I"
      accent="water" header={<AdminHeader title={detail ? "Chi tiết SOS" : "Theo dõi SOS"} />}>
      <div className="mx-auto max-w-[1500px] space-y-5">{children}</div>
    </AppShell>
  );
}
