import { computeRationing } from './rationing.js';

const stockQuantity = value => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

const recordedDuration = value => {
  if (value == null || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const fullDays = value => value != null && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
const format = value => Number.isFinite(value) ? value.toLocaleString() : '—';

function medicationCoverage(items) {
  const basis = 'Recorded medication supply';
  const prescriptions = items.filter(item => item.category === 'medical' && item.subType === 'prescription');
  if (!prescriptions.length) return { days: null, basis, detail: 'Add prescription days to estimate.' };
  if (prescriptions.some(item => stockQuantity(item.quantity) === 0)) return { days: 0, basis, detail: 'At least one prescription is out of stock.' };
  const durations = prescriptions.map(item => recordedDuration(item.fields?.daysSupply));
  if (durations.some(value => value == null)) return { days: null, basis, detail: 'Add days remaining for every prescription.' };
  // Days remaining describes the complete entry, not each unit. Different
  // prescriptions cannot substitute for one another, so the earliest runs out.
  return { days: fullDays(Math.min(...durations)), basis, detail: 'Shortest recorded prescription supply.' };
}

function powerCoverage(items) {
  const basis = 'Longest recorded backup';
  const sources = items.filter(item => item.category === 'power' && ['generator', 'powerBank'].includes(item.subType));
  if (!sources.length) return { days: null, basis, detail: 'Add backup runtime details to estimate.' };
  const stocked = sources.filter(item => stockQuantity(item.quantity) > 0);
  if (!stocked.length) return { days: 0, basis, detail: 'No generator or power bank in stock.' };
  const durations = stocked.map(item => recordedDuration(item.fields?.runtimeHours));
  if (durations.some(value => value == null)) return { days: null, basis, detail: 'Add runtime for every stocked backup.' };
  // Each runtime covers its complete supply entry at the intended load with
  // current fuel/charge. Adding sources could double-count shared fuel or load.
  const hours = Math.max(...durations);
  return { days: fullDays(hours / 24), basis, detail: `${format(hours)} hours at your planned load.` };
}

export function computeEssentialCoverage(items = [], peopleCount = 0, dailyCalTarget = 2000, waterGalPerPerson = 1) {
  const rationing = computeRationing(items, peopleCount, dailyCalTarget, waterGalPerPerson);
  const omitted = rationing.omittedFoodCount;
  const foodDetail = !rationing.peopleCount
    ? 'Mark dependants in Your People to estimate.'
    : !rationing.dailyCalTarget
      ? 'Set a calorie target in Rationing.'
      : `${format(rationing.dailyCalTarget)} cal/person/day.`;
  return {
    water: {
      days: fullDays(rationing.waterDays),
      basis: 'Stored-water coverage',
      detail: rationing.peopleCount ? `${format(rationing.totalWaterGal)} gal · ${format(rationing.waterGalPerPerson)} gal/person/day.` : 'Mark dependants in Your People to estimate.',
    },
    food: {
      days: fullDays(rationing.foodDays),
      basis: 'Recorded food coverage',
      detail: `${foodDetail}${omitted ? ` ${omitted} ${omitted === 1 ? 'entry needs' : 'entries need'} nutrition details.` : ''}`,
    },
    medical: medicationCoverage(items),
    power: powerCoverage(items),
  };
}
