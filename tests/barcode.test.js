import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraErrorMessage, createBarcodeLookup, createScannedInventoryProduct, expandUpcE, findInventoryProduct, normalizeBarcode, productFromOpenFoodFacts, validateBarcode } from '../src/barcode.js';
import { createBarcodeDecoder } from '../src/barcode-decoder.js';

const categories = { food: { subTypes: { cannedGoods: {}, dryGoods: {} } }, tools: { subTypes: { multiTool: {} } } };
const response = (product, code = '3017620422003') => ({ ok: true, status: 200, json: async () => ({ status: product ? 1 : 0, code, product }) });
const makeCode = stem => {
  let sum = 0;
  for (let i = stem.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) sum += Number(stem[i]) * weight;
  return `${stem}${(10 - sum % 10) % 10}`;
};

test('retail codes retain leading zeroes, accept printing spaces and reject URLs, partial scans and bad check digits', () => {
  assert.equal(normalizeBarcode(' 0 12345-678905 '), '012345678905');
  for (const code of ['012345678905', '3017620422003', '96385074', '00012345678905']) assert.equal(validateBarcode(code).valid, true, code);
  for (const code of ['3017620422004', '12345', 'https://example.com/012345678905', '301762042200a', '', null, 12345678905]) assert.equal(validateBarcode(code).valid, false, String(code));
});

test('UPC-E expands to the equivalent UPC-A and checks that expanded check digit', () => {
  assert.equal(expandUpcE('04252614'), '042100005264');
  assert.deepEqual(validateBarcode('04252614', 'upc_e'), { valid: true, code: '04252614', lookupCode: '042100005264' });
  assert.equal(validateBarcode('04252615', 'upc_e').valid, false);
  assert.equal(validateBarcode('04252614', 'ean_8').valid, false);
});

test('inventory lookup matches equivalent UPC and EAN representations without carrying old batch expiry or quantity', () => {
  const item = { barcode: '012345678905', name: 'My beans', category: 'food', subType: 'cannedGoods', quantity: 8, location: 'Pantry', fields: { expiryDate: '2026-10-01', calories: 200, servings: 2, lastRotated: '2026-01-01' } };
  const result = findInventoryProduct('0012345678905', [item]);
  assert.equal(result.name, 'My beans');
  assert.equal(result.quantity, undefined);
  assert.deepEqual(result.fields, { calories: 200, servings: 2 });
  assert.equal(item.fields.expiryDate, '2026-10-01');
  assert.equal(findInventoryProduct('3017620422003', [item]), null);
});

test('public lookup sends only a checked barcode and public field names, caches results, and omits credentials and referrer', async () => {
  const calls = [];
  const lookup = createBarcodeLookup({ fetchImpl: async (...args) => { calls.push(args); return response({ product_name: 'Beans', brands: 'Example', quantity: '400 g', categories_tags: ['en:canned-foods'], nutriments: { 'energy-kcal_100g': 99 } }); } });
  const product = await lookup('3017620422003');
  assert.equal(product.name, 'Example Beans');
  assert.equal(product.subType, 'cannedGoods');
  assert.deepEqual(product.fields, {}); // Per-100g values cannot be treated as per-serving values.
  assert.equal(calls[0][1].credentials, 'omit');
  assert.equal(calls[0][1].referrerPolicy, 'no-referrer');
  assert.equal(calls[0][1].body, undefined);
  assert.match(calls[0][0], /^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/3017620422003\.json\?fields=/);
  assert.deepEqual(await lookup('3017620422003'), product);
  assert.equal(calls.length, 1);
});

test('saved inventory works without a network, while invalid codes never make requests', async () => {
  let requests = 0;
  const lookup = createBarcodeLookup({ fetchImpl: async () => { requests++; throw new Error('offline'); } });
  const result = await lookup('3017620422003', { items: [{ fields: { barcode: '3017620422003' }, name: 'Saved spread', category: 'food', subType: 'dryGoods' }] });
  assert.equal(result.source, 'inventory');
  assert.equal(requests, 0);
  await assert.rejects(lookup('3017620422004'), /check digit/);
  assert.equal(requests, 0);
});

