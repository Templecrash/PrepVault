import { computeRationing } from './rationing.js';

const format = value => Number.isFinite(value) ? value.toLocaleString() : '—';
const peopleLabel = count => `${format(count)} ${count === 1 ? 'person' : 'people'}`;

// Dedicated Food and Water pages use the same recorded stock and assumptions
// as Overview and Rationing. Treatment equipment is not stored drinking water.
export function buildEssentialPlanning(category, items = [], peopleCount = 0, dailyCalTarget = 2000, waterGalPerPerson = 1) {
  if (!['food', 'water'].includes(category)) return null;
  const ration = computeRationing(items, peopleCount, dailyCalTarget, waterGalPerPerson);
  const count = ration.peopleCount;
  const noPeople = !count;
  const people = { label: 'People in this plan', value: count ? peopleLabel(count) : 'Not set', note: 'Only contacts marked as dependants in Your People' };

  if (category === 'food') {
    const noTarget = !ration.dailyCalTarget;
    const missingSettings = noPeople ? 'Mark dependants in Your People to estimate coverage.' : noTarget ? 'Set a calorie target in Rationing to estimate coverage.' : '';
    const omitted = ration.omittedFoodCount;
    const nutritionNote = omitted ? `${omitted} ${omitted === 1 ? 'entry needs' : 'entries need'} nutrition details.` : '';
    const dailyNeed = count * ration.dailyCalTarget;
    return {
      title: 'Food coverage',
      bigNum: ration.foodDays === null ? '—' : format(ration.foodDays),
      bigUnit: 'full days',
      summary: [missingSettings || `${peopleLabel(count)} · ${format(ration.dailyCalTarget)} cal/person/day`, nutritionNote].filter(Boolean).join(' · '),
      rows: [
        { label: 'Recorded calories', value: `${format(ration.totalCalories)} cal`, note: 'Quantity × servings per unit × calories per serving; out-of-stock entries contribute zero' },
        people,
        { label: 'Calorie target', value: noTarget ? 'Not set' : `${format(ration.dailyCalTarget)} cal/person/day`, note: 'Uses your current Rationing target' },
        { label: 'Daily consumption', value: missingSettings ? 'Not available' : `${format(dailyNeed)} cal/day`, note: missingSettings || `${format(count)} × ${format(ration.dailyCalTarget)} cal` },
        { label: 'Nutrition details', value: omitted ? `${format(omitted)} ${omitted === 1 ? 'entry' : 'entries'} not counted` : 'No stocked entries omitted', note: 'Food in stock needs both calories per serving and servings per unit to count toward coverage' },
        { label: 'Recorded food coverage', value: ration.foodDays === null ? 'Not available' : `${format(ration.foodDays)} full days`, note: missingSettings || `${format(ration.totalCalories)} ÷ ${format(dailyNeed)}; rounded down`, highlight: true },
      ],
    };
  }

  const missingSettings = noPeople ? 'Mark dependants in Your People to estimate coverage.' : '';
  return {
    title: 'Stored-water coverage',
    bigNum: ration.waterDays === null ? '—' : format(ration.waterDays),
    bigUnit: 'full days',
    summary: missingSettings || `${peopleLabel(count)} · ${format(ration.waterGalPerPerson)} gal/person/day · stored water only`,
    rows: [
      { label: 'Stored water', value: `${format(ration.totalWaterGal)} gal`, note: 'Recorded stored-water quantities, in gallons; container capacity is not multiplied again' },
      people,
      { label: 'Daily consumption', value: noPeople ? 'Not available' : `${format(ration.dailyWaterGal)} gal/day`, note: missingSettings || `${format(count)} × ${format(ration.waterGalPerPerson)} gal/person/day for drinking, food preparation and hygiene. This is not a drinking limit.` },
      { label: 'Sources & treatment', value: 'Tracked separately', note: 'Filters, tablets, wells and other sources do not add stored gallons or bonus days' },
      { label: 'Stored-water coverage', value: ration.waterDays === null ? 'Not available' : `${format(ration.waterDays)} full days`, note: missingSettings || `${format(ration.totalWaterGal)} ÷ ${format(ration.dailyWaterGal)}; rounded down`, highlight: true },
    ],
  };
}
