export const TRAVEL_MODES = [
  { value: 'driving', label: 'Drive', flag: 'd' },
  { value: 'walking', label: 'Walk', flag: 'w' },
  { value: 'bicycling', label: 'Cycle', flag: 'b' },
  { value: 'transit', label: 'Transit', flag: 'r' },
];

export function routePropertyId(propertyId) {
  return typeof propertyId === 'string' && propertyId && propertyId !== 'all' ? propertyId : 'prop1';
}

export function routesForProperty(routes, propertyId) {
  const id = routePropertyId(propertyId);
  return (Array.isArray(routes) ? routes : []).filter(route => route && routePropertyId(route.propertyId) === id);
}

export function savedRoutePlaces(properties, mapSetups = {}, propAddress = '') {
  return (Array.isArray(properties) ? properties : []).map(property => ({
    id: property.id,
    name: property.name,
    address: String(mapSetups[property.id]?.address || property.address || (property.id === 'prop1' ? propAddress : '') || '').trim(),
  }));
}

export function validateRoute(draft) {
  const origin = typeof draft?.origin === 'string' ? draft.origin.trim() : '';
  const destination = typeof draft?.destination === 'string' ? draft.destination.trim() : '';
  if (!origin || !destination) throw new Error('Add a starting point and a destination.');
  if (origin.length > 300 || destination.length > 300) throw new Error('Keep each location under 300 characters.');
  const comparable = value => value.toLocaleLowerCase().replace(/\s+/g, ' ');
  if (comparable(origin) === comparable(destination)) throw new Error('Choose two different locations.');
  const travelMode = draft.travelMode || 'driving';
  if (!TRAVEL_MODES.some(mode => mode.value === travelMode)) throw new Error('Choose a supported travel mode.');
  const name = (typeof draft.name === 'string' ? draft.name.trim() : '') || `${origin} → ${destination}`.slice(0, 100);
  const notes = typeof draft.notes === 'string' ? draft.notes.trim() : '';
  if (name.length > 100) throw new Error('Keep the route name under 100 characters.');
  if (notes.length > 2000) throw new Error('Keep route notes under 2,000 characters.');
  return { origin, destination, travelMode, name, notes };
}

// Documented universal Maps URL: works in Google Maps on mobile and desktop.
// https://developers.google.com/maps/documentation/urls/get-started#directions-action
export function googleDirectionsUrl(draft) {
  const { origin, destination, travelMode } = validateRoute(draft);
  const params = new URLSearchParams({ api: '1', origin, destination, travelmode: travelMode });
  const url = `https://www.google.com/maps/dir/?${params}`;
  if (url.length > 2048) throw new Error('These locations are too long for Google Maps. Use shorter addresses or coordinates.');
  return url;
}

// Uses the same legacy Maps iframe endpoint as the property map. A direct
// documented Maps URL is always offered alongside it if embedding is blocked.
export function googleRouteEmbedUrl(draft) {
  const { origin, destination, travelMode } = validateRoute(draft);
  const dirflg = TRAVEL_MODES.find(mode => mode.value === travelMode).flag;
  return `https://maps.google.com/maps?${new URLSearchParams({ saddr: origin, daddr: destination, dirflg, output: 'embed' })}`;
}

export function upsertRoute(routes, draft, { id, propertyId, now }) {
  const values = validateRoute(draft);
  googleDirectionsUrl(values);
  const scope = routePropertyId(propertyId);
  const existing = routes.find(route => route.id === id && routePropertyId(route.propertyId) === scope);
  if (!existing && routes.some(route => route.id === id)) throw new Error('This route belongs to another property. Start a new route.');
  const next = { ...existing, ...values, id, propertyId: scope, createdAt: existing?.createdAt || now, updatedAt: now };
  return existing ? routes.map(route => route === existing ? next : route) : [...routes, next];
}
