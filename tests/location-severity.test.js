import test from 'node:test';
import assert from 'node:assert/strict';
import { activeOfficialAlerts, locationConditionStatus, officialAlertNeedsAttention, staleLocationConditions } from '../src/location-severity.js';
const now = Date.parse('2026-10-29T12:00:00Z');
const stamp = offset => new Date(now + offset).toISOString();
const alert = patch => ({ id: 'notice-1', event: 'Rainfall warning', severity: 'yellow', expires: stamp(3600000), ...patch });
const row = patch => ({ data: { fetchedAt: stamp(-60000), alerts: { status: 'ready', checkedAt: stamp(-60000), entries: [] }, weather: { status: 'ready', current: { weatherCode: 3 }, today: { weatherCode: 3 }, hourly: [] }, ...patch } });

test('ordinary weather and a successful empty alert check stay neutral, never all-clear', () => {
  const value = locationConditionStatus(row(), now);
  assert.equal(value.tone, 'neutral');
  assert.equal(value.summary, 'No weather alerts returned');
  assert.deepEqual(value.hazards, []);
});
test('fresh severe US alerts and Canadian warning notices are highlighted without colouring all notices red', () => {
  for (const notice of [alert(), alert({ event: 'Flood Watch', severity: 'Severe' }), alert({ event: 'Heat alert', severity: 'red' })]) {
    const value = locationConditionStatus(row({ alerts: { status: 'ready', checkedAt: stamp(-60000), entries: [notice] } }), now);
    assert.equal(value.tone, 'danger'); assert.equal(value.severeEntries.length, 1);
  }
  const advisory = alert({ event: 'Weather advisory', severity: 'Minor' });
  assert.equal(officialAlertNeedsAttention(advisory), false);
  assert.equal(locationConditionStatus(row({ alerts: { status: 'ready', checkedAt: stamp(-60000), entries: [advisory] } }), now).tone, 'neutral');
});
test('expired and malformed notices are not presented as active warnings', () => {
  assert.deepEqual(activeOfficialAlerts({ status: 'ready', entries: [alert({ expires: stamp(0) }), alert({ expires: 'bad' }), null] }, now), []);
  assert.deepEqual(activeOfficialAlerts({ status: 'unavailable', entries: [alert()] }, now), []);
});
test('stale/error/future-dated data cannot claim a current red hazard', () => {
  for (const value of [{ ...row(), error: 'Cannot refresh' }, row({ fetchedAt: stamp(-16 * 60000) }), row({ fetchedAt: stamp(2 * 60000) }), row({ fetchedAt: null })]) {
    value.data.weather.current.weatherCode = 99;
    assert.equal(staleLocationConditions(value, now), true);
    assert.equal(locationConditionStatus(value, now).tone, 'neutral');
    assert.match(locationConditionStatus(value, now).summary, /Previous check/);
  }
});
test('an old official source check does not inherit freshness from the overall request', () => {
  const value = locationConditionStatus(row({ alerts: { status: 'ready', checkedAt: stamp(-3600000), entries: [alert()] } }), now);
  assert.equal(value.tone, 'neutral'); assert.equal(value.alertsFresh, false); assert.equal(value.severeEntries.length, 0);
});
test('weather code hazards distinguish current conditions from today’s forecast and ignore future hourly weather', () => {
  const current = locationConditionStatus(row({ weather: { status: 'ready', current: { weatherCode: 67 }, today: { weatherCode: 67 } } }), now);
  assert.equal(current.tone, 'danger'); assert.deepEqual(current.hazards, [{ label: 'Freezing rain', timing: 'Current conditions' }]);
  const today = locationConditionStatus(row({ weather: { status: 'ready', current: { weatherCode: 3 }, today: { weatherCode: 99 }, hourly: [{ weatherCode: 67 }] } }), now);
  assert.deepEqual(today.hazards, [{ label: 'Thunderstorms with hail', timing: 'Forecast today' }]);
  const future = row(); future.data.weather.hourly = [{ weatherCode: 99 }];
  assert.equal(locationConditionStatus(future, now).tone, 'neutral');
});
test('unsupported, unavailable and loading sources remain neutral', () => {
  for (const status of ['unsupported', 'unavailable']) {
    const value = locationConditionStatus(row({ alerts: { status, entries: [] }, weather: { status: 'unavailable' } }), now);
    assert.equal(value.tone, 'neutral'); assert.notEqual(value.summary, 'No weather alerts returned');
  }
  assert.equal(locationConditionStatus(undefined, now).summary, 'Checking conditions');
  assert.equal(locationConditionStatus({ error: 'Offline' }, now).summary, 'Conditions unavailable');
});
