const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/rescue-warning-loader.cjs');
const fixture = require('../src/pages/rescue/warnings/warningFixtures.json');
const list = () => structuredClone(fixture.list);
const response = (body, status = 200) => new Response(JSON.stringify(body), {status});
const area = {id:'AREA-1',name:'TEST AREA',areaType:'flood',source:null,description:null,
 geometry:{type:'polygon',points:[{latitude:16,longitude:108},{latitude:16.1,longitude:108},{latitude:16,longitude:108.1}]}};
const later = () => {let resolve; const promise=new Promise(r=>resolve=r); return {promise,resolve};};
const tick = () => new Promise(r=>setImmediate(r));

// Mount the actual exported map wrapper and its actual child component/hooks.
// Only browser/Leaflet surfaces and the existing historical hook are replaced;
// warning HTTP adapter, parser, resource hook and area service are real modules.
function mount(fetchActive, embedded = true, role = 'RESCUE_STAFF') {
 let session={token:'TOKEN-A',user:{id:'RESCUE-A',role}}, slots=[], cursor=0, effects=[], tree, key;
 const calls=[],maps=[],popups=[];
 const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const hooks={
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;
   return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},
  useRef(v){const i=cursor++;if(!(i in slots))slots[i]={current:v};return slots[i];},
  useMemo(fn,deps){const i=cursor++;if(!equal(slots[i]?.deps,deps))slots[i]={deps,value:fn()};return slots[i].value;},
  useCallback(fn,deps){return hooks.useMemo(()=>fn,deps);},
  useEffect(fn,deps){const i=cursor++;if(!equal(slots[i]?.deps,deps)){const old=slots[i];slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}},
 };
 const leaflet={
  divIcon(options){return options;},
  map(){const map={layers:[],removed:false,createPane(){return {style:{}}},closePopup(){},invalidateSize(){},fitBounds(){},
    remove(){this.removed=true},removeLayer(){}};maps.push(map);return map;},
  layerGroup(){const group={layers:[],clearLayers(){this.layers=[]},addLayer(layer){this.layers.push(layer)},addTo(){return group}};return group;},
  polygon(points,options){return {points,options,bindPopup(html){popups.push(html);return this},on(){return this}};},
 };
 leaflet.default=leaflet;
 const fetcher=async(url,init={})=>{
  calls.push({url,init});
  if(url.endsWith('/flood-areas'))return response({success:true,data:{floodAreas:[area]}});
  if(url.endsWith('/flood-alerts/active'))return fetchActive(url,init);
  throw new Error('Unexpected network request: '+url);
 };
 const exports=loader({react:hooks,leaflet,
  '../../context/AuthContext':{useAuth:()=>session},
  './useHistoricalLayers':{useHistoricalLayers:()=>({})},
  '../../components/layout/RescueLayout':{RescueLayout:'RescueLayout'},
  '../../components/layout/AppShell':{AppShell:'AppShell'},
  '../../components/layout/AdminHeader':{AdminHeader:'AdminHeader'},
  'react-router-dom':{Link:'a'},
 },{fetch:fetcher,window:{addEventListener(){},removeEventListener(){}},
  ResizeObserver:class {observe(){}disconnect(){}},
 })('pages/map/FloodMapView.tsx');
 function children(node,fn){if(Array.isArray(node)){node.forEach(n=>children(n,fn));return}if(node?.props){fn(node);children(node.props.children,fn)}}
 const unmount=()=>{slots.forEach(s=>s?.cleanup?.());slots=[]};
 const render=()=>{
  cursor=0;effects=[];
  const wrapper=exports.FloodMapView({embedded});
  if(typeof wrapper.type==='function' && wrapper.type.name==='FloodMapContent') {
    if(key!==undefined&&key!==wrapper.key)unmount();key=wrapper.key;cursor=0;
    tree=wrapper.type(wrapper.props);
  } else tree=wrapper;
  children(tree,n=>{if(n.props.ref&&typeof n.props.ref==='object')n.props.ref.current={};});
  effects.forEach(fn=>fn());return tree;
 };
 const text=node=>Array.isArray(node)?node.map(text).join(' '):node?.props?
  typeof node.type==='function'&&node.type.name==='WarningFeedback'?text(node.type(node.props)):text(node.props.children):
  typeof node==='string'||typeof node==='number'?String(node):'';
 const find=(type,label)=>{const found=[];children(tree,n=>{if(n.type===type&&text(n).includes(label))found.push(n)});assert(found.length,`${type}: ${label}`);return found[0];};
 return {render,unmount,calls,maps,popups,get text(){return text(tree).replace(/\s+/g," ")},get tree(){return tree},
  async settle(){for(let i=0;i<5;i++){await tick();render();}},
  toggle(){find("button","Vùng ngập").props.onClick();render();},
  refresh(){find('button','Làm mới bản đồ').props.onClick();render();},
  setSession(next){session=next;render();},
 };
}

