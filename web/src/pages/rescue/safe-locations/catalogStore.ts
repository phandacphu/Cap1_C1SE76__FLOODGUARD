import { CatalogError, sameOrigin, sortLocations, type CatalogSource, type SafeLocation, type Coordinates } from './catalog';

export interface CatalogState {
  items: SafeLocation[] | null; loading: boolean; error: string | null; updatedAt: number | null;
  origin: Coordinates | null; selectedId: string | null; detail: SafeLocation | null;
  detailLoading: boolean; detailError: string | null; unavailable: boolean;
}
/** Read-only catalogue; generations prevent late list/detail responses from publishing. */
export class CatalogStore {
  private value: CatalogState = { items:null,loading:false,error:null,updatedAt:null,origin:null,selectedId:null,detail:null,detailLoading:false,detailError:null,unavailable:false };
  private listeners = new Set<() => void>();
  private listEpoch = 0;
  private detailEpoch = 0;
  private listController: AbortController | null = null;
  private detailController: AbortController | null = null;
  private desiredOrigin: Coordinates | null = null;
  private runningOrigin: Coordinates | null = null;
  private pending: Promise<void> | null = null;
  private source: CatalogSource;
  constructor(source: CatalogSource) {this.source=source;}
  snapshot = () => this.value;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<CatalogState>) { this.value = { ...this.value,...patch }; this.listeners.forEach(listener=>listener()); }
  cancel = () => {
    this.listEpoch++; this.detailEpoch++; this.listController?.abort(); this.detailController?.abort();
    this.pending = null; this.listController = null; this.publish({loading:false,detailLoading:false});
  };
  load = (origin: Coordinates | null = this.desiredOrigin): Promise<void> => {
    this.desiredOrigin = origin ? { ...origin } : null;
    if (this.pending && sameOrigin(origin,this.runningOrigin)) return this.pending;
    const epoch = ++this.listEpoch;
    this.listController?.abort(); this.detailController?.abort(); this.detailEpoch++;
    const controller = new AbortController(); this.listController = controller; this.runningOrigin = origin;
    this.publish({loading:true,detailLoading:false});
    const request = this.source.list(origin,controller.signal).then(items => {
      if (epoch !== this.listEpoch) return;
      const selected = this.value.selectedId;
      const missing = Boolean(selected && !items.some(item=>item.id === selected));
      this.publish({items:sortLocations(items),origin:origin ? {...origin} : null,updatedAt:Date.now(),loading:false,error:null,
        detail:null,detailError:null,unavailable:missing});
      if (selected && !missing) void this.loadDetail(selected);
    }).catch(error=>{
      if (epoch !== this.listEpoch) return;
      this.publish({loading:false,error:error instanceof Error ? error.message : 'Chưa thể cập nhật.'});
    }).finally(()=>{ if(epoch === this.listEpoch) this.pending = null; });
    this.pending = request;
    return request;
  };
  select = (id: string) => {
    if (!this.value.items?.some(item=>item.id === id)) return;
    if (this.value.selectedId === id && (this.value.detailLoading || this.value.detail !== null) && !this.value.detailError) return;
    this.publish({selectedId:id,detail:null,detailError:null,unavailable:false});
    void this.loadDetail(id);
  };
  close = () => {
    this.detailEpoch++; this.detailController?.abort();
    this.publish({selectedId:null,detail:null,detailLoading:false,detailError:null,unavailable:false});
  };
  loadDetail = async (id: string = this.value.selectedId ?? '') => {
    if (this.value.loading || !id || id !== this.value.selectedId || !this.value.items?.some(item=>item.id===id)) return;
    const epoch = ++this.detailEpoch;
    this.detailController?.abort(); const controller = new AbortController(); this.detailController = controller;
    const origin = this.value.origin;
    this.publish({detailLoading:true});
    try {
      const item = await this.source.detail(id,origin,controller.signal);
      if (epoch !== this.detailEpoch || this.value.selectedId !== id) return;
      this.publish({detail:item,detailLoading:false,detailError:null,unavailable:false,
        items:sortLocations(this.value.items!.map(row=>row.id===id ? item : row))});
    } catch(error) {
      if (epoch !== this.detailEpoch || this.value.selectedId !== id) return;
      const missing = error instanceof CatalogError && error.status === 404;
      this.publish({detailLoading:false,detailError:missing ? 'Địa điểm không còn được cung cấp' : 'Chưa thể cập nhật chi tiết. Vui lòng thử lại.',
        unavailable:missing,detail:missing ? null : this.value.detail,
        items:missing ? this.value.items!.filter(item=>item.id!==id) : this.value.items});
    }
  };
}
