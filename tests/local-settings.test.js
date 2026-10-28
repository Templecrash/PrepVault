import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSnapshot } from '../src/storage.js';
test('backup rejects corrupted JSON settings before any plan restore', () => {
  for (const [key, raw] of [['prepvault-radio-log', '{'], ['prepvault-reference-channels', '{}'], ['prepvault-trap-status', 'null'], ['prepvault-dismissed-opps', '[null]'], ['prepvault-radio-volume', '2'], ['prepvault-radio-location', '{"countryCode":"X"}'], ['prepvault-conversation-notes', '[{"id":"bad"}]']]) {
    assert.throws(() => validateSnapshot({ items: [], localSettings: { [key]: raw } }), /Invalid saved setting/);
  }
});
test('legacy settings and geographic selection survive valid backups', () => {
  const snapshot = { items: [], localSettings: { 'prepvault-radio-log': '["Legacy note"]', 'prepvault-radio-volume': '0.5', 'prepvault-trap-status': '{"a":false}', 'prepvault-radio-location': '{"countryCode":"CA","country":"Canada","state":"Ontario"}' } };
  assert.deepEqual(validateSnapshot(snapshot), snapshot);
});
