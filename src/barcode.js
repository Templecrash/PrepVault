// Retail GTIN validation. Keep leading zeroes: they are part of the barcode.
export function normalizeBarcode(value) {
  return typeof value === 'string' ? value.trim().replace(/[\s-]/g, '') : '';
}

function validCheckDigit(code) {
  let sum = 0;
  for (let i = code.length - 2, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) sum += Number(code[i]) * weight;
  return (10 - sum % 10) % 10 === Number(code.at(-1));
}

export function expandUpcE(code) {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const [system, a, b, c, d, e, last, check] = code;
  if ('012'.includes(last)) return `${system}${a}${b}${last}0000${c}${d}${e}${check}`;
  if (last === '3') return `${system}${a}${b}${c}00000${d}${e}${check}`;
  if (last === '4') return `${system}${a}${b}${c}${d}00000${e}${check}`;
  return `${system}${a}${b}${c}${d}${e}0000${last}${check}`;
}

export function validateBarcode(value, format) {
  const code = normalizeBarcode(value);
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return { valid: false, code, error: 'Enter all 8, 12, 13 or 14 digits printed beneath the product barcode.' };
  const expanded = code.length === 8 ? expandUpcE(code) : null;
  if (format === 'upc_e') {
    if (expanded && validCheckDigit(expanded)) return { valid: true, code, lookupCode: expanded };
  } else if (validCheckDigit(code)) return { valid: true, code, lookupCode: code };
  else if (!format && expanded && validCheckDigit(expanded)) return { valid: true, code, lookupCode: expanded };
  return { valid: false, code, error: 'The barcode check digit does not match. Check the digits or scan again.' };
}

function barcodeKey(value) {
  const checked = validateBarcode(value);
  return checked.valid ? checked.lookupCode.padStart(14, '0') : null;
}

export function findInventoryProduct(code, items = []) {
  const key = barcodeKey(code);
  if (!key) return null;
  const item = items.find(entry => barcodeKey(entry.barcode || entry.fields?.barcode) === key);
  if (!item) return null;
  const fields = { ...item.fields };
  // A new purchase does not inherit the previous batch's expiry or rotation dates.
  for (const field of ['barcode', 'expiryDate', 'lastRefreshed', 'lastRotated']) delete fields[field];
  return { name: item.name, category: item.category, subType: item.subType, location: item.location || '', fields, source: 'inventory' };
}

export function productFromOpenFoodFacts(product) {
  if (!product || typeof product !== 'object') return null;
  const name = String(product.product_name || product.product_name_en || product.generic_name || '').trim().slice(0, 200);
  if (!name) return null;
  const brand = typeof product.brands === 'string' ? product.brands.split(',')[0].trim().slice(0, 80) : '';
  const tags = new Set(Array.isArray(product.categories_tags) ? product.categories_tags : []);
  let subType = '';
  if (tags.has('en:canned-foods')) subType = 'cannedGoods';
  else if (tags.has('en:freeze-dried-foods')) subType = 'freezeDried';
  else if (tags.has('en:jams')) subType = 'preserves';
  return {
    name: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${name}` : name,
    category: 'food', subType, fields: {}, source: 'openfoodfacts',
    packageSize: typeof product.quantity === 'string' ? product.quantity.slice(0, 80) : '',
  };
}

export class BarcodeLookupError extends Error {
  constructor(message, kind = 'unavailable') { super(message); this.name = 'BarcodeLookupError'; this.kind = kind; }
}

// One requested product at a time, with bounded public-data cache and a 12/minute
// client budget below the provider's 15/minute limit. No plan data is transmitted.
export function createBarcodeLookup({ fetchImpl = (...args) => fetch(...args), now = () => Date.now(), timeoutMs = 8000 } = {}) {
  const cache = new Map();
  let requestTimes = [];
  let retryAfter = 0;
  return async function lookupBarcodeProduct(value, { items = [], signal, format } = {}) {
    const checked = validateBarcode(value, format);
    if (!checked.valid) throw new BarcodeLookupError(checked.error, 'invalid');
    const local = findInventoryProduct(checked.lookupCode, items);
    if (local) return local;
    if (signal?.aborted) throw new DOMException('Lookup cancelled', 'AbortError');
    const key = checked.lookupCode;
    const cached = cache.get(key);
    if (cached && cached.expires > now()) return cached.product;
    requestTimes = requestTimes.filter(time => now() - time < 60000);
    if (retryAfter > now() || requestTimes.length >= 12) throw new BarcodeLookupError('Product lookup is busy. You can enter the item below or try again in a minute.', 'rate-limit');
    requestTimes.push(now());
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, timeoutMs);
    try {
      const fields = 'code,product_name,product_name_en,generic_name,brands,quantity,categories_tags';
      const response = await fetchImpl(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(key)}.json?fields=${fields}`, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } });
      if (response.status === 429) {
        retryAfter = now() + 60000;
        throw new BarcodeLookupError('Product lookup is busy. You can enter the item below or try again in a minute.', 'rate-limit');
      }
      if (!response.ok && response.status !== 404) throw new BarcodeLookupError('Product lookup is unavailable. Enter the item details below.');
      const data = response.status === 404 ? null : await response.json();
      // Do not accept an unrelated product from a malformed or stale response.
      const responseCode = data?.code || data?.product?.code;
      const sameProduct = !responseCode || barcodeKey(String(responseCode)) === barcodeKey(key);
      const product = data?.status === 1 && sameProduct ? productFromOpenFoodFacts(data.product) : null;
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(key, { product, expires: now() + (product ? 3600000 : 300000) });
      return product;
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Lookup cancelled', 'AbortError');
      if (error instanceof BarcodeLookupError) throw error;
      throw new BarcodeLookupError(controller.signal.aborted ? 'Product lookup timed out. Enter the item details below.' : 'Product lookup is unavailable. Enter the item details below.');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  };
}

export const lookupBarcodeProduct = createBarcodeLookup();

export function createScannedInventoryProduct(draft, categories) {
  const checked = validateBarcode(draft.barcode);
  if (!checked.valid) throw new Error(checked.error);
  const name = String(draft.name || '').trim();
  if (!name) throw new Error('Enter a name for this item.');
  if (!categories[draft.category]?.subTypes[draft.subType]) throw new Error('Choose a category and item type.');
  const quantity = typeof draft.quantity === 'number' || typeof draft.quantity === 'string' ? Number(draft.quantity) : NaN;
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Enter a quantity greater than zero.');
  if (draft.expiryDate && (!/^\d{4}-\d{2}-\d{2}$/.test(draft.expiryDate) || Number.isNaN(Date.parse(draft.expiryDate)) || new Date(draft.expiryDate).toISOString().slice(0, 10) !== draft.expiryDate)) throw new Error('Enter a valid expiry date.');
  const fields = { ...draft.fields, barcode: checked.code };
  delete fields.expiryDate;
  if (draft.expiryDate) fields.expiryDate = draft.expiryDate;
  return { code: checked.code, barcode: checked.code, name, category: draft.category, subType: draft.subType, qty: quantity, quantity, location: String(draft.location || '').trim(), fields };
}

export function cameraErrorMessage(error) {
  if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error?.name)) return 'Camera permission is blocked. Allow camera access in your browser, use a photo, or type the barcode below.';
  if (['NotFoundError', 'DevicesNotFoundError'].includes(error?.name)) return 'No camera was found. Use a barcode photo or type the digits below.';
  if (['NotReadableError', 'TrackStartError'].includes(error?.name)) return 'The camera is busy. Close other camera apps and retry, or type the barcode below.';
  return 'The camera could not start. Retry, use a barcode photo, or type the digits below.';
}
