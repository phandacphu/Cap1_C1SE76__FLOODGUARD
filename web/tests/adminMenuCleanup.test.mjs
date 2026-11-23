import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const navigation = readFileSync(new URL('../src/components/layout/navConfig.ts', import.meta.url), 'utf8');
const adminNavigation = navigation.split('export const ADMIN_NAV: NavItem[] = [')[1]?.split('];')[0];

test('Admin sidebar removes only Audit Log and demo/system data entries', () => {
  assert.ok(adminNavigation, 'Admin navigation is defined');
  assert.doesNotMatch(adminNavigation, /Audit Log|Dữ liệu demo\/hệ thống/);

  for (const label of [
    'Tổng quan', 'Bản đồ trực quan', 'Bản đồ lịch sử', 'Theo dõi SOS',
    'Quản lý cảnh báo lũ', 'Quản lý vùng ngập', 'Quản lý điểm an toàn',
    'Quản lý người dùng', 'Quản lý Rescue Staff', 'Thông báo', 'Báo cáo', 'Cài đặt hệ thống',
  ]) {
    assert.ok(adminNavigation.includes(`label: "${label}"`), `${label} must be retained`);
  }
});
