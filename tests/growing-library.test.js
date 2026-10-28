import test from 'node:test';
import assert from 'node:assert/strict';
import { FARM_GUIDES, FARM_GUIDE_CLIMATES, FARM_GUIDE_GROUPS, filterFarmGuides, farmGuidesToHtml } from '../src/growing-library.js';

test('farm catalog provides original checklists and attributed HTTPS references across every collection', () => {
  assert.ok(FARM_GUIDES.length >= 75, 'Broad plant, animal and method coverage');
  assert.equal(new Set(FARM_GUIDES.map(guide => guide.id)).size, FARM_GUIDES.length);
  assert.deepEqual(new Set(FARM_GUIDES.map(guide => guide.group)), new Set(Object.keys(FARM_GUIDE_GROUPS)));
  for (const guide of FARM_GUIDES) {
    assert.match(guide.id, /^[a-z0-9-]+$/);
    assert.ok(guide.title && guide.summary && guide.season && guide.caution, guide.id);
    assert.ok(FARM_GUIDE_CLIMATES[guide.climate], guide.id);
    assert.ok(guide.steps.length >= 3 && guide.steps.length <= 5, guide.id);
    assert.ok(guide.steps.every(step => typeof step === 'string' && step.trim()), guide.id);
    assert.ok(guide.keywords.length && guide.sources.length, guide.id);
    assert.equal(new Set(guide.sources.map(source => source.url)).size, guide.sources.length);
    for (const source of guide.sources) {
      const url = new URL(source.url);
      assert.equal(url.protocol, 'https:');
      assert.equal(url.username + url.password, '');
      assert.ok(source.title && source.publisher && source.region, guide.id);
    }
  }
});

test('search combines words, sources and independent topic/climate filters', () => {
  assert.ok(filterFarmGuides({ query: '  TOMATO  ' }).some(guide => /tomato/i.test(guide.title)));
  assert.ok(filterFarmGuides({ query: 'chicken', group: 'livestock' }).length > 0);
  assert.equal(filterFarmGuides({ query: 'chicken', group: 'nuts' }).length, 0);
  const focus = filterFarmGuides({ group: 'fruit', climate: 'warm-climate' });
  assert.ok(focus.length > 0);
  assert.ok(focus.every(guide => guide.group === 'fruit' && guide.climate === 'warm-climate'));
  assert.ok(filterFarmGuides({ query: 'extension' }).length > 0);
  assert.equal(filterFarmGuides({ query: 'nothing-matches-123456' }).length, 0);
  assert.deepEqual(filterFarmGuides(), FARM_GUIDES);
});

test('collection scopes do not mix livestock and growing topics', () => {
  assert.ok(filterFarmGuides({ scope: 'grow' }).every(guide => !['livestock', 'farm-methods'].includes(guide.group)));
  assert.ok(filterFarmGuides({ scope: 'livestock' }).every(guide => guide.group === 'livestock'));
  assert.ok(filterFarmGuides({ scope: 'farm-methods' }).every(guide => guide.group === 'farm-methods'));
  assert.equal(filterFarmGuides({ scope: 'livestock', group: 'fruit' }).length, 0);
});

test('offline field guide is self-contained, readable without scripts, and exports only the selected guides', () => {
  const guides = filterFarmGuides({ group: 'livestock' });
  const html = farmGuidesToHtml(guides);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /without internet, JavaScript or account sign-in/);
  assert.match(html, /publisher manuals.*need internet access/);
  assert.equal((html.match(/<article /g) || []).length, guides.length);
  assert.equal((html.match(/href="#guide-/g) || []).length, guides.length);
  assert.doesNotMatch(html, /<(?:script|iframe|img|link|form)\b|\bsrc\s*=|url\(/i);
  for (const guide of guides) assert.ok(html.includes(guide.title));
  assert.throws(() => farmGuidesToHtml([]), /at least one/);
});

test('offline export escapes content and drops unsafe reference links', () => {
  const html = farmGuidesToHtml([{ ...FARM_GUIDES[0], title: '<script>alert(1)</script>',
    summary: '" onmouseover="bad', steps: ['<img src=x onerror=bad>', 'Step 2', 'Step 3'],
    sources: [{ title: 'No executable link', url: 'javascript:alert(1)', publisher: 'Bad', region: 'Anywhere' },
      { title: 'No credentials', url: 'https://user:secret@example.com', publisher: 'Bad', region: 'Anywhere' }],
  }]);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script|<img|href="javascript:|user:secret|onmouseover="/);
});
