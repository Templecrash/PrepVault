export const hasMapCoordinates = point => point &&
  String(point.latitude ?? '').trim() !== '' && String(point.longitude ?? '').trim() !== '' &&
  Number.isFinite(Number(point.latitude)) && Math.abs(Number(point.latitude)) <= 85 &&
  Number.isFinite(Number(point.longitude)) && Math.abs(Number(point.longitude)) <= 180;

export async function searchMapPlaces(query, { signal, fetchImpl = fetch } = {}) {
  const text = String(query || '').trim();
  if (text.length < 2 || text.length > 150) throw new Error('Enter an address or place between 2 and 150 characters.');
  const timeout = AbortSignal.timeout(20000);
  const response = await fetchImpl('/api/routing', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'search', query: text }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'Place search is unavailable. Try again or enter coordinates.');
    error.status = response.status;
    throw error;
  }
  if (!Array.isArray(data.results)) throw new Error('Place search returned an invalid response. Try again.');
  return data.results.filter(place => hasMapCoordinates(place) && typeof place.name === 'string' && place.name.trim() && typeof place.label === 'string' && place.label.trim())
    .slice(0, 6).map((place, index) => ({ id: String(place.id || index), name: place.name.slice(0, 150), label: place.label.slice(0, 150), detail: String(place.detail || '').slice(0, 300), latitude: Number(place.latitude), longitude: Number(place.longitude) }));
}
