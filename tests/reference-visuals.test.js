import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { REFERENCE_VISUALS, SKILL_VISUALS, MANUAL_CATEGORY_VISUALS } from '../src/reference-visuals.js';
import { SURVIVAL_SKILLS } from '../src/skills-library.js';

test('every skill and supported manual category has a relevant embedded visual', () => {
  assert.deepEqual(Object.keys(SKILL_VISUALS).sort(), SURVIVAL_SKILLS.map(skill => skill.id).sort());
  assert.deepEqual(Object.keys(MANUAL_CATEGORY_VISUALS).sort(), ['electrical', 'hvac', 'plumbing', 'seasonal', 'vehicle']);
  assert.equal(new Set(REFERENCE_VISUALS.map(visual => visual.id)).size, REFERENCE_VISUALS.length);
  for (const visual of [...Object.values(SKILL_VISUALS), ...Object.values(MANUAL_CATEGORY_VISUALS)]) {
    assert.ok(visual.title && visual.alt && visual.caption && visual.sourceUrls.length);
    assert.ok(REFERENCE_VISUALS.includes(visual));
    assert.ok(visual.sourceUrls.every(url => new URL(url).protocol === 'https:'));
  }
});

test('original reference drawings are self-contained and match source assets exactly', async () => {
  for (const visual of REFERENCE_VISUALS) {
    assert.match(visual.path, /^\/guide-illustrations\/reference-[a-z-]+\.svg$/);
    assert.equal(await readFile(new URL(`../public${visual.path}`, import.meta.url), 'utf8'), visual.svg);
    assert.match(visual.svg, /viewBox="0 0 720 400"/);
    assert.match(visual.svg, /<title[^>]*>.+<\/title>/);
    assert.match(visual.svg, /<desc[^>]*>.+<\/desc>/);
    assert.doesNotMatch(visual.svg, /<(?:script|image|foreignObject|iframe)\b|\bon[a-z]+\s*=|(?:href|src)\s*=|@import|url\((?!#)/i);
  }
});

test('high-consequence diagrams preserve the scope and immediate safety boundaries', () => {
  assert.match(SKILL_VISUALS['generator-co'].svg, /6 m \/ 20 ft/);
  assert.match(SKILL_VISUALS['generator-co'].svg, /OUTDOORS ONLY/);
  assert.match(SKILL_VISUALS['safe-water'].svg, /cannot remove fuel/);
  assert.match(SKILL_VISUALS['safe-room'].caption, /not a construction drawing/);
  assert.match(SKILL_VISUALS['stop-bleeding'].caption, /require training/);
  assert.match(SKILL_VISUALS['stop-bleeding'].svg, /EMERGENCY/);
  assert.match(SKILL_VISUALS['protect-wounds'].caption, /minor wounds only/i);
  assert.match(MANUAL_CATEGORY_VISUALS.vehicle.caption, /not a Yamaha, Land Rover or Mercury service illustration/);
  assert.match(MANUAL_CATEGORY_VISUALS.plumbing.caption, /not your model/);
});
