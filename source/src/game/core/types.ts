export type GameMode = 'survival' | 'creative' | 'spectator' | 'hardcore';
export type Difficulty = 'peaceful' | 'easy' | 'normal' | 'hard';
export type WorldType = 'default' | 'flat' | 'amplified' | 'islands';

export interface ItemStack {
  id: string;
  count: number;
  durability?: number;
  ench?: Record<string, number>;
}

export interface WorldOptions {
  name: string;
  seed: number;
  seedText: string;
  mode: GameMode;
  difficulty: Difficulty;
  worldType: WorldType;
  structures: boolean;
  bonusItems: boolean;
  keepInventory: boolean;
  cheats: boolean;
}

export interface PlayerSave {
  pos: [number, number, number];
  yaw: number;
  pitch: number;
  health: number;
  hunger: number;
  saturation: number;
  air: number;
  xp: number;
  level: number;
  inventory: (ItemStack | null)[];
  armor: (ItemStack | null)[];
  /** every item id the player has ever obtained (drives the getting-started checklist) */
  seen?: string[];
  /** off-hand slot (older saves omit it) */
  offhand?: ItemStack | null;
  spawn: [number, number, number] | null;
  flying: boolean;
  selected: number;
  mode: GameMode;
}

export interface EntitySave {
  type: string;
  pos: [number, number, number];
  yaw: number;
  health: number;
  data?: Record<string, unknown>;
}

export interface WorldSave {
  id: string;
  options: WorldOptions;
  created: number;
  lastPlayed: number;
  time: number;
  day: number;
  weather: { type: 'clear' | 'rain' | 'storm'; timer: number };
  player: PlayerSave | null;
  edits: Record<string, number[]>;
  blockEntities: Record<string, unknown>;
  entities: EntitySave[];
  visited: string[];
  preview?: string;
  playTime: number;
}

export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 128;
export const SEA_LEVEL = 62;

export function chunkKey(cx: number, cz: number): string {
  return cx + ',' + cz;
}

export function blockIndex(x: number, y: number, z: number): number {
  return ((x & 15) << 11) | ((z & 15) << 7) | y;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seedFromText(text: string): number {
  const t = text.trim();
  if (t === '') return (Math.random() * 4294967295) >>> 0;
  if (/^-?\d+$/.test(t)) return (parseInt(t, 10) >>> 0);
  return hashString(t);
}

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export class Emitter<T extends Record<string, unknown[]>> {
  private listeners = new Map<keyof T, Set<(...args: any[]) => void>>();
  on<K extends keyof T>(ev: K, fn: (...args: T[K]) => void): () => void {
    if (!this.listeners.has(ev)) this.listeners.set(ev, new Set());
    this.listeners.get(ev)!.add(fn as any);
    return () => this.listeners.get(ev)?.delete(fn as any);
  }
  emit<K extends keyof T>(ev: K, ...args: T[K]): void {
    this.listeners.get(ev)?.forEach((fn) => fn(...args));
  }
}
