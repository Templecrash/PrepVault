const FRESH_FOR = 15 * 60_000;
const time = value => typeof value === 'string' ? Date.parse(value) : NaN;

export function staleLocationConditions(row, now = Date.now()) {
  if (row?.error) return true;
  if (!row?.data) return false;
  const fetched = time(row.data.fetchedAt);
  return !Number.isFinite(fetched) || now - fetched > FRESH_FOR || fetched > now + 60_000;
}

export function activeOfficialAlerts(alerts, now = Date.now()) {
  if (alerts?.status !== 'ready' || !Array.isArray(alerts.entries)) return [];
  return alerts.entries.filter(alert => alert && Number.isFinite(time(alert.expires)) && time(alert.expires) > now);
}

export function officialAlertNeedsAttention(alert) {
  const severity = typeof alert?.severity === 'string' ? alert.severity.trim().toLowerCase() : '';
  const event = typeof alert?.event === 'string' ? alert.event : '';
  return ['severe', 'extreme', 'red', 'orange'].includes(severity) || /\bwarning\b|\bevacuation immediate\b|\bcivil emergency\b/i.test(event);
}

// These are explicit WMO condition codes, not inferred temperature or wind
// thresholds. A forecast hazard is labelled separately from an official alert.
const hazardForCode = code => {
  if ([96, 99].includes(code)) return 'Thunderstorms with hail';
  if (code === 95) return 'Thunderstorms';
  if ([56, 57].includes(code)) return 'Freezing drizzle';
  if ([66, 67].includes(code)) return 'Freezing rain';
  if ([75, 86].includes(code)) return 'Heavy snow';
  if ([65, 82].includes(code)) return 'Heavy rain';
  return null;
};

export function locationConditionStatus(row, now = Date.now()) {
  const data = row?.data;
  const stale = staleLocationConditions(row, now);
  const entries = activeOfficialAlerts(data?.alerts, now);
  const alertTime = time(data?.alerts?.checkedAt);
  const alertsFresh = !stale && Number.isFinite(alertTime) && now - alertTime <= FRESH_FOR && alertTime <= now + 60_000;
  const severeEntries = alertsFresh ? entries.filter(officialAlertNeedsAttention) : [];
  const hazards = [];
  if (!stale && data?.weather?.status === 'ready') {
    const current = hazardForCode(data.weather.current?.weatherCode);
    const today = hazardForCode(data.weather.today?.weatherCode);
    if (current) hazards.push({ label: current, timing: 'Current conditions' });
    if (today && today !== current) hazards.push({ label: today, timing: 'Forecast today' });
  }
  const tone = severeEntries.length || hazards.length ? 'danger' : 'neutral';
  let summary = 'Checking conditions';
  if (stale) summary = data ? 'Previous check · refresh needed' : 'Conditions unavailable';
  else if (severeEntries.length) summary = `${severeEntries.length} ${severeEntries.length === 1 ? 'alert' : 'alerts'} to review`;
  else if (hazards.length) summary = `${hazards[0].label}${hazards[0].timing === 'Forecast today' ? ' forecast' : ''}`;
  else if (data?.alerts?.status === 'ready' && !alertsFresh) summary = 'Previous alerts · refresh needed';
  else if (entries.length) summary = `${entries.length} official ${entries.length === 1 ? 'notice' : 'notices'}`;
  else if (data?.alerts?.status === 'unsupported') summary = 'Official alerts not covered';
  else if (data?.alerts?.status === 'ready') summary = alertsFresh ? 'No weather alerts returned' : 'Alert check is out of date';
  else if (data) summary = 'Alerts unavailable';
  return { tone, stale, alertsFresh, entries, severeEntries, hazards, summary };
}
