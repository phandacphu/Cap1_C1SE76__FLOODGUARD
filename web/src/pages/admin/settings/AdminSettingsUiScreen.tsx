import { useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import {
  AdminUiPreview,
  PreviewPanel,
  previewInputClass,
  previewSecondaryButton,
} from "../ui-preview/AdminUiPreview";

type SettingsTab = "display" | "notifications" | "security";
type Density = "comfortable" | "compact";

function SettingToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="mt-1 max-w-lg text-xs leading-5 text-slate-400">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-water ${checked ? "border-water bg-water" : "border-slate-600 bg-slate-700"}`}
      >
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${checked ? "left-6" : "left-1"}`} />
      </button>
    </div>
  );
}

export default function AdminSettingsUiScreen() {
  const [tab, setTab] = useState<SettingsTab>("display");
  const [density, setDensity] = useState<Density>("comfortable");
  const [noticeSos, setNoticeSos] = useState(true);
  const [noticeFlood, setNoticeFlood] = useState(true);
  const [noticeSystem, setNoticeSystem] = useState(false);

  const restoreDefaults = () => {
    setDensity("comfortable");
    setNoticeSos(true);
    setNoticeFlood(true);
    setNoticeSystem(false);
  };

  return (
    <AdminUiPreview
      title="Cài đặt hệ thống"
      subtitle="Tùy chỉnh giao diện, thông báo và quản lý thông tin bảo mật."
      action={<button type="button" onClick={restoreDefaults} className={previewSecondaryButton}>Khôi phục mặc định</button>}
    >
      <div className="grid items-start gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <nav aria-label="Nhóm cài đặt" className="space-y-2 rounded-2xl border border-border bg-card p-3">
          {([
            ["display", "Giao diện", "settings"],
            ["notifications", "Thông báo", "bell"],
            ["security", "Bảo mật & tài khoản", "shield"],
          ] as const).map(([value, label, icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              aria-current={tab === value ? "page" : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-medium transition ${tab === value ? "bg-water/15 text-water" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
            >
              <Icon name={icon} className="h-4 w-4" /> {label}
            </button>
          ))}
        </nav>

        {tab === "display" && (
          <PreviewPanel title="Tùy chỉnh giao diện">
            <div className="divide-y divide-border/80 px-5 sm:px-6">
              <div className="grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_240px] sm:items-center">
                <div><h3 className="text-sm font-semibold text-white">Ngôn ngữ</h3></div>
                <select aria-label="Ngôn ngữ" value="vi" disabled className={`${previewInputClass} cursor-not-allowed opacity-70`}>
                  <option value="vi">Tiếng Việt</option>
                </select>
              </div>
              <div className="grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_240px] sm:items-center">
                <div><h3 className="text-sm font-semibold text-white">Múi giờ</h3></div>
                <input aria-label="Múi giờ" readOnly value="Việt Nam (UTC+7)" className={`${previewInputClass} cursor-default opacity-70`} />
              </div>
              <div className="space-y-3 py-5">
                <h3 className="text-sm font-semibold text-white">Mật độ hiển thị</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    ["comfortable", "Thoáng", "Khoảng cách rộng, dễ quan sát"],
                    ["compact", "Gọn", "Hiển thị nhiều nội dung hơn"],
                  ] as const).map(([value, label, hint]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={density === value}
                      onClick={() => setDensity(value)}
                      className={`rounded-xl border p-4 text-left transition ${density === value ? "border-water/60 bg-water/10" : "border-border bg-bg/50 hover:border-slate-500"}`}
                    >
                      <span className="flex items-center justify-between gap-2 text-sm font-medium text-white">{label}<span className={`h-4 w-4 rounded-full border-4 ${density === value ? "border-water bg-card" : "border-slate-500 bg-card"}`} /></span>
                      <span className="mt-2 block text-xs text-slate-400">{hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </PreviewPanel>
        )}

        {tab === "notifications" && (
          <PreviewPanel title="Tùy chọn thông báo">
            <div className="divide-y divide-border/80 px-5 sm:px-6">
              <SettingToggle label="Thông báo yêu cầu SOS" hint="Thông báo khi có yêu cầu cứu hộ mới." checked={noticeSos} onChange={setNoticeSos} />
              <SettingToggle label="Thông báo cảnh báo lũ" hint="Thông báo khi cảnh báo lũ thay đổi." checked={noticeFlood} onChange={setNoticeFlood} />
              <SettingToggle label="Thông báo hệ thống" hint="Thông tin liên quan đến hoạt động quản trị." checked={noticeSystem} onChange={setNoticeSystem} />
            </div>
          </PreviewPanel>
        )}

        {tab === "security" && (
          <PreviewPanel title="Bảo mật & tài khoản">
            <div className="divide-y divide-border/80 px-5 sm:px-6">
              {[
                ["Tài khoản quản trị", "Thông tin tài khoản và quyền truy cập."],
                ["Phiên đăng nhập", "Theo dõi hoạt động đăng nhập và đăng xuất."],
                ["Phân quyền", "Quản lý vai trò và quyền truy cập của người dùng."],
              ].map(([title, detail]) => (
                <div key={title} className="flex items-start gap-3 py-5">
                  <span className="mt-1 rounded-lg bg-water/10 p-2 text-water"><Icon name="shield" className="h-4 w-4" /></span>
                  <div><h3 className="text-sm font-semibold text-white">{title}</h3><p className="mt-1 text-xs leading-6 text-slate-400">{detail}</p></div>
                </div>
              ))}
            </div>
          </PreviewPanel>
        )}
      </div>

      <div className="flex justify-end rounded-xl border border-border bg-card px-5 py-4">
        <button type="button" disabled className="cursor-not-allowed rounded-lg bg-water px-4 py-2 text-sm font-semibold text-slate-950 opacity-50">
          Lưu thay đổi
        </button>
      </div>
    </AdminUiPreview>
  );
}
