import { apiGet } from './http';
import type { FloodArea } from '../types/floodArea';

interface FloodAreasResponse {
  floodAreas?: FloodArea[];
  data?: FloodArea[];
}

export const floodAreaService = {
  getFloodAreas: async (token?: string | null): Promise<FloodArea[]> => {
    const validToken = token ?? undefined;
    const res = await apiGet<FloodAreasResponse | FloodArea[]>('/flood-areas', validToken);
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.floodAreas)) return res.floodAreas;
    if (res && Array.isArray(res.data)) return res.data;
    return [];
  },
};
