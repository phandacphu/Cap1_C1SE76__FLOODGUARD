import { validCoordinates, sameOrigin, type Coordinates } from './catalog';
export interface GpsState { point: Coordinates | null; recordedAt: number | null; error: string | null; requesting: boolean }
export class RescueGpsStore {
  private value: GpsState = {point:null,recordedAt:null,error:null,requesting:true};
  private listeners = new Set<() => void>();
  private watch: number | null = null;
  private epoch = 0;
  private requestPending: Promise<Coordinates | null> | null = null;
  private geo: Geolocation | undefined;
  private onFix: (point: Coordinates) => void;
  constructor(geo: Geolocation | undefined, onFix: (point: Coordinates) => void) {this.geo=geo;this.onFix=onFix;}
  snapshot = () => this.value;
  subscribe = (callback: () => void) => {this.listeners.add(callback);return ()=>{this.listeners.delete(callback);};};
  private publish(patch: Partial<GpsState>) {this.value={...this.value,...patch};this.listeners.forEach(callback=>callback());}
  private success(position: GeolocationPosition, force: boolean) {
    const point={latitude:position.coords.latitude,longitude:position.coords.longitude};
    if (!validCoordinates(point)) {this.failure();return;}
    const changed = !sameOrigin(point,this.value.point);
    this.publish({point,recordedAt:Number.isFinite(position.timestamp)?position.timestamp:Date.now(),error:null,requesting:false});
    if(changed || force) this.onFix(point);
  }
  private failure() {this.publish({requesting:false,error:this.value.point ? 'Chưa lấy được GPS mới; đang dùng vị trí cuối, có thể đã cũ.' : 'Chưa có GPS hoặc quyền định vị bị từ chối. Bạn vẫn xem được danh sách và bản đồ.'});}
  start = () => {
    const epoch=++this.epoch;
    if(!this.geo){this.failure();return;}
    try {
      this.watch=this.geo.watchPosition(position=>{if(epoch===this.epoch)this.success(position,false);},()=>{if(epoch===this.epoch)this.failure();},
        {enableHighAccuracy:false,maximumAge:30_000,timeout:15_000});
    } catch {this.failure();}
  };
  stop = () => {this.epoch++;if(this.watch!==null)this.geo?.clearWatch(this.watch);this.watch=null;this.requestPending=null;};
  request = (): Promise<Coordinates | null> => {
    if(this.requestPending)return this.requestPending;
    if(!this.geo){this.failure();return Promise.resolve(this.value.point);}
    const epoch=this.epoch;
    this.publish({requesting:true});
    const request=new Promise<Coordinates | null>(resolve=>{
      try {this.geo!.getCurrentPosition(position=>{
        if(epoch!==this.epoch){resolve(null);return;}
        this.success(position,true);resolve(this.value.point);
      },()=>{if(epoch===this.epoch){this.failure();resolve(this.value.point);}else resolve(null);},
      {enableHighAccuracy:false,maximumAge:0,timeout:15_000});}
      catch {this.failure();resolve(this.value.point);}
    });
    this.requestPending=request;
    void request.finally(()=>{if(this.requestPending===request)this.requestPending=null;});
    return request;
  };
}
