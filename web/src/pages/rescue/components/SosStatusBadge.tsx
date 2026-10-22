import React from "react";
import type { SosStatus } from "../../../types/rescue";

interface Props {
  status: SosStatus;
}

export const SosStatusBadge: React.FC<Props> = ({ status }) => {
  const getStyle = (): string => {
    switch (status) {
      case "submitted":
        return "bg-rose-900/40 text-rose-300 border-rose-700/50";
      case "received":
        return "bg-sky-900/40 text-sky-300 border-sky-600/50";
      case "in_progress":
        return "bg-purple-900/40 text-purple-300 border-purple-500/50";
      case "assisted":
        return "bg-emerald-900/40 text-emerald-300 border-emerald-500/50";
      case "rejected":
      case "cancelled":
        return "bg-slate-800 text-slate-400 border-slate-700";
      default:
        return "bg-slate-800 text-slate-300 border-slate-700";
    }
  };

  const getLabel = (): string => {
    switch (status) {
      case "submitted":
        return "Chờ tiếp nhận";
      case "received":
        return "Đã tiếp nhận";
      case "in_progress":
        return "Đang cứu hộ";
      case "assisted":
        return "Đã hoàn tất";
      case "rejected":
        return "Từ chối";
      case "cancelled":
        return "Đã hủy";
      default:
        return status;
    }
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium border ${getStyle()}`}
    >
      {getLabel()}
    </span>
  );
};
