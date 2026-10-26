import test from 'node:test';
import assert from 'node:assert/strict';
import { imageSize, imageToData, MAX_MAP_IMAGE_LENGTH, normalizeCrop, pointOnMap } from '../src/map-images.js';

function canvasEnvironment(t, encode = () => 'data:image/jpeg;base64,aW1hZ2U=') {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const calls = { fill: [], draw: [], encode: [] };
  const context = { fillRect: (...args) => calls.fill.push(args), drawImage: (...args) => calls.draw.push(args) };
  const canvas = { getContext: () => context, toDataURL: (...args) => { calls.encode.push(args); return encode(...args); } };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: tag => { assert.equal(tag, 'canvas'); return canvas; } } });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete globalThis.document;
  });
  return { calls, canvas };
}

test('map images fit their longest edge while preserving landscape, portrait and square proportions', () => {
  assert.deepEqual(imageSize(4000, 2000), { width: 1800, height: 900 });
  assert.deepEqual(imageSize(2000, 4000), { width: 900, height: 1800 });
  assert.deepEqual(imageSize(2400, 2400), { width: 1800, height: 1800 });
  assert.deepEqual(imageSize(2400, 1200, 1200), { width: 1200, height: 600 });
});

test('image sizing does not upscale small screenshots and never rounds a valid edge to zero', () => {
  assert.deepEqual(imageSize(640, 480), { width: 640, height: 480 });
  assert.deepEqual(imageSize(1800, 900), { width: 1800, height: 900 });
  assert.deepEqual(imageSize(10_000, 1), { width: 1800, height: 1 });
});

test('image sizing rejects missing, nonnumeric and impossible source dimensions', () => {
  for (const size of [undefined, null, 0, -1, NaN, Infinity, '640']) {
    assert.throws(() => imageSize(size, 480), /invalid dimensions/);
    assert.throws(() => imageSize(640, size), /invalid dimensions/);
  }
});

test('marker positions account for the image offset instead of the page origin', () => {
  const rect = { left: 120, top: 240, width: 800, height: 400 };
  assert.deepEqual(pointOnMap(120, 240, rect), { x: 0, y: 0 });
  assert.deepEqual(pointOnMap(520, 440, rect), { x: 50, y: 50 });
  assert.deepEqual(pointOnMap(920, 640, rect), { x: 100, y: 100 });
});

test('the same image location retains its percentage coordinates after a responsive resize', () => {
  const desktop = pointOnMap(900, 400, { left: 300, top: 100, width: 1200, height: 600 });
  const mobile = pointOnMap(190, 280, { left: 16, top: 193, width: 348, height: 174 });
  assert.deepEqual(desktop, { x: 50, y: 50 });
  assert.deepEqual(mobile, desktop);
});

test('captured pointer movement outside the image clamps crop and marker positions to its edges', () => {
  const rect = { left: 20, top: 30, width: 200, height: 100 };
  assert.deepEqual(pointOnMap(-40, -50, rect), { x: 0, y: 0 });
  assert.deepEqual(pointOnMap(500, 500, rect), { x: 100, y: 100 });
  assert.deepEqual(pointOnMap(-40, 500, rect), { x: 0, y: 100 });
});

test('hidden or unmeasured map elements cannot produce marker coordinates', () => {
  assert.equal(pointOnMap(10, 20, { left: 0, top: 0, width: 0, height: 100 }), null);
  assert.equal(pointOnMap(10, 20, { left: 0, top: 0, width: 100, height: 0 }), null);
});

test('crop bounds are identical when dragging from any corner and do not mutate input points', () => {
  const expected = { x: 10, y: 20, width: 60, height: 50 };
  for (const [a, b] of [
    [{ x: 10, y: 20 }, { x: 70, y: 70 }],
    [{ x: 70, y: 70 }, { x: 10, y: 20 }],
    [{ x: 70, y: 20 }, { x: 10, y: 70 }],
    [{ x: 10, y: 70 }, { x: 70, y: 20 }],
  ]) {
    const before = structuredClone([a, b]);
    assert.deepEqual(normalizeCrop(a, b), expected);
    assert.deepEqual([a, b], before);
  }
  assert.deepEqual(normalizeCrop({ x: 50, y: 50 }, { x: 50, y: 50 }), { x: 50, y: 50, width: 0, height: 0 });
});

test('image preparation converts crop percentages to source pixels and saves the matching output dimensions', t => {
  const { calls, canvas } = canvasEnvironment(t);
  const image = { naturalWidth: 4000, naturalHeight: 2000 };
  const output = imageToData(image, { x: 10, y: 20, width: 50, height: 60 });
  assert.deepEqual(output, { dataUrl: 'data:image/jpeg;base64,aW1hZ2U=', width: 1800, height: 1080 });
  assert.deepEqual(calls.draw, [[image, 400, 400, 2000, 1200, 0, 0, 1800, 1080]]);
  assert.deepEqual(calls.fill, [[0, 0, 1800, 1080]], 'transparent screenshots receive a solid background');
  assert.equal(canvas.width, output.width);
  assert.equal(canvas.height, output.height);
});

test('image preparation rejects invalid or out-of-image crop ranges before drawing', () => {
  const full = { x: 0, y: 0, width: 100, height: 100 };
  for (const change of [{ x: -1 }, { y: -1 }, { x: NaN }, { y: Infinity }, { x: 90, width: 20 }, { y: 90, height: 20 }, { width: 101 }, { height: NaN }, { width: 0 }, { height: -1 }]) {
    assert.throws(() => imageToData({ width: 1000, height: 1000 }, { ...full, ...change }), /crop|invalid|larger/i, JSON.stringify(change));
  }
});

test('an unusably small crop is rejected while the exact minimum size remains usable', t => {
  assert.throws(() => imageToData({ width: 1000, height: 1000 }, { x: 0, y: 0, width: 7.9, height: 8 }), /at least 80/);
  canvasEnvironment(t);
  const result = imageToData({ width: 1000, height: 1000 }, { x: 0, y: 0, width: 8, height: 8 });
  assert.equal(result.width, 80);
  assert.equal(result.height, 80);
});

test('large images reduce JPEG quality until the encoded map fits the persistence budget', t => {
  const tooLarge = 'x'.repeat(MAX_MAP_IMAGE_LENGTH + 1);
  const { calls } = canvasEnvironment(t, (_type, quality) => quality > 0.65 ? tooLarge : 'data:image/jpeg;base64,aW1hZ2U=');
  const result = imageToData({ width: 1200, height: 800 });
  assert.ok(result.dataUrl.length <= MAX_MAP_IMAGE_LENGTH);
  assert.deepEqual(calls.encode.map(args => args[1]), [0.9, 0.8, 0.65]);
});

test('image preparation fails explicitly when even its last compression attempt exceeds the budget', t => {
  const tooLarge = 'x'.repeat(MAX_MAP_IMAGE_LENGTH + 1);
  const { calls } = canvasEnvironment(t, () => tooLarge);
  assert.throws(() => imageToData({ width: 1200, height: 800 }), /too detailed to save/);
  assert.deepEqual(calls.encode.map(args => args[1]), [0.9, 0.8, 0.65, 0.5]);
});
