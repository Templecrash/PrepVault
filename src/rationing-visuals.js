import { computeRationing } from './rationing.js';
import { inventoryCondition, recordedQuantity } from './inventory-visuals.js';

const format = value => value.toLocaleString(undefined, { maximumFractionDigits: 1 });

/** Visual comparisons keep incomplete inputs distinct from an empty stockpile.
 * Expiry/rotation checks qualify the estimate; they never rewrite inventory. */
export function buildRationingVisuals({ items = [], peopleCount = 0, dailyCalTarget = 2000, waterGalPerPerson = 1, planningDays = 14, categories = {}, now = Date.now() } = {}) {
  const sanitized = items.map(item => ({ ...item, quantity: recordedQuantity(item.quantity) ?? 0, ...(item.category === 'food' ? { fields: { ...item.fields, calories: recordedQuantity(item.fields?.calories) ?? 0, servings: recordedQuantity(item.fields?.servings) ?? 0 } } : {}) }));
  const result = computeRationing(sanitized, peopleCount, dailyCalTarget, waterGalPerPerson);
  const window = recordedQuantity(planningDays) > 0 ? Number(planningDays) : 14;
  const foods = items.filter(item => item.category === 'food');
  const water = items.filter(item => item.category === 'water' && item.subType === 'storedWater');
  const unknownFoodQuantities = foods.filter(item => recordedQuantity(item.quantity) === null).length;
  const unknownWaterQuantities = water.filter(item => recordedQuantity(item.quantity) === null).length;
  const countedFoods = result.foodItems.filter(item => item.quantity > 0 && item.hasCalorieData).length;
  const pendingChecks = source => source.filter(item => recordedQuantity(item.quantity) > 0 && inventoryCondition(item, categories, [], now).state !== 'ready').length;
  const foodChecks = pendingChecks(foods);
  const waterChecks = pendingChecks(water);

  const bar = (kind, days, unknownQuantities, incomplete, checks, amount) => {
    const noNutrition = kind === 'food' && !countedFoods && result.omittedFoodCount > 0;
    const missing = !result.peopleCount ? 'Select dependants to estimate days.'
      : kind === 'food' && !result.dailyCalTarget ? 'Set a daily calorie target.'
        : unknownQuantities ? `Record quantities for ${unknownQuantities} ${unknownQuantities === 1 ? 'entry' : 'entries'} before estimating days.`
          : noNutrition ? 'Record calories and servings before estimating food days.' : '';
    const value = missing ? null : days;
    const tone = value === null ? 'unknown' : incomplete ? 'warning' : value < window ? 'danger' : checks ? 'warning' : 'good';
    const comparison = value === null ? missing : value < window ? `${window - value} days below this window${incomplete ? ' in counted stock' : ''}.` : 'The recorded amount reaches this window.';
    const details = [comparison, amount];
    if (incomplete) details.push(`${result.omittedFoodCount} stocked food ${result.omittedFoodCount === 1 ? 'entry lacks' : 'entries lack'} nutrition details; this is a lower-bound estimate.`);
    if (checks) details.push(`${checks} stock ${checks === 1 ? 'entry needs' : 'entries need'} an expiry, rotation or detail check.`);
    return { value, max: window, valueLabel: value === null ? 'Not estimated' : `${incomplete ? '≥ ' : ''}${format(value)} days`, targetLabel: `${window}-day window`, tone, note: details.join(' ') };
  };
  return {
    food: bar('food', result.foodDays, unknownFoodQuantities, result.omittedFoodCount > 0, foodChecks, `${format(result.totalCalories)} calories counted.`),
    water: bar('water', result.waterDays, unknownWaterQuantities, false, waterChecks, `${format(result.totalWaterGal)} gallons counted.`),
    foodDetails: {
      segments: [
        { id: 'counted', label: 'Calories + servings recorded', value: countedFoods, tone: 'neutral' },
        { id: 'nutrition', label: 'Nutrition missing', value: result.omittedFoodCount, tone: 'unknown' },
        { id: 'quantity', label: 'Quantity missing', value: unknownFoodQuantities, tone: 'unknown' },
      ],
      value: countedFoods, label: 'entries counted',
      note: 'Calculation inputs only. Complete nutrition fields do not confirm expiry, condition or dietary suitability.',
    },
  };
}
