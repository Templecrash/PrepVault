import { computeRationing } from './rationing.js';

const LABELS = { bad: 'Bad', ok: 'OK', good: 'Good', unknown: 'Not assessed' };
const health = (level, detail) => ({ level, label: LABELS[level], detail });
const list = value => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : [];
const hasText = value => typeof value === 'string' && Boolean(value.trim());
const hasDate = value => hasText(value) && Number.isFinite(Date.parse(value));
const validQuantity = value => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value)) && Number(value) >= 0;
const stocked = item => validQuantity(item.quantity) && Number(item.quantity) > 0;
const severity = alert => ['critical', 'high', 'error', 'bad', 'red'].includes(alert.severity) || alert.ac?.toLowerCase() === '#ef4444' ? 'bad' : 'ok';
const countLabel = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

function relevantAlerts(alerts, items, categories) {
  const ids = new Set(items.map(item => item.id));
  return alerts.filter(alert => categories.includes(alert.category) && (!alert.id || ids.has(alert.id)));
}

function reminderHealth(alerts, basis) {
  if (!alerts.length) return null;
  const critical = alerts.filter(alert => severity(alert) === 'bad').length;
  return health(critical ? 'bad' : 'ok', `${basis} ${countLabel(alerts.length, 'reminder')} to review${critical ? `, including ${critical} urgent` : ''}.`);
}

function stockHealth(items, alerts, noun) {
  const positive = items.filter(stocked).length;
  if (!items.length || (positive === 0 && items.every(item => validQuantity(item.quantity)))) return health('bad', `No ${noun} stock recorded for the selected property.`);
  const reminder = reminderHealth(alerts, `${countLabel(positive, 'entry', 'entries')} with recorded stock.`);
  if (reminder) return reminder;
  const incomplete = items.filter(item => !validQuantity(item.quantity) || Number(item.quantity) === 0).length;
  if (incomplete) return health('ok', `${countLabel(positive, 'entry', 'entries')} in stock; ${countLabel(incomplete, 'entry', 'entries')} has zero or unconfirmed quantity.`);
  return health('good', `${countLabel(positive, 'entry', 'entries')} in stock with no recorded reminders. This rates recorded inventory condition.`);
}

function coverageHealth(category, items, alerts, ration) {
  const isFood = category === 'food';
  const relevant = items.filter(item => item.category === category && (isFood || item.subType === 'storedWater'));
  const noun = isFood ? 'food' : 'stored water';
  const positive = relevant.filter(stocked);
  if (!positive.length && relevant.every(item => validQuantity(item.quantity))) return health('bad', `No ${noun} stock recorded for the selected property.`);
  const reminder = reminderHealth(alerts, `Recorded ${noun}.`);
  if (reminder?.level === 'bad') return reminder;
  if (!positive.length) return health('ok', `No confirmed ${noun} quantity. Review the recorded amounts to assess coverage.`);
  if (!ration.peopleCount) return health('ok', `${noun[0].toUpperCase() + noun.slice(1)} recorded; select dependants in Your People to assess days of coverage.`);
  if (isFood && !ration.dailyCalTarget) return health('ok', 'Set a calorie target in Rationing to assess recorded food coverage.');
  const days = isFood ? ration.foodDays : ration.waterDays;
  const lower = isFood ? 7 : 3;
  const target = isFood ? 30 : 14;
  const basis = `${days} full days for ${countLabel(ration.peopleCount, 'dependant')}. App scale: red below ${lower} days, yellow ${lower}–${target - 1}, green ${target}+.`;
  if (!relevant.every(item => validQuantity(item.quantity)) || (isFood && ration.omittedFoodCount > 0)) {
    return health('ok', `${basis} Some quantities or nutrition details are missing; review them before rating coverage good.`);
  }
  if (reminder) return health(days < lower ? 'bad' : 'ok', `${basis} ${countLabel(alerts.length, 'reminder')} to review.`);
  return health(days < lower ? 'bad' : days < target ? 'ok' : 'good', basis);
}

function codeHealth(codes, now) {
  if (!codes.length) return health('bad', 'No code records. Add the access records relevant to your plan.');
  const days = codes.map(code => hasDate(code.lastChanged) ? Math.floor((now - Date.parse(code.lastChanged)) / 86_400_000) : null);
  const overdue = days.filter(day => day !== null && day > 30).length;
  const soon = days.filter(day => day !== null && day > 25 && day <= 30).length;
  const invalid = days.filter(day => day === null || day < 0).length;
  if (overdue) return health('bad', `${countLabel(overdue, 'code record')} past the 30-day rotation reminder. Code values are not assessed.`);
  if (soon || invalid) return health('ok', `${soon} due soon; ${invalid} with missing, invalid or future change dates. Code values are not assessed.`);
  return health('good', `${countLabel(codes.length, 'code record')} within the current rotation window. Code values are not assessed.`);
}

function completionHealth(checks, emptyDetail, subject) {
  const completed = checks.filter(Boolean).length;
  if (!completed) return health('bad', emptyDetail);
  return health(completed === checks.length ? 'good' : 'ok', `${subject}: ${completed} of ${checks.length} planning details recorded.`);
}

