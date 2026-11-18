import { useEffect, useState, useSyncExternalStore } from 'react';
import { RescueLayout } from '../../../components/layout/RescueLayout';
import { CatalogStore } from './catalogStore';
import { RescueGpsStore } from './gpsStore';
import { catalogApi } from './catalogApi';
import { TYPE_LABEL, distanceLabel, filterLocations, mapsUrl, sameOrigin, type CatalogSource } from './catalog';
import { CatalogMap, type MapCommand } from './CatalogMap';

const time = (value:number|null)=>value===null?'Chưa có':new Date(value).toLocaleString('vi-VN');
export function RescueSafeLocations({source=catalogApi}:{source?:CatalogSource}) {
  const [store]=useState(()=>new CatalogStore(source));
  const [gps]=useState(()=>new RescueGpsStore(navigator.geolocation,point=>{void store.load(point);}));
  const state=useSyncExternalStore(store.subscribe,store.snapshot);
  const position=useSyncExternalStore(gps.subscribe,gps.snapshot);
  const [search,setSearch]=useState('');
  const [type,setType]=useState('all');
  const [command,setCommand]=useState<MapCommand|null>(null);
  useEffect(()=>{void store.load();gps.start();return()=>{gps.stop();store.cancel();};},[store,gps]);
  const rows=filterLocations(state.items??[],search,type);
  const selected=state.detail??state.items?.find(item=>item.id===state.selectedId);
  const updatingOrigin=!sameOrigin(state.origin,position.point);
  const refresh=()=>{void store.load();};
  const focus=(id:string)=>{
    store.select(id);
    const item=state.items?.find(row=>row.id===id);
    if(item)setCommand(value=>({serial:(value?.serial??0)+1,point:item.location}));
  };
  const myPosition=async()=>{
    const point=await gps.request();
    if(point)setCommand(value=>({serial:(value?.serial??0)+1,point}));
  };
  return <RescueLayout syncHint="làm mới thủ công" loading={state.loading} onRefresh={refresh} updatedAt={state.updatedAt===null?null:new Date(state.updatedAt)}>
    <main className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="mb-2 font-mono text-xs uppercase tracking-widest text-safe">Danh mục điểm tránh trú</p><h1 className="text-2xl font-bold md:text-3xl">Điểm tránh trú an toàn</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">Tra cứu địa điểm, xem thông tin và mở chỉ đường. Danh mục do Admin cung cấp; không phải xác nhận mức an toàn thực tế.</p></div>
        <button type="button" disabled={state.loading} onClick={refresh} className="rounded-xl border border-safe/50 bg-safe/10 px-4 py-2 text-sm font-semibold text-safe disabled:opacity-50">{state.loading?'Đang cập nhật…':'Làm mới'}</button>
      </header>
      <div className="rounded-xl border border-border bg-card p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><span>{position.point?'Đã có GPS người cứu hộ':'Chưa có vị trí người cứu hộ'}</span><span className="text-xs text-muted">GPS ghi nhận: {time(position.recordedAt)}</span></div>
        {position.requesting&&<p role="status" className="mt-1 text-muted">Đang lấy vị trí trình duyệt…</p>}
        {position.error&&<p role="status" className="mt-1 text-amber-300">{position.error}</p>}
        {state.origin&&<p className="mt-1 text-xs text-muted">Khoảng cách địa lý ước tính, không phải quãng đường đi hoặc ETA. {updatingOrigin?'Đang chờ khoảng cách theo GPS mới; khoảng cách đang hiển thị dựa trên vị trí của lần tải danh sách trước.':''}</p>}
      </div>
      {state.error&&<div role="alert" className="rounded-xl border border-amber-600/50 bg-amber-950/20 p-4 text-sm text-amber-200"><strong>Chưa thể cập nhật.</strong> {state.error} {state.items!==null?'Đang giữ dữ liệu cũ, có thể đã thay đổi.':''} <button type="button" disabled={state.loading} className="underline" onClick={refresh}>Thử lại</button></div>}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.5fr)]">
        <section aria-label="Danh sách điểm tránh trú" className="min-w-0 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between"><h2 className="font-bold">Danh sách địa điểm</h2><span className="rounded-lg bg-safe/10 px-2 py-1 text-xs text-safe">{state.items===null?'—':`${rows.length}/${state.items.length}`}</span></div>
          <label className="mt-4 block text-xs text-muted">Tìm trong danh sách đã tải<input className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Tên hoặc địa chỉ…"/></label>
          <label className="mt-3 block text-xs text-muted">Loại địa điểm<select className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text" value={type} onChange={event=>setType(event.target.value)}><option value="all">Tất cả loại</option>{Object.entries(TYPE_LABEL).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
          <p className="my-3 text-xs text-muted">{state.origin?'Sắp gần → xa theo khoảng cách gốc từ API.':'Chưa có khoảng cách; danh sách vẫn hiển thị đầy đủ.'} Không giới hạn bán kính.</p>
          {state.items===null&&!state.error&&<p role="status" className="py-8 text-center text-muted">Đang tải danh mục…</p>}
          {state.items?.length===0&&<p className="py-8 text-center text-muted">Chưa có điểm tránh trú</p>}
          {state.items!==null&&state.items.length>0&&rows.length===0&&<p className="py-8 text-center text-muted">Không tìm thấy kết quả phù hợp với từ khóa hoặc loại đã chọn.</p>}
          <div className="space-y-3 xl:max-h-[720px] xl:overflow-y-auto">{rows.map(item=><article key={item.id} className={`rounded-xl border p-4 ${item.id===state.selectedId?'border-safe bg-safe/10':'border-border bg-bg/50'}`}>
            <button type="button" onClick={()=>focus(item.id)} className="w-full text-left"><span className="text-xs text-safe">{TYPE_LABEL[item.type]}</span><h3 className="mt-1 break-words font-semibold">{item.name}</h3><p className="mt-2 break-words text-sm text-muted">{item.address}</p></button>
            {item.distanceKm!==null&&<p className="mt-3 text-sm font-semibold text-water">{distanceLabel(item.distanceKm)}</p>}
            <div className="mt-3 flex flex-wrap gap-3 text-xs"><button className="text-safe underline" type="button" onClick={()=>store.select(item.id)}>Xem chi tiết</button><button className="text-water underline" type="button" onClick={()=>focus(item.id)}>Xem trên bản đồ</button><a className="text-muted underline" href={mapsUrl(item.location)} target="_blank" rel="noopener noreferrer">Mở Google Maps</a></div>
          </article>)}</div>
        </section>
        <div className="min-w-0 space-y-4">
          <section aria-label="Bản đồ điểm tránh trú" className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">Bản đồ địa điểm</h2><div className="flex gap-2 text-xs"><button type="button" disabled={position.requesting} onClick={()=>void myPosition()} className="rounded-lg border border-border px-3 py-2 disabled:opacity-50">Vị trí của tôi</button><button type="button" disabled={!rows.length&&!position.point} onClick={()=>setCommand(value=>({serial:(value?.serial??0)+1}))} className="rounded-lg border border-border px-3 py-2 disabled:opacity-50">Xem toàn bộ</button></div></div>
            <CatalogMap items={rows} user={position.point} selectedId={state.selectedId} onSelect={focus} command={command}/>
          </section>
          <section aria-label="Chi tiết điểm tránh trú" className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between"><h2 className="font-bold">Chi tiết địa điểm</h2>{state.selectedId&&<button type="button" className="text-sm text-muted underline" onClick={store.close}>Đóng</button>}</div>
            {!state.selectedId&&<p className="mt-4 text-sm text-muted">Chọn một thẻ hoặc ghim để xem chi tiết.</p>}
            {state.unavailable?<p role="alert" className="mt-4 text-amber-300">Địa điểm không còn được cung cấp</p>:<>
              {state.detailLoading&&<p role="status" className="mt-3 text-sm text-muted">Đang tải chi tiết theo ID…</p>}
              {state.detailError&&<p role="alert" className="mt-3 text-sm text-amber-300">{state.detailError} <button type="button" disabled={state.loading||state.detailLoading} className="underline" onClick={()=>void store.loadDetail()}>Thử lại chi tiết</button></p>}
              {state.selectedId&&selected&&<div className="mt-4 space-y-3 text-sm"><span className="rounded bg-safe/10 px-2 py-1 text-xs text-safe">{TYPE_LABEL[selected.type]}</span><h3 className="text-xl font-semibold">{selected.name}</h3><p className="text-muted">{selected.address}</p><p className="break-all font-mono text-xs text-muted">ID: {selected.id}</p><p>Tọa độ: {selected.location.latitude}, {selected.location.longitude}</p>{selected.distanceKm!==null&&<p className="text-water">{distanceLabel(selected.distanceKm)}</p>}<p className="whitespace-pre-wrap break-words text-muted">{selected.description?.trim()?selected.description:'Chưa có mô tả'}</p><a className="inline-block rounded-lg bg-safe px-4 py-2 font-semibold text-bg" href={mapsUrl(selected.location)} target="_blank" rel="noopener noreferrer">Mở Google Maps</a><p className="text-xs text-muted">Tuyến Google Maps chưa được hệ thống đánh giá an toàn trước ngập.</p></div>}
            </>}
          </section>
          <p className="text-xs text-muted">Danh mục tải lúc: {time(state.updatedAt)}. Chưa có realtime; bấm Làm mới để nhận thay đổi từ Admin.</p>
        </div>
      </div>
    </main>
  </RescueLayout>;
}
