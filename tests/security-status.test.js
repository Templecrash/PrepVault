import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraSecurityStatus, alarmSecurityStatus } from '../src/security-status.js';

const now = Date.parse('2026-10-29T12:00:00Z');
const fresh = { connected: true, checkedAt: new Date(now).toISOString() };
test('connected cameras are not assumed online and combine providers', () => {
  assert.deepEqual(cameraSecurityStatus({ ...fresh, cameras: [{ status: 'unknown' }, { status: 'offline' }] }, { ...fresh, devices: [{ status: 'online' }] }, now), { label: '3 cameras', detail: '1 online · 1 offline · 1 status unknown', attention: true });
});
test('stale or failed providers never produce a current camera status', () => {
  assert.equal(cameraSecurityStatus({ ...fresh, error: 'failed', cameras: [{ status: 'online' }] }, null, now).label, 'Check connection');
  assert.equal(cameraSecurityStatus(null, { ...fresh, checkedAt: null, devices: [{ status: 'online' }] }, now).label, 'Check connection');
});
test('empty and disconnected accounts have distinct states', () => {
  assert.equal(cameraSecurityStatus(null, null, now).label, 'Not connected');
  assert.equal(cameraSecurityStatus({ ...fresh, cameras: [] }, null, now).label, 'No cameras found');
  assert.equal(alarmSecurityStatus(null, now).label, 'Not connected');
  assert.equal(alarmSecurityStatus({ ...fresh, systems: [] }, now).label, 'No systems found');
});
test('alarm partitions take precedence over other system states', () => {
  assert.equal(alarmSecurityStatus({ ...fresh, systems: [{ status: 'mixed', partitions: [{ status: 'alarm' }] }, { status: 'armed_away' }] }, now).label, 'Alarm reported');
  assert.equal(alarmSecurityStatus({ ...fresh, systems: [{ status: 'disarmed' }, { status: 'armed_away' }] }, now).label, 'Mixed states');
});
test('stale alarms and invalid future checks do not imply current safety', () => {
  assert.equal(alarmSecurityStatus({ ...fresh, checkedAt: '2026-10-29T11:00:00Z', systems: [{ status: 'armed_away' }] }, now).label, 'Status unavailable');
  assert.equal(alarmSecurityStatus({ ...fresh, checkedAt: '2026-10-30T12:00:00Z', systems: [{ status: 'armed_away' }] }, now).label, 'Status unavailable');
});
