import { computeRationing } from './rationing.js';
import { buildFoodWaterRoster } from './food-water-household.js';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const DAY = 86_400_000;
const EVENT_TYPES = ['breakfast', 'lunch', 'dinner', 'water', 'check-in-1', 'check-in-2'];
const error = message => new Error(message || 'The saved emergency plan is invalid. Recover it from a backup before making changes.');
const WATER_SOURCE = { title: 'CDC: Emergency water supply', url: 'https://www.cdc.gov/water-emergency/about/how-to-create-and-store-an-emergency-water-supply.html' };
const PLAN_SOURCE = { title: 'Ready.gov: Make a plan', url: 'https://www.ready.gov/plan' };
const CO_SOURCE = { title: 'CDC: Carbon monoxide safety', url: 'https://www.cdc.gov/carbon-monoxide/about/index.html' };
const commonActions = [
  { id: 'immediate-safety', title: 'Check for immediate danger', detail: 'Get to safety and contact emergency services when urgent help is needed. Follow official instructions for the incident.', navigate: 'location' },
  { id: 'household-check', title: 'Account for your people', detail: 'Confirm everyone’s location, immediate needs and next check-in. Include children, dependants and pets in your practical plan.', navigate: 'community' },
  { id: 'official-updates', title: 'Check official updates', detail: 'Review current warnings and local instructions. This plan does not know whether your building or travel route is safe.', navigate: 'location' },
];
const action = (id, title, detail, navigate) => ({ id, title, detail, navigate });