for(const embedded of [true,false]) test(`actual ${embedded?'embedded':'full'} map sends JWT and renders all V2 active bulletins without per-area linkage`,async(t)=>{
 const raw=list();raw.data.floodAlerts=raw.data.floodAlerts.filter(x=>x.status==='active');
 const h=mount(async()=>response(raw),embedded);t.after(()=>h.unmount());h.render();await h.settle();
 const active=h.calls.filter(x=>x.url.endsWith('/flood-alerts/active'));
 assert.equal(active.length,1);assert.equal(active[0].init.headers?.Authorization,'Bearer TOKEN-A');
 assert(h.calls.some(x=>x.url.endsWith('/flood-areas')),'Keep existing geometry source');
 assert(!h.calls.some(x=>x.url.endsWith('/zones')),'Do not change the approved map data source');
 assert.match(h.text,/2 bản tin đang bật/);assert.match(h.text,/Chưa kết thúc/);
 for(const item of raw.data.floodAlerts)assert(h.text.includes(item.title));
 if(!embedded){h.toggle();await h.settle();}
 assert(h.popups.length>0);for(const popup of h.popups){
  assert.match(popup,/không gắn riêng với vùng này/);
  for(const item of raw.data.floodAlerts)assert(!popup.includes(item.title));
  assert(!popup.includes('Mức độ:'));
 }
 h.unmount();
});
for(const status of [401,403]) test(`actual map clears prior bulletin content on ${status} and recovers on refresh`,async(t)=>{
 let fail=false;const raw=list();raw.data.floodAlerts=raw.data.floodAlerts.filter(x=>x.status==='active');
 const h=mount(async()=>fail?response({code:'AUTH_ERROR'},status):response(raw));t.after(()=>h.unmount());h.render();await h.settle();
 assert(h.text.includes(raw.data.floodAlerts[0].title));fail=true;h.refresh();
 assert.match(h.text,/Dữ liệu lần tải trước, chưa xác nhận lại/);
 await h.settle();for(const item of raw.data.floodAlerts)assert(!h.text.includes(item.title));
 assert(!h.text.includes('0 bản tin đang bật'),'Auth failure must not become empty success');
 assert.match(h.text,status===401?/đăng nhập/i:/quyền/);
 fail=false;h.refresh();await h.settle();assert.match(h.text,/2 bản tin đang bật/);h.unmount();
});
test('actual map labels stale 500 response, refresh observes deactivation and older response cannot win',async(t)=>{
 const raw=list();raw.data.floodAlerts=raw.data.floodAlerts.filter(x=>x.status==='active');let mode='ok', gate;
 const h=mount(async()=>mode==='500'?response({},500):mode==='slow'?gate.promise:response(raw));t.after(()=>h.unmount());h.render();await h.settle();
 mode='500';h.refresh();await h.settle();assert.match(h.text,/chưa xác nhận lại/);assert.match(h.text,/Chưa thể cập nhật/);
 gate=later();mode='slow';h.refresh();await tick();mode='ok';raw.data.floodAlerts=[];h.refresh();await h.settle();assert.match(h.text,/0 bản tin đang bật/);
 gate.resolve(response(list()));await h.settle();assert.match(h.text,/0 bản tin đang bật/);h.unmount();
});
test('actual map remounts on session change and ignores a late response from the previous account',async(t)=>{
 const gate=later();const raw=list();raw.data.floodAlerts=raw.data.floodAlerts.filter(x=>x.status==='active');
 const h=mount(async(url,init)=>init.headers.Authorization==='Bearer TOKEN-A'?gate.promise:response({success:true,data:{...raw.data,floodAlerts:[]}}));
 t.after(()=>h.unmount());h.render();await tick();t.after(()=>h.unmount());h.render();h.setSession({token:'TOKEN-B',user:{id:'RESCUE-B',role:'RESCUE_STAFF'}});await h.settle();
 assert(h.maps[0].removed);assert.match(h.text,/0 bản tin đang bật/);
 gate.resolve(response(raw));await h.settle();assert.match(h.text,/0 bản tin đang bật/);
 for(const item of raw.data.floodAlerts)assert(!h.text.includes(item.title));
 assert(h.calls.some(x=>x.init.headers?.Authorization==='Bearer TOKEN-B'));h.unmount();
});
