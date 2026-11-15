const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.join(__dirname,'../src/pages/rescue/safe-locations');
function modules(fetch=async()=>{throw new Error('Unexpected fetch');}){
  const cache=new Map();
  function load(name){
    const file=path.resolve(root,name+'.ts');
    if(cache.has(file))return cache.get(file);
    const exports={};cache.set(file,exports);
    const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(source,{exports,fetch,AbortController,setTimeout,clearTimeout,URLSearchParams,
      require:key=>key.includes('authApi')?{API_URL:'https://test.invalid/api/'}:load(path.relative(root,path.resolve(path.dirname(file),key))),
    });return exports;
  }
  return {domain:load('catalog'),api:load('catalogApi'),store:load('catalogStore'),gps:load('gpsStore')};
}
const point=(id='TEST-1',distanceKm=null,extra={})=>({id,name:`TEST ONLY ${id}`,address:'TEST address',location:{latitude:16,longitude:108},type:'shelter',description:null,distanceKm,...extra});
const response=(data,status=200)=>new Response(JSON.stringify({success:status<400,data}),{status});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('catalogue service sends only optional complete GPS pair, one /api, no auth, no radius or search',async()=>{
  const calls=[];
  const {api:{catalogApi}}=modules(async(url,options)=>{calls.push({url,options});return response(url.includes('/TEST')?{safeLocation:point('TEST/A',0)}:{safeLocations:[point('TEST-1',url.includes('?')?0:null)]});});
  await catalogApi.list(null,new AbortController().signal);
  await catalogApi.list({latitude:0,longitude:0},new AbortController().signal);
  await catalogApi.detail('TEST/A',{latitude:0,longitude:0},new AbortController().signal);
  assert.equal(calls[0].url,'https://test.invalid/api/safe-locations');
  assert.equal(calls[1].url,'https://test.invalid/api/safe-locations?latitude=0&longitude=0');
  assert.equal(calls[2].url,'https://test.invalid/api/safe-locations/TEST%2FA?latitude=0&longitude=0');
  assert.equal(calls[0].options.headers,undefined);assert.equal(calls[0].options.cache,'no-store');
});
test('strict envelopes, duplicate IDs, invalid coordinates and wrong detail ID fail; zero distance is retained',()=>{
  const {domain:d}=modules();
  assert.equal(d.parseLocation(point('TEST',0),true).distanceKm,0);
  for(const row of [point('TEST',null,{location:{latitude:'16',longitude:108}}),point('TEST',null,{location:{latitude:91,longitude:108}}),point('TEST',null,{type:'invalid'})])assert.throws(()=>d.parseLocation(row,false));
  assert.throws(()=>d.parseCatalog({success:false,data:{safeLocations:[]}},false));
  assert.throws(()=>d.parseCatalog({success:true,data:{safeLocations:[point(),point()]}},false));
  assert.throws(()=>d.parseDetail({success:true,data:{safeLocation:point('OTHER')}},'TEST',false));
  assert.equal(d.parseCatalog({success:true,data:{safeLocations:[]}},false).length,0);
});
test('HTTP non-JSON errors, 400/404/500, network failure and cancellation never become empty success',async()=>{
  for(const status of [400,404,500]){
    const {api:{catalogApi}}=modules(async()=>new Response('<html>error</html>',{status}));
    await assert.rejects(catalogApi.list(null,new AbortController().signal),error=>error.status===status);
  }
  const offline=modules(async()=>{throw new Error('offline');});
  await assert.rejects(offline.api.catalogApi.list(null,new AbortController().signal));
  const invalid=modules(async()=>response({safeLocations:{}}));
  await assert.rejects(invalid.api.catalogApi.list(null,new AbortController().signal));
});
test('sort raw distances before rounding; far points stay; search/type preserve that order; 0 km and no GPS labels',()=>{
  const {domain:d}=modules();
  const rows=d.sortLocations([point('FAR',150),point('B',.354),point('ZERO',0),point('A',.353)]);
  assert.deepEqual(Array.from(rows,item=>item.id),['ZERO','A','B','FAR']);
  assert.ok(d.distanceLabel(0).includes('0 km'));assert.equal(d.distanceLabel(null),null);
  assert.deepEqual(Array.from(d.filterLocations(rows,'TEST','all'),item=>item.id),['ZERO','A','B','FAR']);
  assert.equal(d.filterLocations(rows,'not-matching','all').length,0);
  assert.match(d.mapsUrl({latitude:0,longitude:108}),/destination=0,108$/);
});
test('serial refresh deduplicates and old GPS response cannot overwrite a newer GPS result',async()=>{
  const {store:{CatalogStore}}=modules();const a=deferred(),b=deferred();let calls=0;
  const store=new CatalogStore({list:()=>++calls===1?a.promise:b.promise,detail:async()=>point()});
  const old=store.load(null);assert.equal(store.load(null),old);assert.equal(calls,1);
  const latest=store.load({latitude:16,longitude:108});b.resolve([point('NEW',0)]);await latest;
  a.resolve([point('OLD')]);await old;
  assert.equal(store.snapshot().items[0].id,'NEW');assert.equal(store.snapshot().origin.latitude,16);
});
test('offline refresh keeps previous data/time; recovery updates coordinates and same selected ID',async()=>{
  const {store:{CatalogStore}}=modules();let value=point(),fail=false;
  const store=new CatalogStore({list:async()=>{if(fail)throw new Error('TEST offline');return [value];},detail:async()=>value});
  await store.load();store.select('TEST-1');await tick();const before=store.snapshot();
  fail=true;await store.load();assert.equal(store.snapshot().items,before.items);assert.equal(store.snapshot().updatedAt,before.updatedAt);assert.ok(store.snapshot().error);
  fail=false;value=point('TEST-1',null,{location:{latitude:17,longitude:109},description:'TEST updated'});
  await store.load();await tick();assert.equal(store.snapshot().items[0].location.latitude,17);assert.equal(store.snapshot().detail.id,'TEST-1');assert.equal(store.snapshot().error,null);
});
test('successful empty catalogue removes selected marker/card and shows unavailable; stale detail cannot resurrect it',async()=>{
  const {store:{CatalogStore}}=modules();const detail=deferred();let empty=false;
  const store=new CatalogStore({list:async()=>empty?[]:[point()],detail:()=>detail.promise});
  await store.load();store.select('TEST-1');empty=true;await store.load();
  detail.resolve(point());await tick();assert.equal(store.snapshot().items.length,0);assert.equal(store.snapshot().detail,null);assert.equal(store.snapshot().unavailable,true);
});
test('detail 404 removes stale row/marker, preserves selected unavailable notice and is never mock fallback',async()=>{
  const {store:{CatalogStore},domain:{CatalogError}}=modules();
  const store=new CatalogStore({list:async()=>[point()],detail:async()=>{throw new CatalogError('gone',404);}});
  await store.load();store.select('TEST-1');await tick();assert.equal(store.snapshot().items.length,0);assert.equal(store.snapshot().unavailable,true);assert.equal(store.snapshot().detail,null);
});
test('late selection/detail response cannot overwrite the newly selected ID; detail GPS updates row/marker together',async()=>{
  const {store:{CatalogStore}}=modules();const a=deferred();
  const store=new CatalogStore({list:async()=>[point('A'),point('B')],detail:id=>id==='A'?a.promise:Promise.resolve(point('B',null,{location:{latitude:18,longitude:110}}))});
  await store.load();store.select('A');store.select('B');await tick();a.resolve(point('A'));await tick();
  assert.equal(store.snapshot().selectedId,'B');assert.equal(store.snapshot().detail.id,'B');assert.equal(store.snapshot().items.find(item=>item.id==='B').location.latitude,18);
});
test('unmounted catalogue ignores a late response and cancels reads',async()=>{
  const {store:{CatalogStore}}=modules();const wait=deferred();let signal;
  const store=new CatalogStore({list:(_,s)=>{signal=s;return wait.promise;},detail:async()=>point()});
  const pending=store.load();store.cancel();wait.resolve([point()]);await pending;assert.equal(signal.aborted,true);assert.equal(store.snapshot().items,null);
});
function geoFixture(){let ok,bad,cleared=false;return {geo:{watchPosition:(a,b)=>{ok=a;bad=b;return 1;},clearWatch:()=>{cleared=true;},getCurrentPosition:(a)=>a({coords:{latitude:16,longitude:108},timestamp:2000})},success:(latitude,longitude)=>ok({coords:{latitude,longitude},timestamp:1000}),error:()=>bad({code:1}),cleared:()=>cleared};}
test('GPS refusal without location never invents coordinates; loss after success keeps last known point/time',()=>{
  const {gps:{RescueGpsStore}}=modules();const f=geoFixture();const calls=[];const gps=new RescueGpsStore(f.geo,p=>calls.push(p));
  gps.start();f.error();assert.equal(gps.snapshot().point,null);assert.equal(calls.length,0);
  f.success(0,0);assert.equal(gps.snapshot().point.latitude,0);assert.equal(calls.length,1);
  f.error();assert.equal(gps.snapshot().point.latitude,0);assert.equal(gps.snapshot().recordedAt,1000);assert.ok(gps.snapshot().error);
  gps.stop();f.success(17,109);assert.equal(calls.length,1);assert.equal(f.cleared(),true);
});
test('GPS unavailable remains usable without a synthetic point; explicit location request refreshes GPS',async()=>{
  const {gps:{RescueGpsStore}}=modules();const none=new RescueGpsStore(undefined,()=>assert.fail());none.start();assert.equal(await none.request(),null);assert.ok(none.snapshot().error);
  const f=geoFixture(),calls=[];const gps=new RescueGpsStore(f.geo,p=>calls.push(p));gps.start();await gps.request();assert.equal(calls[0].latitude,16);assert.equal(gps.snapshot().recordedAt,2000);
});
test('captured Render list without GPS, zero-distance list and exact-ID detail use catalogue v2', {skip:!process.env.SAFE_CATALOG_LIVE_DIR},()=>{
  const {domain:d}=modules();const read=name=>JSON.parse(fs.readFileSync(path.join(process.env.SAFE_CATALOG_LIVE_DIR,name+'.json'),'utf8'));
  const a=d.parseCatalog(read('list'),false),b=d.parseCatalog(read('gps'),true);assert.equal(a.length,b.length);
  if(b.length){assert.equal(b[0].distanceKm,0);const detail=d.parseDetail(read('detail'),b[0].id,true);assert.equal(detail.id,b[0].id);}
});

