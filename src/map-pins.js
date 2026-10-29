const coordinate = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim() || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const rounded = value => Number(value.toFixed(6));

export function mapPointCoordinates(point) {
  const latitude = coordinate(point?.latitude), longitude = coordinate(point?.longitude);
  if (latitude === null || longitude === null || Math.abs(latitude) > 85 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

// Leaflet can return longitude outside the first world copy after panning.
// Mercator's visible poles extend slightly past the planner's 85° limit.
export function normalizeMapPick(point) {
  const latitude = coordinate(point?.lat ?? point?.latitude), longitude = coordinate(point?.lng ?? point?.longitude);
  if (latitude === null || longitude === null) return null;
  return { latitude: rounded(Math.max(-85, Math.min(85, latitude))), longitude: rounded(((longitude + 180) % 360 + 360) % 360 - 180) };
}

export function routePointLabel(index, total) {
  if (index === 0) return 'A';
  if (index === total - 1) return 'B';
  return String(index);
}

export function routeMapPoints(points) {
  return (Array.isArray(points) ? points : []).flatMap((point, index) => {
    const coordinates = mapPointCoordinates(point);
    return coordinates ? [{ ...point, ...coordinates, label: routePointLabel(index, points.length) }] : [];
  });
}
