import { mergeRecords, recordsEqual } from './storage.js';

const KEY = 'prepvault-db';
const read = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const CLOUD_FIELDS = {
  items: ['id', 'category', 'subType', 'name', 'quantity', 'location', 'fields', 'addedDate', 'propertyId'],
  pins: ['id', 'layer', 'type', 'x', 'y', 'label', 'notes', 'assignee'],
  properties: ['id', 'name', 'type', 'icon', 'lat', 'lng'],
};

// Core cloud fields keep the existing Supabase schema. The complete household
// remains on-device and in encrypted backups; do not claim full-cloud backup.
export class SyncEngine {
  constructor(supabase) {
    this.supabase = supabase;
    this.userId = null;
    this.syncTimer = null;
    this.queue = Promise.resolve();
    this.destroyed = false;
    this.epoch = 0;
    this.status = 'local';
    this.onOnline = () => this.queueSync();
    this.eventTarget = window;
    this.eventTarget.addEventListener('online', this.onOnline);
  }
  setStatusCallback(callback) { this.onStatusChange = callback; }
  setDataCallback(callback) { this.onData = callback; }
  setSnapshotProvider(callback) { this.getCurrentSnapshot = callback; }
  currentSnapshot() {
    const snapshot = this.getCurrentSnapshot?.() ?? read(KEY);
    return snapshot ? { ...snapshot } : null;
  }
  _setStatus(status) { if (!this.destroyed) { this.status = status; this.onStatusChange?.(status); } }
  isCurrent(userId, epoch) { return !this.destroyed && this.userId === userId && this.epoch === epoch; }
  get baselineKey() { return `prepvault-sync-baseline-${this.userId}`; }
  setUser(id) {
    clearTimeout(this.syncTimer);
    this.epoch += 1;
    this.userId = id;
    if (!id || id.startsWith('local-') || !this.supabase) { this.userId = null; this._setStatus('local'); return this.queue; }
    return this.schedule(async () => { await this.pull(); });
  }
  schedule(work) {
    const userId = this.userId, epoch = this.epoch;
    this.queue = this.queue.then(async () => {
      if (!userId || !this.isCurrent(userId, epoch)) return;
      if (!navigator.onLine) { this._setStatus('offline'); return; }
      try { await work(); } catch (error) {
        if (this.isCurrent(userId, epoch)) { console.error('Cloud sync failed:', error.message); this._setStatus('error'); }
      }
    });
    return this.queue;
  }
  queueSync() {
    if (this.destroyed || !this.userId || !this.supabase) return;
    clearTimeout(this.syncTimer);
    if (!navigator.onLine) { this._setStatus('offline'); return; }
    // Read the other device's latest changes before writing this device's
    // edits; pushing an old snapshot here would overwrite remote updates.
    this.syncTimer = setTimeout(() => this.schedule(() => this.pull()), 1200);
  }
  async checked(request) {
    const response = await request;
    if (response.error) throw response.error;
    return response.data;
  }
  async pull() {
    if (this.destroyed || !this.userId || !this.supabase) return;
    this._setStatus('syncing');
    const userId = this.userId, epoch = this.epoch;
    const [items, pins, properties, profile] = await Promise.all([
      this.checked(this.supabase.from('items').select('*').eq('user_id', userId).is('deleted_at', null)),
      this.checked(this.supabase.from('map_pins').select('*').eq('user_id', userId).is('deleted_at', null)),
      this.checked(this.supabase.from('properties').select('*').eq('user_id', userId)),
      this.checked(this.supabase.from('profiles').select('*').eq('id', userId).maybeSingle()),
    ]);
    if (!this.isCurrent(userId, epoch)) return;
    const local = this.currentSnapshot() || { items: [], pins: [], properties: [] };
    const beforeMerge = { ...local };
    const baseline = read(this.baselineKey) || {};
    const remote = {
      items: (items || []).map(i => ({ id: i.id, category: i.category, subType: i.sub_type, name: i.name, quantity: i.quantity, location: i.location || '', fields: i.fields || {}, addedDate: i.added_date, propertyId: i.property_id })),
      pins: (pins || []).map(p => ({ id: p.id, layer: p.layer, type: p.type, x: p.x, y: p.y, label: p.label, notes: p.notes, assignee: p.assignee })),
      properties: (properties || []).map(p => ({ id: p.id, name: p.name, type: p.type, icon: p.icon, ...(p.lat != null ? { lat: p.lat, lng: p.lng } : {}) })),
    };
    for (const key of ['items', 'pins', 'properties']) {
      // Do not upload demo inventory into an existing cloud account.
      const here = local.demoData && remote.items.length ? [] : (local[key] || []);
      local[key] = mergeRecords(here, remote[key], baseline[key] || [], { syncedKeys: CLOUD_FIELDS[key] });
    }
    if (!local.properties.length) local.properties = [{ id: 'prop1', name: 'My home', type: 'home', icon: '🏠' }];
    if (profile) {
      for (const [localKey, cloudKey] of [['people','people'], ['climate','climate'], ['propAddress','prop_address'], ['activePropertyId','active_property_id']]) {
        if (profile[cloudKey] != null && (local[localKey] == null || local[localKey] === baseline[localKey] || local.demoData)) local[localKey] = profile[cloudKey];
        if (profile[cloudKey] != null) remote[localKey] = profile[cloudKey];
      }
    }
    if (local.activePropertyId !== 'all' && !local.properties.some(property => property.id === local.activePropertyId)) local.activePropertyId = local.properties[0].id;
    if (remote.items.length) local.demoData = false;
    localStorage.setItem(KEY, JSON.stringify(local));
    // Baseline represents the cloud observation, not unsent local changes.
    localStorage.setItem(this.baselineKey, JSON.stringify({ ...baseline, ...remote }));
    // A no-op pull must not trigger React autosave and another sync forever.
    if (!recordsEqual(local, beforeMerge)) this.onData?.(local);
    // The React provider may not have rerendered after onData yet. Push the
    // exact merged snapshot, rather than rereading a pre-merge render.
    if (this.isCurrent(userId, epoch)) await this.push(local);
  }
  async push(snapshot) {
    if (this.destroyed || !this.userId || !this.supabase) return;
    if (!navigator.onLine) { this._setStatus('offline'); return; }
    const local = snapshot || this.currentSnapshot();
    if (!local || local.demoData) { this._setStatus('local'); return; }
    this._setStatus('syncing');
    const baseline = read(this.baselineKey) || {};
    const userId = this.userId, epoch = this.epoch;
    const now = new Date().toISOString();
    for (const [key, table, serialize] of [
      ['properties', 'properties', p => ({ id:p.id, name:p.name, type:p.type, icon:p.icon, lat:p.lat ?? null, lng:p.lng ?? null, user_id:userId })],
      ['items', 'items', i => ({ id:i.id, user_id:userId, property_id:i.propertyId || 'prop1', category:i.category, sub_type:i.subType, name:i.name, quantity:i.quantity ?? 1, location:i.location || '', fields:i.fields || {}, added_date:i.addedDate || now.slice(0,10), updated_at:now, deleted_at:null })],
      ['pins', 'map_pins', p => ({ id:p.id, user_id:userId, layer:p.layer || 'caches', type:p.type || 'marker', x:p.x ?? 0, y:p.y ?? 0, label:p.label || '', notes:p.notes || '', assignee:p.assignee || '', updated_at:now, deleted_at:null })],
    ]) {
      if (!this.isCurrent(userId, epoch)) return;
      const current = local[key] || [];
      for (let start=0;start<current.length;start+=500) {
        if (!this.isCurrent(userId, epoch)) return;
        await this.checked(this.supabase.from(table).upsert(current.slice(start,start+500).map(serialize), { onConflict:'id,user_id' }));
      }
      if (!this.isCurrent(userId, epoch)) return;
      const ids = new Set(current.map(i=>i.id));
      const removed = (baseline[key] || []).filter(i=>!ids.has(i.id)).map(i=>i.id);
      if (removed.length) {
        const request = table === 'properties' ? this.supabase.from(table).delete() : this.supabase.from(table).update({ deleted_at:now, updated_at:now });
        await this.checked(request.eq('user_id',userId).in('id',removed));
      }
    }
    if (!this.isCurrent(userId, epoch)) return;
    await this.checked(this.supabase.from('profiles').update({ climate:local.climate || 'temperate', people:local.people ?? 4, prop_address:local.propAddress || '', active_property_id:local.activePropertyId || 'prop1', updated_at:now }).eq('id',userId));
    if (this.isCurrent(userId, epoch)) {
      localStorage.setItem(this.baselineKey, JSON.stringify(local));
      this._setStatus('synced');
    }
  }
  migrateToCloud() { return this.schedule(() => this.pull()); }
  destroy() { this.destroyed=true; this.epoch+=1; clearTimeout(this.syncTimer); this.eventTarget.removeEventListener('online',this.onOnline); }
}
