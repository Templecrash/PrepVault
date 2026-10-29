export const VEHICLE_PART_TYPES = new Set(['spareParts', 'sparePart', 'fluids', 'tires', 'tire', 'engineOil', 'sparkPlug', 'battery', 'toolkit']);
export const VEHICLE_FUEL_UNITS = ['L', 'US gal', 'Imp gal'];
export const VEHICLE_DISTANCE_UNITS = ['km', 'mi'];
export const EMP_PROTECTION_OPTIONS = [
  ['not-recorded', 'Not recorded'], ['planned', 'Planned'], ['installed', 'Installed · unverified'], ['unverified', 'Needs verification'],
];
export const VEHICLE_EMERGENCY_EQUIPMENT = [
  ['first-aid', 'First aid kit'], ['extinguisher', 'Fire extinguisher'], ['warning-triangle', 'Warning triangle'],
  ['recovery', 'Recovery equipment'], ['jump-start', 'Jump starter / cables'], ['spare-wheel', 'Spare wheel / puncture kit'],
  ['repair-tools', 'Repair tools'], ['water', 'Drinking water'], ['blankets', 'Warm blankets'], ['paper-map', 'Paper map'],
];
const equipmentIds = new Set(VEHICLE_EMERGENCY_EQUIPMENT.map(([id]) => id));
const numericFields = ['tankFuel', 'tankCapacity', 'mileage', 'hoursOnEngine', 'nextServiceMileage', 'nextServiceHours'];
const dateFields = ['lastServiceDate', 'nextService'];
const textFields = ['fuelType', 'empProtectionNotes'];

function finiteNumber(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function vehicleDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1000 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.getTime() / 86400000 : null;
}

export function isVehicleRecord(item) {
  return item?.category === 'vehicles' && !VEHICLE_PART_TYPES.has(item.subType);
}

export function splitVehicleInventory(items = []) {
  return {
    vehicles: items.filter(isVehicleRecord),
    parts: items.filter(item => item?.category === 'vehicles' && VEHICLE_PART_TYPES.has(item.subType)),
    fuel: items.filter(item => item?.category === 'fuel'),
  };
}

export function vehicleServiceStatus(item, now = new Date()) {
  const fields = item?.fields || {};
  const nextDay = dateDay(fields.nextService);
  const today = dateDay(vehicleDateKey(now));
  const daysUntil = nextDay !== null && today !== null ? nextDay - today : null;
  const mileage = finiteNumber(fields.mileage);
  const mileageDue = finiteNumber(fields.nextServiceMileage);
  const hours = finiteNumber(fields.hoursOnEngine);
  const hoursDue = finiteNumber(fields.nextServiceHours);
  const knownDistanceUnit = VEHICLE_DISTANCE_UNITS.includes(fields.mileageUnit);
  const reasons = [];
  if (daysUntil !== null && daysUntil <= 0) reasons.push(daysUntil === 0 ? 'Service is due today' : `Service is ${Math.abs(daysUntil)} days overdue`);
  if (mileage !== null && mileageDue !== null && knownDistanceUnit && mileage >= mileageDue) reasons.push(`Odometer reached ${mileageDue.toLocaleString()} ${fields.mileageUnit}`);
  if (hours !== null && hoursDue !== null && hours >= hoursDue) reasons.push(`Engine reached ${hoursDue.toLocaleString()} hours`);
  const scheduled = nextDay !== null || mileageDue !== null || hoursDue !== null;
  const status = reasons.length ? 'due' : daysUntil !== null && daysUntil <= 30 ? 'soon' : scheduled ? 'scheduled' : 'unrecorded';
  if (status === 'soon') reasons.push(`Service is due in ${daysUntil} ${daysUntil === 1 ? 'day' : 'days'}`);
  if (mileageDue !== null && (mileage === null || !knownDistanceUnit)) reasons.push('Record the current odometer and distance unit to check the mileage reminder');
  if (hoursDue !== null && hours === null) reasons.push('Record current engine hours to check the hours reminder');
  return { status, label: { due: 'Service due', soon: 'Due within 30 days', scheduled: 'Service scheduled', unrecorded: 'No service schedule' }[status], reasons, nextDate: nextDay === null ? null : fields.nextService, daysUntil };
}