function aggregateHealth(statuses, subject) {
  const rated = statuses.filter(status => status && status.level !== 'unknown');
  if (!rated.length) return health('unknown', `${subject} has not been assessed.`);
  const bad = rated.filter(status => status.level === 'bad').length;
  const ok = rated.filter(status => status.level === 'ok').length;
  return health(bad ? 'bad' : ok ? 'ok' : 'good', `${subject}: ${bad} need attention, ${ok} need review, ${rated.length - bad - ok} good. Open the sections for details.`);
}

/**
 * Small navigation signals from the current plan. Supply inputs must already be
 * scoped to the selected property. Reference/live-service pages stay unassessed
 * unless their own live state is available; static examples never imply health.
 */
export function buildNavigationHealth(input = {}) {
  const items = list(input.items);
  const alerts = list(input.alerts);
  const contacts = list(input.contacts);
  const bugOutEntries = list(input.bugOutEntries);
  const codes = list(input.codes);
  const supplyKeys = Array.isArray(input.supplyCategoryKeys) ? input.supplyCategoryKeys : [...new Set(items.map(item => item.category).filter(category => !['food', 'water'].includes(category)))];
  const supplies = items.filter(item => supplyKeys.includes(item.category) && !['food', 'water'].includes(item.category));
  const ration = computeRationing(items, input.peopleCount, input.dailyCalTarget);
  const food = coverageHealth('food', items, relevantAlerts(alerts, items, ['food']), ration);
  const water = coverageHealth('water', items, relevantAlerts(alerts, items, ['water']), ration);
  const preps = stockHealth(supplies, relevantAlerts(alerts, supplies, supplyKeys), 'supply');
  const hasMap = Object.entries(input.mapSetups || {}).some(([id, map]) => map?.image?.dataUrl && (!input.activePropertyId || input.activePropertyId === 'all' || input.activePropertyId === id));
  const routes = list(input.routes).filter(route => !input.activePropertyId || input.activePropertyId === 'all' || route.propertyId === input.activePropertyId);
  const completeContacts = contacts.filter(person => hasText(person.name) && (hasText(person.phone) || hasText(person.email))).length;
  const completeGrabEntries = bugOutEntries.filter(entry => ['name', 'quantity', 'location', 'assignee'].every(key => hasText(entry[key]))).length;
  const commsItems = items.filter(item => item.category === 'comms' || (item.category === 'electronics' && ['radio', 'satPhone', 'cellPhone'].includes(item.subType)));
  const equipment = commsItems.some(stocked);
  const hasCallSigns = list(input.callSigns).some(entry => hasText(entry.sign) && hasText(entry.person));
  const hasRallyPoint = list(input.rallyPoints).some(entry => hasText(entry.name) || hasText(entry.label) || hasText(entry.location));
  const growingCount = ['gardenBeds', 'soilTests', 'compostBins', 'livestock'].reduce((sum, key) => sum + list(input[key]).length, 0);
  const growingStock = items.filter(item => ['farm', 'livestock'].includes(item.category) && stocked(item));
  const results = {
    food, water, preps,
    community: !contacts.length ? health('bad', 'No people recorded. Add your household and contact methods.') : health(completeContacts === contacts.length ? 'good' : 'ok', `${completeContacts} of ${contacts.length} people have a name and contact method. This rates directory completeness.`),
    property: completionHealth([hasDate(input.propertyProfile?.completedAt), hasMap, routes.length > 0], 'Household setup, a saved map and a travel route have not been recorded.', 'Household setup, selected-property map and travel route'),
    comms: completionHealth([equipment, hasCallSigns, hasRallyPoint], 'No stocked communications equipment, call-sign assignments or rally point recorded.', 'Stocked equipment, call-sign assignments and rally point'),
    bugout: !bugOutEntries.length ? health('bad', 'No grab list recorded. Add the items, amounts, locations and people responsible.') : health(completeGrabEntries === bugOutEntries.length ? 'good' : 'ok', `${completeGrabEntries} of ${bugOutEntries.length} grab items have an amount, location and assigned person. Grabbed checks do not affect planning completeness.`),
    codes: codeHealth(codes, Number.isFinite(input.now) ? input.now : Date.now()),
    farming: completionHealth([growingStock.length > 0, growingCount > 0], 'No growing supplies or growing records entered.', 'Growing stock and growing records'),
    simulate: health('unknown', 'Scenario results depend on the scenario and duration selected. Open Scenario lab to review them.'),
    dependencies: health('unknown', 'Dependencies need a household-specific review. Inventory matches alone do not confirm working backups.'),
    surveillance: health('unknown', 'Live camera and alarm status is available inside Surveillance after owner sign-in.'),
    board: health('unknown', 'The public community board has no household health rating.'),
    manuals: health('unknown', 'Reference material has no household health rating. Review manuals for your equipment.'),
    emergency: health('unknown', 'Emergency is a reference library. Check saved copies and your personal emergency plan there.'),
  };
  results.rationing = aggregateHealth([food, water], 'Food and water coverage');
  results.systems = aggregateHealth([food, water, preps], 'Recorded resource condition');
  results.dashboard = aggregateHealth([food, water, preps, results.community, results.property, results.bugout], 'Plan summary');
  return results;
}
