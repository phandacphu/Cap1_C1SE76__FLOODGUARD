// Browser verification against production build + controlled V2 API responses.
// Run with Playwright and Chromium installed: node docs/handoff/flood-warning-v2/verify-rescue-warning-ui.cjs
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const fixture = require('../../../web/src/pages/rescue/warnings/warningFixtures.json');
const out = path.join(__dirname, 'review-19314b8');
fs.mkdirSync(out, { recursive: true });
(async () => {
 const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless:true, args:['--no-sandbox']});
 const context = await browser.newContext({viewport:{width:1440,height:1100}});
 await context.addInitScript(() => {
   localStorage.setItem('floodguard_token','TEST_ONLY_JWT');
   localStorage.setItem('floodguard_user', JSON.stringify({id:'TEST-RESCUE',role:'RESCUE_STAFF',fullName:'TEST ONLY Rescue'}));
 });
 const page=await context.newPage(); const requests=[], errors=[]; let failZones=false, failList=false;
 let rows=structuredClone(fixture.list.data.floodAlerts);
 page.on('pageerror', e=> errors.push(e.message));
 await page.route('**/*',async route=>{
   const request=route.request(), url=new URL(request.url());
   if(!url.pathname.startsWith('/api/')) {
     if(url.hostname!=='127.0.0.1') return route.abort();
     return route.continue();
   }
   assert.equal(request.method(),'GET','Browser test must not mutate any API');
   requests.push({path:url.pathname+url.search,authenticated:request.headers().authorization==='Bearer TEST_ONLY_JWT'});
   let body, status=200;
   if(url.pathname.includes('/flood-alerts')) {
     assert.equal(request.headers().authorization,'Bearer TEST_ONLY_JWT');
     const suffix=url.pathname.split('/flood-alerts')[1];
     if(suffix==='/zones') { body=fixture.zones; if(failZones){status=503;body={success:false,code:'ZONES_UNAVAILABLE'};} }
     else if(suffix==='' || suffix==='/active') {
       let list=rows.filter(r=>suffix!=='/active'||r.status==='active');
       if(url.searchParams.has('status')) list=list.filter(r=>r.status===url.searchParams.get('status'));
       const q=url.searchParams.get('q');if(q) list=list.filter(r=>(r.title+r.content).toLowerCase().includes(q.toLowerCase()));
       body={success:true,data:{schemaVersion:2,serverTime:new Date().toISOString(),floodAlerts:list}};
       if(failList){status=500;body={success:false};}
     } else {
       const item=rows.find(r=>r.id===decodeURIComponent(suffix.slice(1)));
       body=item?{success:true,data:{floodAlert:item,serverTime:new Date().toISOString()}}:{success:false};status=item?200:404;
     }
   } else if(url.pathname.includes('/flood-history/')) {
     body={success:true,data:{geojson:{type:'FeatureCollection',features:[]}}};
   } else if(url.pathname.includes('/rescue-requests')) {
     body={success:true,data:{rescueRequests:[]}};
   } else if(url.pathname.includes('/safe-locations')) {
     body={success:true,data:{safeLocations:[]}};
   } else {status=503;body={success:false,message:'TEST ONLY unsupported source'};}
   return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 const goto=async p=>{await page.goto('http://127.0.0.1:4183'+p);};
 const shot=async name=>{await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});};
 await goto('/rescue/flood-warnings');
 await page.getByText('3 bản tin · Mới nhất trước').waitFor();
 await page.getByText(/Dữ liệu vùng chưa đầy đủ/).waitFor();
 await page.locator('.leaflet-overlay-pane').waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('.leaflet-pane svg path').length>=4);
 assert(requests.some(r=>r.path==='/api/flood-alerts/zones'));
 assert(!requests.some(r=>r.path==='/api/flood-areas'),'Rescue must get boundaries through /zones');
 await shot('list-map-partial');
 await page.getByRole('button',{name:'Đã tắt',exact:true}).click();
 await page.getByText('1 bản tin · Mới nhất trước').waitFor(); await shot('filter-inactive');
 await page.getByRole('link',{name:'Xem chi tiết →'}).click();
 await page.getByText('Bản tin đã tắt.',{exact:false}).waitFor(); await shot('detail-inactive');
 await page.getByRole('link',{name:'Xem vùng trên bản đồ',exact:true}).click();
 await page.getByText(/Đang xem bộ vùng hiện tại/).waitFor(); await shot('full-map');
 await goto('/rescue/flood-warnings');await page.getByText('3 bản tin · Mới nhất trước').waitFor();
 failZones=true;await page.getByRole('button',{name:'Làm mới bản đồ',exact:true}).click();
 await page.getByText(/Chưa tải được nguồn dữ liệu vùng/).waitFor();
 await page.getByText(/Đang hiển thị dữ liệu đã tải trước đó/).first().waitFor();await shot('map-error-stale');failZones=false;
 failList=true;await page.getByRole('button',{name:'Làm mới bản tin',exact:true}).click();
 await page.getByText(/Chưa thể cập nhật/).first().waitFor();await shot('list-error-stale');failList=false;
 await page.setViewportSize({width:390,height:844});await goto('/rescue/flood-warnings');
 await page.getByText('3 bản tin · Mới nhất trước').waitFor();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Mobile must not overflow horizontally');await shot('mobile');
 await page.setViewportSize({width:1440,height:1100});
 for(const [route,name] of [['/rescue/dashboard','dashboard'],['/rescue/sos','sos'],['/rescue/safe-locations','safe-locations']]){
   await goto(route);await page.waitForLoadState('networkidle');await shot(name);
 }
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({baseUrl:'http://127.0.0.1:4183',api:'Intercepted controlled V2 fixture responses; no live backend writes',tileProvider:'Not validated: no MapTiler key configured',requests,errors,checks:['list','all three zone groups rendered','coverage partial','filter inactive','detail correct ID','inactive current-map note','map refresh error and stale','list refresh error and stale','mobile no overflow','dashboard','SOS','Safe Locations']},null,2));
 await browser.close();console.log('Browser checks passed; screenshots saved to '+out);
})().catch(e=>{console.error(e);process.exit(1)});
