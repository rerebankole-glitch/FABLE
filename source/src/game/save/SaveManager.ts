import type { WorldSave } from '../core/types';

const DB_NAME = 'fable-saves';
const STORE = 'worlds';
const LS_PREFIX = 'fable-save-';
const BACKUP_SUFFIX = '.bak';

export interface WorldSummary {
  id: string;
  name: string;
  mode: string;
  difficulty: string;
  worldType: string;
  seed: number;
  seedText: string;
  lastPlayed: number;
  created: number;
  playTime: number;
  day: number;
  preview?: string;
  /** number of edited chunks */
  size: number;
}

/**
 * Persists worlds in IndexedDB (falls back to localStorage, then memory).
 * Static API so the game code can call `SaveManager.put(save)` from anywhere.
 */
export class SaveManager {
  private static db: IDBDatabase | null = null;
  private static ready: Promise<void> | null = null;
  private static memory = new Map<string, WorldSave>();
  private static useLocal = false;

  private static open(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') { this.useLocal = typeof localStorage !== 'undefined'; resolve(); return; }
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
        };
        req.onsuccess = () => { this.db = req.result; resolve(); };
        req.onerror = () => { console.warn('IndexedDB unavailable, falling back to localStorage'); this.useLocal = typeof localStorage !== 'undefined'; resolve(); };
        req.onblocked = () => resolve();
      } catch { this.useLocal = typeof localStorage !== 'undefined'; resolve(); }
    });
    return this.ready;
  }

  private static async all(): Promise<WorldSave[]> {
    await this.open();
    if (this.db) {
      return new Promise((resolve) => {
        try {
          const tx = this.db!.transaction(STORE, 'readonly');
          const req = tx.objectStore(STORE).getAll();
          req.onsuccess = () => resolve((req.result as WorldSave[]) ?? []);
          req.onerror = () => resolve([]);
        } catch { resolve([]); }
      });
    }
    if (this.useLocal) {
      const out: WorldSave[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LS_PREFIX)) { try { out.push(JSON.parse(localStorage.getItem(k)!)); } catch { /* skip */ } }
      }
      return out;
    }
    return Array.from(this.memory.values());
  }

  static summarize(s: WorldSave): WorldSummary {
    const o = s.options ?? ({} as WorldSave['options']);
    return {
      id: s.id, name: o.name ?? 'World', mode: o.mode ?? 'survival', difficulty: o.difficulty ?? 'normal', worldType: o.worldType ?? 'default',
      seed: o.seed ?? 0, seedText: o.seedText ?? String(o.seed ?? ''), lastPlayed: s.lastPlayed ?? 0, created: s.created ?? 0, playTime: s.playTime ?? 0,
      day: s.day ?? 0, preview: s.preview, size: Object.keys(s.edits ?? {}).length,
    };
  }

  static async list(): Promise<WorldSummary[]> {
    const saves = await this.all();
    const seen = new Set<string>();
    const out: WorldSummary[] = [];
    for (const raw of saves) {
      const s = this.validate(raw);
      if (!s || s.id.endsWith(BACKUP_SUFFIX) || seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(this.summarize(s));
    }
    // a world whose primary record is corrupt but whose backup survives is still listed (get() will restore it)
    for (const raw of saves) {
      const s = this.validate(raw);
      if (!s || !s.id.endsWith(BACKUP_SUFFIX)) continue;
      const id = s.id.slice(0, -BACKUP_SUFFIX.length);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(this.summarize({ ...s, id }));
    }
    return out.sort((a, b) => b.lastPlayed - a.lastPlayed);
  }

  /** Raw record read (no validation / backup fallback). */
  private static async getRaw(id: string): Promise<WorldSave | null> {
    await this.open();
    if (this.db) {
      return new Promise((resolve) => {
        try {
          const tx = this.db!.transaction(STORE, 'readonly');
          const req = tx.objectStore(STORE).get(id);
          req.onsuccess = () => resolve((req.result as WorldSave) ?? null);
          req.onerror = () => resolve(null);
        } catch { resolve(null); }
      });
    }
    if (this.useLocal) { try { const raw = localStorage.getItem(LS_PREFIX + id); return raw ? (JSON.parse(raw) as WorldSave) : null; } catch { return null; } }
    return this.memory.get(id) ?? null;
  }

  /**
   * Load a world. If the primary record is missing or fails validation the previous good copy
   * (`<id>.bak`, written before every overwrite) is used instead, so a save interrupted by a crash,
   * a tab close or a storage-quota failure never loses more than one autosave interval.
   */
  static async get(id: string): Promise<WorldSave | null> {
    const primary = this.validate(await this.getRaw(id));
    if (primary) return primary;
    const backup = this.validate(await this.getRaw(id + BACKUP_SUFFIX));
    if (backup) { console.warn(`Save ${id} was unreadable; restored from backup`); backup.id = id; return backup; }
    return null;
  }

  /** Structural validation + migration of older saves. Returns null if the record cannot be trusted. */
  static validate(w: unknown): WorldSave | null {
    if (!w || typeof w !== 'object') return null;
    const s = w as Partial<WorldSave> & Record<string, unknown>;
    if (typeof s.id !== 'string' || !s.options || typeof s.options !== 'object') return null;
    if (typeof s.options.seed !== 'number' || !Number.isFinite(s.options.seed)) return null;
    const options = s.options;
    if (typeof options.name !== 'string') options.name = 'World';
    if (typeof options.seedText !== 'string') options.seedText = String(options.seed);
    if (!['survival', 'creative', 'spectator', 'hardcore'].includes(options.mode)) options.mode = 'survival';
    if (!['peaceful', 'easy', 'normal', 'hard'].includes(options.difficulty)) options.difficulty = 'normal';
    if (!['default', 'flat', 'amplified', 'islands'].includes(options.worldType)) options.worldType = 'default';
    options.structures = options.structures !== false;
    options.bonusItems = !!options.bonusItems;
    options.keepInventory = !!options.keepInventory;
    options.cheats = !!options.cheats;
    // migrations / defaults for fields added after the first save format
    if (!s.edits || typeof s.edits !== 'object') s.edits = {};
    if (!s.blockEntities || typeof s.blockEntities !== 'object') s.blockEntities = {};
    if (!Array.isArray(s.entities)) s.entities = [];
    if (!Array.isArray(s.visited)) s.visited = [];
    if (!s.weather || typeof s.weather !== 'object') s.weather = { type: 'clear', timer: 600 };
    if (!['clear', 'rain', 'storm'].includes(s.weather.type)) s.weather.type = 'clear';
    if (!Number.isFinite(s.weather.timer)) s.weather.timer = 600;
    if (typeof s.time !== 'number' || !Number.isFinite(s.time)) s.time = 1000;
    if (typeof s.day !== 'number') s.day = 0;
    if (typeof s.playTime !== 'number') s.playTime = 0;
    if (typeof s.created !== 'number') s.created = Date.now();
    if (typeof s.lastPlayed !== 'number') s.lastPlayed = s.created;
    // A truncated/hand-edited player record otherwise reaches Player.load(), where missing
    // coordinates or inventory arrays throw after the loading screen has already started.
    if (s.player != null) {
      const p = s.player;
      if (typeof p !== 'object' || Array.isArray(p) || !Array.isArray(p.pos) || p.pos.length !== 3 ||
          !p.pos.every((n: unknown) => typeof n === 'number' && Number.isFinite(n)) ||
          !Array.isArray(p.inventory) || !Array.isArray(p.armor)) return null;
      // Older saves may omit optional scalar fields; use safe defaults rather than NaN physics.
      p.yaw = Number.isFinite(p.yaw) ? p.yaw : 0;
      p.pitch = Number.isFinite(p.pitch) ? p.pitch : 0;
      p.health = Number.isFinite(p.health) ? p.health : 20;
      p.hunger = Number.isFinite(p.hunger) ? p.hunger : 20;
      p.saturation = Number.isFinite(p.saturation) ? p.saturation : 5;
      p.air = Number.isFinite(p.air) ? p.air : 300;
      p.xp = Number.isFinite(p.xp) ? p.xp : 0;
      p.level = Number.isFinite(p.level) ? p.level : 0;
      p.selected = Number.isInteger(p.selected) && p.selected >= 0 && p.selected < 9 ? p.selected : 0;
      if (!Array.isArray(p.spawn) || p.spawn.length !== 3 || !p.spawn.every((n: unknown) => typeof n === 'number' && Number.isFinite(n))) p.spawn = null;
      if (!['survival', 'creative', 'spectator', 'hardcore'].includes(p.mode)) p.mode = 'survival';
      p.flying = !!p.flying;
    } else s.player = null;
    // Malformed edit pairs can poison chunk meshes or crash workers; ignore invalid chunks.
    for (const k of Object.keys(s.edits)) {
      const v = (s.edits as Record<string, unknown>)[k];
      if (!Array.isArray(v) || v.length % 2 !== 0 || !v.every((n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0))
        delete (s.edits as Record<string, unknown>)[k];
    }
    s.entities = s.entities.filter((e) => e && typeof e.type === 'string' && Array.isArray(e.pos) &&
      e.pos.length === 3 && e.pos.every((n) => typeof n === 'number' && Number.isFinite(n)));
    for (const k of Object.keys(s.blockEntities)) {
      const be = s.blockEntities[k] as { items?: unknown } | null;
      if (!be || typeof be !== 'object' || !Array.isArray(be.items)) delete s.blockEntities[k];
    }
    return s as WorldSave;
  }

  private static async putRaw(w: WorldSave): Promise<void> {
    await this.open();
    if (this.db) {
      await new Promise<void>((resolve, reject) => {
        try {
          const tx = this.db!.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(w);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
          tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'));
        } catch (e) { reject(e); }
      });
      return;
    }
    if (this.useLocal) {
      try { localStorage.setItem(LS_PREFIX + w.id, JSON.stringify(w)); return; }
      catch (e) { this.memory.set(w.id, w); throw e; } // quota – keep it for this session but tell the caller
    }
    this.memory.set(w.id, w);
  }

  /** Write a world: the previous good copy becomes `<id>.bak` first, then the new record replaces the primary. */
  static async put(w: WorldSave): Promise<void> {
    if (!w.id.endsWith(BACKUP_SUFFIX)) {
      const prev = await this.getRaw(w.id);
      if (prev && this.validate(prev)) {
        try { await this.putRaw({ ...prev, id: w.id + BACKUP_SUFFIX }); } catch { /* backup is best-effort */ }
      }
    }
    await this.putRaw(w);
  }

  private static async deleteRaw(id: string): Promise<void> {
    await this.open();
    if (this.db) {
      await new Promise<void>((resolve) => {
        try {
          const tx = this.db!.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch { resolve(); }
      });
      return;
    }
    if (this.useLocal) localStorage.removeItem(LS_PREFIX + id);
    this.memory.delete(id);
  }

  static async delete(id: string): Promise<void> {
    await this.deleteRaw(id);
    await this.deleteRaw(id + BACKUP_SUFFIX);
  }

  static async rename(id: string, name: string): Promise<void> {
    const w = await this.get(id);
    if (!w) return;
    w.options = { ...w.options, name };
    await this.put(w);
  }

  static newId(): string {
    return 'w_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36);
  }

  static async exportWorld(id: string): Promise<string | null> {
    const w = await this.get(id);
    return w ? JSON.stringify(w) : null;
  }

  static async importWorld(json: string): Promise<WorldSave | null> {
    try {
      const w = this.validate(JSON.parse(json));
      if (!w) return null;
      w.id = this.newId();
      w.lastPlayed = Date.now();
      await this.put(w);
      return w;
    } catch { return null; }
  }
}
