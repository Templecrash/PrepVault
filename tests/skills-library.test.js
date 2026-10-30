import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { filterSurvivalSkills, SKILL_CATEGORIES, SKILL_CONTEXTS, SKILL_LEVELS, SKILLS_REVIEWED_AT, SURVIVAL_SKILLS } from '../src/skills-library.js';

const officialHosts = new Set(['www.nps.gov', 'www.cdc.gov', 'www.redcross.org', 'www.fda.gov', 'www.fema.gov', 'www.ready.gov', 'www.getprepared.gc.ca', 'www.canada.ca', 'www.weather.gov']);

test('skills have concise checklists, primary sources, and available nonclinical handbooks', async () => {
  const books = JSON.parse(await readFile(new URL('../public/handbooks/sources.json', import.meta.url), 'utf8'));
  const byId = new Map(books.map(book => [book.id, book]));
  assert.ok(SURVIVAL_SKILLS.length >= 12 && SURVIVAL_SKILLS.length <= 24);
  assert.equal(new Set(SURVIVAL_SKILLS.map(skill => skill.id)).size, SURVIVAL_SKILLS.length);
  assert.deepEqual(new Set(SURVIVAL_SKILLS.map(skill => skill.category)), new Set(Object.keys(SKILL_CATEGORIES)));
  for (const skill of SURVIVAL_SKILLS) {
    assert.ok(SKILL_CATEGORIES[skill.category], skill.id);
    assert.ok(SKILL_LEVELS[skill.level], skill.id);
    assert.ok(skill.contexts.length > 0 && skill.contexts.every(context => SKILL_CONTEXTS[context]), skill.id);
    assert.ok(skill.description && skill.caution && skill.keywords.length, skill.id);
    assert.ok(skill.checklist.length >= 2 && skill.checklist.length <= 4, skill.id);
    assert.ok(skill.checklist.join(' ').split(/\s+/).length <= 40, `${skill.id}: concise starter checklist`);
    assert.ok(skill.sources.length > 0, `${skill.id}: missing source`);
    for (const source of skill.sources) {
      const url = new URL(source.url);
      assert.equal(url.protocol, 'https:');
      assert.ok(officialHosts.has(url.hostname), `${skill.id}: official source`);
      assert.ok(source.publisher && source.title);
      assert.equal(source.checkedAt, SKILLS_REVIEWED_AT);
    }
    for (const id of skill.handbookIds) {
      assert.ok(byId.has(id), `${skill.id}: missing handbook ${id}`);
      assert.equal(byId.get(id).audience, 'everyone', `${skill.id}: avoid routing beginners into clinical manuals`);
    }
  }
});

test('search finds tasks, synonyms and publishers while combined filters narrow correctly', () => {
  assert.ok(filterSurvivalSkills({ query: 'make fire' }).some(skill => skill.id === 'make-fire'));
  assert.ok(filterSurvivalSkills({ query: 'stop bleeding' }).some(skill => skill.id === 'stop-bleeding'));
  assert.ok(filterSurvivalSkills({ query: 'tourniquet' }).some(skill => skill.id === 'stop-bleeding'));
  assert.ok(filterSurvivalSkills({ query: '  BOIL   water ' }).some(skill => skill.id === 'safe-water'));
  assert.ok(filterSurvivalSkills({ query: 'build' }).some(skill => skill.id === 'safe-room'));
  assert.ok(filterSurvivalSkills({ query: 'Red Cross' }).some(skill => skill.id === 'stop-bleeding'));
  assert.deepEqual(filterSurvivalSkills({ category: 'power', context: 'bug-in', level: 'practice' }).map(skill => skill.id), ['generator-co']);
  assert.equal(filterSurvivalSkills({ category: 'navigation', context: 'bug-in' }).length, 0);
  assert.equal(filterSurvivalSkills({ query: 'unfindable skill xyz' }).length, 0);
  assert.deepEqual(filterSurvivalSkills(), SURVIVAL_SKILLS);
});

test('high-risk topics retain specific safety and training boundaries', () => {
  const byId = new Map(SURVIVAL_SKILLS.map(skill => [skill.id, skill]));
  assert.equal(byId.get('stop-bleeding').level, 'training');
  assert.match(byId.get('stop-bleeding').checklist.join(' '), /call emergency services/i);
  assert.match(byId.get('stop-bleeding').caution, /direct pressure promptly/i);
  assert.match(byId.get('safe-water').caution, /cannot.*chemical/i);
  assert.match(byId.get('safe-water').checklist.join(' '), /3 minutes above 6,500/);
  assert.match(byId.get('generator-co').checklist.join(' '), /6 m \/ 20 ft/);
  assert.match(byId.get('generator-co').caution, /Never.*garage/i);
  assert.equal(byId.get('safe-room').level, 'training');
  assert.match(byId.get('safe-room').caution, /professional/);
  assert.match(byId.get('evacuate').caution, /Do not cross floodwater/);
});
