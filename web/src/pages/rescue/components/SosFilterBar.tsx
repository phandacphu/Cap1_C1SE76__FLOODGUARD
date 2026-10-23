import { Icon } from "../../../components/ui/Icon";

export type SortMode = "priority" | "newest";

interface Props {
  search: string;
  status: string;
  urgency: string;
  sort: SortMode;
  onSearch: (value: string) => void;
  onStatus: (value: string) => void;
  onUrgency: (value: string) => void;
  onSort: (value: SortMode) => void;
  onReset: () => void;
}

const SELECT =
  "rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-safe focus:outline-none";

/** Search + filters of the SOS list (CCF-106, CCF-107). */
export function SosFilterBar({
  search,
  status,
  urgency,
  sort,
  onSearch,
  onStatus,
  onUrgency,
  onSort,
  onReset,
}: Props) {
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/80 p-4">
      <label className="relative min-w-56 flex-1">
        <span className="sr-only">Tìm kiếm</span>
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
          <Icon name="search" className="h-4 w-4" />
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Tìm mã SOS, ghi chú, tọa độ..."
          className="w-full rounded-lg border border-border bg-bg py-2 pl-9 pr-3 text-sm placeholder:text-muted/70 focus:border-safe focus:outline-none"
        />
      </label>

      <select
        aria-label="Lọc trạng thái"
        value={status}
        onChange={(e) => onStatus(e.target.value)}
        className={SELECT}
      >
        <option value="">Tất cả trạng thái</option>
        <option value="submitted">Chờ tiếp nhận</option>
        <option value="received">Đã tiếp nhận</option>
        <option value="in_progress">Đang cứu hộ</option>
        <option value="assisted">Đã hoàn tất</option>
      </select>

      <select
        aria-label="Lọc mức độ"
        value={urgency}
        onChange={(e) => onUrgency(e.target.value)}
        className={SELECT}
      >
        <option value="">Tất cả mức độ</option>
        <option value="critical">Khẩn cấp</option>
        <option value="high">Cao</option>
        <option value="medium">Trung bình</option>
        <option value="low">Thấp</option>
      </select>

      <select
        aria-label="Sắp xếp"
        value={sort}
        onChange={(e) => onSort(e.target.value as SortMode)}
        className={SELECT}
      >
        <option value="priority">Sắp xếp: Mức khẩn cấp (cao nhất)</option>
        <option value="newest">Sắp xếp: Mới nhất</option>
      </select>

      <div className="flex items-center overflow-hidden rounded-lg border border-border text-sm">
        <span className="flex items-center gap-1.5 bg-safe/15 px-3 py-2 font-semibold text-safe">
          <Icon name="report" className="h-4 w-4" /> Danh sách
        </span>
        <span
          aria-disabled="true"
          title="Sắp ra mắt (CCF-105)"
          className="flex cursor-not-allowed items-center gap-1.5 px-3 py-2 text-muted/70"
        >
          <Icon name="map" className="h-4 w-4" /> Bản đồ
        </span>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted transition hover:text-text"
      >
        <Icon name="refresh" className="h-4 w-4" /> Đặt lại
      </button>
    </section>
  );
}
