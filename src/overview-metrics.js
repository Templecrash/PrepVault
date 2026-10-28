const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function quantityState(value) {
  // Missing quantities are incomplete records, not a default unit or zero stock.
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) return 'unknown';
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 'unknown';
  return number > 0 ? 'stocked' : 'zero';
}

/** Counts inventory entries and registered types; never sums unlike units or
 * infers preparedness, duration, or quantity targets from category coverage.
 * The caller supplies the inventory for the currently selected property scope.
 */
export function summarizeOverviewInventory(items = [], categories = {}) {
  const rows = Object.entries(record(categories) ? categories : {}).map(([key, category]) => ({
    key,
    label: typeof category?.label === 'string' && category.label.trim() ? category.label : key,
    types: new Set(Object.keys(record(category?.subTypes) ? category.subTypes : {})),
    stockedTypeKeys: new Set(),
    recordedEntries: 0,
    stockedEntries: 0,
    zeroEntries: 0,
    unknownQuantityEntries: 0,
  }));
  const byKey = new Map(rows.map(row => [row.key, row]));
  const entries = Array.isArray(items) ? items.filter(record) : [];
  const totals = { stockedEntries: 0, zeroEntries: 0, unknownQuantityEntries: 0, unknownCategoryEntries: 0 };

  for (const item of entries) {
    const state = quantityState(item.quantity);
    const field = state === 'stocked' ? 'stockedEntries' : state === 'zero' ? 'zeroEntries' : 'unknownQuantityEntries';
    totals[field] += 1;
    const row = byKey.get(item.category);
    if (!row) { totals.unknownCategoryEntries += 1; continue; }
    row.recordedEntries += 1;
    row[field] += 1;
    if (state === 'stocked' && row.types.has(item.subType)) row.stockedTypeKeys.add(item.subType);
  }

  const categoryRows = rows.map(({ types, stockedTypeKeys, ...row }) => ({
    ...row,
    totalTypes: types.size,
    stockedTypes: stockedTypeKeys.size,
    // If any record is incomplete, "out of stock" would overstate certainty.
    status: row.stockedEntries ? 'stocked' : row.unknownQuantityEntries ? 'unknown' : row.zeroEntries ? 'out-of-stock' : 'unrecorded',
    coveragePercent: types.size ? Math.round(stockedTypeKeys.size / types.size * 100) : null,
  }));
  const coveredCount = categoryRows.filter(row => row.status === 'stocked').length;
  return {
    categoryCount: categoryRows.length,
    coveredCount,
    emptyCount: categoryRows.length - coveredCount,
    totalEntries: entries.length,
    ...totals,
    categories: categoryRows,
    gaps: categoryRows.filter(row => row.status !== 'stocked'),
  };
}
