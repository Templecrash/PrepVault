import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyNews, parseSyndicatedNews, parseGdeltNews, parseGnews, fetchBriefingSource, loadPreparednessBriefing, buildBriefingSearches, GUIDANCE } from '../api/_lib/preparedness-news.js';

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
  assert.equal(rows[0].summary, ''); assert.deepEqual(rows[0].countries, ['UA']);
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
  assert.equal(calls.length, 6); assert.equal(result.articles.length, 1); assert.equal(result.sources.filter(value => value.status === 'unavailable').length, 1);
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

test('area searches retrieve hazards and national planning without using publisher country as impact', () => {
  const searches = buildBriefingSearches({ city: 'London', region: 'Ontario', countryCode: 'CA' });
  assert.deepEqual(searches.map(row => row.scope), ['local', 'national', 'macro']);
  assert.match(searches[0].query, /"London" \("Ontario" OR "Canada"\)/);
  for (const hazard of ['outage', 'flood', 'wildfire', 'boil water', 'outbreak']) assert.ok(searches[0].query.includes(hazard));
  assert.match(searches[1].query, /"Canada"/); assert.doesNotMatch(searches[0].query, /sourcecountry:/);
});

test('failed area searches fall back to headline-only RSS and retain honest source status and scope', async () => {
  const location = { city: 'Ottawa', region: 'Ontario', countryCode: 'CA' }; const calls = [];
  const result = await loadPreparednessBriefing({ location, now: () => NOW, gnewsKey: '', fetchImpl: async value => {
    const url = new URL(value); calls.push(url);
    if (url.hostname === 'api.gdeltproject.org') return new Response('unavailable', { status: 503 });
    if (url.hostname === 'news.google.com') {
      const q = url.searchParams.get('q'); const local = q.includes('"Ottawa"'); const national = !local && q.startsWith('"Canada"');
      const title = local ? 'Ottawa flood warning - Local Publisher' : national ? 'Canada emergency supplies advice' : 'Global supply chain disruption';
      return new Response(`<rss><channel><item><title>${title}</title><link>https://news.google.com/rss/articles/${local ? 'local' : national ? 'national' : 'macro'}</link><pubDate>Wed, 28 Oct 2026 12:00:00 GMT</pubDate><description>Do not copy publisher text</description><source>Local Publisher</source></item></channel></rss>`);
    }
    if (url.hostname === 'www.cbc.ca' && url.pathname.endsWith('ottawa')) return new Response(`<rss><channel><item><title>Flood closes roads across the region</title><link>https://www.cbc.ca/news/canada/ottawa/flood</link><pubDate>Wed, 28 Oct 2026 12:00:00 GMT</pubDate><description>Publisher article text</description></item></channel></rss>`);
    return new Response('<rss><channel/></rss>');
  } });
  assert.deepEqual(result.coverageContext, location);
  const local = result.articles.find(row => row.url.endsWith('/local')); assert.equal(local.retrievalScope, 'local'); assert.equal(local.retrievalCountryCode, 'CA'); assert.equal(local.summary, ''); assert.equal(local.source, 'Local Publisher'); assert.equal(local.retrievalEvidence, undefined);
  const regional = result.articles.find(row => row.url.includes('cbc.ca')); assert.equal(regional.retrievalScope, 'regional'); assert.equal(regional.retrievalEvidence, 'regional-feed'); assert.equal(regional.retrievalRegion, 'Ontario'); assert.equal(regional.summary, ''); assert.deepEqual(regional.countries, []);
  assert.equal(result.sources.find(row => row.id === 'gdelt-local').status, 'unavailable');
  assert.equal(result.sources.find(row => row.id === 'google-news-local').scope, 'local');
  assert.ok(result.sources.find(row => row.id === 'cbc-ottawa').name.includes('Ottawa'));
  assert.equal(calls.filter(url => url.hostname === 'news.google.com').length, 3);
  assert.ok(calls.filter(url => url.hostname === 'news.google.com').every(url => !url.searchParams.has('apikey')));
});