export const EMERGENCY_SCENARIOS = [
  { id: 'general', label: 'General emergency', description: 'Bring your people, supplies and next steps together.', actions: [...commonActions,
    action('water-check', 'Confirm safe water', 'Check stored water and the current water advisory. Plan enough for drinking, food preparation and hygiene; actual needs may be higher.', 'water'),
    action('food-check', 'Review food and medicines', 'Check food condition, storage temperatures, dietary needs and the medicines each person relies on.', 'food')], sources: [PLAN_SOURCE, WATER_SOURCE] },
  { id: 'power', label: 'Power outage', description: 'Prioritize safe lighting, food storage and essential equipment.', actions: [...commonActions,
    action('power-safety', 'Use backup power safely', 'Keep fuel-burning generators outdoors, more than 20 feet from doors, windows and vents. Check working CO alarms and follow the equipment manual.', 'skills'),
    action('cold-food', 'Check refrigerated food', 'Check temperatures and elapsed time against the food-safety guide. Do not rely on a fixed generator cycling schedule to keep food safe.', 'emergency'),
    action('essential-power', 'Prioritize essential power needs', 'Identify medical equipment, communications and other essential loads. Check recorded runtime and arrange assistance where needed.', 'preps')], sources: [CO_SOURCE, PLAN_SOURCE] },
  { id: 'weather', label: 'Severe weather', description: 'Follow local warnings and keep shelter and evacuation options ready.', actions: [...commonActions,
    action('weather-shelter', 'Follow the current shelter or evacuation instruction', 'The safest action depends on the hazard and your location. Review the specific official warning before choosing shelter or travel.', 'location'),
    action('go-bag', 'Ready your grab list', 'Check the bags, medicines, documents, water and transport your household would need if told to leave.', 'bugout')], sources: [PLAN_SOURCE] },
  { id: 'water', label: 'Water disruption', description: 'Plan from verified stored water and the current local advisory.', actions: [...commonActions,
    action('water-advisory', 'Read the exact water advisory', 'A boil-water, do-not-drink or do-not-use notice requires different actions. Boiling does not remove chemical contamination.', 'location'),
    action('water-check', 'Confirm safe water', 'Check sealed or safely stored water, containers and dates. Account for drinking, cooking and hygiene; arrange additional safe water before supplies run low.', 'water')], sources: [WATER_SOURCE, { title: 'CDC: Making water safe', url: 'https://www.cdc.gov/water-emergency/about/index.html' }] },
  { id: 'evacuation', label: 'Preparing to leave', description: 'Put people, grab lists and official travel instructions first.', actions: [...commonActions,
    action('go-bag', 'Work through your grab list', 'Use the household grab list to collect essentials and confirm who is responsible. Take required medicines and documents.', 'bugout'),
    action('evacuation-route', 'Check destination and route', 'Follow official evacuation routes and closures. Check transport and the needs of people and animals; saved routes do not confirm current access.', 'offline-maps')], sources: [PLAN_SOURCE, { title: 'Ready.gov: Evacuation', url: 'https://www.ready.gov/evacuation' }] },
  { id: 'supply', label: 'Supply disruption', description: 'Review usable stock, daily needs and safe resupply options.', actions: [...commonActions,
    action('food-check', 'Review food and medicines', 'Check usable stock and missing records, and plan around household dietary needs. A calorie total alone does not establish a balanced diet.', 'food'),
    action('supply-review', 'Plan safe resupply', 'Use the recorded shortfalls to decide what to obtain or request. Arrange assistance before food, safe water or essential medicines run out.', 'rationing')], sources: [PLAN_SOURCE, WATER_SOURCE] },
  { id: 'medical', label: 'Medical disruption', description: 'Keep urgent care and individual medical needs at the front.', actions: [...commonActions,
    action('medical-help', 'Arrange qualified medical help', 'For urgent symptoms or injury, contact emergency services. Use prescribed treatment instructions; this schedule does not change medication or dietary needs.', 'emergency'),
    action('medical-supplies', 'Review essential medical supplies', 'Check the medicines, equipment, storage needs and contact information required by each person. Ask a clinician or pharmacist about gaps.', 'preps')], sources: [PLAN_SOURCE] },
  { id: 'civil_unrest', label: 'Civil unrest', description: 'Keep people informed and review safe access to essential needs.', actions: [...commonActions,
    action('unrest-access', 'Check safe access and local restrictions', 'Avoid areas of active disorder and large gatherings. Review official closures and safety instructions before travelling; a saved route does not establish that travel is safe.', 'location'),
    action('unrest-contact', 'Confirm check-ins and essential supplies', 'Agree how to reach your people if phone or transport services are disrupted. Keep medicines, documents and your grab list accessible if official instructions change.', 'bugout')], sources: [PLAN_SOURCE, { title: 'FCDO: Preparing for crises and civil unrest', url: 'https://www.gov.uk/guidance/how-to-deal-with-a-crisis-overseas' }] },
  { id: 'pandemic', label: 'Pandemic or disease outbreak', description: 'Follow current public-health advice and plan around individual care needs.', actions: [...commonActions,
    action('outbreak-guidance', 'Check guidance for the current disease', 'Follow local public-health advice for this outbreak. For respiratory illness, review cleaner air, hygiene, recommended immunizations and precautions around others when sick; guidance differs by disease.', 'location'),
    action('outbreak-care', 'Plan care and practical support', 'Confirm medicines, clinician contacts and help with food and water. People at higher risk of severe respiratory illness should seek prompt clinical advice about testing and treatment when symptoms develop.', 'community')], sources: [PLAN_SOURCE, { title: 'CDC: Preventing respiratory illnesses', url: 'https://www.cdc.gov/respiratory-viruses/prevention/index.html' }] },
  { id: 'economic', label: 'Economic disruption', description: 'Prioritize essentials and review practical ways to access them.', actions: [...commonActions,
    action('economic-essentials', 'Review essential spending and supplies', 'List immediate food, water, medicine, shelter and transport needs against usable stock and available funds. Check local assistance and contact providers about payment options when needed.', 'rationing'),
    action('economic-records', 'Keep important records accessible', 'Keep copies of identification, insurance and essential account contact details secure. Review how you would pay for essentials if electronic payments or cash machines are unavailable.', 'bugout')], sources: [PLAN_SOURCE, { title: 'Ready.gov: Financial emergency preparedness', url: 'https://www.ready.gov/sites/default/files/2021-01/ready_financial-emergency_info-sheet.pdf' }] },
  { id: 'nuclear_chemical', label: 'Radiation or chemical incident', description: 'Use instructions specific to the hazard and your location.', actions: [...commonActions,
    action('hazard-instructions', 'Use the matching official safety guidance', 'Radiation and chemical incidents can require different shelter choices. Follow emergency officials and the relevant guide for sheltering, evacuation and exposure concerns; this plan cannot assess contamination.', 'emergency'),
    action('hazard-supplies', 'Review protected supplies and alerts', 'Keep communications and essential medicines accessible. Follow current food and water advisories, and use official instructions before handling potentially contaminated supplies or leaving shelter.', 'comms')], sources: [{ title: 'CDC: What to do in radiation emergencies', url: 'https://www.cdc.gov/radiation-emergencies/response/index.html' }, { title: 'CDC: Chemical emergency shelter guidance', url: 'https://www.cdc.gov/chemical-emergencies/response/shelter-in-place.html' }] },
  { id: 'cyber_attack', label: 'Cyberattack or digital disruption', description: 'Protect essential accounts and keep a practical communication fallback.', actions: [...commonActions,
    action('cyber-verification', 'Verify messages and service updates', 'Check service notices through known official websites or contact details. Treat unexpected links and requests for passwords, codes or payments cautiously; report suspected phishing to the service involved.', 'comms'),
    action('cyber-accounts', 'Review account and device protection', 'Use strong unique passwords, turn on multifactor authentication and keep software updated. If an account is affected, follow the provider’s official recovery instructions.'),
    action('cyber-fallback', 'Keep offline essentials accessible', 'Check that household contacts, saved plans and important records are available if connected services stop working. Confirm a backup way for your people to check in.', 'community')], sources: [PLAN_SOURCE, { title: 'CISA: Secure Our World guidance', url: 'https://www.cisa.gov/sites/default/files/2024-08/CISA-SOW-Opportunities-Guide.pdf' }] },
];