export function vehicleTankSummary(item) {
  const fields = item?.fields || {};
  const current = finiteNumber(fields.tankFuel);
  const capacity = finiteNumber(fields.tankCapacity);
  const unit = VEHICLE_FUEL_UNITS.includes(fields.fuelUnit) ? fields.fuelUnit : null;
  const percent = unit && current !== null && capacity !== null && capacity > 0 && current <= capacity ? Math.round(current / capacity * 100) : null;
  return { current, capacity, unit, percent };
}

export function vehicleSupplyQuantity(item, categories = {}) {
  const quantity = finiteNumber(item?.quantity);
  const unit = categories[item?.category]?.subTypes?.[item?.subType]?.unit || 'items';
  return { quantity, unit, label: quantity === null ? 'Not recorded' : `${quantity.toLocaleString()} ${unit}` };
}

function assertVehicle(item) {
  if (!isVehicleRecord(item) || !item.id) throw new Error('Select a saved vehicle first.');
}

function validateNumber(value, label) {
  if (value === '' || value === null || value === undefined) return '';
  const number = finiteNumber(value);
  if (number === null) throw new Error(`${label} must be a number of zero or more.`);
  return number;
}

function validateDate(value, label) {
  if (!value) return '';
  if (dateDay(value) === null) throw new Error(`Enter a valid ${label.toLowerCase()}.`);
  return value;
}

export function prepareVehicleUpdate(item, draft, now = new Date()) {
  assertVehicle(item);
  const fields = { ...item.fields };
  const labels = { tankFuel: 'Fuel in tank', tankCapacity: 'Tank capacity', mileage: 'Odometer', hoursOnEngine: 'Engine hours', nextServiceMileage: 'Next service odometer', nextServiceHours: 'Next service hours' };
  for (const field of numericFields) if (Object.hasOwn(draft, field)) fields[field] = validateNumber(draft[field], labels[field]);
  for (const field of dateFields) if (Object.hasOwn(draft, field)) fields[field] = validateDate(draft[field], field === 'nextService' ? 'Next service date' : 'Last service date');
  if (dateDay(fields.lastServiceDate) !== null && dateDay(fields.lastServiceDate) > dateDay(vehicleDateKey(now))) throw new Error('Last service cannot be in the future. Use the next service date for planned work.');
  for (const field of textFields) if (Object.hasOwn(draft, field)) fields[field] = String(draft[field] ?? '').trim().slice(0, field === 'empProtectionNotes' ? 4000 : 100);
  for (const [field, options, label] of [['fuelUnit', VEHICLE_FUEL_UNITS, 'fuel unit'], ['mileageUnit', VEHICLE_DISTANCE_UNITS, 'distance unit'], ['empProtection', EMP_PROTECTION_OPTIONS.map(([id]) => id), 'EMP protection status']]) {
    if (Object.hasOwn(draft, field)) {
      if (draft[field] !== '' && !options.includes(draft[field])) throw new Error(`Choose a valid ${label}.`);
      fields[field] = draft[field];
    }
  }
  const tank = vehicleTankSummary({ fields });
  if (tank.current !== null && tank.capacity !== null && tank.current > tank.capacity) throw new Error('Fuel in the tank cannot exceed its capacity.');
  const readingChanged = keys => keys.some(key => finiteNumber(fields[key]) !== finiteNumber(item.fields?.[key]));
  const tankUnitChanged = (fields.fuelUnit || '') !== (item.fields?.fuelUnit || '');
  const distanceUnitChanged = (fields.mileageUnit || '') !== (item.fields?.mileageUnit || '');
  if ((tank.current !== null || tank.capacity !== null) && !tank.unit && (readingChanged(['tankFuel', 'tankCapacity']) || tankUnitChanged)) throw new Error('Choose litres, US gallons or imperial gallons for the tank.');
  if ((finiteNumber(fields.mileage) !== null || finiteNumber(fields.nextServiceMileage) !== null) && !VEHICLE_DISTANCE_UNITS.includes(fields.mileageUnit) && (readingChanged(['mileage', 'nextServiceMileage']) || distanceUnitChanged)) throw new Error('Choose kilometres or miles for the odometer.');
  if (Object.hasOwn(draft, 'emergencyEquipment')) {
    if (!Array.isArray(draft.emergencyEquipment) || draft.emergencyEquipment.some(id => !equipmentIds.has(id))) throw new Error('Choose equipment from the vehicle checklist.');
    fields.emergencyEquipment = [...new Set(draft.emergencyEquipment)];
  }
  return { ...item, fields };
}

