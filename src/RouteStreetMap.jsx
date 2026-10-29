import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { mapPointCoordinates, normalizeMapPick, routeMapPoints } from './map-pins.js';
import 'leaflet/dist/leaflet.css';

const EMPTY = [];
const labelNode = text => { const node = document.createElement('span'); node.textContent = text; return node; };
const pinNode = label => {
  const node = labelNode(label);
  node.style.cssText = 'display:grid;place-items:center;width:28px;height:28px;box-sizing:border-box;border:2px solid #fff;border-radius:50%;background:var(--pv-accent,#f48947);color:var(--pv-on-accent,#171310);font:600 12px/1 system-ui;box-shadow:0 1px 5px #0006;';
  return node;
};

// Street tiles are viewed online only. They are never copied into saved plans.
export default function RouteStreetMap({ route = null, points = EMPTY, avoidAreas = EMPTY, stops = EMPTY, fallback = null, picking = false, pickingLabel = 'location', disabled = false, onMapPick, onPointMove, initialCenter = null, viewRevision, focusPoint = null }) {
  const host = useRef(null);
  const instance = useRef(null);
  const initial = useRef(initialCenter);
  const interaction = useRef({ picking, disabled, onMapPick, onPointMove });
  const skipNextFit = useRef(false);
  const lastView = useRef('');
  const lastRevision = useRef(viewRevision);
  const lastPoints = useRef('');
  const lastRoute = useRef(null);
  const lastFocusKey = useRef(null);
  const ignoreClickUntil = useRef(0);
  const [ready, setReady] = useState(0);
  const [error, setError] = useState('');
  const editable = typeof onPointMove === 'function';

  useLayoutEffect(() => { interaction.current = { picking, disabled, onMapPick, onPointMove }; }, [picking, disabled, onMapPick, onPointMove]);
  useEffect(() => {
    let disposed = false;
    let map;
    let observer;
    import('leaflet').then(({ default: L }) => {
      if (disposed || !host.current) return;
      const center = normalizeMapPick(initial.current);
      map = L.map(host.current, { scrollWheelZoom: false, worldCopyJump: true }).setView(center ? [center.latitude, center.longitude] : [45, -90], center ? 11 : 3);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        referrerPolicy: 'strict-origin-when-cross-origin',
      })
        .on('loading', () => { if (!disposed) setError(''); })
        .on('tileerror', () => { if (!disposed) setError('Street tiles could not load. Check your connection or try zooming the map.'); })
        .addTo(map);
      map.on('dragstart dragend', () => { ignoreClickUntil.current = Date.now() + 250; });
      map.on('click', event => {
        const current = interaction.current;
        if (disposed || !current.picking || current.disabled || typeof current.onMapPick !== 'function' || event.originalEvent?.detail > 1 || Date.now() < ignoreClickUntil.current) return;
        const point = normalizeMapPick(event.latlng);
        if (!point) return;
        skipNextFit.current = true;
        current.onMapPick(point);
      });
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
      lastView.current = ''; lastPoints.current = ''; lastRoute.current = null; lastFocusKey.current = null; skipNextFit.current = false;
      map?.remove();
    };
  }, []);

  useEffect(() => {
    if (!ready || !instance.current) return;
    const { map, L, features } = instance.current;
    features.clearLayers();
    const selected = routeMapPoints(editable ? points : (route?.points || points));
    const areas = (route?.avoidAreas || avoidAreas).flatMap(area => {
      const point = mapPointCoordinates(area);
      return point && Number.isFinite(Number(area.radiusKm)) && Number(area.radiusKm) > 0 ? [{ ...area, ...point }] : [];
    });
    let bounds;
    if (route?.coordinates?.length > 1) {
      const line = L.polyline(route.coordinates.map(point => [point[1], point[0]]), { color: '#f48947', weight: 5 }).addTo(features);
      bounds = line.getBounds();
    } else if (selected.length) {
      bounds = L.latLngBounds(selected.map(point => [point.latitude, point.longitude]));
    }
    selected.forEach(point => {
      const canMove = editable && !disabled && point.id !== undefined && point.id !== null;
      const title = `${point.label}: ${String(point.name || 'Location').split(',')[0]}`;
      const marker = L.marker([point.latitude, point.longitude], {
        icon: L.divIcon({ html: pinNode(point.label), className: 'pv-route-point-pin', iconSize: [28, 28], iconAnchor: [14, 14], tooltipAnchor: [0, -15] }),
        draggable: canMove, autoPan: canMove, keyboard: true, title: `${title}${canMove ? '. Drag to adjust.' : ''}`, alt: title, bubblingMouseEvents: false,
      }).bindTooltip(labelNode(title), { direction: 'top' }).addTo(features);
      marker.on('dragstart', () => { ignoreClickUntil.current = Date.now() + 250; });
      marker.on('dragend', () => {
        ignoreClickUntil.current = Date.now() + 250;
        const current = interaction.current;
        if (!map.hasLayer(marker) || current.disabled || typeof current.onPointMove !== 'function') return;
        const moved = normalizeMapPick(marker.getLatLng());
        if (!moved) { marker.setLatLng([point.latitude, point.longitude]); return; }
        marker.setLatLng([moved.latitude, moved.longitude]);
        skipNextFit.current = true;
        current.onPointMove(point.id, moved);
      });
    });
    stops.filter(stop => !stop.isDestination).forEach(stop => {
      const point = mapPointCoordinates(stop);
      if (point) L.circleMarker([point.latitude, point.longitude], { radius: 7, color: '#fff', fillColor: '#ad8149', fillOpacity: 1, weight: 2 })
        .bindTooltip(labelNode(`Day ${stop.day}: suggested overnight area`)).addTo(features);
    });
    areas.forEach(area => L.circle([area.latitude, area.longitude], { radius: Number(area.radiusKm) * 1000, color: '#9d6255', weight: 1, fillOpacity: .12 })
      .bindTooltip(labelNode(`Avoid: ${area.name}`)).addTo(features));

    // Fit address searches/new routes, but leave the viewport alone after a
    // click or drag so the next pin can be placed without a camera jump.
    const view = bounds ? `${route ? 'route' : 'places'}:${bounds.toBBoxString()}` : '';
    const pointSignature = selected.map(point => `${point.id}:${point.label}:${point.latitude},${point.longitude}`).join('|');
    const changedPoints = pointSignature !== lastPoints.current;
    const requestedFit = viewRevision !== lastRevision.current;
    const newRoute = Boolean(route && route !== lastRoute.current);
    const shouldFit = view && (view !== lastView.current || requestedFit || newRoute);
    const skip = skipNextFit.current && !requestedFit && !newRoute;
    if (shouldFit) {
      const initialFit = !lastView.current;
      lastView.current = view;
      if (!skip && (viewRevision === undefined || requestedFit || initialFit || newRoute)) {
        if (!route && selected.length === 1) map.setView([selected[0].latitude, selected[0].longitude], 13);
        else map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      }
    } else if (!view) lastView.current = '';
    if (changedPoints || requestedFit) skipNextFit.current = false;
    lastPoints.current = pointSignature;
    lastRevision.current = viewRevision;
    lastRoute.current = route;
  }, [ready, route, points, avoidAreas, stops, editable, disabled, viewRevision]);

  useEffect(() => {
    const enabled = picking && !disabled;
    if (host.current) host.current.style.cursor = enabled ? 'crosshair' : '';
    if (instance.current) {
      if (enabled) instance.current.map.doubleClickZoom.disable();
      else instance.current.map.doubleClickZoom.enable();
    }
  }, [picking, disabled, ready]);

  useEffect(() => {
    if (!ready || !instance.current || focusPoint?.key === undefined || focusPoint?.key === null) return;
    const coordinates = mapPointCoordinates(focusPoint);
    if (!coordinates || focusPoint.key === lastFocusKey.current) return;
    lastFocusKey.current = focusPoint.key;
    instance.current.map.setView([coordinates.latitude, coordinates.longitude], 15);
  }, [ready, focusPoint]);
  const useCenter = () => {
    const current = interaction.current;
    if (!instance.current || !current.picking || current.disabled || typeof current.onMapPick !== 'function') return;
    const center = normalizeMapPick(instance.current.map.getCenter());
    if (!center) return;
    skipNextFit.current = true;
    current.onMapPick(center);
  };

  return <div className="pv-route-street">
    <div style={{ position: 'relative' }}>
      <div ref={host} style={{ height: 360, borderRadius: 12, zIndex: 0 }} role="region" aria-label={picking ? `Map to place ${pickingLabel}. Use arrow keys to pan, then choose Use map centre.` : 'Online street map of your route'}/>
      {picking && !disabled && <span aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 1, pointerEvents: 'none', width: 22, height: 22, display: 'grid', placeItems: 'center', color: '#171310', background: '#ffffffd9', border: '2px solid #171310', borderRadius: '50%', font: '600 20px/1 system-ui', boxShadow: '0 0 0 2px #fff' }}>+</span>}
    </div>
    {picking && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginTop: 12 }}><p className="pv-route-note" role="status" style={{ margin: 0 }}>{disabled ? 'Pin editing is paused while the route is being checked.' : `Click or tap to place ${pickingLabel}. Or pan the map to the centre target.`}</p><button type="button" className="pv-inventory-button pv-inventory-button-secondary" disabled={!ready || disabled || typeof onMapPick !== 'function'} onClick={useCenter}>Use map centre</button></div>}
    {!ready && !error && <p className="pv-route-note" role="status">Loading street map…</p>}
    {error && <><p className="pv-route-note" role="status">{error}{fallback ? ' Your route drawing is available below, and your directions remain usable.' : ' You can still select places and calculate a route.'}</p>{fallback}</>}
  </div>;
}
