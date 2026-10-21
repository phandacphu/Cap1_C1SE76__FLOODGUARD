import React from 'react';
import type { RescueRequest } from '../../types/rescue';
import { SosPriorityBadge } from './components/SosPriorityBadge';
import { SosStatusBadge } from './components/SosStatusBadge';

interface EnrichedRescueRequest extends RescueRequest {
  assignmentFetchFailed?: boolean;
  assignedStaffId?: string;
}

interface Props {
  requests: EnrichedRescueRequest[];
  loading: boolean;
  fetchError: string | null;
  actionLoadingId: string | null;
  currentUserId: string;
  onAccept: (id: string) => Promise<void>;
  onUpdateStatus: (id: string, nextStatus: 'in_progress' | 'assisted') => Promise<void>;
  onReload: () => void;
}

export const RescueSosList: React.FC<Props> = ({
  requests,
  loading,
  fetchError,
  actionLoadingId,
  currentUserId,
  onAccept,
  onUpdateStatus,
  onReload,
}) => {
  if (loading) {
    return (
      <div className="p-12 text-center font-mono text-xs text-slate-400 space-y-3">
        <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <div>Đang kết nối trung tâm điều phối Render...</div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="p-12 text-center font-mono text-xs text-red-400 space-y-3">
        <div>Không thể tải danh sách cứu hộ do sự cố máy chủ.</div>
        <button
          type="button"
          onClick={onReload}
          className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs transition-colors"
        >
          Làm mới dữ liệu
        </button>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="p-12 text-center font-mono text-xs text-slate-400">
        Không tìm thấy tín hiệu yêu cầu SOS phù hợp với bộ lọc hiện tại.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-[#1E3A5F]/70 text-xs font-mono">
        <thead className="bg-[#051424]">
          <tr>
            <th className="px-4 py-3.5 text-left text-slate-400 uppercase tracking-wider">Mã SOS</th>
            <th className="px-4 py-3.5 text-left text-slate-400 uppercase tracking-wider">Độ Ưu Tiên</th>
            <th className="px-4 py-3.5 text-left text-slate-400 uppercase tracking-wider">Trạng Thái</th>
            <th className="px-4 py-3.5 text-left text-slate-400 uppercase tracking-wider">Số Người</th>
            <th className="px-4 py-3.5 text-left text-slate-400 uppercase tracking-wider">Tọa Độ GPS</th>
            <th className="px-4 py-3.5 text-left text-slate-400 uppercase tracking-wider">Ghi Chú</th>
            <th className="px-4 py-3.5 text-right text-slate-400 uppercase tracking-wider">Tác Chiến</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1E3A5F]/40 bg-[#07172A]/40">
          {requests.map((item) => {
            const isProcessing = actionLoadingId === item.id;
            const raw = item as unknown as Record<string, unknown>;
            const assignedStaffId = String(
              item.assignment?.rescueStaffId || item.assignedStaffId || raw.assignedTo || ''
            );
            const hasAssignment = Boolean(assignedStaffId);
            const isAssignedToMe = Boolean(currentUserId && assignedStaffId === currentUserId);

            return (
              <tr key={item.id} className="hover:bg-[#0C243B]/60 transition-colors">
                <td className="px-4 py-3 text-cyan-300 font-bold">#{item.id.slice(0, 8)}</td>
                <td className="px-4 py-3"><SosPriorityBadge urgency={item.urgency} /></td>
                <td className="px-4 py-3"><SosStatusBadge status={item.status} /></td>
                <td className="px-4 py-3 text-slate-200 font-semibold">{item.numberOfPeople} người</td>
                <td className="px-4 py-3 text-slate-400">
                  {item.location.latitude.toFixed(4)}, {item.location.longitude.toFixed(4)}
                </td>
                <td className="px-4 py-3 text-slate-300 max-w-xs truncate" title={item.note || ''}>
                  {item.note || <span className="text-slate-500 italic">Không có ghi chú</span>}
                </td>
                <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                  {item.status === 'submitted' && (
                    <button
                      type="button"
                      onClick={() => { void onAccept(item.id); }}
                      disabled={isProcessing}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-mono tracking-wider uppercase font-semibold transition-colors disabled:opacity-50"
                    >
                      {isProcessing ? 'Đang nhận...' : 'Tiếp nhận'}
                    </button>
                  )}

                  {item.status === 'received' && (
                    item.assignmentFetchFailed ? (
                      <span className="text-[11px] font-mono text-amber-400 italic">
                        Lỗi tải thông tin ca
                      </span>
                    ) : isAssignedToMe ? (
                      <button
                        type="button"
                        onClick={() => { void onUpdateStatus(item.id, 'in_progress'); }}
                        disabled={isProcessing}
                        className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-[11px] font-mono tracking-wider uppercase font-semibold transition-colors disabled:opacity-50"
                      >
                        {isProcessing ? '...' : 'Bắt đầu cứu hộ'}
                      </button>
                    ) : (
                      <span className="text-[11px] font-mono text-slate-500 italic">
                        {hasAssignment ? 'Đã giao nhân sự khác' : 'Chờ phân công'}
                      </span>
                    )
                  )}

                  {item.status === 'in_progress' && (
                    item.assignmentFetchFailed ? (
                      <span className="text-[11px] font-mono text-amber-400 italic">
                        Lỗi tải thông tin ca
                      </span>
                    ) : isAssignedToMe ? (
                      <button
                        type="button"
                        onClick={() => { void onUpdateStatus(item.id, 'assisted'); }}
                        disabled={isProcessing}
                        className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[11px] font-mono tracking-wider uppercase font-semibold transition-colors disabled:opacity-50"
                      >
                        {isProcessing ? '...' : 'Hoàn tất'}
                      </button>
                    ) : (
                      <span className="text-[11px] font-mono text-slate-500 italic">
                        {hasAssignment ? 'Đã giao nhân sự khác' : 'Chờ phân công'}
                      </span>
                    )
                  )}

                  {item.status === 'assisted' && (
                    <span className="text-[11px] font-mono text-emerald-400">
                      ✓ Hoàn tất tác chiến
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default RescueSosList;
