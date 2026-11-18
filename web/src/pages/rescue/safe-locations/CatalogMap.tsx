import { safeLocationIcon, selectedSafeLocationIcon, rescueGpsIcon } from './mapIcons';
import { useEffect, useState } from 'react';
import { Marker, MapContainer, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { latLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../../map/floodMap.css';
import { TYPE_LABEL, mapsUrl, type Coordinates, type SafeLocation } from './catalog';
export type MapCommand = {serial:number; point?:Coordinates};
function Camera({command,items,user}:{command:MapCommand|null;items:SafeLocation[];user:Coordinates|null}) {
  const map=useMap();
  useEffect(()=>{
    const observer=new ResizeObserver(()=>map.invalidateSize());observer.observe(map.getContainer());
    map.invalidateSize();return()=>observer.disconnect();
  },[map]);
  useEffect(()=>{
    if(!command)return;
    if(command.point){map.setView([command.point.latitude,command.point.longitude],15);return;}
    const positions=items.map(item=>[item.location.latitude,item.location.longitude] as [number,number]);
    if(user)positions.push([user.latitude,user.longitude]);
    if(positions.length)map.fitBounds(latLngBounds(positions),{padding:[35,35],maxZoom:15});
    // Snapshot camera only on an explicit user command, never a data/GPS update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[command,map]);
  return null;
}
export function CatalogMap({items,user,selectedId,onSelect,command}:{items:SafeLocation[];user:Coordinates|null;selectedId:string|null;onSelect:(id:string)=>void;command:MapCommand|null}) {
  const key=(import.meta.env.VITE_MAPTILER_KEY??'').trim();
  const [tileError,setTileError]=useState(false);
  const [round,setRound]=useState(0);
  return <div className="space-y-2">
    {!key&&<p role="status" className="text-sm text-amber-300">Chưa cấu hình VITE_MAPTILER_KEY. Danh sách và tọa độ vẫn sử dụng được.</p>}
    {tileError&&<p role="status" className="text-sm text-amber-300">Chưa tải được một số ô bản đồ. <button type="button" className="underline" onClick={()=>{setTileError(false);setRound(value=>value+1);}}>Thử lại nền bản đồ</button></p>}
    <div className="relative z-0 overflow-hidden rounded-2xl border border-border">
      <MapContainer className="floodguard-map" center={[16.0544,108.2022]} zoom={12} style={{height:480,width:'100%'}}>
        {key&&<TileLayer key={round} tileSize={512} zoomOffset={-1} maxZoom={19}
          url={`https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`}
          attribution='&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
          eventHandlers={{tileerror:()=>setTileError(true)}}/>}
        {items.map(item=><Marker key={item.id} position={[item.location.latitude,item.location.longitude]}
          icon={selectedId===item.id?selectedSafeLocationIcon:safeLocationIcon}
          eventHandlers={{click:()=>onSelect(item.id)}}>
          <Tooltip>{item.name}</Tooltip><Popup><strong>{item.name}</strong><p>{TYPE_LABEL[item.type]}</p><p>{item.address}</p>
            <a href={mapsUrl(item.location)} target="_blank" rel="noopener noreferrer">Mở Google Maps</a>
          </Popup>
        </Marker>)}
        {user&&<Marker position={[user.latitude,user.longitude]} icon={rescueGpsIcon}><Tooltip>Vị trí người cứu hộ — GPS trình duyệt</Tooltip></Marker>}
        <Camera command={command} items={items} user={user}/>
      </MapContainer>
    </div>
    <p className="text-xs text-muted">Ghim định vị xanh lá: điểm tránh trú · Biểu tượng GPS xanh dương: người cứu hộ. Tâm bản đồ ban đầu là Đà Nẵng, không phải vị trí của bạn. Camera chỉ di chuyển khi bạn thao tác.</p>
  </div>;
}
