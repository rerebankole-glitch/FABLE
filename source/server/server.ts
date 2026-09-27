// FABLE multiplayer server.
//
// A small authoritative WebSocket server that speaks the JSON protocol in
// src/game/network/Network.ts. It shares the world seed with every client (the
// clients generate terrain locally from the seed, exactly like singleplayer),
// and is the source of truth for:
//   * block edits   (broadcast to everyone, replayed to late joiners)
//   * day time      (ticks at the same 20 units/sec the client uses)
//   * player list   (positions broadcast at 10 Hz)
//   * chat          (plus a few server-side commands)
//
// Run:   npm run server                      (default: port 8080, random seed)
//        npm run server -- --port 9000 --seed hello --mode creative --name "My Server"
// Then:  Multiplayer -> ws://localhost:8080 -> Direct Connect
//
// The world (seed + edits + time) is persisted to ./server/worlds/<name>.json.

import { WebSocketServer, WebSocket } from 'ws';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Generator } from '../src/game/world/Generator';
import { B, BLOCKS } from '../src/game/blocks/Blocks';
import { CHUNK_SIZE, SEA_LEVEL, blockIndex, chunkKey, seedFromText } from '../src/game/core/types';
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from '../src/game/network/Network';

// ------------------------------------------------------------------ config

interface Config { port: number; seed: number; seedText: string; name: string; mode: string; difficulty: string; worldType: string; maxPlayers: number }

function parseArgs(argv: string[]): Config {
  const get = (k: string): string | undefined => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : undefined; };
  const seedText = get('seed') ?? '';
  const seed = seedText ? (/^-?\d+$/.test(seedText) ? parseInt(seedText, 10) | 0 : seedFromText(seedText) | 0) : (Math.random() * 2147483647) | 0;
  return {
    port: parseInt(get('port') ?? process.env.PORT ?? '8080', 10),
    seed, seedText: seedText || String(seed),
    name: get('name') ?? 'FABLE Server',
    mode: get('mode') ?? 'survival',
    difficulty: get('difficulty') ?? 'normal',
    worldType: get('world-type') ?? 'default',
    maxPlayers: parseInt(get('max-players') ?? '16', 10),
  };
}

const cfg = parseArgs(process.argv.slice(2));
// Worlds live in ./server/worlds relative to the project (works both when run from source and from the esbuild bundle in dist/).
const worldsDir = process.env.FABLE_WORLDS ?? join(process.cwd(), 'server', 'worlds');
const worldFile = join(worldsDir, cfg.name.replace(/[^a-z0-9_-]+/gi, '_') + '.json');

// ------------------------------------------------------------------ world state

interface WorldFile { seed: number; seedText: string; time: number; day: number; mode: string; difficulty: string; worldType: string; edits: number[]; spawn: [number, number, number] }

let time = 1000;
let day = 0;
/** All block edits in the order they happened, as [x,y,z,id] quads (deduped by position). */
const edits = new Map<string, [number, number, number, number]>();
let spawn: [number, number, number] = [0.5, 70, 0.5];

function load(): void {
  if (!existsSync(worldFile)) return;
  try {
    const w = JSON.parse(readFileSync(worldFile, 'utf8')) as WorldFile;
    cfg.seed = w.seed; cfg.seedText = w.seedText; cfg.mode = w.mode ?? cfg.mode; cfg.difficulty = w.difficulty ?? cfg.difficulty; cfg.worldType = w.worldType ?? cfg.worldType;
    time = w.time; day = w.day ?? 0; spawn = w.spawn ?? spawn;
    for (let i = 0; i + 3 < w.edits.length; i += 4) edits.set(w.edits[i] + ',' + w.edits[i + 1] + ',' + w.edits[i + 2], [w.edits[i], w.edits[i + 1], w.edits[i + 2], w.edits[i + 3]]);
    console.log(`[world] loaded ${worldFile} (${edits.size} edits, day ${day})`);
  } catch (e) { console.warn('[world] could not read save, starting fresh:', e); }
}

let dirty = false;
function save(): void {
  if (!dirty && existsSync(worldFile)) return;
  mkdirSync(worldsDir, { recursive: true });
  const flat: number[] = [];
  for (const e of edits.values()) flat.push(e[0], e[1], e[2], e[3]);
  const w: WorldFile = { seed: cfg.seed, seedText: cfg.seedText, time, day, mode: cfg.mode, difficulty: cfg.difficulty, worldType: cfg.worldType, edits: flat, spawn };
  writeFileSync(worldFile, JSON.stringify(w));
  dirty = false;
}

load();

// ------------------------------------------------------------------ terrain (spawn search + sanity checks)

