import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../src/App.tsx');
const navigation = read('../src/components/layout/navConfig.ts');
const screen = read('../src/pages/admin/settings/AdminSettingsUiScreen.tsx');

test('settings has its own Admin-only route and all remaining sidebar items remain available', () => {
  const adminRoutes = app.split("<Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>")[1]?.split('</Route>')[0];
  assert.ok(adminRoutes);
  for (const path of ['/admin/rescue-staff', '/admin/notifications', '/admin/reports', '/admin/settings']) {
    assert.ok(adminRoutes.includes(`path="${path}"`));
  }
  assert.match(navigation, /label: "Cài đặt hệ thống", icon: "settings", to: "\/admin\/settings"/);
  assert.doesNotMatch(navigation, /Audit Log|Dữ liệu demo\/hệ thống/);
});

test('settings UI includes display, notifications and security tabs with local-only controls', () => {
  assert.match(screen, /useState<SettingsTab>\("display"\)/);
  assert.match(screen, /setTab\(value\)/);
  assert.match(screen, /tab === "display"/);
  assert.match(screen, /tab === "notifications"/);
  assert.match(screen, /tab === "security"/);
  assert.match(screen, /role="switch"/);
  assert.match(screen, /aria-checked=\{checked\}/);
  assert.match(screen, /Khôi phục mặc định/);
  assert.match(screen, /disabled[\s\S]*?Lưu thay đổi/);
});

test('settings page does not mutate backend config or show technical implementation notes', () => {
  assert.doesNotMatch(screen, /\bfetch\s*\(|\baxios\b|firebase|localStorage|sessionStorage/i);
  assert.doesNotMatch(screen, /<p[^>]*>[^<]*(?:chưa nối|chưa kết nối|API|Firebase)/i);
  assert.doesNotMatch(screen, /Chỉ hiển thị mẫu|Chưa kết nối|bản xem trước trang này/);
});