test('initial failure is not an empty success; successful empty retry clears error',async()=>{
  const {store:{CatalogStore}}=modules();let fail=true;
  const store=new CatalogStore({list:async()=>{if(fail)throw new Error('TEST unavailable');return [];},detail:async()=>point()});
  await store.load();assert.equal(store.snapshot().items,null);assert.ok(store.snapshot().error);assert.equal(store.snapshot().updatedAt,null);
  fail=false;await store.load();assert.equal(store.snapshot().items.length,0);assert.equal(store.snapshot().error,null);assert.ok(store.snapshot().updatedAt);
});
test('all supported types and empty/long descriptions remain API data with no capacity/contact invented',()=>{
  const {domain:d}=modules();
  for(const type of ['shelter','school','hospital','community_center','other']){
    const item=d.parseLocation(point('TEST',null,{type,description:type==='other'?'TEST '.repeat(300):''}),false);
    assert.equal(item.type,type);assert.equal(Object.hasOwn(item,'capacity'),false);assert.equal(Object.hasOwn(item,'contactPhone'),false);
  }
});
test('refresh invalidates an old detail read; GPS query and details use the same latest origin',async()=>{
  const {store:{CatalogStore}}=modules();const oldDetail=deferred();let detailCalls=0;const origins=[];
  const store=new CatalogStore({list:async origin=>[point('TEST-1',origin?0:null)],detail:async(_id,origin)=>{
    origins.push(origin);if(++detailCalls===1)return oldDetail.promise;return point('TEST-1',0,{location:{latitude:17,longitude:109}});
  }});
  await store.load();store.select('TEST-1');await store.load({latitude:17,longitude:109});await tick();oldDetail.resolve(point('TEST-1',null,{name:'STALE TEST'}));await tick();
  assert.equal(store.snapshot().detail.name,'TEST ONLY TEST-1');assert.equal(store.snapshot().detail.location.latitude,17);assert.equal(origins[1].latitude,17);
});

