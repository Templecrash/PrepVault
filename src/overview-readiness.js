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
