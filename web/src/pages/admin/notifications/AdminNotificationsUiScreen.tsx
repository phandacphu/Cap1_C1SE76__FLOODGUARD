import { useMemo, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import {
  AdminUiPreview,
  PreviewBadge,
  PreviewPanel,
  PreviewStat,
  previewInputClass,
  previewSecondaryButton,
} from "../ui-preview/AdminUiPreview";

type NotificationCategory = "sos" | "flood" | "system";
type NotificationFilter = "all" | "unread" | "read";

interface NotificationPreview {
  id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  time: string;
}

const categoryLabel: Record<NotificationCategory, string> = {
  sos: "Yêu cầu SOS",
  flood: "Cảnh báo lũ",
  system: "Hệ thống",
};

const categoryTone: Record<NotificationCategory, "warn" | "water" | "muted"> = {
  sos: "warn",
  flood: "water",
  system: "muted",
};

// Local UI fixture. Later replace with the verified Admin notification contract.
const previewNotifications: NotificationPreview[] = [
  { id: "NT-M01", title: "Có yêu cầu SOS mới", body: "Một yêu cầu cứu hộ vừa được ghi nhận và đang chờ tiếp nhận.", category: "sos", time: "09:40" },
  { id: "NT-M02", title: "Cập nhật cảnh báo lũ", body: "Thời gian hiệu lực của một cảnh báo lũ vừa được cập nhật.", category: "flood", time: "09:12" },
  { id: "NT-M03", title: "Cập nhật trạng thái cứu hộ", body: "Một yêu cầu SOS đã chuyển sang trạng thái đang xử lý.", category: "sos", time: "08:35" },
  { id: "NT-M04", title: "Thông báo hệ thống", body: "Có thông tin mới cần được quản trị viên theo dõi.", category: "system", time: "Hôm qua" },
  { id: "NT-M05", title: "Nhắc kiểm tra cảnh báo", body: "Một cảnh báo lũ có thời gian kết thúc trong ngày hôm nay.", category: "flood", time: "Hôm qua" },
];

export default function AdminNotificationsUiScreen() {
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set(["NT-M04", "NT-M05"]));
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>(previewNotifications[0].id);

  const unreadCount = previewNotifications.filter((item) => !readIds.has(item.id)).length;
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("vi-VN");
    return previewNotifications.filter((item) => {
      if (filter === "unread" && readIds.has(item.id)) return false;
      if (filter === "read" && !readIds.has(item.id)) return false;
      return [item.title, item.body, categoryLabel[item.category]]
        .some((field) => field.toLocaleLowerCase("vi-VN").includes(query));
    });
  }, [filter, readIds, search]);

  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;
  const markRead = (id: string) => setReadIds((previous) => new Set(previous).add(id));

  return (
    <AdminUiPreview
      title="Thông báo"
      subtitle="Theo dõi yêu cầu SOS, cảnh báo lũ và thông tin hệ thống."
      action={
        <button
          type="button"
          onClick={() => setReadIds(new Set(previewNotifications.map((item) => item.id)))}
          className={previewSecondaryButton}
        >
          Đánh dấu tất cả đã đọc
        </button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <PreviewStat title="Tổng thông báo" value={previewNotifications.length} detail="Tất cả thông báo" />
        <PreviewStat title="Chưa đọc" value={unreadCount} detail="Cần xem" tone="warn" />
        <PreviewStat title="Đã đọc" value={previewNotifications.length - unreadCount} detail="Đã xem" tone="safe" />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        <PreviewPanel title="Danh sách thông báo" extra={<PreviewBadge tone="muted">{filtered.length} thông báo</PreviewBadge>}>
          <div className="space-y-4 p-5">
            <label className="relative block">
              <span className="sr-only">Tìm thông báo</span>
              <span className="pointer-events-none absolute left-3 top-3 text-slate-500"><Icon name="search" className="h-4 w-4" /></span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={`${previewInputClass} pl-9`}
                placeholder="Tìm thông báo..."
              />
            </label>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc thông báo">
              {([
                ["all", "Tất cả"],
                ["unread", "Chưa đọc"],
                ["read", "Đã đọc"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  aria-pressed={filter === value}
                  className={`rounded-lg px-3.5 py-2 text-sm transition ${filter === value ? "bg-water/15 text-water" : "bg-slate-800/60 text-slate-400 hover:text-white"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-border/80 border-t border-border">
            {filtered.map((item) => {
              const isRead = readIds.has(item.id);
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => { setSelectedId(item.id); markRead(item.id); }}
                  className={`flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-slate-800/45 ${selected?.id === item.id ? "bg-water/5" : ""}`}
                >
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${isRead ? "bg-slate-600" : "bg-water"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`text-sm ${isRead ? "font-medium text-slate-300" : "font-semibold text-white"}`}>{item.title}</span>
                      <span className="text-xs text-slate-500">{item.time}</span>
                    </span>
                    <span className="mt-1 block line-clamp-2 text-sm leading-relaxed text-slate-400">{item.body}</span>
                    <span className="mt-2 inline-block"><PreviewBadge tone={categoryTone[item.category]}>{categoryLabel[item.category]}</PreviewBadge></span>
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 && <p className="px-5 py-12 text-center text-sm text-slate-400">Không có thông báo phù hợp.</p>}
          </div>
        </PreviewPanel>

        <PreviewPanel title="Nội dung thông báo">
          {selected ? (
            <div className="space-y-5 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <PreviewBadge tone={categoryTone[selected.category]}>{categoryLabel[selected.category]}</PreviewBadge>
                <span className="text-xs text-slate-500">{selected.time}</span>
              </div>
              <h3 className="text-xl font-semibold leading-snug text-white">{selected.title}</h3>
              <p className="min-h-28 text-sm leading-7 text-slate-300">{selected.body}</p>
            </div>
          ) : <p className="p-6 text-sm text-slate-400">Chọn thông báo để xem nội dung.</p>}
        </PreviewPanel>
      </div>
    </AdminUiPreview>
  );
}