test('GNews queries stay inside provider length bounds, keep keys private and preserve macro capacity', async () => {
  const queries = []; const location = { city: 'Ottawa', region: 'Ontario', countryCode: 'CA' };
  const result = await loadPreparednessBriefing({ location, now: () => NOW, gnewsKey: 'fixture-secret', fetchImpl: async value => {
    const url = new URL(value);
    if (url.hostname === 'gnews.io') {
      const q = url.searchParams.get('q'); queries.push(q); assert.ok(q.length <= 200); assert.equal(url.searchParams.get('country'), null);
      return new Response(JSON.stringify({ articles: Array.from({ length: 10 }, (_, i) => ({ title: 'Ottawa emergency flood warning', description: 'Flood advice', url: `https://example.com/${q.includes('Ottawa') ? 'local' : q.startsWith('"Canada"') ? 'national' : 'macro'}/${i}`, publishedAt: '2026-10-28T12:00:00Z' })) }));
    }
    return new Response('<rss><channel/></rss>');
  } });
  assert.equal(queries.length, 3); assert.ok(queries.find(q => q.includes('"Ottawa" AND')));
  assert.ok(result.articles.some(row => row.retrievalScope === 'local')); assert.ok(result.articles.some(row => row.retrievalScope === 'macro'));
  assert.ok(result.articles.length <= 100); assert.doesNotMatch(JSON.stringify(result), /fixture-secret|apikey/);
  const longQueries = [];
  await loadPreparednessBriefing({ location: { city: 'a'.repeat(80), region: 'b'.repeat(80), countryCode: 'JP' }, now: () => NOW, gnewsKey: 'fixture-secret', fetchImpl: async value => { const url = new URL(value); longQueries.push(url); return url.hostname === 'api.gdeltproject.org' || url.hostname === 'gnews.io' ? new Response('{"articles":[]}') : new Response('<rss><channel/></rss>'); } });
  assert.ok(longQueries.some(url => url.hostname === 'api.gdeltproject.org'));
  assert.ok(longQueries.filter(url => url.hostname === 'gnews.io').every(url => url.searchParams.get('q').length <= 200));
});

test('Google publisher attribution cannot become location evidence and vague retirement preparedness is excluded', () => {
  const xml = `<rss><channel><item><title>Ukraine war update - CityNews Ottawa</title><link>https://news.google.com/rss/articles/test</link><pubDate>Wed, 28 Oct 2026 12:00:00 GMT</pubDate><description>Ukraine war update - CityNews Ottawa</description><source>CityNews Ottawa</source></item></channel></rss>`;
  const [row] = parseSyndicatedNews(xml, { id: 'google-news-local', name: 'Google News', url: 'https://news.google.com/', allowedHost: 'news.google.com', headlinesOnly: true, publisherMetadata: true }, NOW);
  assert.equal(row.title, 'Ukraine war update'); assert.equal(row.source, 'CityNews Ottawa'); assert.deepEqual(row.countries, ['UA']); assert.equal(row.summary, '');
  assert.deepEqual(classifyNews('Vehicle collision causes power outage in London').countries, []);
  assert.deepEqual(parseSyndicatedNews(`<feed>${entry('Longevity preparedness in Canada', undefined, undefined, 'Retirement planning advice')}</feed>`, source, NOW), []);
});

