import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../src/App.tsx');
const navigation = read('../src/components/layout/navConfig.ts');
const screen = read('../src/pages/admin/notifications/AdminNotificationsUiScreen.tsx');

test('notifications route is reachable from the Admin sidebar and remains Admin-only', () => {
  const adminRoutes = app.split("<Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>")[1]?.split('</Route>')[0];
  assert.ok(adminRoutes, 'Admin routes exist');
  assert.match(adminRoutes, /path="\/admin\/notifications"/);
  assert.match(navigation, /label: "Thông báo", icon: "bell", to: "\/admin\/notifications"/);
  assert.match(adminRoutes, /path="\/admin\/rescue-staff"/);
});

test('notifications include search, read filters, local read state and accessible detail selection', () => {
  assert.match(screen, /useMemo/);
  assert.match(screen, /setSearch/);
  assert.match(screen, /setFilter/);
  assert.match(screen, /setReadIds/);
  assert.match(screen, /setSelectedId/);
  assert.match(screen, /aria-pressed=\{filter === value\}/);
  assert.match(screen, /Đánh dấu tất cả đã đọc/);
  assert.match(screen, /selected \? \(/);
  assert.match(screen, /Không có thông báo phù hợp/);
});

test('notifications remain a frontend-only preview with no backend actions or technical notes in rendered text', () => {
  assert.match(screen, /const previewNotifications: NotificationPreview\[\]/);
  assert.doesNotMatch(screen, /\bfetch\s*\(|\baxios\b|firebase|localStorage|sessionStorage/i);
  assert.doesNotMatch(screen, /<p[^>]*>[^<]*(?:chưa nối|chưa kết nối|API|Firebase)/i);
  assert.doesNotMatch(screen, /Mục trong bản xem trước|Nội dung minh họa/);
});
