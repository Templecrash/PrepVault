const rows = value => Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) : [];
export const hasPlanningDetail = value => typeof value === 'string' && Boolean(value.trim()) && !['none', 'unknown', 'n/a', 'not recorded', 'not set', 'tbd', '-'].includes(value.trim().toLowerCase());
export const recordedPlanningAmount = value => {
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};
const amount = recordedPlanningAmount;

const calendarDay = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
};

export function buildSoilStatus(tests = []) {
  const records = rows(tests);
  const ph = records.map(test => amount(test.ph)).filter(value => value !== null && value <= 14);
  const moisture = records.map(test => amount(test.moisture)).filter(value => value !== null && value <= 100);
  return { total: records.length, phRecorded: ph.length, moistureRecorded: moisture.length,
    averagePh: ph.length ? ph.reduce((sum, value) => sum + value, 0) / ph.length : null,
    averageMoisture: moisture.length ? moisture.reduce((sum, value) => sum + value, 0) / moisture.length : null };
}

export function compostRecordStatus(bin, now = new Date()) {
  const currentDay = calendarDay(new Date(now).toISOString().slice(0, 10));
  const turned = calendarDay(bin.lastTurned), rawInterval = amount(bin.turningFreqDays);
  const interval = rawInterval !== null && rawInterval > 0 ? rawInterval : null;
  const days = turned === null || turned > currentDay ? null : (currentDay - turned) / 86400_000;
  const stage = ['fresh', 'active', 'curing', 'finished'].includes(bin.stage) ? bin.stage : null;
  const turning = stage === 'finished' ? 'finished' : days === null || interval === null ? 'unknownTurning' : days >= interval ? 'due' : 'current';
  return { stage, interval, days, turning };
}

export function buildCompostStatus(bins = [], now = new Date()) {
  const result = { total: 0, fresh: 0, active: 0, curing: 0, finished: 0, unknownStage: 0, turningTotal: 0, current: 0, due: 0, unknownTurning: 0 };
  for (const bin of rows(bins)) {
    const status = compostRecordStatus(bin, now);
    result.total++;
    result[status.stage || 'unknownStage']++;
    if (status.turning === 'finished') continue;
    result.turningTotal++;
    result[status.turning]++;
  }
  return result;
}

export function livestockRecordStatus(animal) {
  const rawCount = amount(animal.count);
  const count = Number.isSafeInteger(rawCount) ? rawCount : null;
  const feedDays = amount(animal.feedStockDays), feedPerAnimal = amount(animal.feedLbsPerDay);
  const status = typeof animal.status === 'string' ? animal.status.trim().toLowerCase() : '';
  const hasAnimals = count !== null && count > 0;
  const sick = hasAnimals && status === 'sick';
  const lowFeed = hasAnimals && feedDays !== null && feedDays <= 7;
  const knownStatus = ['healthy', 'pregnant', 'lactating', 'sick'].includes(status);
  const incomplete = !hasAnimals || feedDays === null || feedPerAnimal === null || !hasPlanningDetail(animal.feedType) || !knownStatus;
  const totalFeed = count !== null && feedPerAnimal !== null ? count * feedPerAnimal : null;
  return { count, feedDays, feedPerAnimal, totalFeed: Number.isFinite(totalFeed) ? totalFeed : null, status: knownStatus ? status : null,
    sick, lowFeed, state: sick || lowFeed ? 'attention' : incomplete ? 'unknown' : 'recorded' };
}

export function peopleRecordMatches(person, filter) {
  if (filter === 'contact') return hasPlanningDetail(person.phone);
  if (filter === 'no-contact') return !hasPlanningDetail(person.phone);
  if (filter === 'no-role') return !hasPlanningDetail(person.role);
  if (filter === 'dependants') return person.isDependant === true;
  if (filter === 'other') return person.isDependant !== true;
  return true;
}

export function buildPeopleStatus(contacts = []) {
  const people = rows(contacts);
  const contact = people.filter(person => hasPlanningDetail(person.phone)).length;
  const role = people.filter(person => hasPlanningDetail(person.role)).length;
  const dependants = people.filter(person => person.isDependant === true).length;
  return { total: people.length, contact, missingContact: people.length - contact, role, missingRole: people.length - role, dependants, others: people.length - dependants };
}

export function buildBugOutStatus(entries = [], items = []) {
  const checklist = rows(entries);
  const supplies = new Map(rows(items).map(item => [item.id, item]));
  const status = { total: checklist.length, grabbed: 0, remaining: 0, detailed: 0, missingDetails: 0, inStock: 0, outOfStock: 0, unknownStock: 0, missingLink: 0, custom: 0 };
  for (const entry of checklist) {
    status[entry.grabbed === true ? 'grabbed' : 'remaining']++;
    const detailed = ['quantity', 'location', 'assignee'].every(key => hasPlanningDetail(entry[key]));
    status[detailed ? 'detailed' : 'missingDetails']++;
    if (!entry.inventoryId) { status.custom++; continue; }
    const supply = supplies.get(entry.inventoryId);
    if (!supply) { status.missingLink++; continue; }
    const quantity = amount(supply.quantity);
    status[quantity === null ? 'unknownStock' : quantity === 0 ? 'outOfStock' : 'inStock']++;
  }
  return status;
}

export function buildFarmStatus({ gardenBeds = [], items = [], livestock = [] } = {}) {
  const garden = { beds: 0, knownBeds: 0, unknownBeds: 0, totalCells: 0, plantedCells: 0, emptyCells: 0, ignoredCells: 0 };
  for (const bed of rows(gardenBeds)) {
    garden.beds++;
    const width = amount(bed.width), height = amount(bed.height);
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || !Number.isSafeInteger(width * height)) { garden.unknownBeds++; continue; }
    garden.knownBeds++; garden.totalCells += width * height;
    const occupied = new Set();
    for (const cell of rows(bed.cells)) {
      const x = amount(cell.x), y = amount(cell.y);
      if (!hasPlanningDetail(cell.cropId)) continue;
      const key = `${x},${y}`;
      if (!Number.isInteger(x) || !Number.isInteger(y) || x >= width || y >= height || occupied.has(key)) { garden.ignoredCells++; continue; }
      occupied.add(key);
    }
    garden.plantedCells += occupied.size;
  }
  garden.emptyCells = garden.totalCells - garden.plantedCells;
  const seeds = { total: 0, stocked: 0, empty: 0, unknown: 0 };
  for (const item of rows(items).filter(item => item.category === 'farm' && ['seedPacket', 'seedling'].includes(item.subType))) {
    seeds.total++;
    const quantity = amount(item.quantity);
    seeds[quantity === null ? 'unknown' : quantity === 0 ? 'empty' : 'stocked']++;
  }
  const animals = { total: 0, attention: 0, recorded: 0, unknown: 0, lowFeed: 0, sick: 0 };
  for (const animal of rows(livestock)) {
    animals.total++;
    const status = livestockRecordStatus(animal);
    if (status.sick) animals.sick++;
    if (status.lowFeed) animals.lowFeed++;
    animals[status.state]++;
  }
  return { garden, seeds, animals };
}
