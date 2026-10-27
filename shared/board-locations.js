import locationData from './board-locations-data.js';

export const countries = locationData;
const byCountry = new Map(countries.map(country => [country.code, country]));

export function isValidBoardLocation(country, region = '') {
  if (typeof country !== 'string' || typeof region !== 'string') return false;
  const selected = byCountry.get(country);
  return Boolean(selected && (region === '' || selected.regions.some(entry => entry.code === region)));
}

export function boardLocationLabel(country, region = '') {
  const selected = byCountry.get(country);
  if (!selected) return 'All countries';
  const area = selected.regions.find(entry => entry.code === region);
  return area ? `${area.name}, ${selected.name}` : selected.name;
}

export function regionsForCountry(country) {
  return byCountry.get(country)?.regions || [];
}