const gen = new Generator({ seed: cfg.seed, structures: true, worldType: cfg.worldType as 'default', dimension: 'overworld' });
const chunkCache = new Map<string, Uint8Array>();
function chunkData(cx: number, cz: number): Uint8Array {
  const k = chunkKey(cx, cz);
  let d = chunkCache.get(k);
  if (!d) {
    d = gen.generateChunk(cx, cz).data;
    // apply persisted edits inside this chunk
    for (const e of edits.values()) if (Math.floor(e[0] / CHUNK_SIZE) === cx && Math.floor(e[2] / CHUNK_SIZE) === cz) d[blockIndex(e[0], e[1], e[2])] = e[3];
    chunkCache.set(k, d);
    if (chunkCache.size > 512) chunkCache.delete(chunkCache.keys().next().value!);
  }
  return d;
}
function block(x: number, y: number, z: number): number {
  if (y < 0 || y > 127) return B.AIR;
  return chunkData(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE))[blockIndex(x, y, z)];
}
function surfaceY(x: number, z: number): number {
  for (let y = 127; y > 0; y--) { const id = block(x, y, z); if (id !== B.AIR && BLOCKS[id].solid) return y; }
  return 0;
}
function findSpawn(): [number, number, number] {
  if (cfg.worldType === 'flat') return [0.5, surfaceY(0, 0) + 1, 0.5];
  for (let r = 0; r < 200; r += 8) for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
    const x = Math.floor(Math.cos(a) * r), z = Math.floor(Math.sin(a) * r);
    const y = surfaceY(x, z);
    const id = block(x, y, z);
    if (y > SEA_LEVEL && id !== B.WATER && id !== B.LAVA && block(x, y + 1, z) === B.AIR && block(x, y + 2, z) === B.AIR) return [x + 0.5, y + 1, z + 0.5];
    if (r === 0) break;
  }
  return [0.5, surfaceY(0, 0) + 1, 0.5];
}
if (!existsSync(worldFile)) { spawn = findSpawn(); dirty = true; }
console.log(`[world] seed ${cfg.seed} (${cfg.seedText}) · ${cfg.worldType} · ${cfg.mode}/${cfg.difficulty} · spawn ${spawn.map((v) => v.toFixed(1)).join(' ')}`);

// ------------------------------------------------------------------ players

interface Client {
  id: string; name: string; ws: WebSocket; x: number; y: number; z: number; yaw: number; pitch: number; joined: boolean; alive: boolean;
  /** token buckets for rate limiting (tokens refill per second) */
  budget: { block: number; chat: number; pos: number; last: number };
  /** number of rejected/invalid packets; too many and the client is disconnected */
  strikes: number;
  /** false until the first accepted position packet (the first packet may legitimately be far from spawn after a reload) */
  moved: boolean;
}

// --- rate limits (per client, tokens per second / burst) ---
const LIMITS = { block: { rate: 12, burst: 30 }, chat: { rate: 1, burst: 4 }, pos: { rate: 40, burst: 80 } } as const;
const MAX_STRIKES = 40;
const MAX_MESSAGE_BYTES = 4096;

function take(c: Client, kind: keyof typeof LIMITS): boolean {
  const now = Date.now();
  const dt = (now - c.budget.last) / 1000;
  c.budget.last = now;
  for (const k of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) c.budget[k] = Math.min(LIMITS[k].burst, c.budget[k] + dt * LIMITS[k].rate);
  if (c.budget[kind] < 1) return false;
  c.budget[kind] -= 1;
  return true;
}
function strike(c: Client, why: string): void {
  c.strikes++;
  if (c.strikes === MAX_STRIKES) { console.log(`[kick] ${c.name || c.id}: too many invalid packets (${why})`); send(c.ws, { t: 'reject', reason: 'Too many invalid packets' }); c.ws.close(); }
}
const clients = new Map<WebSocket, Client>();
let nextId = 1;

const send = (ws: WebSocket, m: ServerMessage): void => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
const broadcast = (m: ServerMessage, except?: WebSocket): void => { const s = JSON.stringify(m); for (const c of clients.values()) if (c.joined && c.ws !== except && c.ws.readyState === WebSocket.OPEN) c.ws.send(s); };
const playersMsg = (): ServerMessage => ({ t: 'players', players: [...clients.values()].filter((c) => c.joined).map((c) => ({ id: c.id, name: c.name, x: c.x, y: c.y, z: c.z, yaw: c.yaw, pitch: c.pitch })) });
const serverChat = (text: string, ws?: WebSocket): void => { const m: ServerMessage = { t: 'chat', from: 'Server', text }; if (ws) send(ws, m); else broadcast(m); };

