import React, { useState } from 'react';
import { useRescue } from './useRescue';
import { SosFilterBar, type SortMode } from './components/SosFilterBar';
import { RescueSosList } from './RescueSosList';

export const RescueSosListPage: React.FC = () => {
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('');
  const [sortFilter, setSortFilter] = useState<SortMode>('priority' as SortMode);

  const {
    displayedRequests,
    loading,
    fetchError,
    actionError,
    setActionError,
    actionLoadingId,
    currentUserId,
    triggerReload,
    handleAcceptRequest,
    handleUpdateRescueStatus,
  } = useRescue(statusFilter, urgencyFilter, sortFilter, searchFilter);

  const handleResetFilters = () => {
    setSearchFilter('');
    setStatusFilter('');
    setUrgencyFilter('');
    setSortFilter('priority' as SortMode);
  };

  return (
    <div className="w-full space-y-6 text-slate-100 font-sans pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#1E3A5F]/50 pb-4">
        <div>
          <h1 className="text-xl font-bold font-mono tracking-tight text-white uppercase">
            Quản Lý Danh Sách Yêu Cầu SOS
          </h1>
          <p className="text-xs font-mono text-slate-400 mt-0.5">
            Xem toàn bộ yêu cầu cứu hộ, lọc theo trạng thái và cập nhật tác chiến hiện trường
          </p>
        </div>

        <button
          type="button"
          onClick={triggerReload}
          disabled={loading}
          className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-mono font-medium transition-colors shadow-lg shadow-cyan-950/50 flex items-center space-x-1.5 disabled:opacity-50 self-start sm:self-auto"
        >
          <span>{loading ? 'Đang đồng bộ...' : 'Làm mới dữ liệu'}</span>
        </button>
      </div>

      {actionError && (
        <div className="bg-red-950/70 border border-red-600 p-3.5 rounded-lg text-red-200 text-xs font-mono flex items-center justify-between">
          <div>[LỖI THAO TÁC]: {actionError}</div>
          <button type="button" onClick={() => setActionError(null)} className="text-red-400 hover:text-red-200">✕</button>
        </div>
      )}

      {/* Thanh bộ lọc */}
      <SosFilterBar
        search={searchFilter}
        status={statusFilter}
        urgency={urgencyFilter}
        sort={sortFilter}
        onSearch={setSearchFilter}
        onStatus={setStatusFilter}
        onUrgency={setUrgencyFilter}
        onSort={(mode) => setSortFilter(mode)}
        onReset={handleResetFilters}
      />

      {/* Bảng danh sách SOS */}
      <div className="bg-[#081B30]/80 border border-[#1E3A5F] rounded-xl overflow-hidden backdrop-blur-sm shadow-xl">
        <RescueSosList
          requests={displayedRequests}
          loading={loading}
          fetchError={fetchError}
          actionLoadingId={actionLoadingId}
          currentUserId={currentUserId}
          onAccept={handleAcceptRequest}
          onUpdateStatus={handleUpdateRescueStatus}
          onReload={triggerReload}
        />
      </div>
    </div>
  );
};

export default RescueSosListPage;
