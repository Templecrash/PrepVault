import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

// Street tiles are viewed online only. They are never copied into saved plans.
export default function RouteStreetMap({ route, stops = [] }) {
  const host = useRef(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    let map;
    import('leaflet').then(({ default: L }) => {
      if (disposed || !host.current) return;
      map = L.map(host.current, { scrollWheelZoom: false });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        referrerPolicy: 'strict-origin-when-cross-origin',
      }).on('tileerror', () => { if (!disposed) setError('Street tiles are unavailable. Your saved route drawing and directions remain below.'); }).addTo(map);
      const line = L.polyline(route.coordinates.map(p => [p[1], p[0]]), { color: '#31593f', weight: 5 }).addTo(map);
      const label = text => { const node = document.createElement('span'); node.textContent = text; return node; };
      route.points.forEach((point, index) => L.circleMarker([point.latitude, point.longitude], { radius: 8, color: '#fff', fillColor: '#31593f', fillOpacity: 1, weight: 2 }).bindTooltip(label(`${index + 1}. ${point.name}`), { permanent: true }).addTo(map));
      stops.filter(stop => !stop.isDestination).forEach(stop => L.circleMarker([stop.latitude, stop.longitude], { radius: 7, color: '#fff', fillColor: '#ad8149', fillOpacity: 1, weight: 2 }).bindTooltip(label(`Day ${stop.day}: suggested overnight area`)).addTo(map));
      route.avoidAreas.forEach(area => L.circle([area.latitude, area.longitude], { radius: area.radiusKm * 1000, color: '#9d6255', weight: 1, fillOpacity: .12 }).bindTooltip(label(`Avoid: ${area.name}`)).addTo(map));
      map.fitBounds(line.getBounds(), { padding: [32, 32], maxZoom: 15 });
    }).catch(() => { if (!disposed) setError('The street map could not be loaded. Use the saved route drawing below.'); });
    return () => { disposed = true; map?.remove(); };
  }, [route, stops]);
  return <div className="pv-route-street"><div ref={host} style={{ height: 360, borderRadius: 12, zIndex: 0 }} role="region" aria-label="Online street map of your route"/>{error && <p className="pv-route-note" role="status">{error}</p>}</div>;
}