test('local candidates survive a flood of newer national and global feed articles', async () => {
  const result = await loadPreparednessBriefing({ location: { city: 'Ottawa', region: 'Ontario', countryCode: 'CA' }, now: () => NOW, gnewsKey: '', fetchImpl: async value => {
    const url = new URL(value);
    if (url.hostname === 'api.gdeltproject.org') {
      const q = url.searchParams.get('query'); const scope = q.includes('"Ottawa"') ? 'local' : q.startsWith('"Canada"') ? 'national' : 'macro';
      return new Response(JSON.stringify({ articles: Array.from({ length: 50 }, (_, i) => ({ title: `${scope === 'local' ? 'Ottawa' : 'Canada'} flood warning ${i}`, url: `https://example.com/${scope}/${i}`, seendate: scope === 'local' ? '20261025T120000Z' : '20261028T120000Z' })) }));
    }
    const host = url.hostname; const prefix = encodeURIComponent(url.pathname + url.search);
    return new Response(`<rss><channel>${Array.from({ length: 30 }, (_, i) => `<item><title>Flood warning ${i}</title><link>https://${host}/${prefix}/${i}</link><pubDate>Wed, 28 Oct 2026 12:00:00 GMT</pubDate></item>`).join('')}</channel></rss>`);
  } });
  assert.equal(result.articles.length, 100);
  assert.equal(result.articles.filter(row => row.retrievalScope === 'local').length, 30);
  assert.ok(result.articles.filter(row => row.retrievalScope === 'macro').length >= 32);
  assert.equal(new Set(result.articles.map(row => row.url)).size, result.articles.length);
});

test('energy-price and shipping disruptions survive topic parsing for wider-impact assessment', () => {
  for (const title of ['Oil prices rise after export disruption', 'Crude markets surge amid Middle East crisis', 'Prices of gas rise sharply', 'Shipping delays spread after Red Sea attacks', 'Blockade disrupts freight through the Suez Canal']) {
    assert.ok(classifyNews(title).topics.includes('infrastructure'), title);
    const rows = parseSyndicatedNews(`<feed>${entry(title, undefined, undefined, '')}</feed>`, source, NOW);
    assert.equal(rows.length, 1, title);
  }
  assert.ok(classifyNews('WHO issues pandemic warning as new outbreak spreads').topics.includes('health'));
  assert.deepEqual(parseSyndicatedNews(`<feed>${entry('What the budget means for energy prices', undefined, undefined, 'Routine financial policy.')}</feed>`, source, NOW), []);
  assert.deepEqual(classifyNews('Shipping industry awards celebrate new office').topics, []);
});

test('headlines need physical hazard evidence rather than metaphorical storm words or routine energy supply', () => {
  const irrelevant = [
    'Covenant House Toronto - The Storm Images — LBB',
    'Covenant House Toronto Turns a Storm of Circumstance into Youth Homelessness Campaign — LBB',
    'Made in Canada: Tenaris’s totally tubular pipes can give the country a self-reliant energy supply chain',
    'Toronto company opens a new energy export office',
    'A storm of political controversy follows the campaign',
  ];
  for (const title of irrelevant) {
    assert.deepEqual(classifyNews(title).topics, [], title);
    assert.deepEqual(parseSyndicatedNews(`<feed>${entry(title, undefined, undefined, '')}</feed>`, { ...source, headlinesOnly: true }, NOW), [], title);
  }
  for (const title of ['Winter storm warning for Toronto', 'Severe storms approach Ontario', 'Flood closes roads across the region', 'Flooding in Toronto', 'Ottawa flood victims wait for relief', 'Wildfire spreads near Vancouver', 'Toronto power outage affects thousands', 'Ontario disaster preparedness checklist']) {
    assert.ok(classifyNews(title).topics.length, title);
    assert.equal(parseSyndicatedNews(`<feed>${entry(title, undefined, undefined, '')}</feed>`, { ...source, headlinesOnly: true }, NOW).length, 1, title);
  }
});

test('incidental energy context cannot turn housing news into a power warning', () => {
  const title = 'Toronto housing market faces fresh uncertainty after Bank of Canada rate hike, real estate experts say';
  const summary = "The Bank of Canada said this week's hike is aimed at reducing the risk of high global oil prices spreading to other products, and signaled further rate hikes. Real estate experts say this could slow the GTA housing market.";
  assert.deepEqual(parseSyndicatedNews(`<feed>${entry(title, undefined, undefined, summary)}</feed>`, { ...source, headlinesOnly: true }, NOW), []);
  assert.deepEqual(parseGnews({ articles: [{ title, description: summary, url: 'https://example.com/housing', publishedAt: '2026-10-28T12:00:00Z' }] }, NOW), []);
  const actual = parseGnews({ articles: [{ title: 'Residents told to stay indoors', description: 'A power outage has disrupted the regional water treatment plant.', url: 'https://example.com/emergency', publishedAt: '2026-10-28T12:00:00Z' }] }, NOW);
  assert.equal(actual.length, 1); assert.ok(actual[0].topics.includes('infrastructure'));
});


test('local public-safety notices are included without treating routine police coverage as an alert', () => {
  for (const headline of ['Police warn Toronto residents after armed threat', 'Toronto issues shelter-in-place notice', 'Road closure following a hazardous spill']) assert.ok(classifyNews(headline).topics.includes('public-safety'), headline);
  assert.ok(!classifyNews('Toronto police charity event celebrates volunteers').topics.includes('public-safety'));
});
