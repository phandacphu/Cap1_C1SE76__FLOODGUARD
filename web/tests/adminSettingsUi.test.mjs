import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../src/App.tsx');
const navigation = read('../src/components/layout/navConfig.ts');
const screen = read('../src/pages/admin/settings/AdminSettingsUiScreen.tsx');

test('settings keeps its Admin-only route and sidebar entry', () => {
  const adminRoutes = app.split("<Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>")[1]?.split('</Route>')[0];
  assert.ok(adminRoutes?.includes('path="/admin/settings"'));
  assert.match(navigation, /label: "Cài đặt hệ thống", icon: "settings", to: "\/admin\/settings"/);
});

test('settings links from three tabs only to existing Admin routes', () => {
  assert.match(screen, /useState<SettingsTab>\("display"\)/);
  for (const tab of ['display', 'notifications', 'security']) assert.ok(screen.includes(`tab === "${tab}"`));
  for (const path of ['/admin/sos', '/admin/flood-warnings', '/admin/notifications', '/admin/users']) {
    assert.ok(app.includes(`path="${path}"`));
    assert.ok(screen.includes(`to="${path}"`));
  }
  assert.match(screen, /useAuth\(\)/);
  assert.match(screen, /logoutRequest\(token\)/);
  assert.match(screen, /navigate\("\/login", \{ replace: true \}\)/);
});

test('settings omits preview controls, simulated switches and fake save', () => {
  assert.match(screen, /preview=\{false\}/);
  assert.doesNotMatch(screen, /role="switch"|aria-checked|setNotice|setDensity|Khôi phục mặc định|Lưu thay đổi|Giao diện mẫu/);
  assert.doesNotMatch(screen, /fetch\s*\(|axios|firebase|localStorage|sessionStorage/i);
  assert.doesNotMatch(screen, /Chưa kết nối|Chỉ hiển thị mẫu|bản xem trước trang này/);
});
