import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../src/App.tsx');
const navigation = read('../src/components/layout/navConfig.ts');
const screen = read('../src/pages/admin/rescue-staff/RescueStaffUiScreen.tsx');
const preview = read('../src/pages/admin/ui-preview/AdminUiPreview.tsx');

test('Rescue Staff menu opens its protected Admin route', () => {
  const adminRoutes = app.split("<Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>")[1]?.split('</Route>')[0];
  assert.ok(adminRoutes, 'Admin routes exist');
  assert.match(adminRoutes, /path="\/admin\/rescue-staff"/);
  assert.match(navigation, /label: "Quản lý Rescue Staff", icon: "staff", to: "\/admin\/rescue-staff"/);
  assert.doesNotMatch(navigation, /Audit Log|Dữ liệu demo\/hệ thống/);
});

test('Rescue Staff reuses Admin Users data, search/filter and authenticated detail', () => {
  assert.match(screen, /useUserManagement\(\)/);
  assert.match(screen, /useMemo/);
  assert.match(screen, /setSearch/);
  assert.match(screen, /setFilter/);
  assert.match(screen, /fetchUserDetail/);
  assert.match(screen, /role="dialog"/);
  assert.match(screen, /role="alertdialog"/);
  assert.doesNotMatch(screen, /\baxios\b|firebase|localStorage|sessionStorage/);
  assert.doesNotMatch(preview, /\bfetch\s*\(|\baxios\b|firebase/);
});

test('Rescue account statistics and rows are API-backed, not sample shift/area data', () => {
  assert.match(screen, /u\.role === "rescue"/);
  assert.match(screen, /rescue\.length/);
  assert.match(screen, /filtered\.map/);
  assert.match(screen, /preview=\{false\}/);
  assert.doesNotMatch(screen, /Nhân sự mẫu 01|previewStaff/);
  assert.match(preview, /Giao diện mẫu/);
});