export function recordVehicleService(item, draft, { id, now = new Date() } = {}) {
  assertVehicle(item);
  if (typeof id !== 'string' || !id.trim() || id.length > 120) throw new Error('A unique service record ID is required.');
  const previous = item.fields?.vehicleServiceLog ?? [];
  if (!Array.isArray(previous)) throw new Error('The existing service log needs repair before another entry can be added.');
  if (previous.some(entry => !entry || typeof entry !== 'object' || !entry.id)) throw new Error('The existing service log contains an invalid entry. Export a backup before repairing it.');
  if (previous.some(entry => entry.id === id)) throw new Error('This service entry is already saved.');
  const date = validateDate(draft.date, 'Service date');
  if (!date) throw new Error('Enter the date the service was completed.');
  if (dateDay(date) > dateDay(vehicleDateKey(now))) throw new Error('Completed service cannot be in the future.');
  const summary = String(draft.summary ?? '').trim();
  if (!summary) throw new Error('Describe the service that was completed.');
  if (summary.length > 2000) throw new Error('Keep the service description under 2,000 characters.');
  const odometer = validateNumber(draft.odometer, 'Service odometer');
  const hours = validateNumber(draft.hours, 'Service engine hours');
  const odometerUnit = draft.odometerUnit || item.fields?.mileageUnit || '';
  if (odometer !== '' && !VEHICLE_DISTANCE_UNITS.includes(odometerUnit)) throw new Error('Choose kilometres or miles for the service odometer.');
  const nextService = validateDate(draft.nextService, 'Next service date');
  const nextServiceMileage = validateNumber(draft.nextServiceMileage, 'Next service odometer');
  const nextServiceHours = validateNumber(draft.nextServiceHours, 'Next service hours');
  if (nextService && nextService < date) throw new Error('Next service must be on or after the completed service date.');
  if (nextServiceMileage !== '' && odometer !== '' && nextServiceMileage < odometer) throw new Error('Next service odometer cannot be below the service reading.');
  if (nextServiceHours !== '' && hours !== '' && nextServiceHours < hours) throw new Error('Next service hours cannot be below the service reading.');
  if (nextServiceMileage !== '' && !VEHICLE_DISTANCE_UNITS.includes(odometerUnit)) throw new Error('Choose kilometres or miles for the mileage reminder.');
  const fields = { ...item.fields };
  const entry = { id, date, summary, odometer, odometerUnit, hours, nextService, nextServiceMileage, nextServiceHours, oilChanged: draft.oilChanged === true, createdAt: new Date(now).toISOString() };
  fields.vehicleServiceLog = [...previous, entry];
  const latest = [fields.lastServiceDate, ...previous.map(value => value.date)].filter(value => dateDay(value) !== null).sort().at(-1);
  if (!latest || date >= latest) {
    if ((odometer !== '' || nextServiceMileage !== '') && fields.mileageUnit && fields.mileageUnit !== odometerUnit && finiteNumber(fields.mileage) !== null) throw new Error('Use the vehicle’s current distance unit, or change its unit in vehicle details first.');
    fields.lastServiceDate = date;
    fields.nextService = nextService;
    fields.nextServiceMileage = nextServiceMileage;
    fields.nextServiceHours = nextServiceHours;
    if (odometer !== '') {
      fields.mileage = Math.max(odometer, finiteNumber(fields.mileage) ?? 0);
      fields.mileageUnit = odometerUnit;
    } else if (nextServiceMileage !== '') fields.mileageUnit = odometerUnit;
    if (hours !== '') fields.hoursOnEngine = Math.max(hours, finiteNumber(fields.hoursOnEngine) ?? 0);
  }
  if (entry.oilChanged && (dateDay(fields.lastOilChange) === null || date >= fields.lastOilChange)) fields.lastOilChange = date;
  return { ...item, fields };
}

export function linkVehicleSupply(item, vehicleId, vehicles) {
  if (!item?.id || !(item.category === 'fuel' || item.category === 'vehicles' && VEHICLE_PART_TYPES.has(item.subType))) throw new Error('Only fuel or vehicle supplies can be linked to a vehicle.');
  if (vehicleId && !vehicles.some(vehicle => isVehicleRecord(vehicle) && vehicle.id === vehicleId && (vehicle.propertyId || 'prop1') === (item.propertyId || 'prop1'))) throw new Error('Choose a vehicle at this property.');
  return { ...item, fields: { ...item.fields, vehicleId: vehicleId || '' } };
}
