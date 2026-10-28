import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FARM_VISUALS,FARM_GUIDE_VISUALS} from '../src/farm-visuals.js';
import {CROP_GUIDES} from '../src/growing-crops.js';
import {FRUIT_GUIDES} from '../src/growing-fruit.js';
import {LIVESTOCK_GUIDES,FARM_METHOD_GUIDES} from '../src/growing-livestock.js';
const guides=[...CROP_GUIDES,...FRUIT_GUIDES,...LIVESTOCK_GUIDES,...FARM_METHOD_GUIDES];

test('every farm guide has a relevant source-attributed task diagram',()=>{
  assert.equal(Object.keys(FARM_GUIDE_VISUALS).length,guides.length);
  assert.ok(FARM_VISUALS.length>=30);
  assert.equal(new Set(FARM_VISUALS.map(v=>v.id)).size,FARM_VISUALS.length);
  for(const guide of guides){
    const visual=FARM_GUIDE_VISUALS[guide.id];
    assert.ok(visual,guide.id);
    assert.ok(visual.title&&visual.alt&&visual.caption,guide.id);
    assert.ok(visual.sourceUrls.length,guide.id);
    assert.ok(visual.sourceUrls.every(url=>guide.sources.some(source=>source.url===url)),guide.id);
  }
  assert.equal(FARM_GUIDE_VISUALS['crop-okra'].id,'tender-pods');
  assert.equal(FARM_GUIDE_VISUALS['animal-geese'].id,'pasture-geese');
  assert.equal(FARM_GUIDE_VISUALS['animal-sheep'].id,'pasture-sheep');
  assert.equal(FARM_GUIDE_VISUALS['animal-equines'].id,'pasture-equines');
});

test('original SVG assets exactly match the embedded offline copies and contain no active or remote content',async()=>{
  for(const visual of FARM_VISUALS){
    assert.match(visual.path,/^\/guide-illustrations\/farm-[a-z0-9-]+\.svg$/);
    assert.equal(await readFile(new URL(`../public${visual.path}`,import.meta.url),'utf8'),visual.svg,visual.id);
    assert.match(visual.svg,/<svg[^>]+viewBox="0 0 720 420"/);
    assert.match(visual.svg,/<title id="title">/);
    assert.match(visual.svg,/<desc id="description">/);
    assert.doesNotMatch(visual.svg,/<(?:script|foreignObject|iframe|image|style)\b|\bon[a-z]+\s*=|\bhref\s*=/i,visual.id);
    assert.ok(visual.sourceUrls.every(url=>new URL(url).protocol==='https:'));
  }
});
