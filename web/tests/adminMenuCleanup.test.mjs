import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const navigation = readFileSync(new URL('../src/components/layout/navConfig.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const userScreen = readFileSync(new URL('../src/pages/admin/user-management/UserManagementScreen.tsx', import.meta.url), 'utf8');
const adminNavigation = navigation.split('export const ADMIN_NAV: NavItem[] = [')[1]?.split('];')[0];

test('Admin sidebar removes only Audit Log and demo/system data entries', () => {
  assert.ok(adminNavigation, 'Admin navigation is defined');
  assert.doesNotMatch(adminNavigation, /Audit Log|Dữ liệu demo\/hệ thống/);

  for (const label of [
    'Tổng quan', 'Bản đồ trực quan', 'Bản đồ lịch sử', 'Theo dõi SOS',
    'Quản lý cảnh báo lũ', 'Quản lý vùng ngập', 'Quản lý điểm an toàn',
    'Quản lý người dùng', 'Quản lý Rescue Staff', 'Báo cáo', 'Cài đặt hệ thống',
  ]) {
    assert.ok(adminNavigation.includes(`label: "${label}"`), `${label} must be retained`);
  }
  assert.doesNotMatch(adminNavigation, /label: "Thông báo"|\/admin\/notifications/);
  assert.doesNotMatch(app, /\/admin\/notifications|AdminNotificationsUiScreen/);
});

test('Admin user management hides technical integration badges while retaining the existing account UI', () => {
  assert.doesNotMatch(userScreen, /KẾT NỐI API CHÍNH THỨC \(RENDER\)|ADMIN PANEL \/ CCF-123/);
  assert.match(userScreen, /Quản lý người dùng toàn hệ thống/);
  assert.match(userScreen, /Làm mới/);
});
