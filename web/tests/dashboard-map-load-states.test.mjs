import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatAreaAlertCount } from '../src/pages/map/mapAlertStatus.ts';
import { formatDashboardSosCount } from '../src/pages/admin/sos/sosFormat.ts';

test('pending alert request takes precedence over a zero or previous result', () => {
  assert.equal(formatAreaAlertCount(true, 0), 'Đang tải cảnh báo');
  assert.equal(formatAreaAlertCount(true, 3), 'Đang tải cảnh báo');
  assert.equal(formatAreaAlertCount(false, null), 'Cảnh báo: chưa xác nhận');
  assert.equal(formatAreaAlertCount(false, 0), '0 cảnh báo hiệu lực tại lần tải');
});

test('dashboard distinguishes an unavailable SOS count from a successful zero', () => {
  assert.equal(formatDashboardSosCount(undefined), 'Chưa tải được số SOS');
  assert.equal(formatDashboardSosCount(null), 'Chưa tải được số SOS');
  assert.equal(formatDashboardSosCount(0), '0');
  assert.equal(formatDashboardSosCount(3), '3');
});