test('selecting the same marker/card while detail is in flight does not duplicate detail requests',async()=>{
  const {store:{CatalogStore}}=modules();const wait=deferred();let calls=0;
  const store=new CatalogStore({list:async()=>[point()],detail:()=>{calls++;return wait.promise;}});
  await store.load();store.select('TEST-1');store.select('TEST-1');store.select('TEST-1');assert.equal(calls,1);
  wait.resolve(point());await tick();assert.equal(store.snapshot().detail.id,'TEST-1');
});

test('selection during a failed list refresh still reads detail by selected ID and keeps list error visible',async()=>{
  const {store:{CatalogStore}}=modules();const refresh=deferred();let reads=0;const details=[];
  const store=new CatalogStore({list:async()=>++reads===1?[point('A'),point('B')]:refresh.promise,
    detail:async id=>{details.push(id);return point(id,null,{description:'Fresh detail from API'});}});
  await store.load();const pending=store.load();store.select('A');store.select('B');
  assert.equal(details.length,0);assert.equal(store.snapshot().detailLoading,true);
  refresh.reject(new Error('TEST list offline'));await pending;await tick();
  assert.deepEqual(details,['B']);assert.equal(store.snapshot().detail.id,'B');assert.ok(store.snapshot().error);
  assert.equal(store.snapshot().detail.description,'Fresh detail from API');assert.equal(store.snapshot().loading,false);
});
test('queued detail failure exposes retry; retry processes same ID without resending the failed list',async()=>{
  const {store:{CatalogStore}}=modules();const refresh=deferred();let lists=0,details=0;
  const store=new CatalogStore({list:async()=>++lists===1?[point()]:refresh.promise,
    detail:async()=>{if(++details===1)throw new Error('TEST detail offline');return point();}});
  await store.load();const pending=store.load();store.select('TEST-1');refresh.reject(new Error('TEST list offline'));await pending;await tick();
  assert.ok(store.snapshot().detailError);assert.equal(store.snapshot().detailLoading,false);assert.equal(store.snapshot().detail,null);
  await store.loadDetail();assert.equal(store.snapshot().detail.id,'TEST-1');assert.equal(store.snapshot().detailError,null);assert.equal(lists,2);
});
test('closing a queued selection or superseding its refresh never issues detail for an obsolete ID',async()=>{
  const {store:{CatalogStore}}=modules();const refresh=deferred();let reads=0,details=0;
  const store=new CatalogStore({list:async()=>++reads===1?[point()]:refresh.promise,detail:async()=>{details++;return point();}});
  await store.load();const pending=store.load();store.select('TEST-1');store.close();refresh.reject(new Error('TEST offline'));await pending;await tick();
  assert.equal(details,0);assert.equal(store.snapshot().selectedId,null);
});
test('manual new GPS before late old watch sample retains point/time and nearest order from the new origin',async()=>{
  const {gps:{RescueGpsStore},store:{CatalogStore}}=modules();let watchSuccess,manualSuccess;const calls=[];
  const store=new CatalogStore({list:async origin=>{calls.push(origin);return origin.latitude===17?[point('NEAR',.1),point('FAR',20)]:[point('FAR',.1),point('NEAR',20)];},detail:async()=>point()});
  const geo={watchPosition:success=>{watchSuccess=success;return 0;},clearWatch:()=>{},getCurrentPosition:success=>{manualSuccess=success;}};
  const gps=new RescueGpsStore(geo,p=>{void store.load(p);});gps.start();const pending=gps.request();
  manualSuccess({coords:{latitude:17,longitude:109},timestamp:2000});await pending;await tick();
  watchSuccess({coords:{latitude:16,longitude:108},timestamp:1000});await tick();
  assert.equal(gps.snapshot().point.latitude,17);assert.equal(gps.snapshot().recordedAt,2000);assert.equal(calls.length,1);assert.equal(store.snapshot().origin.latitude,17);
  assert.deepEqual(Array.from(store.snapshot().items,item=>item.id),['NEAR','FAR']);
  gps.stop();
});
test('late manual GPS cannot replace a newer watch sample; invalid timestamps never become a fresh fix',async()=>{
  const {gps:{RescueGpsStore}}=modules();let watch,manual;const calls=[];
  const gps=new RescueGpsStore({watchPosition:success=>{watch=success;return 0;},clearWatch:()=>{},getCurrentPosition:success=>{manual=success;}},p=>calls.push(p));
  gps.start();const pending=gps.request();watch({coords:{latitude:18,longitude:110},timestamp:3000});
  manual({coords:{latitude:17,longitude:109},timestamp:2000});const focused=await pending;
  assert.equal(focused.latitude,18);assert.equal(gps.snapshot().recordedAt,3000);assert.equal(calls.length,1);
  watch({coords:{latitude:15,longitude:107},timestamp:NaN});assert.equal(gps.snapshot().point.latitude,18);assert.equal(gps.snapshot().recordedAt,3000);assert.equal(calls.length,1);
  watch({coords:{latitude:14,longitude:106},timestamp:3000});assert.equal(gps.snapshot().point.latitude,18);assert.equal(calls.length,1);gps.stop();
});

