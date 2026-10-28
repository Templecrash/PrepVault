import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

const EMPTY = [];
const validPoint = point => Number.isFinite(point?.latitude) && Math.abs(point.latitude) <= 85 && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;
const labelNode = text => { const node = document.createElement('span'); node.textContent = text; return node; };

// Street tiles are viewed online only. They are never copied into saved plans.
export default function RouteStreetMap({ route = null, points = EMPTY, avoidAreas = EMPTY, stops = EMPTY, fallback = null }) {
  const host = useRef(null);
  const instance = useRef(null);
  const lastView = useRef('');
  const [ready, setReady] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    let map;
    let observer;
    import('leaflet').then(({ default: L }) => {
      if (disposed || !host.current) return;
      map = L.map(host.current, { scrollWheelZoom: false }).setView([45, -90], 3);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        referrerPolicy: 'strict-origin-when-cross-origin',
      })
        .on('loading', () => { if (!disposed) setError(''); })
        .on('tileerror', () => { if (!disposed) setError('Street tiles could not load. Check your connection or try zooming the map.'); })
        .addTo(map);
      instance.current = { map, L, features: L.featureGroup().addTo(map) };
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => { if (!disposed) map.invalidateSize({ pan: false }); });
        observer.observe(host.current);
      }
      setReady(value => value + 1);
    }).catch(() => { if (!disposed) setError('The street map could not be loaded. Check your connection and reopen Maps.'); });
    return () => {
      disposed = true;
      observer?.disconnect();
      instance.current = null;
      lastView.current = '';
      map?.remove();
    };
  }, []);

  useEffect(() => {
    if (!ready || !instance.current) return;
    const { map, L, features } = instance.current;
    features.clearLayers();
    const selected = (route?.points || points).filter(validPoint);
    const areas = (route?.avoidAreas || avoidAreas).filter(area => validPoint(area) && Number.isFinite(Number(area.radiusKm)) && Number(area.radiusKm) > 0);
    let bounds;
    if (route?.coordinates?.length > 1) {
      const line = L.polyline(route.coordinates.map(point => [point[1], point[0]]), { color: '#31593f', weight: 5 }).addTo(features);
      bounds = line.getBounds();
    } else if (selected.length) {
      bounds = L.latLngBounds(selected.map(point => [point.latitude, point.longitude]));
    }
    selected.forEach((point, index) => L.circleMarker([point.latitude, point.longitude], { radius: 8, color: '#fff', fillColor: '#31593f', fillOpacity: 1, weight: 2 })
      .bindTooltip(labelNode(`${index + 1}. ${String(point.name || 'Location').split(',')[0]}`), { permanent: true, direction: 'top' }).addTo(features));
    stops.filter(stop => !stop.isDestination && validPoint(stop)).forEach(stop => L.circleMarker([stop.latitude, stop.longitude], { radius: 7, color: '#fff', fillColor: '#ad8149', fillOpacity: 1, weight: 2 })
      .bindTooltip(labelNode(`Day ${stop.day}: suggested overnight area`)).addTo(features));
    areas.forEach(area => L.circle([area.latitude, area.longitude], { radius: Number(area.radiusKm) * 1000, color: '#9d6255', weight: 1, fillOpacity: .12 })
      .bindTooltip(labelNode(`Avoid: ${area.name}`)).addTo(features));

    // Adjusting pace or rerendering the form must not interrupt map navigation.
    const view = bounds ? `${route ? 'route' : 'places'}:${bounds.toBBoxString()}` : '';
    if (view && view !== lastView.current) {
      lastView.current = view;
      if (!route && selected.length === 1) map.setView([selected[0].latitude, selected[0].longitude], 13);
      else map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    } else if (!view) {
      lastView.current = '';
    }
  }, [ready, route, points, avoidAreas, stops]);

  return <div className="pv-route-street">
    <div ref={host} style={{ height: 360, borderRadius: 12, zIndex: 0 }} role="region" aria-label="Online street map of your route"/>
    {!ready && !error && <p className="pv-route-note" role="status">Loading street map…</p>}
    {error && <><p className="pv-route-note" role="status">{error}{fallback ? ' Your route drawing is available below, and your directions remain usable.' : ' You can still select places and calculate a route.'}</p>{fallback}</>}
  </div>;
}
