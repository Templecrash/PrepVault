const numberOrZero = value => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};
const FOOD_TYPES = {
  cannedGoods: { label: 'Canned goods', unit: 'cans' },
  freezeDried: { label: 'Freeze-dried food', unit: 'pouches' },
  rice: { label: 'Rice / grains', unit: 'lbs' },
  livestock: { label: 'Livestock', unit: 'animals' },
  huntingFishing: { label: 'Hunting / fishing', unit: 'kits' },
  preserves: { label: 'Preserves', unit: 'jars' },
  frozenMeat: { label: 'Frozen meat', unit: 'lbs' },
  dryGoods: { label: 'Dry goods', unit: 'lbs' },
};

// Stored-water quantity is already measured in gallons. Capacity describes its
// container and must not be multiplied into the recorded stock a second time.
export function computeRationing(items = [], peopleCount = 0, dailyCalTarget = 2000, waterGalPerPerson = 1) {
  const count = Math.floor(numberOrZero(peopleCount));
  const target = numberOrZero(dailyCalTarget);
  const waterTarget = Math.max(1, Math.min(5, numberOrZero(waterGalPerPerson)));
  const foodItems = items.filter(item => item.category === 'food').map(item => {
    const quantity = numberOrZero(item.quantity);
    const caloriesPerServing = numberOrZero(item.fields?.calories);
    const servings = numberOrZero(item.fields?.servings);
    const product = quantity * caloriesPerServing * servings;
    const hasCalorieData = caloriesPerServing > 0 && servings > 0 && Number.isFinite(product);
    return { ...item, name: item.name || FOOD_TYPES[item.subType]?.label || 'Food', unit: FOOD_TYPES[item.subType]?.unit || 'units', quantity, caloriesPerServing, servings, hasCalorieData, totalCalories: hasCalorieData ? product : 0 };
  });
  const waterItems = items.filter(item => item.category === 'water' && item.subType === 'storedWater').map(item => ({ ...item, name: item.name || 'Stored water', gallons: numberOrZero(item.quantity) }));
  const totalCalories = foodItems.reduce((sum, item) => sum + item.totalCalories, 0);
  const totalWaterGal = waterItems.reduce((sum, item) => sum + item.gallons, 0);
  const mealSuggestions = count ? foodItems.filter(item => item.quantity > 0 && item.hasCalorieData).sort((a, b) => b.caloriesPerServing - a.caloriesPerServing).slice(0, 6).map(item => ({ ...item, unitsNeeded: Math.ceil(count / item.servings), shortOnStock: item.quantity < Math.ceil(count / item.servings) })) : [];
  return {
    peopleCount: count, dailyCalTarget: target, waterGalPerPerson: waterTarget, dailyWaterGal: count ? count * waterTarget : null, totalCalories, totalWaterGal,
    foodDays: count && target ? Math.floor(totalCalories / (count * target)) : null,
    waterDays: count ? Math.floor(totalWaterGal / (count * waterTarget)) : null,
    omittedFoodCount: foodItems.filter(item => item.quantity > 0 && !item.hasCalorieData).length,
    foodItems, waterItems, mealSuggestions,
  };
}
