/** Client mods: small, safe, client-side quality-of-life toggles installable from the Marketplace.
 *  They run entirely in this browser tab (no scripts from the web, no server, no gameplay advantage
 *  in multiplayer beyond what the local renderer already allows) and are always free. State is kept
 *  in localStorage next to the other profile data. */
const KEY = 'fable-clientmods-v1';

export interface ClientMod {
  id: string;
  name: string;
  desc: string;
  author: string;
  tag: 'controls' | 'visual' | 'hud';
  /** short usage hint shown once installed (e.g. the key it binds) */
  hint?: string;
  accent: string;
}

export const CLIENT_MODS: ClientMod[] = [
  {
    id: 'optics_zoom',
    name: 'Optics Zoom',
    desc: 'Hold the C key to smoothly zoom the camera in for a closer look at builds and views.',
    author: 'FABLE Labs',
    tag: 'controls',
    hint: 'Hold C while playing to zoom.',
    accent: '#5c86ad',
  },
  {
    id: 'lumen_visor',
    name: 'Lumen Visor',
    desc: 'A soft fullbright visor: lifts darkness in caves and at night without changing your saved video settings.',
    author: 'FABLE Labs',
    tag: 'visual',
    hint: 'Brightens dark areas while installed.',
    accent: '#e0c050',
  },
  {
    id: 'wayfinder',
    name: 'Wayfinder HUD',
    desc: 'Always-on coordinates readout in the HUD so you can find home, friends and ore veins again.',
    author: 'FABLE Labs',
    tag: 'hud',
    hint: 'Shows XYZ in the HUD while installed.',
    accent: '#52b788',
  },
  {
    id: 'steady_cam',
    name: 'Steady Camera',
    desc: 'Calms view bobbing and camera shake for sensitive eyes; motion effects stay available in settings.',
    author: 'FABLE Labs',
    tag: 'visual',
    hint: 'Softens bobbing and shake while installed.',
    accent: '#c0557f',
  },
];

export function getModById(id: string): ClientMod | undefined {
  return CLIENT_MODS.find((m) => m.id === id);
}

interface ModState { enabled: Record<string, boolean> }
const listeners = new Set<() => void>();

function read(): ModState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object' || !raw.enabled || typeof raw.enabled !== 'object') return { enabled: {} };
    const enabled: Record<string, boolean> = {};
    for (const m of CLIENT_MODS) if ((raw.enabled as Record<string, unknown>)[m.id] === true) enabled[m.id] = true;
    return { enabled };
  } catch { return { enabled: {} }; }
}
let state = read();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* mods still work for the session */ }
  for (const l of listeners) l();
}

export const mods = {
  get value(): Readonly<ModState> { return state; },
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  isOn(id: string): boolean { return state.enabled[id] === true; },
  /** Install/uninstall a mod; returns the new state. */
  toggle(id: string): boolean {
    if (!getModById(id)) return false;
    const enabled = { ...state.enabled };
    if (enabled[id]) delete enabled[id]; else enabled[id] = true;
    state = { enabled }; save();
    return !!enabled[id];
  },
};

/** Cheap synchronous accessor used inside the game loop. */
export function modOn(id: string): boolean { return state.enabled[id] === true; }
