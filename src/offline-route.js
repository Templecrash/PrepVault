export const ROUTE_PLANS_KEY = 'prepvault-offline-routes';
export const ROUTE_MODES = ['drive', 'avoid-highways', 'walk'];
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const coordinatesValid = (latitude, longitude) => Number.isFinite(latitude) && Math.abs(latitude) <= 85 && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
export function validateRouteRequest(value) {
  if (!record(value) || !ROUTE_MODES.includes(value.mode) || !Array.isArray(value.points) || value.points.length < 2 || value.points.length > 6) throw new Error('Choose two to six locations and a travel mode.');
  const point = value => {
    if (!record(value) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 150 || !coordinatesValid(value.latitude, value.longitude)) throw new Error('Each stop needs a name and valid latitude and longitude.');
    return { name: value.name.trim(), latitude: value.latitude, longitude: value.longitude };
  };
  const points = value.points.map(point);
  const directKm = points.slice(1).reduce((sum, p, i) => sum + haversineKm([p.longitude, p.latitude], [points[i].longitude, points[i].latitude]), 0);
  if (directKm < .02) throw new Error('Choose separate starting and destination locations.');
  if (directKm > (value.mode === 'walk' ? 300 : 3000)) throw new Error('Split this journey into shorter routes (up to 300 km walking or 3,000 km driving between stops).');
  const walkingSpeed = value.walkingSpeed ?? 4;
  if (!Number.isFinite(walkingSpeed) || walkingSpeed < 1 || walkingSpeed > 8) throw new Error('Choose a walking speed between 1 and 8 km/h.');
  if (value.avoidAreas !== undefined && (!Array.isArray(value.avoidAreas) || value.avoidAreas.length > 4)) throw new Error('Choose up to four areas to avoid.');
  const avoidAreas = (value.avoidAreas || []).map(area => {
    const p = point(area); if (!Number.isFinite(area.radiusKm) || area.radiusKm < .2 || area.radiusKm > 25) throw new Error('Avoidance areas need a radius between 0.2 and 25 km.');
    if (avoidancePolygon({ ...p, radiusKm: area.radiusKm }).some(([longitude, latitude]) => !coordinatesValid(latitude, longitude))) throw new Error('This avoidance area crosses the map boundary. Move it away from the date line or polar edge, or reduce its radius.');
    if (points.some(stop => haversineKm([stop.longitude, stop.latitude], [p.longitude, p.latitude]) < area.radiusKm)) throw new Error('A stop is inside an area you want to avoid. Move the stop or reduce that area.');
    return { ...p, radiusKm: area.radiusKm };
  });
  return { points, mode: value.mode, walkingSpeed, avoidAreas };
}
export function haversineKm(a, b) {
  const radians = value => value * Math.PI / 180;
  const dLat = radians(b[1] - a[1]), dLon = radians(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)));
}
export function avoidancePolygon(area) {
  return Array.from({ length: 25 }, (_, index) => {
    const angle = index * Math.PI / 12;
    return [area.longitude + Math.cos(angle) * area.radiusKm / (111.32 * Math.cos(area.latitude * Math.PI / 180)), area.latitude + Math.sin(angle) * area.radiusKm / 111.32];
  });
}
export function validateSavedRoute(value) {
  if (!record(value) || !ROUTE_MODES.includes(value.mode) || !Number.isFinite(value.distanceKm) || value.distanceKm <= 0 || value.distanceKm > 15000 || !Number.isFinite(value.durationSeconds) || value.durationSeconds <= 0 || value.durationSeconds > 20_000_000 || !Array.isArray(value.coordinates) || value.coordinates.length < 2 || value.coordinates.length > 100000 || value.coordinates.some(p => !Array.isArray(p) || p.length !== 2 || !coordinatesValid(p[1], p[0])) || !Array.isArray(value.instructions) || value.instructions.length > 10000 || !Number.isFinite(Date.parse(value.calculatedAt))) throw new Error('This saved route is incomplete or damaged.');
  const request = validateRouteRequest({ ...value, walkingSpeed: value.walkingSpeed ?? 4 });
  if (!value.coordinates.some(point => point[0] !== value.coordinates[0][0] || point[1] !== value.coordinates[0][1]) || !value.instructions.length) throw new Error('This saved route is missing usable geometry or directions.');
  const instructions = value.instructions.map(step => {
    if (!record(step) || typeof step.text !== 'string' || !step.text.trim() || step.text.length > 2000 || !Number.isFinite(step.distanceKm) || step.distanceKm < 0 || !Number.isFinite(step.timeSeconds) || step.timeSeconds < 0) throw new Error('Saved directions could not be read.');
    return { text: step.text, distanceKm: step.distanceKm, timeSeconds: step.timeSeconds };
  });
  return { ...request, distanceKm: value.distanceKm, durationSeconds: value.durationSeconds, coordinates: value.coordinates.map(p => [...p]), instructions, warnings: Array.isArray(value.warnings) ? value.warnings.filter(s => typeof s === 'string').slice(0, 20).map(s => s.slice(0, 500)) : [], calculatedAt: value.calculatedAt };
}
function normalizeTravel(value = {}) {
  const result = { hoursPerDay: value.hoursPerDay ?? 6, walkingSpeed: value.walkingSpeed ?? 4, drivingHours: value.drivingHours ?? 6, breakMinutes: value.breakMinutes ?? 15 };
  if (!Number.isFinite(result.hoursPerDay) || result.hoursPerDay < 1 || result.hoursPerDay > 12 || !Number.isFinite(result.drivingHours) || result.drivingHours < 1 || result.drivingHours > 12 || !Number.isFinite(result.walkingSpeed) || result.walkingSpeed < 1 || result.walkingSpeed > 8 || !Number.isFinite(result.breakMinutes) || result.breakMinutes < 0 || result.breakMinutes > 60) throw new Error('Use 1–12 travel hours/day, 1–8 km/h walking and 0–60 minutes of rest per moving hour.');
  return result;
}
export function normalizeRoutePlansSetting(raw) {
  if (typeof raw !== 'string' || raw.length > 12_000_000) throw new Error('Saved routes could not be read.');
  const rows = JSON.parse(raw); if (!Array.isArray(rows) || rows.length > 30) throw new Error('Keep up to 30 saved route plans.');
  const ids = new Set();
  return JSON.stringify(rows.map(plan => {
    if (!record(plan) || typeof plan.id !== 'string' || !plan.id || plan.id.length > 100 || ids.has(plan.id) || typeof plan.name !== 'string' || !plan.name.trim() || plan.name.length > 150 || !Number.isFinite(Date.parse(plan.savedAt))) throw new Error('A saved trip could not be read.');
    ids.add(plan.id); return { id: plan.id, name: plan.name.trim(), savedAt: plan.savedAt, route: validateSavedRoute(plan.route), travel: normalizeTravel(plan.travel) };
  }));
}
export function readRoutePlans(storage) { const raw = storage.getItem(ROUTE_PLANS_KEY); return raw === null ? [] : JSON.parse(normalizeRoutePlansSetting(raw)); }
export function saveRoutePlans(storage, rows) { const raw = normalizeRoutePlansSetting(JSON.stringify(rows)); storage.setItem(ROUTE_PLANS_KEY, raw); return JSON.parse(raw); }
export function planTravelDays(route, value = {}) {
  const travel = normalizeTravel(value);
  const moveHours = route.mode === 'walk' ? route.distanceKm / travel.walkingSpeed : route.durationSeconds / 3600;
  const totalHours = moveHours * (1 + travel.breakMinutes / 60);
  const budget = route.mode === 'walk' ? travel.hoursPerDay : travel.drivingHours;
  const days = Math.max(1, Math.ceil(totalHours / budget));
  if (days > 365) throw new Error('This plan exceeds 365 travel days. Split the route or increase your daily travel budget.');
  const dailyDistanceKm = route.distanceKm * budget / totalHours;
  const segments = route.coordinates.slice(1).map((p, i) => haversineKm(route.coordinates[i], p));
  const geometryLength = segments.reduce((a, b) => a + b, 0);
  const stops = Array.from({ length: days }, (_, i) => {
    const distanceKm = Math.min(route.distanceKm, dailyDistanceKm * (i + 1));
    let target = geometryLength * distanceKm / route.distanceKm; let segment = 0;
    while (segment < segments.length - 1 && target > segments[segment]) { target -= segments[segment]; segment++; }
    const fraction = segments[segment] ? Math.min(1, target / segments[segment]) : 0;
    const a = route.coordinates[segment], b = route.coordinates[segment + 1];
    const longitudeDelta = ((b[0] - a[0] + 540) % 360) - 180;
    const longitude = fraction === 1 ? b[0] : ((a[0] + longitudeDelta * fraction + 540) % 360) - 180;
    return { day: i + 1, distanceKm, latitude: a[1] + (b[1] - a[1]) * fraction, longitude, isDestination: distanceKm === route.distanceKm };
  });
  return { days, totalHours, stops, dailyDistanceKm };
}
export async function calculateRoute(value, { signal, fetchImpl = fetch } = {}) {
  const request = validateRouteRequest(value);
  const response = await fetchImpl('/api/routing', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
  const data = await response.json(); if (!response.ok) { const error = new Error(data.error || 'This route could not be calculated.'); error.status = response.status; throw error; }
  return validateSavedRoute(data.route);
}
export function routeToGpx(route) {
  const escape = s => String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="PrepVault" xmlns="http://www.topografix.com/GPX/1/1">${route.points.map(p => `<wpt lat="${p.latitude}" lon="${p.longitude}"><name>${escape(p.name)}</name></wpt>`).join('')}<trk><name>PrepVault saved route</name><trkseg>${route.coordinates.map(p => `<trkpt lat="${p[1]}" lon="${p[0]}"/>`).join('')}</trkseg></trk></gpx>`;
}