test('unknown and mismatched products allow manual entry rather than inventing product details', async () => {
  assert.equal(await createBarcodeLookup({ fetchImpl: async () => response(null) })('3017620422003'), null);
  assert.equal(await createBarcodeLookup({ fetchImpl: async () => response({ product_name: 'Wrong product' }, '012345678905') })('3017620422003'), null);
  assert.equal(await createBarcodeLookup({ fetchImpl: async () => ({ ok: false, status: 404 }) })('3017620422003'), null);
  assert.equal(productFromOpenFoodFacts({ nutriments: {} }), null);
  assert.equal(productFromOpenFoodFacts({ product_name: 'Something' }).subType, '');
});

test('timeout, offline, rate limits and explicit cancellation have distinct recoverable outcomes', async () => {
  await assert.rejects(createBarcodeLookup({ fetchImpl: async () => { throw new TypeError('network'); } })('3017620422003'), /unavailable/);
  const slow = createBarcodeLookup({ timeoutMs: 5, fetchImpl: (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))) });
  await assert.rejects(slow('3017620422003'), /timed out/);
  const controller = new AbortController();
  const pending = slow('012345678905', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
  let calls = 0;
  const busy = createBarcodeLookup({ fetchImpl: async () => { calls++; return { ok: false, status: 429 }; } });
  await assert.rejects(busy('3017620422003'), /try again in a minute/);
  await assert.rejects(busy('012345678905'), /try again in a minute/);
  assert.equal(calls, 1);
});

test('the request budget bounds public lookups and expires after one minute', async () => {
  let time = 100000, calls = 0;
  const lookup = createBarcodeLookup({ now: () => time, fetchImpl: async () => { calls++; return { ok: false, status: 404 }; } });
  for (let i = 0; i < 12; i++) await lookup(makeCode(String(10000000000 + i)));
  await assert.rejects(lookup(makeCode('10000000012')), /busy/);
  assert.equal(calls, 12);
  time += 60001;
  assert.equal(await lookup(makeCode('10000000012')), null);
  assert.equal(calls, 13);
});

test('the reviewed inventory payload preserves barcode, user edits, quantity, location and optional expiry', () => {
  const draft = { barcode: '3017620422003', name: ' My food ', category: 'food', subType: 'cannedGoods', quantity: '3', location: ' Pantry ', expiryDate: '2028-02-29', fields: { calories: 250 } };
  assert.deepEqual(createScannedInventoryProduct(draft, categories), { code: '3017620422003', barcode: '3017620422003', name: 'My food', category: 'food', subType: 'cannedGoods', qty: 3, quantity: 3, location: 'Pantry', fields: { barcode: '3017620422003', calories: 250, expiryDate: '2028-02-29' } });
  for (const quantity of ['', 0, -1, 'Infinity', NaN, true, false, [], null]) assert.throws(() => createScannedInventoryProduct({ ...draft, quantity }, categories), /quantity/);
  assert.throws(() => createScannedInventoryProduct({ ...draft, name: '  ' }, categories), /name/);
  assert.throws(() => createScannedInventoryProduct({ ...draft, subType: 'not-real' }, categories), /type/);
  assert.throws(() => createScannedInventoryProduct({ ...draft, expiryDate: '2027-02-29' }, categories), /expiry/);
});

test('camera guidance distinguishes denied permission, missing hardware and a busy camera', () => {
  assert.match(cameraErrorMessage({ name: 'NotAllowedError' }), /permission is blocked/);
  assert.match(cameraErrorMessage({ name: 'NotFoundError' }), /No camera/);
  assert.match(cameraErrorMessage({ name: 'NotReadableError' }), /camera is busy/);
});

test('decoder uses supported native retail formats and falls back when native support is absent or partial', async () => {
  const original = globalThis.BarcodeDetector;
  try {
    let requestedFormats;
    globalThis.BarcodeDetector = class {
      static async getSupportedFormats() { return ['ean_13', 'ean_8', 'upc_a', 'upc_e']; }
      constructor({ formats }) { requestedFormats = formats; }
      async detect() { return [{ rawValue: '3017620422003', format: 'ean_13' }]; }
    };
    const native = await createBarcodeDecoder();
    assert.equal(native.kind, 'native');
    assert.equal((await native.decode({}))[0].rawValue, '3017620422003');
    assert.equal(requestedFormats.includes('qr_code'), false);
    globalThis.BarcodeDetector.getSupportedFormats = async () => ['qr_code'];
    assert.equal((await createBarcodeDecoder()).kind, 'software');
    delete globalThis.BarcodeDetector;
    assert.equal((await createBarcodeDecoder()).kind, 'software');
  } finally {
    if (original) globalThis.BarcodeDetector = original;
    else delete globalThis.BarcodeDetector;
  }
});
