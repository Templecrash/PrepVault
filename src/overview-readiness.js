export function categoryReadiness(row, coverage, alerts = []) {
  const days = Number.isFinite(coverage?.days) ? Math.max(0, Math.floor(coverage.days)) : null;
  const critical = alerts.some(alert => alert.ac?.toLowerCase() === '#ef4444' || ['critical', 'high', 'red'].includes(alert.severity));
  let level = row.stockedEntries ? 'good' : row.unknownQuantityEntries ? 'unknown' : 'bad';
  let statusLabel = row.stockedEntries ? 'In stock' : row.unknownQuantityEntries ? 'Check amounts' : 'No stock';
  let detail = `${row.stockedEntries ?? 0} entries with stock. ${alerts.length} reminders. This assesses recorded inventory, not a guarantee of readiness.`;
  if (row.zeroEntries || row.unknownQuantityEntries || alerts.length) { if (level === 'good') level = 'ok'; statusLabel = 'Review'; }
  if (coverage && days === null && row.stockedEntries) { level = 'ok'; statusLabel = 'Add details'; detail = coverage.detail || 'Add the details needed to estimate coverage.'; }
  if (days !== null) {
    const thresholds = row.key === 'water' ? [3, 14] : row.key === 'power' ? [1, 3] : [7, 30];
    level = days < thresholds[0] ? 'bad' : days < thresholds[1] ? 'ok' : 'good';
    if ((alerts.length || row.unknownQuantityEntries || /need.*nutrition|missing/i.test(coverage.detail || '')) && level === 'good') level = 'ok';
    statusLabel = `${days} days`;
    detail = `${coverage.basis || 'Recorded coverage'}: ${days} full days. ${coverage.detail || 'Based on recorded amounts.'} App scale: low below ${thresholds[0]}, review below ${thresholds[1]} days.`;
  }
  if (critical) { level = 'bad'; detail += ' An urgent inventory reminder needs attention.'; }
  return { days, level, statusLabel, detail };
}

const READINESS_GROUPS = [
  { key: 'essentials', label: 'Daily essentials', description: 'Food, water, health and everyday care.', categories: ['food', 'water', 'medical', 'hygiene', 'clothing', 'kids', 'pets'] },
  { key: 'home', label: 'Home & systems', description: 'Shelter, energy, equipment and communications.', categories: ['shelter', 'power', 'fuel', 'firewood', 'batteries', 'lighting', 'comms', 'electronics', 'tools', 'equipment', 'defense', 'firearms', 'nbc'] },
  { key: 'resilience', label: 'Mobility & resilience', description: 'Getting out, growing food and longer-term resources.', categories: ['bugout', 'vehicles', 'boat', 'farm', 'livestock', 'fishing', 'books', 'bullion', 'alcohol', 'recreational'] },
];
const LEVEL_ORDER = { bad: 0, unknown: 1, ok: 2, good: 3 };

/** Roll up category states without treating unlike supplies as a shared score.
 * The caller provides categories, coverage and reminders for one property scope.
 */
export function buildReadinessGroups(categories = [], coverage = {}, priorities = []) {
  const groups = READINESS_GROUPS.map(group => ({ ...group, rows: [], counts: { good: 0, ok: 0, bad: 0, unknown: 0 }, total: 0, attentionCount: 0, goodCount: 0 }));
  const groupByCategory = new Map(groups.flatMap(group => group.categories.map(key => [key, group])));
  const alertsByCategory = new Map();
  for (const alert of priorities) {
    const alerts = alertsByCategory.get(alert.category) || [];
    alerts.push(alert); alertsByCategory.set(alert.category, alerts);
  }
  for (const row of categories) {
    const group = groupByCategory.get(row.key) || groups[2];
    const alerts = alertsByCategory.get(row.key) || [];
    const readiness = categoryReadiness(row, coverage?.[row.key], alerts);
    group.rows.push({ ...row, ...readiness, alertCount: alerts.length });
    group.counts[readiness.level] += 1;
    group.total += 1;
    if (readiness.level === 'good') group.goodCount += 1;
    else group.attentionCount += 1;
  }
  return groups.map(({ categories: order, ...group }) => {
    const position = key => { const index = order.indexOf(key); return index < 0 ? order.length : index; };
    group.rows.sort((left, right) => LEVEL_ORDER[left.level] - LEVEL_ORDER[right.level] || position(left.key) - position(right.key) || (left.label || left.key).localeCompare(right.label || right.key));
    return group;
  });
}
