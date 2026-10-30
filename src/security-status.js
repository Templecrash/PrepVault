import { surveillanceIsStale } from './overview-surveillance.js';

export const ALARM_LABELS = { armed_away: 'Armed · Away', armed_stay: 'Armed · Stay', disarmed: 'Disarmed', ready: 'Ready', not_ready: 'Not ready', entry_delay: 'Entry delay', exit_delay: 'Exit delay', mixed: 'Mixed states', alarm: 'Alarm reported', unknown: 'Unknown' };

export function alarmSystemIsArmed(system) {
  const armed = status => status === 'armed_away' || status === 'armed_stay';
  return armed(system?.status) || (system?.status === 'mixed' && Boolean(system.partitions?.some(partition => armed(partition.status))));
}

export function cameraSecurityStatus(reveal, nest, now = Date.now()) {
  const services = [reveal && { ...reveal, devices: reveal.cameras }, nest].filter(service => service?.connected);
  if (!services.length) return { label: 'Not connected', detail: 'Connect a camera account to begin.', attention: false };
  const devices = services.flatMap(service => Array.isArray(service.devices) ? service.devices : []);
  const stale = services.some(service => surveillanceIsStale(service, now));
  if (stale) return { label: 'Check connection', detail: 'Camera status could not be verified recently.', attention: true };
  if (!devices.length) return { label: 'No cameras found', detail: 'Your account is connected; no cameras were returned.', attention: false };
  const online = devices.filter(device => device.status === 'online').length;
  const offline = devices.filter(device => device.status === 'offline').length;
  const unknown = devices.length - online - offline;
  return { label: `${devices.length} ${devices.length === 1 ? 'camera' : 'cameras'}`, detail: [online && `${online} online`, offline && `${offline} offline`, unknown && `${unknown} status unknown`].filter(Boolean).join(' · '), attention: offline > 0 };
}

export function alarmSecurityStatus(eyezon, now = Date.now()) {
  if (!eyezon?.connected) return { label: 'Not connected', detail: 'Connect your alarm to see its reported state.', attention: false };
  if (surveillanceIsStale(eyezon, now)) return { label: 'Status unavailable', detail: 'Refresh or check your alarm provider directly.', attention: true };
  const systems = Array.isArray(eyezon.systems) ? eyezon.systems : [];
  if (!systems.length) return { label: 'No systems found', detail: 'No alarm systems were returned by EyezOn.', attention: false };
  const states = new Set(systems.map(system => system.status));
  const hasAlarm = systems.some(system => system.status === 'alarm' || system.partitions?.some(partition => partition.status === 'alarm'));
  const state = hasAlarm ? 'alarm' : states.size === 1 ? systems[0].status : 'mixed';
  return { label: ALARM_LABELS[state] || 'Unknown', detail: `${systems.length} ${systems.length === 1 ? 'system' : 'systems'} · Reported by EyezOn`, attention: hasAlarm, armed: systems.some(alarmSystemIsArmed) };
}
