export const FREE_CATEGORY_LIMIT = 20;

// Count distinct inventory entries, not quantities or property-filtered rows.
export function categoryUpgradeNotices(before, after) {
  const count = items => items.reduce((counts, item) => {
    counts.set(item.category, (counts.get(item.category) || 0) + 1);
    return counts;
  }, new Map());
  const previous = count(before);
  return [...count(after)].filter(([category, total]) => total > FREE_CATEGORY_LIMIT && total > (previous.get(category) || 0))
    .map(([category, total]) => ({ category, count: total }));
}
