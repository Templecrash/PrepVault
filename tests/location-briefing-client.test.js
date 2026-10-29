import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBriefing, filterBriefing, availableBriefingCountry, briefingHighlights, shortBriefingText, getPreparednessBriefing } from '../src/location-briefing.js';

const article = overrides => ({ id: 'one', title: 'Example report', summary: 'A source description.', source: 'Example source', url: 'https://example.org/report', publishedAt: '2026-10-28T10:00:00Z', kind: 'news', topics: ['conflict'], countries: ['JP'], ...overrides });
const payload = articles => ({ fetchedAt: '2026-10-28T12:00:00Z', articles, sources: [{ name: 'Example source', status: 'ready', url: 'https://example.org' }], guidance: [] });

test('briefing validation removes unsafe links and duplicates without inventing dates or official status', () => {
  const result = normalizeBriefing(payload([article(), article(), article({ url: 'javascript:alert(1)' }), article({ url: 'https://user:secret@example.org' }), article({ id: 'two', url: 'https://example.org/indexed', publishedAt: 'bad-date', observedAt: '2026-10-28T11:00:00Z', kind: 'urgent', topics: ['conflict', 'untrusted'], countries: ['JP', 'Japan'] })]));
  assert.equal(result.articles.length, 2);
  assert.equal(result.articles[1].publishedAt, null);
  assert.equal(result.articles[1].observedAt, '2026-10-28T11:00:00.000Z');
  assert.equal(result.articles[1].kind, 'news');
  assert.deepEqual(result.articles[1].countries, ['JP']);
  assert.deepEqual(result.articles[1].topics, ['conflict']);
  assert.throws(() => normalizeBriefing({ articles: [], sources: [], fetchedAt: 'unknown' }), /incomplete/);
  assert.equal(normalizeBriefing(payload([article({ dateBasis: 'updated' })])).articles[0].dateBasis, 'updated');
});

test('country filters match report countries and keep worldwide reporting independent of watched cities', () => {
  const articles = normalizeBriefing(payload([article(), article({ id: 'two', url: 'https://example.org/uk', countries: ['GB'], topics: ['preparedness'] }), article({ id: 'three', url: 'https://example.org/global', countries: [], topics: ['disasters'] })])).articles;
  assert.equal(filterBriefing(articles, { watchedCountries: ['CA'] }).length, 3);
  assert.equal(filterBriefing(articles, { country: 'watched', watchedCountries: ['CA'] }).length, 0);
  assert.equal(filterBriefing(articles, { country: 'JP' })[0].id, 'one');
  assert.equal(filterBriefing(articles, { topic: 'preparedness', country: 'GB' })[0].id, 'two');
});

test('TLDR uses actual source text across topics without adding personal-risk claims', () => {
  const values = [article({ id: 'one' }), article({ id: 'two' }), article({ id: 'three', topics: ['preparedness'], summary: '' }), article({ id: 'four', topics: ['disasters'] })];
  assert.deepEqual(briefingHighlights(values, 3).map(value => value.id), ['one', 'three', 'four']);
  assert.equal(shortBriefingText(values[0]), 'A source description.');
  assert.equal(shortBriefingText(values[2]), 'Example report');
  assert.ok(shortBriefingText(article({ summary: 'Long publisher text '.repeat(40) })).length <= 220);
});

test('removing watched cities cannot leave a hidden country filter applied', () => {
  assert.equal(availableBriefingCountry('FR', ['GB', 'JP', 'CA', 'US', 'FR'], true), 'FR');
  assert.equal(availableBriefingCountry('FR', ['GB', 'JP', 'CA', 'US'], true), 'all');
  assert.equal(availableBriefingCountry('watched', ['GB', 'JP', 'CA', 'US'], false), 'all');
  assert.equal(availableBriefingCountry('watched', ['GB', 'JP', 'CA', 'US'], true), 'watched');
  assert.equal(availableBriefingCountry('JP', ['GB', 'JP', 'CA', 'US'], false), 'JP');
});

test('global briefing request sends no coordinates, watched cities or account credentials', async () => {
  const data = await getPreparednessBriefing({ fetchImpl: async (url, options) => {
    assert.equal(url, '/api/location-briefing');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.body, undefined);
    assert.ok(options.signal);
    return Response.json(payload([]));
  } });
  assert.deepEqual(data.articles, []);
  await assert.rejects(getPreparednessBriefing({ fetchImpl: async () => Response.json({ error: 'Feeds unavailable.' }, { status: 503 }) }), /Feeds unavailable/);
});

test('area brief sends selected city context only and rejects a mismatched-city response', async () => {
  const location = { name: 'Ottawa', region: 'Ontario', countryCode: 'CA', latitude: 45.42, longitude: -75.69, privateAddress: 'PRIVATE', country: 'Canada' };
  const coverageContext = { city: 'Ottawa', region: 'Ontario', countryCode: 'CA' };
  const data = await getPreparednessBriefing({ location, fetchImpl: async (url, options) => {
    assert.deepEqual(Object.fromEntries(new URL(url, 'https://prep.example').searchParams), coverageContext);
    assert.doesNotMatch(url, /latitude|longitude|PRIVATE|45.42|75.69/); assert.equal(options.credentials, 'omit');
    return Response.json({ ...payload([]), coverageContext });
  } });
  assert.deepEqual(data.coverageContext, coverageContext);
  await assert.rejects(getPreparednessBriefing({ location, fetchImpl: async () => Response.json({ ...payload([]), coverageContext: { ...coverageContext, city: 'Toronto' } }) }), /did not match the selected city/);
  await assert.rejects(getPreparednessBriefing({ location, fetchImpl: async () => Response.json(payload([])) }), /did not match the selected city/);
});
