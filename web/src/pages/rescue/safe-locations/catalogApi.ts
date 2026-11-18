import { API_URL } from '../../../api/authApi';
import { CatalogError, parseCatalog, parseDetail, validCoordinates, type Coordinates, type CatalogSource } from './catalog';

export function catalogPath(id: string | null, origin: Coordinates | null) {
  if (origin && !validCoordinates(origin)) throw new CatalogError('Tọa độ GPS không hợp lệ.',400);
  if (id !== null && !id.trim()) throw new CatalogError('ID không hợp lệ.',400);
  const query = origin ? `?${new URLSearchParams({ latitude:String(origin.latitude),longitude:String(origin.longitude) })}` : '';
  return `/safe-locations${id === null ? '' : `/${encodeURIComponent(id)}`}${query}`;
}
async function read(path: string, signal: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const relay = () => controller.abort();
  signal.addEventListener('abort',relay,{once:true});
  if (signal.aborted) controller.abort();
  const timeout = setTimeout(() => controller.abort(),70_000);
  try {
    const response = await fetch(`${API_URL.replace(/\/+$/,'')}${path}`,{ signal:controller.signal, cache:'no-store' });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new CatalogError(response.status === 404 ? 'Địa điểm không còn được cung cấp' :
      response.status === 400 ? 'Tọa độ hoặc yêu cầu không hợp lệ. Vui lòng lấy lại GPS.' : `Chưa thể cập nhật (HTTP ${response.status}).`,response.status);
    return body;
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof CatalogError) throw error;
    throw new CatalogError('Chưa thể cập nhật. Kiểm tra kết nối và thử lại.',0);
  } finally {
    clearTimeout(timeout); signal.removeEventListener('abort',relay);
  }
}
export const catalogApi: CatalogSource = {
  async list(origin,signal) { return parseCatalog(await read(catalogPath(null,origin),signal),origin !== null); },
  async detail(id,origin,signal) { return parseDetail(await read(catalogPath(id,origin),signal),id,origin !== null); },
};
