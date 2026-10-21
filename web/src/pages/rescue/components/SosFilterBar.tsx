import React from "react";

interface Props {
  status: string;
  urgency: string;
  sortByPriority: boolean;
  onStatusChange: (val: string) => void;
  onUrgencyChange: (val: string) => void;
  onPrioritySortToggle: (val: boolean) => void;
  onReset: () => void;
}

export const SosFilterBar: React.FC<Props> = ({
  status,
  urgency,
  sortByPriority,
  onStatusChange,
  onUrgencyChange,
  onPrioritySortToggle,
  onReset,
}) => {
  return (
    <div className="bg-[#0A1A2F]/90 border border-[#1E3A5F] rounded-lg p-4 flex flex-wrap items-center justify-between gap-4 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-mono text-slate-400 tracking-wide uppercase">
            Trạng thái:
          </span>
          <select
            value={status}
            onChange={(e) => {
              onStatusChange(e.target.value);
            }}
            className="bg-[#051424] text-slate-200 border border-[#1E3A5F] text-xs font-mono rounded px-3 py-1.5 focus:outline-none focus:border-cyan-500"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="submitted">Chờ tiếp nhận</option>
            <option value="received">Đã tiếp nhận</option>
            <option value="in_progress">Đang cứu hộ</option>
            <option value="assisted">Đã hoàn tất</option>
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs font-mono text-slate-400 tracking-wide uppercase">
            Mức độ:
          </span>
          <select
            value={urgency}
            onChange={(e) => {
              onUrgencyChange(e.target.value);
            }}
            className="bg-[#051424] text-slate-200 border border-[#1E3A5F] text-xs font-mono rounded px-3 py-1.5 focus:outline-none focus:border-cyan-500"
          >
            <option value="">Tất cả mức độ</option>
            <option value="critical">Nguy cấp (Critical)</option>
            <option value="high">Cao (High)</option>
            <option value="medium">Trung bình (Medium)</option>
            <option value="low">Thấp (Low)</option>
          </select>
        </div>

        <label className="flex items-center space-x-2 cursor-pointer text-xs font-mono text-cyan-400 select-none">
          <input
            type="checkbox"
            checked={sortByPriority}
            onChange={(e) => {
              onPrioritySortToggle(e.target.checked);
            }}
            className="rounded bg-[#051424] border-[#1E3A5F] text-cyan-500 focus:ring-0 focus:ring-offset-0"
          />
          <span>Ưu tiên cấp bách lên đầu</span>
        </label>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="px-3 py-1.5 text-xs font-mono text-slate-400 hover:text-white border border-[#1E3A5F] hover:border-slate-400 rounded transition-colors"
      >
        Đặt lại bộ lọc
      </button>
    </div>
  );
};
