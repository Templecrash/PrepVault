import { CONVERSATION_NOTES_KEY, normalizeConversationNotesSetting } from './conversation-notes.js';
import { CALENDAR_KEY, normalizeCalendarSetting } from './calendar.js';
import { ROUTE_PLANS_KEY, normalizeRoutePlansSetting } from './offline-route.js';
import { LOCATION_KEY, LOCATION_WATCHLIST_KEY, normalizeLocation, normalizeLocationWatchlist } from './location.js';
import { normalizeRadioLocation, RADIO_LOCATION_KEY } from './radio-directory.js';

const ARRAY_KEYS = new Set(['prepvault-dismissed-opps', 'prepvault-radio-log', 'prepvault-reference-channels', 'prepvault-user-channels']);
const OBJECT_KEYS = new Set(['prepvault-trap-status', 'pv-weather-cache', 'pv-news-cache']);
export function validateLocalSettings(settings) {
  for (const [key, raw] of Object.entries(settings || {})) {
    // Unknown keys are removed by the workspace allowlist, never restored.
    if (![...ARRAY_KEYS, ...OBJECT_KEYS, CONVERSATION_NOTES_KEY, RADIO_LOCATION_KEY, LOCATION_KEY, LOCATION_WATCHLIST_KEY, CALENDAR_KEY, ROUTE_PLANS_KEY, 'prepvault-radio-volume', 'prepvault-alerts-dismissed-until', 'prepvault-dismiss-profile-cta', 'prepvault-workspace-open', 'prepvault-scanner-feed'].includes(key)) continue;
    // Historical account caches discarded non-string preference values.
    if (typeof raw !== 'string') continue;
    try {
      if (key === CONVERSATION_NOTES_KEY) { normalizeConversationNotesSetting(raw); continue; }
      if (key === CALENDAR_KEY) { normalizeCalendarSetting(raw); continue; }
      if (key === ROUTE_PLANS_KEY) { normalizeRoutePlansSetting(raw); continue; }
      if (raw.length > 1_000_000) throw new Error();
      if (ARRAY_KEYS.has(key)) {
        const value = JSON.parse(raw);
        if (!Array.isArray(value) || value.length > 10000 || value.some(item => item === null || !['object', 'string', 'number'].includes(typeof item))) throw new Error();
      } else if (OBJECT_KEYS.has(key)) {
        const value = JSON.parse(raw);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      } else if (key === LOCATION_KEY) normalizeLocation(JSON.parse(raw));
      else if (key === LOCATION_WATCHLIST_KEY) normalizeLocationWatchlist(JSON.parse(raw));
      else if (key === RADIO_LOCATION_KEY) normalizeRadioLocation(JSON.parse(raw));
      else if (key === 'prepvault-radio-volume' && (!raw.trim() || !Number.isFinite(Number(raw)) || Number(raw) < 0 || Number(raw) > 1)) throw new Error();
      else if (key === 'prepvault-alerts-dismissed-until' && !/^\d{1,16}$/.test(raw)) throw new Error();
      else if (['prepvault-dismiss-profile-cta', 'prepvault-workspace-open'].includes(key) && !['0', '1', 'true', 'false'].includes(raw)) throw new Error();
      else if (key === 'prepvault-scanner-feed' && raw.length > 200) throw new Error();
    } catch { throw new Error(`Invalid saved setting in backup: ${key}. Your current plan has not been changed.`); }
  }
}
