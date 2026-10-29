import { computeEssentialCoverage } from './essential-coverage.js';

const DAY = 86400000;
const BACKUPS = new Set(['generator', 'powerBank', 'batteryBackup', 'ups']);
const REFERENCES = {
  food: { days: 30, low: 7, title: 'Recorded food coverage' },
  water: { days: 14, low: 3, title: 'Stored-water coverage' },
  medical: { days: 30, low: 7, title: 'Prescription coverage' },
  power: { days: 3, low: 1, title: 'Backup power coverage' },
};
const present = value => value !== null && value !== undefined && value !== '';
export function recordedQuantity(value) {
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
export const scopeInventoryItems = (items = [], propertyId) => items.filter(item => item && typeof item === 'object' && (!propertyId || propertyId === 'all' || (item.propertyId || 'prop1') === propertyId));

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
const condition = (id, label, tone, detail, state) => ({ id, label, tone, detail, state });

/** Stock-record checks only: a positive count does not establish usability or
 * sufficiency. Missing optional descriptive fields do not imply a hazard. */
export function inventoryCondition(item, categories = {}, alerts = [], now = Date.now()) {
  const quantity = recordedQuantity(item.quantity);
  if (quantity === null) return condition('unknown', 'Unconfirmed', 'empty', 'Record a valid quantity', 'unknown');
  if (quantity === 0) return condition('empty', 'Out of stock', 'empty', 'No stock recorded', 'empty');
  const sub = categories[item.category]?.subTypes?.[item.subType];
  if (!sub) return condition('unknown', 'Unconfirmed', 'empty', 'Check the category and supply type', 'unknown');
  const date = new Date(now);
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const fields = item.fields || {};
  const expiry = calendarDay(fields.expiryDate);
  const refreshed = calendarDay(fields.lastRefreshed);
  if (expiry !== null) {
    const days = (expiry - today) / DAY;
    if (days < 0) return condition('expired', 'Expired', 'danger', `${Math.abs(days)} days past recorded expiry`, 'attention');
    if (days <= 90) return condition('soon', 'Expiring soon', 'warning', days === 0 ? 'Expires today' : `In ${days} days`, 'attention');
  }
  if (refreshed !== null && refreshed <= today - 150 * DAY) return condition('rotation', 'Refresh due', 'warning', refreshed <= today - 180 * DAY ? 'Refresh overdue' : `Refresh in ${180 - (today - refreshed) / DAY} days`, 'attention');
  const alert = item.id == null ? null : alerts.find(value => value.id === item.id);
  if (alert) return condition('maintenance', 'Review due', 'warning', alert.al || 'Review the recorded reminder', 'attention');
  const needed = sub.fields || [];
  if ((present(fields.expiryDate) && expiry === null) || (needed.includes('expiryDate') && expiry === null)) return condition('unknown', 'Unconfirmed', 'empty', 'Add or correct the expiry date', 'unknown');
  if ((present(fields.lastRefreshed) && (refreshed === null || refreshed > today)) || (needed.includes('lastRefreshed') && refreshed === null)) return condition('unknown', 'Unconfirmed', 'empty', 'Add or correct the refresh date', 'unknown');
  if (item.category === 'food' && !['livestock', 'huntingFishing'].includes(item.subType) && (!(recordedQuantity(fields.calories) > 0) || !(recordedQuantity(fields.servings) > 0))) return condition('unknown', 'Unconfirmed', 'empty', 'Nutrition details are incomplete', 'unknown');
  if (item.category === 'medical' && item.subType === 'prescription' && recordedQuantity(fields.daysSupply) === null) return condition('unknown', 'Unconfirmed', 'empty', 'Record prescription days remaining', 'unknown');
  if (item.category === 'power' && BACKUPS.has(item.subType) && recordedQuantity(fields.runtimeHours) === null) return condition('unknown', 'Unconfirmed', 'empty', 'Record backup runtime at your planned load', 'unknown');
  return condition('ready', 'In stock', 'ready', 'Positive quantity; no recorded checks due', 'ready');
}

export function inventoryMatchesStatus(item, status) {
  const state = item.condition.state;
  if (status === 'all') return true;
  if (status === 'attention') return state === 'attention';
  if (status === 'stocked') return recordedQuantity(item.quantity) > 0;
  return item.condition.id === status;
}

export function buildInventoryVisuals({ items = [], categories = {}, alerts = [], propertyId, now = Date.now() } = {}) {
  const scoped = scopeInventoryItems(items, propertyId);
  const inventory = scoped.map(item => ({ ...item, condition: inventoryCondition(item, categories, alerts, now) }));
  const counts = { ready: 0, attention: 0, empty: 0, unknown: 0 };
  for (const item of inventory) counts[item.condition.state]++;
  const segments = [
    { id: 'ready', label: 'In stock', value: counts.ready, tone: 'good' },
    { id: 'attention', label: 'Needs review', value: counts.attention, tone: 'warning' },
    { id: 'empty', label: 'Out of stock', value: counts.empty, tone: 'danger' },
    { id: 'unknown', label: 'Unconfirmed', value: counts.unknown, tone: 'unknown' },
  ];
  const categoryRows = Object.entries(categories).map(([key, category]) => {
    const entries = inventory.filter(item => item.category === key);
    const types = Object.keys(category.subTypes || {});
    const stocked = new Set(entries.filter(item => recordedQuantity(item.quantity) > 0 && types.includes(item.subType)).map(item => item.subType));
    return { id: key, label: category.label || key, value: stocked.size, max: types.length || 1, valueLabel: `${stocked.size} / ${types.length} types stocked`, tone: 'neutral', recorded: entries.length };
  }).sort((a, b) => b.recorded - a.recorded || a.label.localeCompare(b.label));
  return { items: scoped, inventory, counts, segments, total: inventory.length, categoryRows };
}

export function subtypeStockRows(inventory, category = {}) {
  return Object.entries(category.subTypes || {}).map(([key, type]) => {
    const entries = inventory.filter(item => item.subType === key);
    const stocked = entries.filter(item => recordedQuantity(item.quantity) > 0).length;
    const unknown = entries.some(item => item.condition.state === 'unknown');
    const attention = entries.some(item => item.condition.state === 'attention');
    const empty = entries.some(item => item.condition.state === 'empty');
    return { id: key, label: type.label || key, value: stocked, max: entries.length || 1,
      valueLabel: entries.length ? `${stocked} / ${entries.length} entries in stock` : 'Not recorded',
      tone: attention || empty && stocked ? 'warning' : unknown || !entries.length ? 'unknown' : stocked ? 'good' : 'danger', recorded: entries.length };
  });
}

export function essentialCoverageVisual(category, items, peopleCount, dailyCalTarget = 2000, waterGalPerPerson = 1, inventory = []) {
  const reference = REFERENCES[category];
  if (!reference) return null;
  const contributors = items.filter(item => item.category === category && (category === 'water' ? item.subType === 'storedWater' : category === 'medical' ? item.subType === 'prescription' : category === 'power' ? BACKUPS.has(item.subType) : true));
  const unknownQuantity = contributors.some(item => recordedQuantity(item.quantity) === null);
  const valid = items.filter(item => recordedQuantity(item.quantity) !== null).map(item => item.category === 'food' ? { ...item, fields: { ...item.fields, calories: recordedQuantity(item.fields?.calories) ?? 0, servings: recordedQuantity(item.fields?.servings) ?? 0 } } : item);
  const coverage = computeEssentialCoverage(valid, peopleCount, dailyCalTarget, waterGalPerPerson)[category];
  const value = unknownQuantity ? null : coverage.days;
  const incompleteNutrition = category === 'food' && contributors.some(item => recordedQuantity(item.quantity) > 0 && (!(recordedQuantity(item.fields?.calories) > 0) || !(recordedQuantity(item.fields?.servings) > 0)));
  const partial = incompleteNutrition || inventory.some(item => item.category === category && ['unknown', 'attention'].includes(item.condition.state));
  const tone = value === null ? 'unknown' : value < reference.low ? 'danger' : value < reference.days || partial ? 'warning' : 'good';
  const basis = unknownQuantity ? 'Check quantities before estimating days.' : `${coverage.basis === reference.title ? '' : `${coverage.basis}. `}${coverage.detail}`;
  return { title: reference.title, value, max: reference.days, valueLabel: value === null ? 'Not enough detail' : `${value.toLocaleString()} full ${value === 1 ? 'day' : 'days'}`,
    targetLabel: `${reference.days}-day planning reference`, tone,
    note: `${basis} Low below ${reference.low} ${reference.low === 1 ? 'day' : 'days'}; reference ${reference.days} days.${partial && value !== null ? ' Some entries need review.' : ''}${category === 'medical' ? ' Follow your own refill plan.' : ''}` };
}
