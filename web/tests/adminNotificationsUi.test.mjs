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

test('notifications use the Admin log lookup with cursor and detail selection', () => {
  assert.match(screen, /fetchNotificationLogs/);
  assert.match(screen, /notificationId/);
  assert.match(screen, /correlationId/);
  assert.match(screen, /eventId/);
  assert.match(screen, /nextPage/);
  assert.match(screen, /setSelectedId/);
  assert.match(screen, /Không có nhật ký phù hợp/);
});

test('notifications do not render the old read-state fixture or mutate backend', () => {
  assert.doesNotMatch(screen, /previewNotifications|setReadIds|Đánh dấu tất cả đã đọc/);
  assert.doesNotMatch(screen, /\bfetch\s*\(|\baxios\b|firebase|localStorage|sessionStorage/i);
  assert.match(screen, /preview=\{false\}/);
});
