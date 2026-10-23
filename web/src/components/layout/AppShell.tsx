import { useState, type ReactNode } from "react";
import { Icon } from "../ui/Icon";
import { Sidebar } from "./Sidebar";
import type { NavItem } from "./navConfig";

interface AppShellProps {
  nav: NavItem[];
  brandSub: string;
  brandTag?: string;
  roleLabel: string;
  accent: "water" | "safe";
  /** Count bubbles in the sidebar, keyed by route. */
  badges?: Record<string, number>;
  /** Top bar content, rendered to the right of the mobile menu button. */
  header: ReactNode;
  children: ReactNode;
}

/** Shared frame for the Admin and Rescue screens: sidebar + top bar + content. */
export function AppShell({
  nav,
  brandSub,
  brandTag,
  roleLabel,
  accent,
  badges,
  header,
  children,
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const sidebar = (
    <Sidebar
      items={nav}
      brandSub={brandSub}
      brandTag={brandTag}
      roleLabel={roleLabel}
      accent={accent}
      badges={badges}
      onNavigate={() => setDrawerOpen(false)}
    />
  );

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Đóng menu"
            className="absolute inset-0 bg-black/60"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-border">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur sm:px-6">
          <button
            type="button"
            aria-label="Mở menu"
            className="rounded-lg border border-border p-2 text-muted lg:hidden"
            onClick={() => setDrawerOpen(true)}
          >
            <Icon name="menu" className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3">{header}</div>
        </header>

        <main className="px-4 py-5 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
