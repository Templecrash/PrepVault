import test from 'node:test';
import assert from 'node:assert/strict';
import { articleRelevance, briefingLocationKey, normalizeBriefingLocation, selectRelevantBriefing } from '../src/briefing-relevance.js';
import { briefingHighlights } from '../src/location-briefing.js';

const location = { name: 'Ottawa', region: 'Ontario', countryCode: 'CA', latitude: 45.42, longitude: -75.69 };
const article = (title, extra = {}) => ({ id: title, title, summary: '', topics: ['infrastructure'], countries: [], publishedAt: '2026-10-29T12:00:00Z', ...extra });

test('news location context retains only bounded city, region and country code', () => {
  assert.deepEqual(normalizeBriefingLocation({ ...location, address: 'PRIVATE', user: 'PRIVATE' }), { city: 'Ottawa', region: 'Ontario', countryCode: 'CA' });
  assert.equal(briefingLocationKey(location), briefingLocationKey({ city: 'ottawa', region: 'ontario', countryCode: 'CA' }));
  assert.equal(briefingLocationKey(null), 'global');
  for (const changes of [{ name: 'https://private.example' }, { name: 'Ottawa" OR world' }, { name: 'a'.repeat(101) }, { countryCode: 'Canada' }, { region: 'Ontario\nsecret' }]) assert.throws(() => normalizeBriefingLocation({ ...location, ...changes }));
});

test('local and regional reports rank above newer international events', () => {
  const rows = [
    article('Oil prices surge after supply disruption', { publishedAt: '2026-10-29T15:00:00Z' }),
    article('Canada prepares emergency supplies guidance', { topics: ['preparedness'], countries: ['CA'] }),
    article('Ontario electricity outage warning', { retrievalCountryCode: 'CA' }),
    article('Ottawa outage affects homes', { retrievalScope: 'local', retrievalCountryCode: 'CA' }),
  ];
  const ranked = selectRelevantBriefing(rows, location);
  assert.deepEqual(ranked.map(row => row.relevance.scope), ['local', 'regional', 'national', 'macro']);
  assert.match(ranked[0].relevance.reason, /Ottawa/);
  assert.match(ranked[3].relevance.impact, /could affect.*local shortage is not confirmed/i);
  assert.deepEqual(briefingHighlights(ranked, 3).map(row => row.relevance.scope), ['local', 'national', 'macro']);
});

test('unrelated overseas disasters and diplomatic headlines do not crowd the local briefing', () => {
  for (const row of [
    article('Green flood alert in Romania', { topics: ['disasters'] }),
    article('Earthquake in Japan', { topics: ['disasters'], countries: ['JP'] }),
    article('UN vote on Cuba embargo', { topics: ['conflict'] }),
    article('Canada minister pledges humanitarian aid after Pakistan flood', { topics: ['disasters'], countries: ['CA', 'PK'] }),
    article('Canadian ambassador condemns conflict in Sudan', { topics: ['conflict'], countries: ['CA', 'SD'] }),
    article('BC Wildfire Service members take their call for recognition to Ottawa', { topics: ['disasters'], countries: ['CA'] }),
    article('Evacuation Funds: Group in Ottawa demand transparency', { topics: ['preparedness'], countries: ['CA'] }),
    article('4 in hospital as Toronto police investigate shooting in home', { topics: ['conflict'], countries: ['CA'], retrievalScope: 'national', retrievalCountryCode: 'CA' }),
    article('GAD modelling supports pandemic preparedness work', { topics: ['preparedness'] }),
    article('World News in Brief: Iran nuclear inspections', { topics: ['conflict'] }),
    article('World News in Brief: Iran nuclear inspections, deadly church attack in Jordan', { topics: ['conflict'] }),
    article('Worries run high two weeks into Bell Island fuel shortage'),
    article('Police investigate home invasion in another country', { topics: ['conflict'] }),
    article('Alien invasion threatens nuclear war in a new film review', { topics: ['conflict'] }),
    article('Universities study pandemic-era cases', { topics: ['health'] }),
  ]) assert.equal(articleRelevance(row, location), null, row.title);
});

