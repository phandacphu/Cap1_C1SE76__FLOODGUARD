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

test('report range changes local KPIs and charts; export stays disabled', () => {
  assert.match(screen, /useState<ReportRange>\("7d"\)/);
  assert.match(screen, /\["7d", "7 ngày"\]/);
  assert.match(screen, /\["30d", "30 ngày"\]/);
  assert.match(screen, /\["90d", "90 ngày"\]/);
  assert.match(screen, /onClick=\{\(\) => setRange\(value\)\}/);
  assert.match(screen, /current\.trend\.map/);
  assert.match(screen, /conic-gradient/);
  assert.match(screen, /disabled[\s\S]*?Xuất báo cáo/);
});

test('the reports UI has no API requests or unnecessary implementation notes', () => {
  assert.match(screen, /const previewReports: Record<ReportRange, ReportPreview>/);
  assert.doesNotMatch(screen, /\bfetch\s*\(|\baxios\b|firebase|localStorage|sessionStorage/i);
  assert.doesNotMatch(screen, /<p[^>]*>[^<]*(?:chưa nối|chưa kết nối|API|Firebase)/i);
  assert.doesNotMatch(screen, /Dữ liệu minh họa để kiểm tra bố cục|Các con số và biểu đồ là dữ liệu mẫu/);
});
