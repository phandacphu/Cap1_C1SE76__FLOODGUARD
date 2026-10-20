import { NavLink, useNavigate } from "react-router-dom";
import floodguardLogo from "../../assets/floodguard-logo.png";
import { logoutRequest } from "../../api/authApi";
import { useAuth } from "../../context/AuthContext";
import { Icon } from "../ui/Icon";
import type { NavItem } from "./navConfig";

interface SidebarProps {
  items: NavItem[];
  /** Small line under the brand, e.g. "COMMAND C4I". */
  brandSub: string;
  /** Optional chip next to the brand, e.g. "ADMIN". */
  brandTag?: string;
  /** Job title under the user's name. */
  roleLabel: string;
  accent: "water" | "safe";
  /** Called after the user picks an item (used to close the mobile drawer). */
  onNavigate?: () => void;
}

const ACCENT_ACTIVE = {
  water: "bg-water/10 text-water",
  safe: "bg-safe/15 text-safe",
} as const;

export function Sidebar({
  items,
  brandSub,
  brandTag,
  roleLabel,
  accent,
  onNavigate,
}: SidebarProps) {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    // Best effort: the JWT is stateless, so the session is cleared locally either way.
    if (token) await logoutRequest(token);
    logout();
    navigate("/login", { replace: true });
  };

  const displayName = user?.fullName || user?.email || "Người dùng";

  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="flex items-center gap-3 px-5 py-5">
        <img
          src={floodguardLogo}
          alt="FLOODGUARD"
          className="h-10 w-10 rounded-lg object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-tight tracking-wide text-water">
            FLOODGUARD
          </p>
          <p className="font-mono text-[10px] tracking-[0.2em] text-muted">
            {brandSub}
          </p>
        </div>
        {brandTag && (
          <span className="rounded border border-water/40 bg-water/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-water">
            {brandTag}
          </span>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-3" aria-label="Menu chính">
        {items.map((item) =>
          item.to ? (
            <NavLink
              key={item.label}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                  isActive
                    ? ACCENT_ACTIVE[accent]
                    : "text-text/85 hover:bg-card hover:text-text"
                }`
              }
            >
              <Icon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          ) : (
            <div
              key={item.label}
              aria-disabled="true"
              title="Sắp ra mắt"
              className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted/70"
            >
              <Icon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
              <span className="truncate">{item.label}</span>
            </div>
          ),
        )}
      </nav>

      <div className="m-3 rounded-xl border border-border bg-card/60 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-water/20 text-water">
            <Icon name="user" className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            <p className="truncate font-mono text-[10px] tracking-widest text-muted">
              {roleLabel}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span
            aria-disabled="true"
            title="Sắp ra mắt"
            className="flex cursor-not-allowed items-center gap-1.5"
          >
            <Icon name="user" className="h-3.5 w-3.5" /> Hồ sơ
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 transition hover:text-text"
          >
            <Icon name="logout" className="h-3.5 w-3.5" /> Đăng xuất
          </button>
        </div>
      </div>
    </div>
  );
}
