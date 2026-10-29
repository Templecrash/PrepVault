import { hasMapCoordinates } from './map-search.js';

export const routePointLabel = (index, count) => index === 0 ? 'Starting point' : index === count - 1 ? 'Destination' : `Stop ${index}`;
export const routePointLetter = (index, count) => index === 0 ? 'A' : index === count - 1 ? 'B' : String(index);

export function withMapPin(point, coordinates) {
  if (!point || !hasMapCoordinates(coordinates)) throw new Error('Choose a valid point on the map.');
  const latitude = Number(coordinates.latitude).toFixed(6);
  const longitude = Number(coordinates.longitude).toFixed(6);
  const generated = !point.name?.trim() || /^Map pin: -?\d+\.\d+, -?\d+\.\d+$/.test(point.name);
  return { ...point, name: generated ? `Map pin: ${latitude}, ${longitude}` : point.name,
    latitude, longitude, selectionSource: 'map', matchType: undefined, matchLabel: undefined };
}

export function nextUnplacedPoint(points, placedId) {
  const index = points.findIndex(point => point.id === placedId);
  const ordered = [...points.slice(index + 1), ...points.slice(0, index)];
  return ordered.find(point => !hasMapCoordinates(point))?.id || null;
}
