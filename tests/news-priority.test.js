import test from 'node:test';
import assert from 'node:assert/strict';
import { newsPriority, priorityBriefing } from '../src/news-priority.js';
const now = Date.parse('2026-10-29T12:00:00Z');
const article = (title, scope = 'local', date = now - 3600000) => ({ title, relevance: { scope }, publishedAt: new Date(date).toISOString() });
test('recent disruptions rank ahead while old and resolved stories are not live priorities', () => {
  assert.equal(newsPriority(article('Toronto power outage affects transit'), now), 1);
  for (const row of [article('Toronto power restored after outage'), article('Evacuation drill planned'), article('Blackout: Canada’s Impending Electricity Crisis and How to Fix It'), article('How to prepare for a power outage'), article('Wildfire', 'local', now - 7 * 86400000), { title: 'Lockdown' }, article('Flood warning', 'local', now + 86400000)]) assert.equal(newsPriority(row, now), 0);
});
test('brief reserves two local priorities and room for a wider effect without duplicates', () => {
  const rows = [article('Household planning'), article('Toronto road closure'), article('Ontario wildfire'), article('Global fuel shortage', 'macro')];
  const selected = priorityBriefing(rows, now);
  assert.equal(selected.length, 3);
  assert.deepEqual(selected.map(row => row.title), ['Toronto road closure', 'Ontario wildfire', 'Global fuel shortage']);
  assert.deepEqual(priorityBriefing([rows[0]], now), [rows[0]]);
});