test('detail interrupted by refresh resumes after list failure and rejects its old late response',async()=>{
  const {store:{CatalogStore}}=modules();const refresh=deferred(),old=deferred();let lists=0,details=0;
  const store=new CatalogStore({list:async()=>++lists===1?[point()]:refresh.promise,detail:async()=>++details===1?old.promise:point('TEST-1',null,{description:'Latest detail'})});
  await store.load();store.select('TEST-1');const pending=store.load();refresh.reject(new Error('TEST list offline'));await pending;await tick();
  assert.equal(store.snapshot().detail.description,'Latest detail');old.resolve(point('TEST-1',null,{description:'STALE detail'}));await tick();
  assert.equal(details,2);assert.equal(store.snapshot().detail.description,'Latest detail');
});

test('superseded failed refresh cannot drain an old queued detail after newer list removes that ID',async()=>{
  const {store:{CatalogStore}}=modules();const stale=deferred();let lists=0,details=0;
  const store=new CatalogStore({list:async()=>{lists++;return lists===1?[point('A')]:lists===2?stale.promise:[point('B',0)];},detail:async id=>{details++;return point(id);}});
  await store.load();const old=store.load();store.select('A');await store.load({latitude:17,longitude:109});
  stale.reject(new Error('STALE TEST failure'));await old;await tick();assert.equal(details,0);assert.equal(store.snapshot().items[0].id,'B');assert.equal(store.snapshot().unavailable,true);
});
