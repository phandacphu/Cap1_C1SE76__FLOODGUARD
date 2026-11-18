const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/pages/map/historicalDetails.ts'),'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: api });
const point = (id='HIST-TEST', description='Mô tả Admin') => ({ type:'Feature', properties:{ id, name:'Tên Admin', description, source:'Nguồn Admin', areaType:'flood' }, geometry:{ type:'Point', coordinates:[108,16] } });
const polygon = (id='HIST-TEST') => ({ ...point(id), geometry:{type:'Polygon',coordinates:[[[108,16],[109,16],[109,17],[108,16]]]} });
const collection = features => ({type:'FeatureCollection',features});
const fields = feature => Object.fromEntries(api.historicalDetails(feature,new Map()));

test('HIST popup preserves metadata and uses fallback only for missing or blank description', () => {
  const data=fields(point());
  assert.equal(data['Mô tả'],'Mô tả Admin');
  assert.equal(data['Nguồn'],'Nguồn Admin');
  assert.equal(data['Tọa độ điểm HIST (vĩ độ, kinh độ)'],'16, 108');
  for(const description of [null,'','   ']) assert.equal(fields(point('HIST-TEST',description))['Mô tả'],'Chưa có mô tả');
});
test('polygon reference matches stable ID only, never same name or nearby geometry', () => {
  const wrong=point('HIST-OTHER');
  const index=api.historicalPointIndex(collection([wrong]));
  assert.match(Object.fromEntries(api.historicalDetails(polygon(),index))['Tọa độ điểm HIST (vĩ độ, kinh độ)'],/Chưa có điểm/);
  index.set('HIST-TEST',point());
  assert.equal(Object.fromEntries(api.historicalDetails(polygon(),index))['Tọa độ điểm HIST (vĩ độ, kinh độ)'],'16, 108');
});
test('API strings are escaped in popup; stale and historical labels remain explicit', () => {
  const item=point('HIST-TEST','<img src=x onerror=alert(1)> & "TEST"');
  item.properties.name='<script>TEST</script>';
  const html=api.historicalPopupHtml(item,new Map(),true,1000);
  assert.ok(!html.includes('<img')&&!html.includes('<script>'));
  assert.match(html,/&lt;img/);
  assert.match(html,/không xác nhận ngập hiện tại/);
  assert.match(html,/Dữ liệu có thể đã cũ/);
});
test('invalid/duplicate HIST metadata fails rather than inventing ID or description', () => {
  assert.throws(()=>api.validateHistoricalMetadata(collection([point(),point()]),'points'));
  assert.throws(()=>api.validateHistoricalMetadata(collection([{...point(),properties:{...point().properties,description:123}}]),'points'));
  assert.throws(()=>api.validateHistoricalMetadata(collection([{...point(),properties:{...point().properties,id:null}}]),'areas'));
  assert.equal(api.validateHistoricalMetadata(collection([]),'areas').features.length,0);
});
test('refresh displays changed API metadata and empty snapshots remove deleted point/area', () => {
  const first=collection([point()]);
  const second=collection([point('HIST-TEST','Mô tả đã sửa')]);
  assert.equal(fields(second.features[0])['Mô tả'],'Mô tả đã sửa');
  assert.equal(fields(first.features[0])['Mô tả'],'Mô tả Admin');
  assert.equal(api.historicalPointIndex(collection([])).size,0);
});
test('live Render points/areas preserve metadata and pair by exact HIST ID', {skip:!process.env.HIST_LIVE_DIR}, () => {
  const parser = {};
  const source = fs.readFileSync(path.join(__dirname,'../src/pages/admin/flood-area/historicalMapService.ts'),'utf8').replace('import.meta.env.VITE_API_URL','undefined');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:parser});
  const load = key => parser.parseHistoricalCollection(JSON.parse(fs.readFileSync(path.join(process.env.HIST_LIVE_DIR,`${key}.json`),'utf8')),key);
  const points=load('points');
  const areas=load('areas');
  api.validateHistoricalMetadata(points,'points'); api.validateHistoricalMetadata(areas,'areas');
  const index=api.historicalPointIndex(points);
  for(const feature of areas.features){
    const linked=index.get(feature.properties.id);
    assert.ok(linked,feature.properties.id);
    for(const key of ['id','name','description','source','areaType']) assert.deepEqual(feature.properties[key],linked.properties[key]);
    const html=api.historicalPopupHtml(feature,index,false,1000);
    assert.ok(html.includes(api.escapeHistoricalText(feature.properties.id)));
    const description=feature.properties.description;
    if(typeof description==='string'&&description.trim()) assert.ok(html.includes(api.escapeHistoricalText(description)));
  }
});
