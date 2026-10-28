import { computeRationing } from './rationing.js';

const DAY = 86400000;
const quantityIsValid = value => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value)) && Number(value) >= 0;
const plural = (count, one, many = `${one}s`) => count === 1 ? one : many;
const nameOf = item => String(item.name || 'Unnamed supply');
const shortList = values => values.slice(0, 3).join(', ') + (values.length > 3 ? ` and ${values.length - 3} more` : '');
const edit = (item, label = 'Review supply') => ({ kind: 'edit', item, label });

// Compare calendar dates, avoiding UTC shifts and daylight-saving day lengths.
function calendarDay(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    const [, year, month, day] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.getTime() : null;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) : null;
}

/**
 * Local, deterministic suggestions from recorded inventory, not an AI assessment.
 * Callers normally pass property-scoped items; propertyId provides an additional
 * scope check when supplied. An unrecorded subtype is never treated as a need.
 */
export function buildInventoryRecommendations({ items = [], categories = {}, categoryKey = null, propertyId, peopleCount = 0, dailyCalTarget = 2000, waterGalPerPerson = 1, alerts = [], now = Date.now() } = {}) {
  const catalogue = categories && typeof categories === 'object' ? categories : {};
  const entries = Object.entries(catalogue).filter(([key, category]) => category && (!categoryKey || key === categoryKey));
  const keys = new Set(entries.map(([key]) => key));
  const scoped = (Array.isArray(items) ? items : []).filter(item => item && typeof item === 'object' && keys.has(item.category) && (!propertyId || propertyId === 'all' || (item.propertyId || 'prop1') === propertyId));
  const valid = scoped.filter(item => quantityIsValid(item.quantity));
  const stocked = valid.filter(item => Number(item.quantity) > 0);
  const knownTypes = entries.flatMap(([category, definition]) => Object.entries(definition.subTypes || {}).map(([subType, type]) => ({ category, subType, label: type?.label || subType })));
  const recordedTypeKeys = new Set(scoped.map(item => `${item.category}/${item.subType}`));
  const stockedTypeKeys = new Set(stocked.map(item => `${item.category}/${item.subType}`));
  const recordedTypes = knownTypes.filter(type => recordedTypeKeys.has(`${type.category}/${type.subType}`));
  const stockedTypes = knownTypes.filter(type => stockedTypeKeys.has(`${type.category}/${type.subType}`));
  const unrecordedTypes = knownTypes.filter(type => !recordedTypeKeys.has(`${type.category}/${type.subType}`));
  const candidates = [];
  const suggest = (id, priority, title, detail, action, icon = 'compass') => candidates.push({ id, priority, title, detail, action, icon });
  const current = new Date(now);
  const today = Number.isFinite(current.getTime()) ? Date.UTC(current.getFullYear(), current.getMonth(), current.getDate()) : null;

  const invalid = scoped.filter(item => !quantityIsValid(item.quantity));
  if (invalid.length) suggest('quantities', 100, `Check ${invalid.length} ${plural(invalid.length, 'quantity', 'quantities')}`, `${nameOf(invalid[0])}${invalid.length > 1 ? ` and ${invalid.length - 1} more` : ''} ${invalid.length === 1 ? 'needs' : 'need'} a valid, non-negative quantity. These entries are excluded from coverage estimates.`, edit(invalid[0], 'Update quantity'), 'edit');

  const dated = stocked.map(item => ({ item, expiry: calendarDay(item.fields?.expiryDate), refresh: calendarDay(item.fields?.lastRefreshed) }));
  const expiring = today === null ? [] : dated.filter(record => record.expiry !== null && record.expiry <= today + 90 * DAY).sort((a, b) => a.expiry - b.expiry);
  if (expiring.length) {
    const past = expiring.filter(record => record.expiry < today).length;
    const upcoming = expiring.length - past;
    const counts = [past && `${past} past the recorded expiry date`, upcoming && `${upcoming} due today or within 90 days`].filter(Boolean).join('; ');
    suggest('expiry', past ? 95 : 75, 'Review expiry dates', `${counts}. Start with ${nameOf(expiring[0].item)} and check its label and condition.`, edit(expiring[0].item, 'Review expiry'), 'clock');
  }

  const invalidDates = dated.filter(({ item, expiry, refresh }) => (item.fields?.expiryDate && expiry === null) || (item.fields?.lastRefreshed && (refresh === null || (today !== null && refresh > today))));
  if (invalidDates.length) suggest('dates', 70, 'Check recorded dates', `${invalidDates.length} ${plural(invalidDates.length, 'entry', 'entries')} ${invalidDates.length === 1 ? 'has' : 'have'} an invalid date or a refresh date in the future. Reminders may be incomplete.`, edit(invalidDates[0].item, 'Correct dates'), 'clock');

  const refreshDue = today === null ? [] : dated.filter(record => record.refresh !== null && record.refresh <= today - 150 * DAY).sort((a, b) => a.refresh - b.refresh);
  const stockIds = new Set(stocked.map(item => item.id).filter(id => id !== undefined && id !== null));
  const scopedAlerts = (Array.isArray(alerts) ? alerts : []).filter(alert => alert && stockIds.has(alert.id) && (!alert.category || keys.has(alert.category)));
  if (refreshDue.length) suggest('refresh', 74, 'Check the next refresh', `${refreshDue.length} ${plural(refreshDue.length, 'entry', 'entries')} ${refreshDue.length === 1 ? 'is' : 'are'} within 30 days of the app’s 180-day refresh reminder, or overdue. Start with ${nameOf(refreshDue[0].item)}; confirm the appropriate interval for the item.`, edit(refreshDue[0].item, 'Review refresh'), 'refresh');
  else if (scopedAlerts.length) {
    const item = stocked.find(record => record.id === scopedAlerts[0].id);
    suggest('reminders', 73, 'Follow up on inventory reminders', `${scopedAlerts.length} ${plural(scopedAlerts.length, 'reminder')} ${scopedAlerts.length === 1 ? 'is' : 'are'} attached to supplies in this view. Review ${nameOf(item)} and update its record after checking it.`, edit(item), 'clock');
  }

  const hasEssentials = keys.has('food') || keys.has('water');
  const ration = hasEssentials ? computeRationing(valid, peopleCount, dailyCalTarget, waterGalPerPerson) : null;
  const coverage = [];
  if (ration && !ration.peopleCount) suggest('dependants', 85, 'Set who this stock supports', 'Mark dependants in Your People to calculate food and stored-water days. The total number of contacts is not used.', { kind: 'people', label: 'Manage dependants' }, 'users');
  if (ration && keys.has('food')) {
    if (!ration.dailyCalTarget) suggest('calorie-target', 82, 'Set your food planning target', 'A daily calorie target is needed before food days can be calculated. Set it in Rationing.', { kind: 'rationing', label: 'Open rationing' }, 'ration');
    if (ration.omittedFoodCount) {
      const missing = ration.foodItems.find(item => item.quantity > 0 && !item.hasCalorieData);
      const original = valid.find(item => item.id === missing.id && item.category === 'food') || missing;
      suggest('nutrition', 80, 'Fill in food nutrition details', `${ration.omittedFoodCount} stocked ${plural(ration.omittedFoodCount, 'entry', 'entries')} ${ration.omittedFoodCount === 1 ? 'is' : 'are'} not counted in food days. Add calories per serving and servings per unit, starting with ${nameOf(missing)}.`, edit(original, 'Add nutrition details'), 'ration');
    }
    coverage.push({ category: 'food', label: 'Recorded food', days: Number.isFinite(ration.foodDays) ? ration.foodDays : null, note: ration.peopleCount && ration.dailyCalTarget ? `${ration.peopleCount} ${plural(ration.peopleCount, 'dependant')} · ${ration.dailyCalTarget.toLocaleString()} cal/person/day${ration.omittedFoodCount ? ' · incomplete nutrition data' : ''}` : 'Set dependants and a calorie target to estimate days' });
  }
  if (ration && keys.has('water')) coverage.push({ category: 'water', label: 'Stored water', days: Number.isFinite(ration.waterDays) ? ration.waterDays : null, note: ration.peopleCount ? `${ration.peopleCount} ${plural(ration.peopleCount, 'dependant')} · ${ration.waterGalPerPerson.toLocaleString()} gal/person/day · sources and treatment add no stored days` : 'Set dependants to estimate days; sources and treatment add no stored days' });

  const empty = valid.filter(item => Number(item.quantity) === 0);
  if (empty.length) suggest('zero-stock', 60, 'Review entries at zero', `${empty.length} ${plural(empty.length, 'entry', 'entries')} ${empty.length === 1 ? 'is' : 'are'} recorded with no stock, starting with ${nameOf(empty[0])}. Confirm the quantity and whether you still want it in this plan.`, edit(empty[0], 'Review quantity'), 'box');

  const unlocated = stocked.filter(item => !String(item.location || '').trim() || String(item.location).trim() === '?');
  if (unlocated.length) suggest('locations', 40, 'Make supplies easy to find', `${unlocated.length} stocked ${plural(unlocated.length, 'entry', 'entries')} ${unlocated.length === 1 ? 'has' : 'have'} no storage location. Record where ${nameOf(unlocated[0])} is kept so it is easier to find in an emergency.`, edit(unlocated[0], 'Add storage location'), 'map');

  if (!scoped.length && entries.length) suggest('start', 55, 'Record what you already have', `No ${categoryKey ? catalogue[categoryKey].label.toLowerCase() : 'supply'} entries are recorded in this view. Add the items you have at this location before assessing what else you need.`, { kind: 'add', categoryKey: categoryKey || undefined, label: 'Add a supply' }, 'plus');
  else if (unrecordedTypes.length) {
    const labels = categoryKey ? unrecordedTypes.map(type => type.label) : entries.filter(([key]) => !scoped.some(item => item.category === key)).map(([, definition]) => definition.label);
    if (labels.length) suggest('unrecorded-types', 30, categoryKey ? 'Consider the types not yet recorded' : 'Review categories without entries', `Not recorded here: ${shortList(labels)}. This does not mean you need all of them; review which apply to your plans.`, categoryKey ? { kind: 'add', categoryKey, label: 'Record another supply' } : { kind: 'category', categoryKey: entries.find(([key]) => !scoped.some(item => item.category === key))?.[0], label: 'Explore a category' }, 'list');
  }

  if (coverage.some(record => record.days !== null)) suggest('coverage', 20, 'Compare coverage with your plans', 'The recorded-day estimates use your current dependant count and Rationing target. Compare them with the duration you want to prepare for; they do not establish that every need is covered.', { kind: 'rationing', label: 'Review rationing' }, 'compass');
  if (stocked.length) suggest('stock-review', 10, 'Keep recorded stock current', `${stocked.length} ${plural(stocked.length, 'entry', 'entries')} ${stocked.length === 1 ? 'has' : 'have'} a positive quantity across ${stockedTypes.length} recorded ${plural(stockedTypes.length, 'type')}. Compare with what is on hand after use, purchases or a move.`, edit(stocked[0], 'Review a supply'), 'check');

  return {
    recordedCount: scoped.length, stockedCount: stocked.length, recordedTypes, stockedTypes, unrecordedTypes, coverage,
    suggestions: candidates.sort((a, b) => b.priority - a.priority).slice(0, 3),
  };
}
