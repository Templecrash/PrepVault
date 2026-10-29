const BACKUP_TYPES = new Set(['generator', 'powerBank', 'batteryBackup', 'ups']);
const format = value => Number.isFinite(value) ? value.toLocaleString() : '—';
const entries = count => `${format(count)} ${count === 1 ? 'entry' : 'entries'}`;

function recordedNumber(value) {
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function powerInventory(items) {
  const power = items.filter(item => item?.category === 'power');
  const backups = power.filter(item => BACKUP_TYPES.has(item.subType));
  const stocked = backups.filter(item => recordedNumber(item.quantity) > 0);
  const runtimes = stocked.map(item => recordedNumber(item.fields?.runtimeHours));
  const recordedRuntimes = runtimes.filter(value => value !== null);
  const solar = power.filter(item => item.subType === 'solarPanel' && recordedNumber(item.quantity) > 0);
  const solarRatings = solar.map(item => {
    const watts = recordedNumber(item.fields?.watts);
    const total = watts === null ? null : watts * recordedNumber(item.quantity);
    return Number.isFinite(total) ? total : null;
  });
  const recordedSolarRatings = solarRatings.filter(value => value !== null);
  const totalSolarWatts = recordedSolarRatings.reduce((sum, watts) => sum + watts, 0);
  return {
    backupCount: backups.length,
    stockedBackupCount: stocked.length,
    missingRuntimeCount: runtimes.length - recordedRuntimes.length,
    longestRuntimeHours: recordedRuntimes.length ? Math.max(...recordedRuntimes) : null,
    stockedSolarCount: solar.length,
    missingSolarRatingCount: solarRatings.length - recordedSolarRatings.length,
    recordedSolarWatts: recordedSolarRatings.length && Number.isFinite(totalSolarWatts) ? totalSolarWatts : null,
  };
}

function coverageFor(inventory) {
  const basis = 'Longest recorded backup';
  if (!inventory.backupCount) return { days: null, basis, detail: 'Add backup runtime details to estimate.' };
  if (!inventory.stockedBackupCount) return { days: 0, basis, detail: 'No backup power equipment in stock.' };
  if (inventory.missingRuntimeCount) return { days: null, basis, detail: 'Add runtime for every stocked backup.' };
  // Runtime describes the complete entry at its intended load with its current
  // fuel/charge. Sources may overlap or share fuel, so never sum or multiply it.
  const hours = inventory.longestRuntimeHours;
  return { days: Math.floor(hours / 24), basis, detail: `${format(hours)} hours at your planned load.` };
}

/** Shared by Overview and the dedicated Power page; caller scopes the items. */
export function computePowerCoverage(items = []) {
  return coverageFor(powerInventory(items));
}

export function buildPowerPlanning(items = []) {
  const inventory = powerInventory(items);
  const coverage = coverageFor(inventory);
  const missingRuntime = inventory.missingRuntimeCount;
  const missingSolar = inventory.missingSolarRatingCount;
  const solarNote = 'Quantity × rated watts per panel; a nameplate rating, not energy produced or backup runtime.';
  return {
    title: 'Backup power coverage',
    bigNum: coverage.days === null ? '—' : format(coverage.days),
    bigUnit: 'full days',
    summary: coverage.detail,
    rows: [
      { label: 'Backup equipment in stock', value: entries(inventory.stockedBackupCount), note: 'Generators, power banks, battery backups and UPS entries with positive recorded quantities' },
      { label: 'Longest recorded runtime', value: inventory.longestRuntimeHours === null ? 'Not recorded' : `${format(inventory.longestRuntimeHours)} hours`, note: 'Longest known entry at your planned load and current fuel or charge. Runtimes are not added together or multiplied by quantity.' },
      { label: 'Runtime details', value: missingRuntime ? `${entries(missingRuntime)} missing runtime` : inventory.stockedBackupCount ? 'Recorded for every stocked backup' : 'No stocked backups', note: 'Enter the total runtime for each complete supply entry; watts or battery capacity alone do not establish runtime.' },
      { label: 'Recorded solar rating', value: !inventory.stockedSolarCount ? 'None in stock' : inventory.recordedSolarWatts === null ? 'Not recorded' : `${format(inventory.recordedSolarWatts)} W`, note: `${solarNote}${missingSolar ? ` ${entries(missingSolar)} missing a valid panel rating and excluded.` : ''}` },
      { label: 'Recorded backup coverage', value: coverage.days === null ? 'Not available' : `${format(coverage.days)} full days`, note: coverage.days === null ? coverage.detail : inventory.stockedBackupCount ? `${format(inventory.longestRuntimeHours)} hours ÷ 24; rounded down. This is not whole-house coverage unless your recorded load includes the whole house.` : coverage.detail, highlight: true },
    ],
  };
}
