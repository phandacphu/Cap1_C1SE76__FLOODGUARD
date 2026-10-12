import React from "react";
import type { UrgencyLevel } from "../../../types/rescue";

interface Props {
  urgency: UrgencyLevel;
}

export const SosPriorityBadge: React.FC<Props> = ({ urgency }) => {
  const getStyle = () => {
    switch (urgency) {
      case "critical":
        return "bg-red-950/80 text-red-400 border-red-600/60 animate-pulse";
      case "high":
        return "bg-orange-950/80 text-orange-400 border-orange-600/60";
      case "medium":
        return "bg-amber-950/80 text-amber-400 border-amber-600/60";
      case "low":
      default:
        return "bg-emerald-950/80 text-emerald-400 border-emerald-600/60";
    }
  };

  const getLabel = () => {
    switch (urgency) {
      case "critical":
        return "NGUY CẤP";
      case "high":
        return "CAO";
      case "medium":
        return "TRUNG BÌNH";
      case "low":
      default:
        return "THẤP";
    }
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold tracking-wider border uppercase ${getStyle()}`}
    >
      ● {getLabel()}
    </span>
  );
};
