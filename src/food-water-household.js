// The directory is the only food/water roster. Never infer participation from
// a person's age, group, role, or the separate scenario household setting.
export function buildFoodWaterRoster(contacts = []) {
  if (!Array.isArray(contacts)) return [];
  return contacts.filter(person => person?.isDependant === true)
    .map(person => ({ id: person.id, name: person.name, isDependant: true }));
}
