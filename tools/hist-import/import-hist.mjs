#!/usr/bin/env node
/** FLOODGUARD HIST metadata updater. DRY-RUN BY DEFAULT. No direct Firestore access. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(scriptDir, 'descriptions-27.json');
const args = process.argv.slice(2);
let apiBase = process.env.FLOODGUARD_API_URL || '';
let apply = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--api-url' && args[i + 1]) apiBase = args[++i];
  else if (args[i] === '--apply') apply = true;
  else throw new Error('Cách dùng: node tools/hist-import/import-hist.mjs --api-url URL [--apply]');
}
if (!apiBase) throw new Error('Phải chỉ rõ --api-url (ví dụ http://localhost:5000/api).');
const endpoint = new URL(apiBase.replace(/\/+$/, '') + '/');
if (!['http:', 'https:'].includes(endpoint.protocol) || !endpoint.pathname.endsWith('/api/')) {
  throw new Error('API URL phải có dạng http(s)://host/api');
}
const token = (process.env.FLOODGUARD_ADMIN_TOKEN || '').trim();
if (!token) throw new Error('Thiếu FLOODGUARD_ADMIN_TOKEN. Cần JWT Admin hợp lệ; không lưu token vào file và không gửi token qua chat.');
const { items } = JSON.parse(await fs.readFile(dataFile,'utf8'));
const ids = items.map(x => x.id);
if (ids.length !== 27 || new Set(ids).size !== 27 ||
    ids.some((id, i) => id !== `HIST-${String(i+1).padStart(2,'0')}`) ||
    items.some(x => typeof x.description !== 'string' || !x.description.trim() ||
      typeof x.source !== 'string' || !/^https:\/\//.test(x.source))) {
  throw new Error('File dữ liệu phải có đúng 27 ID HIST-01..HIST-27, mô tả và nguồn hợp lệ.');
}
const outputDir = path.join(os.homedir(),'Downloads','FLOODGUARD-HIST-reports');
await fs.mkdir(outputDir,{recursive:true});
const stamp = new Date().toISOString().replace(/[:.]/g,'-');
const reportFile = path.join(outputDir,`hist-${apply?'apply':'preview'}-${stamp}.json`);
const backupFile = path.join(outputDir,`hist-backup-${stamp}.json`);
const report = { mode: apply ? 'apply' : 'dry-run', apiUrl: endpoint.href, createdAt: new Date().toISOString(), rows: [] };
function safeEqual(a,b) { return JSON.stringify(a) === JSON.stringify(b); }
async function saveReport() { await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n','utf8'); }
async function request(relativePath,method='GET',data) {
  const url = new URL(relativePath,endpoint);
  let response, body;
  try {
    response = await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,...(data?{'Content-Type':'application/json'}:{})},
      body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(80000)});
    body = await response.json();
  } catch (e) {
    throw new Error(`${method} ${relativePath}: mất phản hồi/kết nối (${e.message}); KHÔNG tự gửi lại PATCH. Đọc lại dữ liệu để đối chiếu.`);
  }
  if (!response.ok || body?.success !== true || !body.data) {
    throw new Error(`${method} ${relativePath}: HTTP ${response.status}: ${String(body?.message || 'Dữ liệu phản hồi không hợp lệ')}`);
  }
  return body.data;
}
function immutableProjection(area){
  return Object.fromEntries(['id','name','areaType','geometry','referencePoint','sourceUrl'].map(k => [k,area[k]??null]));
}
function blank(value){return value == null || (typeof value==='string'&&!value.trim());}
const list = await request('admin/flood-history');
if (!Array.isArray(list.floodAreas)) throw new Error('API không trả về data.floodAreas.');
const liveIds = new Set(list.floodAreas.map(x=>x.id));
if (ids.some(id=>!liveIds.has(id))) throw new Error('Thiếu ít nhất một HIST trong Admin catalogue. Không ghi dữ liệu.');
const originals=[];
for (const entry of items) {
  const before=(await request(`admin/flood-history/${encodeURIComponent(entry.id)}`)).floodArea;
  if (!before || before.id !== entry.id) throw new Error(`GET detail sai ID ${entry.id}`);
  originals.push(before);
  const row={id:entry.id,name:before.name,action:'',oldDescription:before.description??null,
    proposedDescription:entry.description,proposedSource:entry.source};
  if (!blank(before.description)) {
    row.action='skip-existing-description';
  } else {
    const patch={description:entry.description};
    if (blank(before.source)) patch.source=entry.source;
    row.action='update'; row.patch=patch;
  }
  report.rows.push(row);
  console.log(`${entry.id}: ${row.action}${row.action==='update' ? ` | ${entry.description}`:''}`);
}
await fs.writeFile(backupFile,JSON.stringify({savedAt:new Date().toISOString(),apiUrl:endpoint.href,areas:originals},null,2)+'\n','utf8');
await saveReport();
console.log(`\nDự kiến cập nhật: ${report.rows.filter(x=>x.action==='update').length}/27; bỏ qua mô tả có sẵn: ${report.rows.filter(x=>x.action==='skip-existing-description').length}.`);
console.log(`Bản sao trước sửa: ${backupFile}\nBáo cáo: ${reportFile}`);
if (!apply) {
  console.log('CHỈ XEM TRƯỚC. Chưa có PATCH nào được gửi. Chỉ dùng --apply SAU KHI Backend mới đã deploy và mô tả/nguồn đã được duyệt.');
  process.exit(0);
}
if (!process.stdin.isTTY) throw new Error('Chế độ ghi yêu cầu xác nhận trực tiếp từ bàn phím.');
const rl=readline.createInterface({input:process.stdin,output:process.stdout});
let confirmation;
try {confirmation=await rl.question('Để ghi dữ liệu chung, nhập chính xác: NHAP 27 HIST : ');} finally {rl.close();}
if (confirmation.trim()!=='NHAP 27 HIST') throw new Error('Hủy: xác nhận không đúng. Không ghi dữ liệu.');
for (let i=0;i<items.length;i++) {
  const row=report.rows[i];
  if (row.action !== 'update') continue;
  const before=originals[i];
  try {
    // Re-read immediately before mutation; NEVER override a record changed since preview.
    const latest=(await request(`admin/flood-history/${encodeURIComponent(row.id)}`)).floodArea;
    if (!safeEqual(latest,before)) {row.result='skipped-concurrent-change';await saveReport();continue;}
    const patch=row.patch;
    const updated=(await request(`admin/flood-history/${encodeURIComponent(row.id)}`,'PATCH',patch)).floodArea;
    if (!updated || updated.id!==row.id || updated.description!==patch.description ||
        !safeEqual(immutableProjection(updated),immutableProjection(before)) ||
        (patch.source && updated.source!==patch.source)) {
      throw new Error('PATCH trả về dữ liệu không khớp hoặc thay đổi trường cần bảo toàn.');
    }
    const verified=(await request(`admin/flood-history/${encodeURIComponent(row.id)}`)).floodArea;
    if (!verified || verified.description!==patch.description ||
        !safeEqual(immutableProjection(verified),immutableProjection(before)) ||
        (patch.source && verified.source!==patch.source)) {
      throw new Error('GET đối chiếu thất bại hoặc phát hiện trường không mong muốn thay đổi.');
    }
    row.result='updated-and-verified';
    console.log(`PASS ${row.id}`);
  } catch (error) {
    row.result='ERROR-STOP-NO-AUTO-RETRY';row.error=String(error.message || error);
    await saveReport();
    console.error(`DỪNG TẠI ${row.id}: ${row.error}`);
    console.error('Không tự gửi lại PATCH: phải GET đối chiếu thủ công trước.');
    process.exitCode=1; break;
  }
  await saveReport();
}
await saveReport();
console.log(`Kết quả: ${reportFile}`);
