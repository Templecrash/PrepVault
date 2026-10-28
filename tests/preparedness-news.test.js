import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyNews, parseSyndicatedNews, parseGdeltNews, parseGnews, fetchBriefingSource, loadPreparednessBriefing, GUIDANCE } from '../api/_lib/preparedness-news.js';

const NOW = Date.parse('2026-10-28T16:00:00Z');
const source = { id: 'govuk', name: 'GOV.UK', url: 'https://www.gov.uk/', allowedHost: 'www.gov.uk', kind: 'official' };
const entry = (title = 'Japan reviews emergency supplies', url = 'https://www.gov.uk/news/example', date = '2026-10-28T12:00:00Z', summary = 'Advice on earthquake preparation.') => `<entry><title>${title}</title><link href="${url}"/><updated>${date}</updated><summary>${summary}</summary></entry>`;

test('feed parsing retains real source dates, safe links and plain excerpts', () => {
  const rows = parseSyndicatedNews(`<feed>${entry('Japan emergency supplies', 'https://www.gov.uk/news/example?utm_source=test', undefined, '&lt;b&gt;Prepare&lt;/b&gt; for earthquakes.')}</feed>`, source, NOW);
  assert.equal(rows.length, 1); assert.equal(rows[0].url, 'https://www.gov.uk/news/example');
  assert.equal(rows[0].summary, 'Prepare for earthquakes.');
  assert.equal(rows[0].publishedAt, '2026-10-28T12:00:00.000Z');
  assert.equal(rows[0].dateBasis, 'updated');
  assert.deepEqual(rows[0].countries, ['JP']); assert.equal(rows[0].kind, 'official');
});
test('RSS parsing accepts GDACS reports and upgrades its known HTTP links', () => {
  const xml = '<rss><channel><item><title>Earthquake in Japan</title><link>http://www.gdacs.org/report.aspx?id=1</link><pubDate>Wed, 28 Oct 2026 12:00:00 GMT</pubDate><description>Magnitude 5.5.</description></item></channel></rss>';
  const [row] = parseSyndicatedNews(xml, { ...source, allowedHost: 'www.gdacs.org' }, NOW);
  assert.equal(row.dateBasis, 'published'); assert.equal(row.url, 'https://www.gdacs.org/report.aspx?id=1'); assert.deepEqual(row.topics, ['disasters']);
});
test('invalid, old, future, unrelated and off-domain feed items do not become news', () => {
  const xml = `<feed>${entry('Local concert', undefined, undefined, 'Music in the park.')}${entry(undefined, 'javascript:alert(1)')}${entry(undefined, 'https://evil.example/news')}${entry(undefined, undefined, '2025-01-01')}${entry(undefined, undefined, '2027-01-01')}${entry(undefined, undefined, 'not a date')}</feed>`;
  assert.deepEqual(parseSyndicatedNews(xml, source, NOW), []);
  for (const text of ['<html>blocked</html>', '<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///secret">]><rss/>']) assert.throws(() => parseSyndicatedNews(text, source, NOW));
});
test('UN metadata does not copy publisher excerpts and country tags are content-based', () => {
  const rows = parseSyndicatedNews(`<feed>${entry('Ukraine war update', undefined, undefined, 'UK statement on current events.')}</feed>`, { ...source, headlinesOnly: true, kind: 'news' }, NOW);
  assert.equal(rows[0].summary, ''); assert.deepEqual(rows[0].countries, ['GB', 'UA']);
  assert.deepEqual(classifyNews('Earthquake aftershocks continue').countries, []);
  assert.deepEqual(classifyNews('Ask us about preparedness').countries, []);
});
test('routine budgets, loans and vague preparation do not crowd out actual preparedness news', () => {
  const stories = [
    entry('What the Autumn Budget means for your energy bills', undefined, undefined, 'A plan for lower electricity bills.'),
    entry('Warm Homes Loan Scheme: Factsheet', undefined, undefined, 'Energy support for households.'),
    entry('A new hospital opens', undefined, undefined, 'Doctors welcome a new building.'),
    entry('Farm award ceremony', undefined, undefined, 'Celebrating food and crops.'),
    entry('Preparing for the future', undefined, undefined, 'A new finance strategy.'),
    entry('Peace conference celebrates an anniversary', undefined, undefined, 'Delegates share their hopes.'),
  ];
  assert.deepEqual(parseSyndicatedNews(`<feed>${stories.join('')}</feed>`, source, NOW), []);
  for (const text of ['Officials issue emergency supplies warning', 'Power grid outage after storms', 'Food shortage in Canada', 'Hospital emergency after missile strike', 'Prepare for flooding', 'Ukraine war update']) assert.ok(classifyNews(text).topics.length, text);
  const crisis = parseSyndicatedNews(`<feed>${entry('Emergency budget after nationwide blackout', undefined, undefined, 'Electricity outage disrupts hospitals.')}</feed>`, source, NOW);
  assert.equal(crisis.length, 1);
});
test('GDELT first-seen time is never represented as publication time', () => {
  const [row] = parseGdeltNews({ articles: [{ title: 'War in Ukraine', url: 'https://example.com/report', seendate: '20261028T120000Z', sourcecountry: 'Japan' }] }, NOW);
  assert.equal(row.dateBasis, 'indexed'); assert.equal(row.publishedAt, null); assert.equal(row.observedAt, '2026-10-28T12:00:00.000Z'); assert.deepEqual(row.countries, ['UA']);
  assert.deepEqual(parseGdeltNews({ articles: [{ title: 'War in Ukraine', url: 'http://example.com/report', seendate: '20261028T120000Z' }] }, NOW), []);
});
test('GNews preserves publication dates and strips untrusted markup', () => {
  const [row] = parseGnews({ articles: [{ title: '<b>Food shortage in Canada</b>', description: 'Supply warning', url: 'https://example.com/report', source: { name: '<b>Publisher</b>' }, publishedAt: '2026-10-28T11:00:00Z' }] }, NOW);
  assert.equal(row.title, 'Food shortage in Canada'); assert.equal(row.source, 'Publisher'); assert.deepEqual(row.countries, ['CA']); assert.equal(row.observedAt, null);
});
test('source fetches have timeout, redirect protection, identification and byte bounds', async () => {
  assert.equal(await fetchBriefingSource('https://example.com/rss', { fetchImpl: async (_url, init) => { assert.equal(init.redirect, 'error'); assert.match(init.headers['User-Agent'], /PrepVault/); assert.match(init.headers.Accept, /\*\/\*/); assert.ok(init.signal); return new Response('feed'); } }), 'feed');
  await assert.rejects(fetchBriefingSource('https://example.com/rss', { fetchImpl: async () => new Response('large', { headers: { 'Content-Length': '1500001' } }) }));
  await assert.rejects(fetchBriefingSource('https://example.com/rss', { fetchImpl: async () => new Response('x'.repeat(1500001)) }));
  await assert.rejects(fetchBriefingSource('https://example.com/rss', { timeoutMs: 2, fetchImpl: async (_url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) }), /aborted/);
});
test('partial source failure is visible and standing advice is separate from current articles', async () => {
  const calls = [];
  const result = await loadPreparednessBriefing({ now: () => NOW, gnewsKey: '', fetchImpl: async url => {
    calls.push(url);
    if (url.includes('gdelt')) return new Response('rate limited', { status: 429 });
    if (url.includes('gov.uk')) return new Response(`<feed>${entry()}</feed>`);
    return new Response('<rss><channel/></rss>');
  } });
  assert.equal(calls.length, 5); assert.equal(result.articles.length, 1); assert.equal(result.sources.filter(value => value.status === 'unavailable').length, 1);
  assert.equal(result.sources.find(value => value.id === 'gdelt').status, 'unavailable');
  assert.ok(result.guidance.every(value => value.kind === 'standing-guidance' && !value.publishedAt));
  assert.equal(GUIDANCE.find(value => value.country === 'GB').url, 'https://beready.campaign.gov.uk/');
  assert.doesNotMatch(JSON.stringify(result), /rate limited/);
});
test('all failed sources produce no invented stories, with configured API credentials withheld', async () => {
  const result = await loadPreparednessBriefing({ now: () => NOW, gnewsKey: 'test-private-key', fetchImpl: async () => { throw new Error('secret failure'); } });
  assert.equal(result.articles.length, 0); assert.ok(result.sources.every(value => value.status === 'unavailable'));
  assert.doesNotMatch(JSON.stringify(result), /test-private-key|secret failure|apikey/);
});
