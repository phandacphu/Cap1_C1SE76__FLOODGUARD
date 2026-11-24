import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../src/App.tsx');
const navigation = read('../src/components/layout/navConfig.ts');
const screen = read('../src/pages/admin/reports/AdminReportsUiScreen.tsx');

test('reports sidebar opens an Admin-only route without changing other pages', () => {
  const adminRoutes = app.split("<Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>")[1]?.split('</Route>')[0];
  assert.ok(adminRoutes, 'Admin routes exist');
  assert.match(adminRoutes, /path="\/admin\/reports"/);
  assert.match(navigation, /label: "Báo cáo", icon: "report", to: "\/admin\/reports"/);
  for (const route of ['/admin/notifications', '/admin/rescue-staff', '/admin/sos']) {
    assert.ok(adminRoutes.includes(`path="${route}"`));
  }
});

test('report range chooses a server SOS window, while export stays disabled', () => {
  assert.match(screen, /useState<ReportRange>\("7d"\)/);
  assert.match(screen, /"7d", "7 ngày"/);
  assert.match(screen, /"30d", "30 ngày"/);
  assert.match(screen, /"90d", "90 ngày"/);
  assert.match(screen, /chooseRange\(key\)/);
  assert.match(screen, /fetchSosReport\(token, range\)/);
  assert.match(screen, /fetchWarningReport\(token\)/);
  assert.match(screen, /conic-gradient/);
  assert.match(screen, /disabled title="Chưa có chức năng xuất báo cáo/);
});

test('reports show verified counts and no fixture or fake time-series values', () => {
  assert.doesNotMatch(screen, /previewReports|current\.trend|requests: 42/);
  assert.match(screen, /sos\.data\?\.rescued/);
  assert.match(screen, /warning\.data\?\.total/);
  assert.match(screen, /detail="Toàn hệ thống"/);
  assert.doesNotMatch(screen, /\bfetch\s*\(|\baxios\b|firebase|localStorage|sessionStorage/i);
  assert.match(screen, /setLocked\(true\)/);
});

test('report has four real-data sections with business-facing flood warning name', () => {
  for (const name of ['Theo dõi SOS', 'Quản lý cảnh báo lũ', 'Quản lý vùng ngập', 'Quản lý điểm an toàn']) assert.ok(screen.includes(name));
  for (const path of ['/admin/sos', '/admin/flood-warnings', '/admin/flood-areas', '/admin/safe-locations']) assert.ok(screen.includes(`"${path}"`));
  assert.doesNotMatch(screen, /Cảnh báo V2|Lịch sử V2|detail="V2"/);
  assert.match(screen, /areas\.data\.radarCandidates/);
  assert.match(screen, /locations\.data\.total/);
  assert.doesNotMatch(screen, /PreviewStat title="Chưa phân loại"|Quản lý vùng ngập · Trong kỳ/);
});
