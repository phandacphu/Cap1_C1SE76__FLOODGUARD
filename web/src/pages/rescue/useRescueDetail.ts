import { useCallback } from 'react';
import { rescueService, RescueApiError } from '../../api/rescueService';
import { useSosResource } from './useRescue';

export function useRescueDetail(id: string | undefined) {
  const loadRequest = useCallback((signal: AbortSignal) => {
    if (!id) return Promise.reject(new RescueApiError('Yêu cầu SOS không tồn tại.', 404));
    return rescueService.getRescueDetail(id, signal);
  }, [id]);
  const loadHistory = useCallback((signal: AbortSignal) => {
    if (!id) return Promise.reject(new RescueApiError('Yêu cầu SOS không tồn tại.', 404));
    return rescueService.getHistory(id, signal);
  }, [id]);
  const result = useSosResource(id ?? '', loadRequest);
  const history = useSosResource('history:' + (id ?? ''), loadHistory);
  const denied = [401, 403, 404].includes(history.status ?? 0);
  const refreshRequest = result.refresh;
  const refreshHistory = history.refresh;
  const refresh = useCallback(() => { refreshRequest(); refreshHistory(); }, [refreshRequest, refreshHistory]);
  return {
    ...result,
    error: denied ? history.error : result.error,
    status: denied ? history.status : result.status,
    refresh,
    request: denied ? null : result.data,
    history: denied || !result.data ? null : history.data,
    historyError: history.error,
  };
}
