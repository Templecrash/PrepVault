import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FARM_GUIDES, farmGuidesToHtml } from '../src/growing-library.js';
import { SURVIVAL_SKILLS } from '../src/skills-library.js';
import { FARM_GUIDE_VISUALS } from '../src/farm-visuals.js';
import { SKILL_VISUALS, MANUAL_CATEGORY_VISUALS } from '../src/reference-visuals.js';
import { HANDBOOK_VISUALS, SKILL_HANDBOOK_VISUALS } from '../src/handbook-visuals.js';
import { handbookStartPage, illustrationDataUrl } from '../src/guide-illustration.js';

test('every farm and skills guide has a complete task picture with a self-contained SVG', async () => {
  for (const guide of FARM_GUIDES) assert.ok(FARM_GUIDE_VISUALS[guide.id], guide.id);
  for (const skill of SURVIVAL_SKILLS) assert.ok(SKILL_VISUALS[skill.id], skill.id);
  for (const category of ['plumbing', 'seasonal', 'hvac', 'electrical', 'vehicle']) assert.ok(MANUAL_CATEGORY_VISUALS[category], category);
  const visuals = [...Object.values(FARM_GUIDE_VISUALS), ...Object.values(SKILL_VISUALS), ...Object.values(MANUAL_CATEGORY_VISUALS)];
  const unique = [...new Map(visuals.map(visual => [visual.id, visual])).values()];
  assert.ok(unique.length >= 30, 'Distinct task diagrams rather than one generic image');
  for (const visual of unique) {
    assert.ok(visual.title && visual.alt && visual.caption && visual.svg, visual.id);
    assert.match(visual.svg, /<svg\b/);
    assert.match(visual.svg, /viewBox=/);
    assert.match(visual.svg, /<title[ >]/);
    assert.match(visual.svg, /<desc[ >]/);
    assert.doesNotMatch(visual.svg, /<(?:script|foreignObject|iframe|image)\b|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?!#)|@import/i, visual.id);
    assert.doesNotMatch(visual.svg.replace(/url\(\s*["']?#[\w-]+["']?\s*\)/g, ''), /url\(/i, visual.id);
    assert.equal(decodeURIComponent(illustrationDataUrl(visual).split(',').slice(1).join(',')), visual.svg);
    assert.match(visual.path, /^\/guide-illustrations\/[a-z0-9-]+\.svg$/);
    assert.equal(await readFile(new URL(`../public${visual.path}`, import.meta.url), 'utf8'), visual.svg, visual.id);
  }
});

test('all original handbooks are audited, page shortcuts are valid, and skill shortcuts stay nonclinical', async () => {
  const books = JSON.parse(await readFile(new URL('../public/handbooks/sources.json', import.meta.url), 'utf8'));
  const byId = new Map(books.map(book => [book.id, book]));
  for (const book of books) {
    const visual = HANDBOOK_VISUALS[book.id];
    assert.ok(visual?.summary, book.id);
    assert.ok(['illustrated', 'reference'].includes(visual.status), book.id);
    if (visual.status === 'illustrated') assert.ok(visual.pages.length > 0, book.id);
    for (const page of visual.pages) {
      assert.ok(Number.isSafeInteger(page.page) && page.page > 0 && page.page <= book.pages, book.id);
      assert.ok(page.title && page.description, book.id);
    }
  }
  for (const references of Object.values(SKILL_HANDBOOK_VISUALS)) for (const reference of references) {
    const book = byId.get(reference.bookId);
    assert.equal(book?.audience, 'everyone');
    assert.ok(reference.page > 0 && reference.page <= book.pages);
    assert.ok(HANDBOOK_VISUALS[reference.bookId].pages.some(page => page.page === reference.page));
  }
});

test('download embeds the exact picture for every guide without fetching external images', () => {
  const html = farmGuidesToHtml();
  const sources = [...html.matchAll(/<img src="([^"]+)"/g)].map(match => match[1]);
  assert.equal(sources.length, FARM_GUIDES.length);
  for (const [index, guide] of FARM_GUIDES.entries()) {
    assert.equal(sources[index], illustrationDataUrl(FARM_GUIDE_VISUALS[guide.id]).replace(/'/g, '&#39;'));
  }
  assert.doesNotMatch(html, /<img[^>]*src="(?:https?:|\/)/i);
});

test('illustrated page navigation clamps invalid input and respects one-based PDF pages', () => {
  assert.equal(handbookStartPage(172, 268), 172);
  assert.equal(handbookStartPage(-5, 268), 1);
  assert.equal(handbookStartPage(999, 268), 268);
  assert.equal(handbookStartPage('nonsense', 268), 1);
  assert.equal(handbookStartPage(5.8, 60), 5);
  assert.equal(handbookStartPage(12), 1);
  assert.equal(illustrationDataUrl(null), '');
});
