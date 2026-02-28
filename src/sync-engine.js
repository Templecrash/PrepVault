/**
 * PrepVault Sync Engine — Offline-first with Supabase cloud sync
 *
 * Strategy:
 * 1. All mutations write to localStorage immediately (existing behavior)
 * 2. When online + authenticated, push changes to Supabase
 * 3. On login, pull remote data and merge
 * 4. Conflict resolution: last-write-wins via updated_at timestamp
 */

const SYNC_KEY = 'prepvault-sync-meta';
const PV_STORAGE_KEY = 'prepvault-db';

export class SyncEngine {
  constructor(supabase) {
    this.supabase = supabase;
    this.userId = null;
    this.syncTimer = null;
    this.status = 'local'; // 'local' | 'syncing' | 'synced' | 'error' | 'offline'
    this.onStatusChange = null;
    this.pendingChanges = false;
  }

  setUser(userId) {
    this.userId = userId;
    if (userId && navigator.onLine) {
      this.pull(); // Initial pull on login
    }
  }

  setStatusCallback(cb) {
    this.onStatusChange = cb;
  }

  _setStatus(status) {
    this.status = status;
    if (this.onStatusChange) this.onStatusChange(status);
  }

  /**
   * Called after every local save. Debounces cloud sync by 2s.
   */
  queueSync() {
    if (!this.userId || !navigator.onLine) {
      this._setStatus(navigator.onLine ? 'local' : 'offline');
      return;
    }
    this.pendingChanges = true;
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this.push(), 2000);
  }

  /**
   * Push local state to Supabase
   */
  async push() {
    if (!this.userId) return;
    this._setStatus('syncing');

    try {
      const raw = localStorage.getItem(PV_STORAGE_KEY);
      if (!raw) return;
      const local = JSON.parse(raw);

      // Upsert items
      if (local.items && local.items.length > 0) {
        const rows = local.items.map(item => ({
          id: item.id,
          user_id: this.userId,
          property_id: item.propertyId || local.activePropertyId || 'prop1',
          category: item.category,
          sub_type: item.subType,
          name: item.name,
          quantity: item.quantity || 1,
          location: item.location || '',
          fields: item.fields || {},
          added_date: item.addedDate || new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString(),
          version: (item._version || 0) + 1,
        }));

        // Batch upsert in chunks of 500
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          const { error } = await this.supabase
            .from('items')
            .upsert(chunk, { onConflict: 'id,user_id' });

          if (error) {
            console.error('Sync push items error:', error);
            throw error;
          }
        }
      }

      // Upsert profile settings
      const { error: profileError } = await this.supabase
        .from('profiles')
        .update({
          climate: local.climate || 'temperate',
          people: local.people || 4,
          prop_address: local.propAddress || '',
          active_property_id: local.activePropertyId || 'prop1',
          updated_at: new Date().toISOString(),
        })
        .eq('id', this.userId);

      if (profileError) {
        console.error('Sync push profile error:', profileError);
      }

      // Upsert map pins
      if (local.pins && local.pins.length > 0) {
        const pinRows = local.pins.map(pin => ({
          id: pin.id,
          user_id: this.userId,
          layer: pin.layer || 'caches',
          type: pin.type || 'marker',
          x: pin.x || 0,
          y: pin.y || 0,
          label: pin.label || '',
          notes: pin.notes || '',
          assignee: pin.assignee || '',
          updated_at: new Date().toISOString(),
        }));

        const { error: pinError } = await this.supabase
          .from('map_pins')
          .upsert(pinRows, { onConflict: 'id,user_id' });

        if (pinError) {
          console.error('Sync push pins error:', pinError);
        }
      }

      // Save sync metadata
      const meta = { lastPush: new Date().toISOString(), userId: this.userId };
      localStorage.setItem(SYNC_KEY, JSON.stringify(meta));

      this.pendingChanges = false;
      this._setStatus('synced');
    } catch (err) {
      console.error('Sync push failed:', err);
      this._setStatus('error');
    }
  }

  /**
   * Pull remote state and merge into localStorage
   */
  async pull() {
    if (!this.userId) return;
    this._setStatus('syncing');

    try {
      // Fetch remote items
      const { data: remoteItems, error: itemsError } = await this.supabase
        .from('items')
        .select('*')
        .eq('user_id', this.userId)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });

      if (itemsError) throw itemsError;

      // Fetch profile
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', this.userId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Profile fetch error:', profileError);
      }

      // Fetch pins
      const { data: remotePins, error: pinsError } = await this.supabase
        .from('map_pins')
        .select('*')
        .eq('user_id', this.userId)
        .is('deleted_at', null);

      if (pinsError) {
        console.error('Pins fetch error:', pinsError);
      }

      // Read current local state
      const raw = localStorage.getItem(PV_STORAGE_KEY);
      const local = raw ? JSON.parse(raw) : {};

      // Merge strategy: if remote has items, use remote (cloud is source of truth after first sync)
      if (remoteItems && remoteItems.length > 0) {
        const mergedItems = remoteItems.map(ri => ({
          id: ri.id,
          category: ri.category,
          subType: ri.sub_type,
          name: ri.name,
          quantity: ri.quantity,
          location: ri.location,
          fields: ri.fields || {},
          addedDate: ri.added_date,
          propertyId: ri.property_id,
          _version: ri.version,
        }));

        local.items = mergedItems;
      }

      // Merge profile settings
      if (profile) {
        local.climate = profile.climate || local.climate || 'temperate';
        local.people = profile.people || local.people || 4;
        local.propAddress = profile.prop_address || local.propAddress || '';
        local.activePropertyId = profile.active_property_id || local.activePropertyId || 'prop1';
      }

      // Merge pins
      if (remotePins && remotePins.length > 0) {
        local.pins = remotePins.map(rp => ({
          id: rp.id,
          layer: rp.layer,
          type: rp.type,
          x: rp.x,
          y: rp.y,
          label: rp.label,
          notes: rp.notes,
          assignee: rp.assignee,
        }));
      }

      // Save merged state to localStorage
      local.savedAt = new Date().toISOString();
      localStorage.setItem(PV_STORAGE_KEY, JSON.stringify(local));

      // Save sync metadata
      const meta = { lastPull: new Date().toISOString(), userId: this.userId };
      localStorage.setItem(SYNC_KEY, JSON.stringify(meta));

      this._setStatus('synced');
      return local; // Return merged data so caller can update React state
    } catch (err) {
      console.error('Sync pull failed:', err);
      this._setStatus('error');
      return null;
    }
  }

  /**
   * Initial migration: push local data to cloud on first login
   */
  async migrateToCloud() {
    if (!this.userId) return;

    const meta = (() => {
      try { return JSON.parse(localStorage.getItem(SYNC_KEY)); } catch { return null; }
    })();

    // Only migrate if we've never synced before
    if (meta?.userId === this.userId) return;

    const raw = localStorage.getItem(PV_STORAGE_KEY);
    if (!raw) return;

    const local = JSON.parse(raw);
    if (!local.items || local.items.length === 0) return;

    console.log('First sync: migrating', local.items.length, 'local items to cloud');
    await this.push();
  }

  destroy() {
    if (this.syncTimer) clearTimeout(this.syncTimer);
  }
}