const SCENARIO_IDS = new Set(EMERGENCY_SCENARIOS.map(scenario => scenario.id));
const ACTION_IDS = new Set(EMERGENCY_SCENARIOS.flatMap(scenario => scenario.actions.map(entry => entry.id)));
export const DEFAULT_EMERGENCY_TIMES = Object.freeze({ mealTimes: Object.freeze(['08:00', '13:00', '18:00']), checkInTimes: Object.freeze(['09:00', '19:00']) });

function localDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1000 || year > 9998) return null;
  const parsed = new Date(year, month - 1, day, 12);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day ? parsed : null;
}

function asDate(value = new Date()) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw error('Choose a valid emergency plan date.');
  return date;
}

export function emergencyDateKey(value = new Date()) {
  const date = asDate(value);
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function emergencyAddDays(value, count) {
  const date = localDate(value);
  if (!date || !Number.isInteger(count)) throw error('Choose a valid emergency schedule date.');
  date.setDate(date.getDate() + count);
  return emergencyDateKey(date);
}

function dayDistance(from, to) {
  const first = localDate(from), second = localDate(to);
  if (!first || !second) throw error('Choose a valid emergency schedule date.');
  return Math.round((Date.UTC(second.getFullYear(), second.getMonth(), second.getDate()) - Date.UTC(first.getFullYear(), first.getMonth(), first.getDate())) / DAY);
}

const validISO = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z');
const validTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const timeList = (value, size) => Array.isArray(value) && value.length === size && value.every(validTime) && value.every((entry, index) => index === 0 || entry > value[index - 1]);
const finiteRange = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** Explicit schema: backups never activate an unvalidated or partially restored plan. */
export function validateEmergencyPlan(raw) {
  if (raw == null) return null;
  if (!record(raw) || raw.version !== 1 || typeof raw.active !== 'boolean' || !validISO(raw.startedAt) || !SCENARIO_IDS.has(raw.scenarioId)) throw error();
  if (typeof raw.propertyId !== 'string' || !raw.propertyId.trim() || raw.propertyId.length > 100 || ['__proto__', 'constructor', 'prototype'].includes(raw.propertyId)) throw error();
  if (!Number.isInteger(raw.horizonDays) || raw.horizonDays < 1 || raw.horizonDays > 90 || !finiteRange(raw.dailyCalTarget, 1000, 3000) || !finiteRange(raw.waterGalPerPerson, 1, 5)) throw error();
  if (!timeList(raw.mealTimes, 3) || !timeList(raw.checkInTimes, 2) || !record(raw.completed) || !Array.isArray(raw.checkedActions) || raw.checkedActions.length > ACTION_IDS.size || new Set(raw.checkedActions).size !== raw.checkedActions.length || raw.checkedActions.some(id => !ACTION_IDS.has(id))) throw error();
  if (raw.active ? raw.endedAt != null : !validISO(raw.endedAt) || Date.parse(raw.endedAt) < Date.parse(raw.startedAt)) throw error();
  const startDate = emergencyDateKey(raw.startedAt);
  if (!localDate(startDate) || !localDate(emergencyAddDays(startDate, raw.horizonDays - 1)) || (raw.endedAt != null && !localDate(emergencyDateKey(raw.endedAt)))) throw error();
  const entries = Object.entries(raw.completed);
  if (entries.length > 540) throw error();
  const completed = {};
  for (const [key, timestamp] of entries) {
    const [date, type, extra] = key.split(':');
    if (extra !== undefined || !localDate(date) || !EVENT_TYPES.includes(type) || !validISO(timestamp)) throw error();
    completed[key] = new Date(timestamp).toISOString();
  }
  return { version: 1, active: raw.active, startedAt: new Date(raw.startedAt).toISOString(), endedAt: raw.endedAt == null ? null : new Date(raw.endedAt).toISOString(), scenarioId: raw.scenarioId, propertyId: raw.propertyId.trim(), horizonDays: raw.horizonDays, dailyCalTarget: raw.dailyCalTarget, waterGalPerPerson: raw.waterGalPerPerson, mealTimes: [...raw.mealTimes], checkInTimes: [...raw.checkInTimes], completed, checkedActions: [...raw.checkedActions] };
}

export function createEmergencyPlan(options = {}, now = new Date()) {
  return validateEmergencyPlan({ version: 1, active: true, startedAt: asDate(now).toISOString(), endedAt: null, scenarioId: options.scenarioId ?? 'general', propertyId: options.propertyId ?? 'prop1', horizonDays: options.horizonDays ?? 14, dailyCalTarget: options.dailyCalTarget ?? 2000, waterGalPerPerson: options.waterGalPerPerson ?? 1, mealTimes: options.mealTimes ?? DEFAULT_EMERGENCY_TIMES.mealTimes, checkInTimes: options.checkInTimes ?? DEFAULT_EMERGENCY_TIMES.checkInTimes, completed: {}, checkedActions: [] });
}

export function updateEmergencyPlan(raw, patch) {
  const plan = validateEmergencyPlan(raw);
  if (!plan || !record(patch)) throw error();
  const allowed = ['scenarioId', 'propertyId', 'horizonDays', 'dailyCalTarget', 'waterGalPerPerson', 'mealTimes', 'checkInTimes'];
  if (Object.keys(patch).some(key => !allowed.includes(key))) throw error('Only emergency plan settings can be changed here.');
  const next = { ...plan, ...patch };
  if (next.propertyId !== plan.propertyId) { next.completed = {}; next.checkedActions = []; }
  else if (next.scenarioId !== plan.scenarioId) {
    const relevant = new Set(EMERGENCY_SCENARIOS.find(scenario => scenario.id === next.scenarioId)?.actions.map(entry => entry.id) || []);
    next.checkedActions = plan.checkedActions.filter(id => relevant.has(id));
  }
  return validateEmergencyPlan(next);
}

export function deactivateEmergencyPlan(raw, now = new Date()) {
  const plan = validateEmergencyPlan(raw);
  if (!plan) return null;
  return validateEmergencyPlan({ ...plan, active: false, endedAt: asDate(now).toISOString() });
}

function scheduleRange(plan) {
  const start = emergencyDateKey(plan.startedAt);
  return { start, end: emergencyAddDays(start, plan.horizonDays - 1) };
}

export function toggleEmergencyEvent(raw, key, now = new Date()) {
  const plan = validateEmergencyPlan(raw);
  if (!plan?.active || typeof key !== 'string') throw error('Activate an emergency plan before completing its schedule.');
  const [date, type, extra] = key.split(':');
  const range = scheduleRange(plan);
  if (extra !== undefined || !localDate(date) || !EVENT_TYPES.includes(type) || date < range.start || date > range.end) throw error('This event is outside the emergency schedule.');
  if (!plan.completed[key] && date > emergencyDateKey(now)) throw error('Future schedule entries cannot be completed yet.');
  const completed = { ...plan.completed };
  if (completed[key]) delete completed[key]; else completed[key] = asDate(now).toISOString();
  return validateEmergencyPlan({ ...plan, completed });
}

export function toggleEmergencyAction(raw, id) {
  const plan = validateEmergencyPlan(raw);
  if (!plan?.active || !EMERGENCY_SCENARIOS.find(scenario => scenario.id === plan.scenarioId)?.actions.some(entry => entry.id === id)) throw error('Choose an action from the active emergency plan.');
  return validateEmergencyPlan({ ...plan, checkedActions: plan.checkedActions.includes(id) ? plan.checkedActions.filter(current => current !== id) : [...plan.checkedActions, id] });
}

const positive = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
const round = value => Math.round((value + Number.EPSILON) * 1000) / 1000;
const number = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
const MEAL_KEYS = ['breakfast', 'lunch', 'dinner'];

function mealTargets(plan) {
  const targets = [Math.round(plan.dailyCalTarget * .25), Math.round(plan.dailyCalTarget * .35)];
  return [...targets, plan.dailyCalTarget - targets[0] - targets[1]];
}

function outstandingTargets(plan, peopleCount, date) {
  const targets = mealTargets(plan);
  return {
    calories: MEAL_KEYS.reduce((sum, key, index) => sum + (plan.completed[`${date}:${key}`] ? 0 : targets[index] * peopleCount), 0),
    waterGal: plan.completed[`${date}:water`] ? 0 : plan.waterGalPerPerson * peopleCount,
  };
}

function recordedStock(items, propertyId, date) {
  const scoped = (Array.isArray(items) ? items : []).filter(item => record(item) && (propertyId === 'all' || (item.propertyId || 'prop1') === propertyId));
  let excludedFoodCount = 0, excludedWaterCount = 0, undatedFoodCount = 0;
  const eligible = scoped.filter(item => {
    if (item.category === 'food' && ['livestock', 'huntingFishing'].includes(item.subType)) { if (positive(item.quantity)) excludedFoodCount++; return false; }
    if (item.category !== 'food' && !(item.category === 'water' && item.subType === 'storedWater')) return false;
    const expiry = item.fields?.expiryDate;
    if (expiry && (!localDate(expiry) || expiry < date)) {
      if (positive(item.quantity)) { if (item.category === 'food') excludedFoodCount++; else excludedWaterCount++; }
      return false;
    }
    if (item.category === 'food' && !expiry && positive(item.quantity)) undatedFoodCount++;
    return true;
  });
  return { eligible, excludedFoodCount, excludedWaterCount, undatedFoodCount };
}

/** Current recorded stock is not automatically consumed when a task is checked. */
export function buildEmergencySummary({ plan: raw, items = [], rationPeople = [], now = new Date() } = {}) {
  const plan = validateEmergencyPlan(raw);
  if (!plan) return null;
  const today = emergencyDateKey(now), range = scheduleRange(plan);
  const stock = recordedStock(items, plan.propertyId, today);
  const roster = buildFoodWaterRoster(rationPeople);
  const counted = new Set();
  const peopleCount = roster.filter(person => { if (person.id && counted.has(person.id)) return false; if (person.id) counted.add(person.id); return true; }).length;
  const base = computeRationing(stock.eligible, peopleCount, plan.dailyCalTarget, plan.waterGalPerPerson);
  const totalCalories = Number.isFinite(base.totalCalories) ? base.totalCalories : null;
  const totalWaterGal = Number.isFinite(base.totalWaterGal) ? base.totalWaterGal : null;
  const dailyCalories = peopleCount ? peopleCount * plan.dailyCalTarget : null;
  const dailyWaterGal = peopleCount ? peopleCount * plan.waterGalPerPerson : null;
  const foodDays = dailyCalories && totalCalories !== null ? Math.floor(totalCalories / dailyCalories) : null;
  const waterDays = dailyWaterGal && totalWaterGal !== null ? Math.floor(totalWaterGal / dailyWaterGal) : null;
  const coverageDays = foodDays !== null && waterDays !== null ? Math.min(foodDays, waterDays) : null;
  const dayIndex = Math.max(1, dayDistance(range.start, today) + 1);
  const planningDaysRemaining = Math.max(0, plan.horizonDays - dayIndex + 1);
  let remainingCalories = peopleCount ? 0 : null, remainingWaterGal = peopleCount ? 0 : null;
  if (peopleCount) {
    for (let date = today < range.start ? range.start : today; date <= range.end; date = emergencyAddDays(date, 1)) {
      const outstanding = outstandingTargets(plan, peopleCount, date);
      remainingCalories += outstanding.calories;
      remainingWaterGal += outstanding.waterGal;
    }
  }
  const notes = [
    'Planning targets are not personal nutrition advice. Needs vary with age, activity, pregnancy and health; follow individual care instructions.',
    'Stored-water planning includes drinking, food preparation and hygiene. It is not a limit on drinking; arrange more safe water when needs exceed the plan.',
    'Checking a schedule entry records completion only. Update inventory quantities separately after use. Confirm food condition, temperatures and preparation needs before using it.',
    'Completed meals and water allocations are excluded from remaining schedule needs. Keep current stock updated so used or allocated supplies are not offered again.',
  ];
  if (!peopleCount) notes.unshift('Mark dependants in Your People to calculate allocations. No one is inferred from the scenario household setting.');
  if (base.omittedFoodCount) notes.push(`${base.omittedFoodCount} stocked food ${base.omittedFoodCount === 1 ? 'entry lacks' : 'entries lack'} usable calorie or serving information and is not counted in the calorie estimate.`);
  if (stock.excludedFoodCount) notes.push(`${stock.excludedFoodCount} food ${stock.excludedFoodCount === 1 ? 'entry is' : 'entries are'} excluded: past/invalid expiry dates, animals or hunting equipment are not ready-to-use meal stock.`);
  if (stock.excludedWaterCount) notes.push(`${stock.excludedWaterCount} stored-water ${stock.excludedWaterCount === 1 ? 'entry is' : 'entries are'} excluded because of a past or invalid recorded expiry date.`);
  if (stock.undatedFoodCount) notes.push(`${stock.undatedFoodCount} stocked food ${stock.undatedFoodCount === 1 ? 'entry has' : 'entries have'} no expiry recorded. Check labels and condition.`);
  if (!planningDaysRemaining) notes.push('The planned duration has ended. Extend the duration or end Emergency mode after reviewing the situation.');
  return { ...base, peopleCount, totalCalories, totalWaterGal, foodDays, waterDays, coverageDays, dailyCalories, dailyWaterGal, remainingCalories, remainingWaterGal, waterGalPerPerson: plan.waterGalPerPerson, horizonDays: plan.horizonDays, dayIndex, planningDaysRemaining, horizonElapsed: planningDaysRemaining === 0, startedDate: range.start, plannedEndDate: range.end, resupplyDate: coverageDays === null || coverageDays > 3650 ? null : emergencyAddDays(today, coverageDays), foodShortfallCalories: remainingCalories !== null && totalCalories !== null ? Math.max(0, remainingCalories - totalCalories) : null, waterShortfallGal: remainingWaterGal !== null && totalWaterGal !== null ? round(Math.max(0, remainingWaterGal - totalWaterGal)) : null, excludedFoodCount: stock.excludedFoodCount, excludedWaterCount: stock.excludedWaterCount, undatedFoodCount: stock.undatedFoodCount, notes };
}

function baseEvents(plan, summary, date, now) {
  const today = emergencyDateKey(now);
  const meals = ['Breakfast', 'Lunch', 'Dinner'];
  const perPerson = mealTargets(plan);
  const definitions = meals.map((title, index) => ({ type: 'meal', suffix: title.toLowerCase(), time: plan.mealTimes[index], title, caloriesPerPerson: summary.peopleCount ? perPerson[index] : null, householdCalories: summary.peopleCount ? perPerson[index] * summary.peopleCount : null, notes: summary.peopleCount ? `Planning target: ${number(perPerson[index])} calories per person; ${number(perPerson[index] * summary.peopleCount)} for ${summary.peopleCount} ${summary.peopleCount === 1 ? 'dependant' : 'dependants'}. Review dietary needs and food safety before serving.` : 'Mark food and water dependants in Your People before calculating meal quantities.', allocation: [], shortfallCalories: null }));
  definitions.push({ type: 'water', suffix: 'water', time: plan.mealTimes[0], title: 'Check and allocate today’s safe water', waterGalPerPerson: summary.peopleCount ? plan.waterGalPerPerson : null, householdWaterGal: summary.dailyWaterGal, shortfallWaterGal: null, notes: summary.peopleCount ? `Confirm and set aside at least ${number(summary.dailyWaterGal)} gal for ${summary.peopleCount} ${summary.peopleCount === 1 ? 'dependant' : 'dependants'} (${number(plan.waterGalPerPerson)} gal each) for drinking, food preparation and hygiene. This is not a drinking limit. Update available inventory after allocating it; arrange more safe water when needed.` : 'Mark food and water dependants in Your People before calculating daily stored-water needs.' });
  plan.checkInTimes.forEach((time, index) => definitions.push({ type: 'check-in', suffix: `check-in-${index + 1}`, time, title: index === 0 ? 'Morning household check-in' : 'Evening household check-in', notes: 'Confirm everyone is accounted for, review immediate needs and agree the next contact. This reminder does not send a message or request anyone’s location.' }));
  return definitions.map(({ suffix, ...entry }) => {
    const key = `${date}:${suffix}`;
    return { ...entry, id: `emergency:${plan.startedAt}:${key}`, key, date, kind: 'emergency', done: Boolean(plan.completed[key]), completedAt: plan.completed[key] || null, canComplete: plan.active && (date <= today || Boolean(plan.completed[key])), navigate: 'emergency-mode', source: 'emergency', sourceLabel: 'Emergency mode' };
  }).sort((left, right) => left.time.localeCompare(right.time) || EVENT_TYPES.indexOf(left.key.split(':')[1]) - EVENT_TYPES.indexOf(right.key.split(':')[1]));
}

function allocateMeal(pool, target, date) {
  let remaining = target;
  const allocation = [];
  for (const food of pool) {
    if (remaining <= .000001) break;
    const expiry = food.fields?.expiryDate;
    if (food.availableCalories <= 0 || (expiry && expiry < date)) continue;
    const calories = Math.min(food.availableCalories, remaining);
    const units = calories / (food.caloriesPerServing * food.servings);
    food.availableCalories -= calories;
    remaining -= calories;
    allocation.push({ itemId: food.id, name: food.name, units, unit: food.unit, calories, servings: calories / food.caloriesPerServing });
  }
  return { allocation, shortfallCalories: Math.max(0, round(remaining)) };
}

const expiryOrder = (left, right) => (left.fields?.expiryDate || '9999').localeCompare(right.fields?.expiryDate || '9999') || String(left.id).localeCompare(String(right.id));

function allocateWater(pool, target, date) {
  let remaining = target;
  for (const water of pool) {
    if (remaining <= .000001) break;
    if (water.availableGallons <= 0 || (water.fields?.expiryDate && water.fields.expiryDate < date)) continue;
    const gallons = Math.min(water.availableGallons, remaining);
    water.availableGallons -= gallons;
    remaining -= gallons;
  }
  return Math.max(0, round(remaining));
}

export function buildEmergencySchedule({ plan: raw, items = [], rationPeople = [], date, now = new Date() } = {}) {
  const plan = validateEmergencyPlan(raw);
  if (!plan?.active) return [];
  const selected = date ?? emergencyDateKey(now), today = emergencyDateKey(now), range = scheduleRange(plan);
  if (!localDate(selected)) throw error('Choose a valid emergency schedule date.');
  if (selected < range.start || selected > range.end) return [];
  const summary = buildEmergencySummary({ plan, items, rationPeople, now });
  const events = baseEvents(plan, summary, selected, now);
  // Past completions are a record, not a reconstructed menu from today's stock.
  if (!summary.peopleCount || selected < today) return events;
  const pool = summary.foodItems.filter(item => item.quantity > 0 && item.hasCalorieData).map(item => ({ ...item, availableCalories: item.totalCalories })).sort(expiryOrder);
  const waterPool = summary.waterItems.map(item => ({ ...item, availableGallons: item.gallons })).sort(expiryOrder);
  // Completed entries describe past use/allocation. Current stock should already
  // reflect it, so only still-outstanding targets consume the projection.
  for (let date = today < range.start ? range.start : today; date < selected; date = emergencyAddDays(date, 1)) {
    const outstanding = outstandingTargets(plan, summary.peopleCount, date);
    allocateMeal(pool, outstanding.calories, date);
    allocateWater(waterPool, outstanding.waterGal, date);
  }
  for (const event of events) {
    if (event.done) continue;
    if (event.type === 'meal') Object.assign(event, allocateMeal(pool, event.householdCalories, selected), { allocationNote: 'Suggested recorded stock to review, not a balanced menu. Amounts may be fractional units. No stock is deducted automatically.' });
    if (event.type === 'water') event.shortfallWaterGal = allocateWater(waterPool, summary.dailyWaterGal, selected);
  }
  return events;
}

export function buildEmergencyCalendarEvents({ plan: raw, items = [], rationPeople = [], startDate, endDate, now = new Date() } = {}) {
  const plan = validateEmergencyPlan(raw);
  if (!plan?.active) return [];
  const range = scheduleRange(plan);
  if (startDate !== undefined && !localDate(startDate) || endDate !== undefined && !localDate(endDate)) throw error('Choose a valid emergency calendar range.');
  const first = startDate && startDate > range.start ? startDate : range.start;
  const last = endDate && endDate < range.end ? endDate : range.end;
  if (first > last) return [];
  const summary = buildEmergencySummary({ plan, items, rationPeople, now });
  const events = [];
  for (let date = first; date <= last && events.length < 540; date = emergencyAddDays(date, 1)) events.push(...baseEvents(plan, summary, date, now));
  return events;
}
