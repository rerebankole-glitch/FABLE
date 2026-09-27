import { useSyncExternalStore } from 'react';
import type { ItemStack } from '../game/core/types';

export type Screen = 'menu' | 'singleplayer' | 'create' | 'multiplayer' | 'settings' | 'marketplace' | 'language' | 'credits' | 'loading' | 'game';

export type Overlay =
  | { kind: 'inventory' }
  | { kind: 'crafting' }
  | { kind: 'chest'; pos: [number, number, number] }
  | { kind: 'furnace'; pos: [number, number, number] }
  | { kind: 'altar'; pos: [number, number, number] }
  | { kind: 'hearth'; pos: [number, number, number] }
  | { kind: 'mending'; pos: [number, number, number] }
  | { kind: 'trade'; mobId: number };

export interface HudState {
  health: number;
  maxHealth: number;
  hunger: number;
  air: number;
  armor: number;
  xp: number;
  level: number;
  selected: number;
  mode: string;
  effects: string[];
  hurt: number;
  hurtCause: 'hurt' | 'drown' | 'starve';
  underwater: boolean;
  bossName: string | null;
  bossHp: number;
  sleeping: number;
  portal: number;
  /** name + health fraction of the mob under the crosshair (null when none) */
  target: { name: string; hp: number; hostile: boolean } | null;
  /** true when a planted Ancient Blade is close enough to pull free */
  bladePrompt: boolean;
  /** 0..1 progress of the block being mined (0 when idle) */
  mining: number;
  /** ms timestamp of the last autosave (0 = never) */
  savedAt: number;
  saving: boolean;
  coords: string;
  /** world-level flag: this world is Hardcore (drives hearts + death screen) */
  hardcore: boolean;
}

export interface ChatLine { id: number; text: string; time: number }

export interface StoreState {
  screen: Screen;
  prevScreen: Screen;
  /** increments every time a game session ends so the canvas can be re-created */
  session: number;
  paused: boolean;
  dead: boolean;
  deathMessage: string;
  overlay: Overlay | null;
  chatOpen: boolean;
  chat: ChatLine[];
  messages: ChatLine[];
  debug: string | null;
  loading: { stage: string; progress: number; detail?: string };
  worldName: string;
  mobile: boolean;
  tooltipItem: ItemStack | null;
  hud: HudState;
  /** inventory version – bumped whenever any container changes */
  inv: number;
  error: string | null;
  splash: string;
  /** floating damage numbers in screen space */
  popups: { x: number; y: number; text: string; a: number }[];
}

const SPLASHES = [
  'Every block tells a story.', 'Now in your browser!', '100% pure JavaScript!', 'Blocks, blocks, blocks!', 'Beware the Wyrm!',
  'Single-file build!', 'Made with three.js!', 'Punch a tree!', 'Keep digging!', 'Watch out for lava!', 'Runs at night too!',
  'Now with more cubes!', 'Web workers ahoy!', 'Don\'t look down!', 'Textures drawn in code!', 'Free as in freedom!',
  'Worlds saved in IndexedDB!', 'Multiplayer over WebSockets!', 'Twenty biomes deep!', 'Mind the cave crawlers!', 'The keepers remember.',
];

const initialHud: HudState = {
  health: 20, maxHealth: 20, hunger: 20, air: 300, armor: 0, xp: 0, level: 0, selected: 0, mode: 'survival', effects: [],
  hurt: 0, hurtCause: 'hurt', underwater: false, bossName: null, bossHp: 0, sleeping: 0, portal: 0, target: null, mining: 0, bladePrompt: false, savedAt: 0, saving: false, coords: '', hardcore: false,
};

const isMobile = typeof window !== 'undefined' && (('ontouchstart' in window && navigator.maxTouchPoints > 0) || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) && !window.matchMedia('(pointer: fine)').matches;

let state: StoreState = {
  screen: 'menu', prevScreen: 'menu', session: 0, paused: false, dead: false, deathMessage: '', overlay: null,
  chatOpen: false, chat: [], messages: [], debug: null, loading: { stage: '', progress: 0 }, worldName: '',
  mobile: isMobile, tooltipItem: null, hud: initialHud, inv: 0, error: null, popups: [],
  splash: SPLASHES[Math.floor(Math.random() * SPLASHES.length)],
};

const listeners = new Set<() => void>();
let nextLine = 1;
let bumpScheduled = false;

function notify(): void {
  for (const l of listeners) l();
}

export const store = {
  get state(): StoreState { return state; },
  set(patch: Partial<StoreState>): void {
    state = { ...state, ...patch };
    notify();
  },
  setHud(patch: Partial<HudState>): void {
    state = { ...state, hud: { ...state.hud, ...patch } };
    notify();
  },
  /** Inventory changed – coalesced to one re-render per frame. */
  bump(): void {
    if (bumpScheduled) return;
    bumpScheduled = true;
    const run = () => { bumpScheduled = false; state = { ...state, inv: state.inv + 1 }; notify(); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else setTimeout(run, 16);
  },
  addChat(text: string): void {
    const line = { id: nextLine++, text, time: performance.now() };
    state = { ...state, chat: [...state.chat, line].slice(-100) };
    notify();
  },
  /** Short status message shown above the hotbar (also logged to chat). */
  message(text: string): void {
    const line = { id: nextLine++, text, time: performance.now() };
    state = { ...state, messages: [...state.messages, line].slice(-4), chat: [...state.chat, line].slice(-100) };
    notify();
  },
  goto(screen: Screen): void {
    state = { ...state, prevScreen: state.screen, screen };
    notify();
  },
  back(): void {
    const target = state.prevScreen === state.screen || state.prevScreen === 'loading' || state.prevScreen === 'game' ? 'menu' : state.prevScreen;
    state = { ...state, prevScreen: 'menu', screen: target };
    notify();
  },
  /** Reset everything that belongs to a play session. */
  resetSession(): void {
    state = {
      ...state, session: state.session + 1, paused: false, dead: false, deathMessage: '', overlay: null, chatOpen: false, chat: [], messages: [],
      debug: null, tooltipItem: null, hud: initialHud, worldName: '',
    };
    notify();
  },
  newSplash(): void {
    state = { ...state, splash: SPLASHES[Math.floor(Math.random() * SPLASHES.length)] };
    notify();
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
};

export function useStore<T>(selector: (s: StoreState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(state), () => selector(state));
}
