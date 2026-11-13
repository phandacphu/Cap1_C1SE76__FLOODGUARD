import { useCallback } from 'react';
import { rescueService, RescueApiError } from '../../api/rescueService';
import { useSosResource } from './useRescue';
import { mergeSosDetail } from './sosDetailData';

export function useRescueDetail(id: string | undefined) {
  const load = useCallback((signal: AbortSignal) => {
    if (!id) return Promise.reject(new RescueApiError('Yêu cầu SOS không tồn tại.', 404));
    return rescueService.getRescueDetail(id, signal);
  }, [id]);
  const result = useSosResource(id ?? '', load, mergeSosDetail);
  return {
    ...result,
    request: result.data,
    history: result.data?.statusHistory ?? null,
    historyError: result.data?.historyError ?? null,
  };
}