function uniqueName(want: string): string {
  const base = (want || 'Player').replace(/[^\w -]/g, '').slice(0, 16) || 'Player';
  const taken = new Set([...clients.values()].map((c) => c.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}${i}`.toLowerCase())) return `${base}${i}`;
}

function command(c: Client, text: string): void {
  const [name, ...args] = text.slice(1).split(/\s+/);
  switch (name) {
    case 'help': serverChat('Server commands: /help /list /seed /spawn /time <day|night|n> /save' + (cfg.mode === 'creative' ? ' · local: /give /tp /gamemode' : ''), c.ws); break;
    case 'list': serverChat(`Online (${clients.size}): ` + [...clients.values()].map((p) => p.name).join(', '), c.ws); break;
    case 'seed': serverChat(`Seed: ${cfg.seed}`, c.ws); break;
    case 'spawn': serverChat(`Spawn is at ${spawn.map((v) => Math.floor(v)).join(' ')}`, c.ws); break;
    case 'time': {
      if (cfg.mode !== 'creative') { serverChat('Time can only be changed on creative servers.', c.ws); break; }
      const v = args[1] ?? args[0];
      time = v === 'day' ? 1000 : v === 'night' ? 14000 : v === 'noon' ? 6000 : parseInt(v) || 0;
      broadcast({ t: 'time', time }); serverChat(`${c.name} set the time to ${Math.floor(time)}`); dirty = true; break;
    }
    case 'save': dirty = true; save(); serverChat('World saved.', c.ws); break;
    default: serverChat(`Unknown server command /${name}. Try /help`, c.ws);
  }
}

function onMessage(ws: WebSocket, raw: ClientMessage): void {
  const c = clients.get(ws);
  if (!c) return;
  c.alive = true;
  if (!c.joined) {
    if (raw.t !== 'join') return;
    if (raw.protocol !== PROTOCOL_VERSION) { send(ws, { t: 'reject', reason: `Protocol mismatch (server ${PROTOCOL_VERSION}, client ${raw.protocol})` }); ws.close(); return; }
    if ([...clients.values()].filter((p) => p.joined).length >= cfg.maxPlayers) { send(ws, { t: 'reject', reason: 'Server is full' }); ws.close(); return; }
    if (typeof raw.name !== 'string') { ws.close(); return; }
    c.name = uniqueName(raw.name);
    c.joined = true;
    c.x = spawn[0]; c.y = spawn[1]; c.z = spawn[2];
    send(ws, { t: 'welcome', id: c.id, seed: cfg.seed, time, spawn, mode: cfg.mode, difficulty: cfg.difficulty, worldType: cfg.worldType });
    // replay world edits in chunks of 2000 quads
    const all = [...edits.values()];
    for (let i = 0; i < all.length; i += 2000) send(ws, { t: 'blocks', changes: all.slice(i, i + 2000).flat() });
    send(ws, playersMsg());
    broadcast(playersMsg(), ws);
    serverChat(`${c.name} joined the game`);
    serverChat(`Welcome to ${cfg.name}! ${clients.size} online. Type /help for server commands.`, ws);
    console.log(`[join] ${c.name} (${c.id}) from ${(ws as any)._socket?.remoteAddress ?? '?'}`);
    return;
  }
  switch (raw.t) {
    case 'pos': {
      if (!take(c, 'pos')) return;
      if (![raw.x, raw.y, raw.z, raw.yaw, raw.pitch].every(Number.isFinite)) { strike(c, 'pos'); return; }
      // The server does not simulate movement, so positions are trusted (teleports/creative flight are legitimate);
      // keep them inside the world's range and reject absurd jumps (> 64 blocks per packet) in survival.
      const nx = Math.max(-3e7, Math.min(3e7, raw.x)), ny = Math.max(-64, Math.min(512, raw.y)), nz = Math.max(-3e7, Math.min(3e7, raw.z));
      if (cfg.mode !== 'creative' && Math.hypot(nx - c.x, ny - c.y, nz - c.z) > 64 && c.moved) { strike(c, 'teleport'); return; }
      c.x = nx; c.y = ny; c.z = nz; c.yaw = raw.yaw; c.pitch = raw.pitch; c.moved = true;
      break;
    }
    case 'block': {
      const { x, y, z, id } = raw;
      if (![x, y, z, id].every(Number.isInteger) || y < 0 || y > 127 || Math.abs(x) > 3e7 || Math.abs(z) > 3e7 || !BLOCKS[id]) { strike(c, 'block'); return; }
      if (!take(c, 'block')) { send(ws, { t: 'block', x, y, z, id: block(x, y, z) }); return; }
      if (id === B.BEDROCK && cfg.mode !== 'creative') { send(ws, { t: 'block', x, y, z, id: block(x, y, z) }); return; }
      // reach check: must be within ~7 blocks of the player's eyes (a bit generous for latency)
      const dx = x + 0.5 - c.x, dy = y + 0.5 - (c.y + 1.6), dz = z + 0.5 - c.z;
      if (cfg.mode !== 'creative' && dx * dx + dy * dy + dz * dz > 7 * 7) { send(ws, { t: 'block', x, y, z, id: block(x, y, z) }); return; }
      if (block(x, y, z) === id) return; // no-op
      const key = x + ',' + y + ',' + z;
      edits.set(key, [x, y, z, id]);
      const cd = chunkCache.get(chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)));
      if (cd) cd[blockIndex(x, y, z)] = id;
      dirty = true;
      broadcast({ t: 'block', x, y, z, id }, ws);
      break;
    }
    case 'chat': {
      if (typeof raw.text !== 'string') { strike(c, 'chat'); return; }
      // strip control characters, collapse whitespace
      const text = raw.text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').slice(0, 256).trim();
      if (!text) return;
      if (!take(c, 'chat')) { serverChat('You are sending messages too quickly.', ws); return; }
      if (text.startsWith('/')) { command(c, text); return; }
      console.log(`[chat] <${c.name}> ${text}`);
      broadcast({ t: 'chat', from: c.name, text });
      break;
    }
    case 'ping': if (Number.isFinite(raw.time)) send(ws, { t: 'pong', time: raw.time }); break;
    default: strike(c, 'unknown'); break;
  }
}

// ------------------------------------------------------------------ server

const wss = new WebSocketServer({ port: cfg.port, host: '0.0.0.0', maxPayload: 16 * 1024 });
wss.on('listening', () => console.log(`[server] ${cfg.name} listening on ws://0.0.0.0:${cfg.port}  (protocol v${PROTOCOL_VERSION}, max ${cfg.maxPlayers} players)`));
wss.on('connection', (ws) => {
  const c: Client = { id: 'p' + nextId++, name: '', ws, x: spawn[0], y: spawn[1], z: spawn[2], yaw: 0, pitch: 0, joined: false, alive: true, budget: { block: LIMITS.block.burst, chat: LIMITS.chat.burst, pos: LIMITS.pos.burst, last: Date.now() }, strikes: 0, moved: false };
  clients.set(ws, c);
  ws.on('pong', () => { c.alive = true; });
  ws.on('message', (data, isBinary) => {
    if (isBinary) { strike(c, 'binary'); return; }
    const str = data.toString();
    if (str.length > MAX_MESSAGE_BYTES) { strike(c, 'oversize'); return; }
    let msg: ClientMessage;
    try { msg = JSON.parse(str); } catch { strike(c, 'json'); return; }
    if (!msg || typeof msg !== 'object' || typeof (msg as { t?: unknown }).t !== 'string') { strike(c, 'shape'); return; }
    try { onMessage(ws, msg); } catch (e) { console.error('[error] handling message from', c.name, e); }
  });
  const gone = () => {
    if (!clients.has(ws)) return;
    clients.delete(ws);
    if (c.joined) { broadcast({ t: 'leave', id: c.id }); serverChat(`${c.name} left the game`); console.log(`[leave] ${c.name}`); }
  };
  ws.on('close', gone);
  ws.on('error', gone);
  // kick clients that never join
  setTimeout(() => { if (!c.joined && clients.has(ws)) { ws.close(); clients.delete(ws); } }, 10000);
});

// day/night: same rate as the client (20 time units per second); resync everyone every 10 s
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - last) / 1000; last = now;
  time += dt * 20;
  if (time >= 24000) { time -= 24000; day++; dirty = true; }
}, 250);
// heartbeat: protocol-level pings (browsers answer these automatically, even while the world is still loading)
setInterval(() => {
  for (const c of clients.values()) {
    if (!c.alive) { console.log(`[timeout] ${c.name || c.id}`); c.ws.terminate(); continue; }
    c.alive = false;
    try { c.ws.ping(); } catch { /* ignore */ }
  }
}, 20000);
setInterval(() => { if (clients.size) broadcast(playersMsg()); }, 100);
setInterval(() => { if (clients.size) broadcast({ t: 'time', time }); }, 10000);
setInterval(save, 30000);

const shutdown = (): void => { console.log('\n[server] saving & shutting down'); dirty = true; save(); for (const c of clients.values()) c.ws.close(1001, 'Server shutting down'); wss.close(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
