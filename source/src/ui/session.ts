import { Game } from '../game/core/Game';
import { SaveManager } from '../game/save/SaveManager';
import { WebSocketTransport, type ServerMessage } from '../game/network/Network';
import { MOBS, Mob } from '../game/entities/Entities';
import { settings, t } from '../game/core/Settings';
import { CHUNK_SIZE, blockIndex, chunkKey, seedFromText, type Difficulty, type GameMode, type WorldOptions, type WorldSave, type WorldType } from '../game/core/types';
import { audio } from '../game/audio/Audio';
import { store } from './store';

export const CANVAS_ID = 'game-canvas';

let current: Game | null = null;
const listeners = new Set<(g: Game | null) => void>();

export function currentGame(): Game | null { return current; }
export function onGameChange(fn: (g: Game | null) => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
function setCurrent(g: Game | null): void {
  current = g;
  listeners.forEach((l) => l(g));
  // Debug hook (dev builds only): window.__fable.game / window.__fable.store
  if (import.meta.env.DEV) (window as unknown as { __fable?: unknown }).__fable = { game: g, store, settings };
}

/** Wait until React has mounted the canvas that belongs to the given session (the canvas is re-keyed per session). */
async function waitForCanvas(session: number): Promise<HTMLCanvasElement> {
  for (let i = 0; i < 120; i++) {
    const c = document.getElementById(CANVAS_ID) as HTMLCanvasElement | null;
    if (c && c.isConnected && c.dataset.session === String(session)) return c;
    await new Promise((r) => requestAnimationFrame(r));
  }
  throw new Error('Game canvas not found');
}

function fail(e: unknown): void {
  console.error(e);
  const msg = e instanceof Error ? e.message : String(e);
  if (current) { try { current.stop(); current.renderer.forceContextLoss(); } catch { /* ignore */ } }
  setCurrent(null);
  store.resetSession();
  store.set({ screen: 'menu', error: msg.includes('WebGL') || msg.includes('context') ? 'Could not create a WebGL context. Your browser or GPU may not support 3D rendering.' : 'Failed to start world: ' + msg });
}

/** Launch a world: `save` is null for a brand-new world. */
export async function launchWorld(options: WorldOptions, save: WorldSave | null, saveId?: string, created?: number): Promise<void> {
  if (current) { try { current.stop(); } catch { /* ignore */ } setCurrent(null); }
  store.resetSession();
  const session = store.state.session;
  store.set({ screen: 'loading', loading: { stage: t('loading'), progress: 0 }, worldName: options.name, error: null });
  try {
    audio.init();
    const canvas = await waitForCanvas(session);
    const game = new Game(canvas, options, saveId ?? save?.id ?? SaveManager.newId(), created ?? save?.created ?? Date.now());
    setCurrent(game);
    await game.start(save);
    if (!save) game.saveWorld().catch(() => undefined);
  } catch (e) { fail(e); }
}

export async function loadWorld(id: string): Promise<void> {
  const save = await SaveManager.get(id);
  if (!save) { store.set({ error: 'That world could not be loaded.' }); return; }
  await launchWorld(save.options, save, save.id, save.created);
}

export interface CreateParams {
  name: string; seedText: string; mode: GameMode; difficulty: Difficulty; worldType: WorldType;
  structures: boolean; bonusItems: boolean; keepInventory: boolean; cheats: boolean;
}

export async function createWorld(p: CreateParams): Promise<void> {
  const seedText = p.seedText.trim();
  const seed = seedText ? (/^-?\d+$/.test(seedText) ? (parseInt(seedText, 10) | 0) : seedFromText(seedText)) : (Math.random() * 2147483647) | 0;
  const hardcore = p.mode === 'hardcore';
  const options: WorldOptions = {
    name: p.name.trim() || t('new_world'), seed, seedText: seedText || String(seed), mode: hardcore ? 'hardcore' : p.mode, difficulty: hardcore ? 'hard' : p.difficulty, worldType: p.worldType,
    structures: p.structures, bonusItems: p.bonusItems, keepInventory: p.keepInventory && !hardcore, cheats: !hardcore && (p.cheats || p.mode === 'creative'),
  };
  await launchWorld(options, null, SaveManager.newId(), Date.now());
}

/** Save (if singleplayer) and return to the title screen. */
export async function quitToTitle(): Promise<void> {
  const g = current;
  if (!g) { store.set({ screen: 'menu' }); return; }
  store.set({ paused: true });
  try { if (!g.transport.connected) await g.saveWorld(); } catch (e) { console.warn('save failed', e); }
  try { g.stop(); g.renderer.forceContextLoss(); } catch { /* ignore */ }
  setCurrent(null);
  store.resetSession();
  store.newSplash();
  store.set({ screen: 'menu' });
}

/** Hardcore death is final: delete this world's save and return to the title screen. */
export async function deleteWorldAndQuit(): Promise<void> {
  const g = current;
  if (!g) { store.set({ screen: 'menu' }); return; }
  const id = g.saveId;
  const online = g.transport.connected;
  try { g.stop(); g.renderer.forceContextLoss(); } catch { /* ignore */ }
  setCurrent(null);
  store.resetSession();
  store.newSplash();
  store.set({ screen: 'menu' });
  try { if (!online) await SaveManager.delete(id); } catch (e) { console.warn('world delete failed', e); }
}

// ------------------------------------------------------------------ multiplayer

/** Connect to a FABLE server and join its world. */
export async function joinServer(address: string): Promise<void> {
  const transport = new WebSocketTransport();
  store.set({ error: null, screen: 'loading', loading: { stage: 'Connecting to ' + address + '...', progress: 0.05 }, worldName: address });
  let welcome: Extract<ServerMessage, { t: 'welcome' }>;
  try {
    welcome = await transport.connect(address, settings.value.playerName);
  } catch (e) {
    store.set({ screen: 'multiplayer', error: e instanceof Error ? e.message : String(e) });
    return;
  }
  // Register the handler synchronously (before any await): the server streams the edit replay and
  // player list right after `welcome`, and the transport does not buffer messages for us.
  let game: Game | null = null;
  const queue: ServerMessage[] = [];
  const pending: number[][] = [];
  transport.onMessage((m) => { if (game) handleServerMessage(game, m, pending, welcome.id); else queue.push(m); });

  const options: WorldOptions = {
    name: address, seed: welcome.seed, seedText: String(welcome.seed), mode: welcome.mode === 'hardcore' ? 'survival' : (welcome.mode as GameMode) || 'survival', difficulty: (welcome.difficulty as Difficulty) || 'normal',
    worldType: (welcome.worldType as WorldType) || 'default', structures: true, bonusItems: false, keepInventory: false, cheats: welcome.mode === 'creative',
  };
  if (current) { try { current.stop(); } catch { /* ignore */ } setCurrent(null); }
  store.resetSession();
  const session = store.state.session;
  store.set({ screen: 'loading', loading: { stage: 'Joining world...', progress: 0.1 }, worldName: address });
  try {
    audio.init();
    const canvas = await waitForCanvas(session);
    const g = new Game(canvas, options, 'mp_' + welcome.id, Date.now());
    g.transport = transport;
    setCurrent(g);
    transport.onClose((reason) => { if (current === g) { quitToTitle().then(() => store.set({ screen: 'multiplayer', error: 'Disconnected: ' + reason })); } });
    const fakeSave: WorldSave = {
      id: 'mp_' + welcome.id, options, created: Date.now(), lastPlayed: Date.now(), time: welcome.time, day: 0, weather: { type: 'clear', timer: 600 },
      player: null as any, edits: {}, blockEntities: {}, entities: [], visited: [], playTime: 0,
    };
    // Start the world at the server's spawn (findSpawn() would otherwise pick a seed-dependent spot).
    // Game.start() only searches for a spawn when there is no saved player, so hand it a minimal one.
    fakeSave.player = {
      pos: [welcome.spawn[0], welcome.spawn[1], welcome.spawn[2]], yaw: 0, pitch: 0, health: 20, hunger: 20, saturation: 5, air: 300, xp: 0, level: 0,
      inventory: new Array(36).fill(null), armor: new Array(4).fill(null), spawn: [welcome.spawn[0], welcome.spawn[1], welcome.spawn[2]], flying: false, selected: 0, mode: options.mode,
    };
    // Server edits are applied as the world streams in: the game now exists, so drain what arrived meanwhile.
    game = g;
    for (const m of queue) handleServerMessage(g, m, pending, welcome.id);
    queue.length = 0;
    const drain = (): void => {
      if (!pending.length) return;
      const rest: number[][] = [];
      for (const c of pending) if (!g.world.isLoaded(c[0], c[2])) rest.push(c); else g.world.setBlock(c[0], c[1], c[2], c[3]);
      pending.length = 0; pending.push(...rest);
    };
    await g.start(fakeSave);
    g.world.events.on('chunkLoaded', drain);
    drain();
    // make sure we are standing on solid ground (terrain is identical to the server's, but be safe)
    const sy = g.world.surfaceY(Math.floor(welcome.spawn[0]), Math.floor(welcome.spawn[2])) + 1;
    if (Math.abs(sy - welcome.spawn[1]) > 3) g.player.setPosition(welcome.spawn[0], sy, welcome.spawn[2]);
    store.message(`Connected to ${address}`);
  } catch (e) { transport.close(); fail(e); }
}

/** Apply a server block change now if the chunk is loaded, otherwise remember it for when it is. */
function applyServerBlock(game: Game, pending: number[][], x: number, y: number, z: number, id: number): void {
  // Always record it in the world's edit map so a chunk that unloads and regenerates gets it back.
  const key = chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
  let m = game.world?.edits.get(key);
  if (game.world && !m) { m = new Map(); game.world.edits.set(key, m); }
  m?.set(blockIndex(x, y, z), id);
  if (game.world && game.world.isLoaded(x, z)) game.world.setBlock(x, y, z, id);
  else pending.push([x, y, z, id]);
}

function handleServerMessage(game: Game, m: ServerMessage, pending: number[][], selfId: string): void {
  switch (m.t) {
    case 'block': applyServerBlock(game, pending, m.x, m.y, m.z, m.id); break;
    case 'blocks': {
      for (let i = 0; i + 3 < m.changes.length; i += 4) applyServerBlock(game, pending, m.changes[i], m.changes[i + 1], m.changes[i + 2], m.changes[i + 3]);
      break;
    }
    case 'chat': store.addChat(m.from === 'Server' ? m.text : `<${m.from}> ${m.text}`); break;
    case 'time': game.dayTime = m.time; break;
    case 'players': {
      const seen = new Set<string>();
      for (const p of m.players) {
        if (p.id === selfId) continue; // the server's list includes us
        seen.add(p.id);
        let rp = game.remotePlayers.get(p.id);
        if (!rp) {
          const mob = new Mob(MOBS.keeper, p.x, p.y, p.z);
          mob.obj.name = 'player:' + p.name;
          game.scene.add(mob.obj);
          rp = { ...p, tx: p.x, ty: p.y, tz: p.z, mob };
          game.remotePlayers.set(p.id, rp);
        }
        rp.tx = p.x; rp.ty = p.y; rp.tz = p.z; rp.yaw = p.yaw; rp.pitch = p.pitch; rp.name = p.name;
      }
      for (const [id, rp] of game.remotePlayers) if (!seen.has(id)) { game.scene.remove(rp.mob.obj); game.remotePlayers.delete(id); }
      break;
    }
    case 'leave': {
      const rp = game.remotePlayers.get(m.id);
      if (rp) { game.scene.remove(rp.mob.obj); game.remotePlayers.delete(m.id); }
      break;
    }
    case 'reject': store.set({ error: m.reason }); break;
    default: break;
  }
}