test('same-named cities and country-of-publisher do not establish local impact', () => {
  const london = { name: 'London', region: 'Ontario', countryCode: 'CA' };
  assert.equal(articleRelevance(article('London England flood warning', { topics: ['disasters'], countries: ['GB'], retrievalCountryCode: 'CA' }), london), null);
  assert.equal(articleRelevance(article('London Ontario flood warning', { topics: ['disasters'], countries: ['GB'], retrievalCountryCode: 'CA' }), london).scope, 'local');
  assert.equal(articleRelevance(article('Ottawa Kansas power outage', { countries: ['US'], retrievalCountryCode: 'CA' }), location), null);
  assert.equal(articleRelevance(article('Power restored after a storm', { retrievalScope: 'local', retrievalCountryCode: 'CA' }), location), null);
  assert.equal(articleRelevance(article('Green flooding in Japan', { topics: ['disasters'], countries: ['JP'], sourcecountry: 'Canada' }), location), null);
  assert.equal(articleRelevance(article('Rare ceasefire offers hope in Ukraine - CityNews Ottawa', { topics: ['conflict'], countries: ['UA'], source: 'CityNews Ottawa', retrievalCountryCode: 'CA' }), location), null);
});

test('verified regional feeds provide labelled regional context without pretending a city match', () => {
  const evidence = { retrievalScope: 'regional', retrievalCountryCode: 'CA', retrievalEvidence: 'regional-feed', retrievalRegion: 'Ontario' };
  const relevant = articleRelevance(article('Storm closes several schools', evidence), location);
  assert.equal(relevant.scope, 'regional'); assert.match(relevant.reason, /may concern another community/);
  assert.equal(articleRelevance(article('Storm closes several schools', { ...evidence, retrievalRegion: 'Alberta' }), location), null);
  assert.equal(articleRelevance(article('Japan earthquake warning', { ...evidence, countries: ['JP'], topics: ['disasters'] }), location), null);
  assert.equal(articleRelevance(article('Canada nationwide outage', evidence), location).scope, 'national');
});

test('macro events need an explicit wider mechanism and use conditional planning language', () => {
  const rows = [
    article('Red Sea shipping disruption after attacks'),
    article('Global wheat exports disrupted by war', { topics: ['food-water', 'conflict'] }),
    article('Worldwide payment network outage'),
    article('WHO declares public health emergency of international concern', { topics: ['health'] }),
    article('NATO warns of military escalation', { topics: ['conflict'] }),
  ];
  for (const row of rows) {
    const relevance = articleRelevance(row, location);
    assert.equal(relevance.scope, 'macro', row.title); assert.ok(relevance.reason); assert.ok(relevance.impact);
    assert.doesNotMatch(relevance.impact, /you are in danger|evacuate now|will affect|confirmed local threat/i);
  }
  assert.equal(articleRelevance(article('Local hospital ransomware in Japan', { countries: ['JP'], topics: ['health'] }), location), null);
  assert.equal(articleRelevance(article('International shipping conference opens'), location), null);
});

test('scope and topic filtering retain local-plus-regional meaning and deduplicate headlines', () => {
  const rows = [article('Ottawa power outage', { countries: ['CA'] }), article('Ontario power outage', { countries: ['CA'] }), article('Canada food shortage', { countries: ['CA'], topics: ['food-water'] }), article('Oil prices surge after a supply disruption')];
  assert.deepEqual(selectRelevantBriefing([...rows, { ...rows[0], id: 'duplicate' }], location, { scope: 'local' }).map(row => row.relevance.scope), ['local', 'regional']);
  assert.equal(selectRelevantBriefing(rows, location, { topic: 'food-water' })[0].relevance.scope, 'national');
  assert.equal(selectRelevantBriefing(rows, location, { scope: 'macro' }).length, 1);
  assert.deepEqual(selectRelevantBriefing(rows, null).map(row => row.relevance.scope), ['macro']);
  assert.equal(selectRelevantBriefing([article('Ask us about emergency supplies', { topics: ['preparedness'] })], { name: 'Boston', region: 'Massachusetts', countryCode: 'US' }).length, 0);
});


test('a capital acting as the government does not turn overseas aid into a local disaster', () => {
  const report = { title: 'Ottawa pledges humanitarian aid after Pakistan flood', summary: '', topics: ['disasters'], countries: ['CA', 'PK'], retrievalCountryCode: 'CA' };
  assert.equal(articleRelevance(report, { city: 'Ottawa', region: 'Ontario', countryCode: 'CA' }), null);
});
