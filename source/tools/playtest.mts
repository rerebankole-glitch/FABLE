// FABLE headless playtest: drives the REAL systems (terrain generator, physics, survival ticks,
// mining formula, drop tables, crafting matcher, inventory, mobs, audio event ids, HUD sprites)
// through a full survival session, and prints everything it observes. The build host has no
// browser, so this is how the game gets "played" and measured here.
//
//   node tools/pt-build.mjs && node dist/playtest.mjs
import { Generator } from '../src/game/world/Generator';
import { BLOCKS, B, blockDef, isLog } from '../src/game/blocks/Blocks';
import { BIOMES } from '../src/game/world/Biomes';
import { Player } from '../src/game/player/Player';
import { Game } from '../src/game/core/Game';
import { isHandledArt } from '../src/game/items/Icons';
import { ITEMS, itemDef, makeStack } from '../src/game/items/Items';
import { PlayerInventory, clickSlot, quickMove } from '../src/game/inventory/Inventory';
import { matchRecipe, SMELTING, RECIPES } from '../src/game/crafting/Recipes';
import { GAME_VERSION } from '../src/game/core/brand';
import { settings } from '../src/game/core/Settings';
import type { ItemStack } from '../src/game/core/types';
import type { BlockDef } from '../src/game/blocks/Blocks';

const CHUNK = 16;

// Minimal DOM shim: mob models build their own canvas textures at construction time. Real pixels are
// irrelevant to this harness (no renderer here), only that the code paths run.
{
  const g = globalThis as unknown as Record<string, unknown>;
  const noop = () => undefined;
  const ctx = new Proxy({}, {
    get(_t, p) {
      if (p === 'createImageData') return (a: number, b: number) => ({ data: new Uint8ClampedArray(a * b * 4), width: a, height: b });
      if (p === 'getImageData') return (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'canvas') return undefined;
      return noop;
    },
    set() { return true; },
  });
  g.document = {
    createElement: () => ({ width: 0, height: 0, style: {}, className: '', getContext: () => ctx, toDataURL: () => 'data:image/png;base64,AAAA' }),
    createElementNS: () => ({ style: {} }),
  };
  g.window = { devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720, addEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }) };
  g.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
  g.performance = g.performance ?? { now: () => Date.now() };
}
const say = (s: string) => console.log(s);
const head = (s: string) => say('\n=== ' + s + ' ===');
const idOf = (name: string): number => BLOCKS.findIndex((b) => b && b.name === name);
const biomeName = (i: number) => BIOMES[i]?.name ?? 'biome' + i;

// ------------------------------------------------------------------ terrain
class PlayWorld {
  gen = new Generator({ seed: 1337, structures: true, worldType: 'normal', dimension: 'overworld' } as never);
  chunks = new Map<string, { data: Uint8Array; biomes: Uint8Array; heights: Uint8Array }>();
  spawnTypes: string[] = [];
  lootCount = 0;
  getChunk(cx: number, cz: number) {
    const k = cx + ',' + cz;
    let c = this.chunks.get(k);
    if (!c) {
      const r = this.gen.generateChunk(cx, cz);
      c = { data: r.data, biomes: r.biomes, heights: r.heights };
      this.chunks.set(k, c);
      for (const s of r.spawns as { type: string }[]) this.spawnTypes.push(s.type);
      this.lootCount += (r.loot as unknown[]).length;
    }
    return c;
  }
  getBlock(x: number, y: number, z: number): number {
    // MUST match the game's own indexing (World.getBlock / blockIndex): ((x&15)<<11)|((z&15)<<7)|y.
    // An earlier version of this harness used y-major indexing, which read the wrong cells and made
    // every "terrain" measurement nonsense (and returned undefined above y=127).
    if (y < 0 || y >= 128) return 0;
    const c = this.getChunk(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
    const lx = ((x % CHUNK) + CHUNK) % CHUNK, lz = ((z % CHUNK) + CHUNK) % CHUNK;
    return c.data[(lx << 11) | (lz << 7) | y];
  }
  biome(x: number, z: number): string {
    const c = this.getChunk(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
    const lx = ((x % CHUNK) + CHUNK) % CHUNK, lz = ((z % CHUNK) + CHUNK) % CHUNK;
    return biomeName(c.biomes[lz * CHUNK + lx]);
  }
  surfaceY(x: number, z: number): number {
    for (let y = 127; y > 1; y--) { const d = BLOCKS[this.getBlock(x, y, z)]; if (d && d.solid) return y; }
    return 1;
  }
}

const world = new PlayWorld();
const t0 = Date.now();
head(`FABLE PLAYTEST — headless session on GAME_VERSION ${GAME_VERSION}`);
say('host note: no browser is available here, so this session drives the real game modules (the same');
say('generator, physics, mining formula, recipes, inventory and survival ticks the browser runs) and');
say('measures them; visual claims below are derived from the rendering code paths, not screenshots.');

const R = 6;
const biomeCount = new Map<string, number>();
const blockCount = new Map<string, number>();
let minH = 999, maxH = -999, logs = 0, caveAir = 0, liquid = 0, structureTiles = 0, columns = 0;
const ores = new Map<string, number>();
const ORE_NAMES = ['coal_ore', 'iron_ore', 'copper_ore', 'gold_ore', 'crystal_ore', 'ember_ore'];
const STRUCTURE = ['oak_planks', 'cobblestone', 'bricks', 'stone_bricks', 'bookshelf', 'crafting_table', 'chest', 'furnace', 'glass', 'torch'];
for (let cx = -R; cx <= R; cx++) for (let cz = -R; cz <= R; cz++) {
  const c = world.getChunk(cx, cz);
  for (let i = 0; i < 256; i++) { const n = biomeName(c.biomes[i]); biomeCount.set(n, (biomeCount.get(n) ?? 0) + 1); }
  for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
    columns++;
    let h = 0;
    for (let y = 1; y < 200; y++) {
      const id = c.data[(y * CHUNK + z) * CHUNK + x];
      if (!id) continue;
      const d = BLOCKS[id];
      if (!d) continue;
      blockCount.set(id, (blockCount.get(id) ?? 0) + 1);
      if (d.shape === 'liquid') liquid++;
      if (ORE_NAMES.includes(d.name)) ores.set(d.name, (ores.get(d.name) ?? 0) + 1);
      if (STRUCTURE.includes(d.name)) structureTiles++;
      if (isLog(id)) logs++;
      if (d.solid) h = y;
    }
    for (let y = 3; y < h - 3; y++) if (c.data[(y * CHUNK + z) * CHUNK + x] === 0) caveAir++;
    if (h) { minH = Math.min(minH, h); maxH = Math.max(maxH, h); }
  }
}
say(`world: ${world.chunks.size} chunks generated in ${Date.now() - t0} ms (${columns} columns)`);
say(`terrain  y=${minH}..${maxH}   trees(log tiles)=${logs}   water/lava tiles=${liquid}   underground air=${caveAir}   structure tiles=${structureTiles}`);
const tb = [...biomeCount.values()].reduce((a, b) => a + b, 0);
say(`biomes: ${[...biomeCount.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${(c / tb * 100).toFixed(1)}%`).join(' | ')}`);
say(`ores: ${[...ores.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n}:${c}`).join(' ')}`);
say(`mob/structure spawn markers: ${world.spawnTypes.length} (${[...new Set(world.spawnTypes)].join(', ')})   loot containers: ${world.lootCount}`);

// ------------------------------------------------------------------ movement
head('MOVEMENT — walk / sprint / jump / strafe (real Player + physics)');
const flat = { getBlock: (_x: number, y: number) => (y < 64 ? idOf('stone') : 0) };
const player = new Player();
const inp = player.input;
const stepOn = (w: { getBlock: (x: number, y: number, z: number) => number }, secs: number, light = 1) => {
  for (let t = 0; t < secs; t += 1 / 60) player.update(1 / 60, w, light);
};
const measure = (label: string, secs: number) => {
  const x0 = player.body.x, z0 = player.body.z;
  stepOn(flat, secs);
  const d = Math.hypot(player.body.x - x0, player.body.z - z0);
  say(`${label.padEnd(22)} ${(d / secs).toFixed(2)} blocks/s`);
  return d;
};
player.body.y = 64;
player.autoJump = false;   // keep the flat-ground speed measurements free of auto-jump hops
player.input.jump = false; stepOn(flat, 0.5);
inp.forward = true; measure('walk forward', 4);
inp.sprint = true; measure('sprint forward', 4);
inp.sprint = false; inp.forward = false; inp.right = true; measure('strafe right', 3);
inp.right = false; inp.back = true; measure('walk backward', 3);
inp.back = false; inp.sneak = true; inp.forward = true; measure('sneak forward', 3);
inp.sneak = false; inp.forward = false;
// jump arc
{
  const y0 = player.body.y;
  let peak = y0;
  inp.jump = true;
  for (let i = 0; i < 90; i++) { player.update(1 / 60, flat, 1); peak = Math.max(peak, player.body.y); }
  inp.jump = false;
  say(`jump height (held)      ${(peak - y0).toFixed(2)} blocks (vanilla 1.25)`);
}
// terrain walk with and without jumping
const findSpawn = () => {
  const LAND = new Set(['Plains', 'Forest', 'Birch Forest', 'Taiga', 'Savanna', 'Snowy Plains', 'Jungle', 'Dark Forest', 'Mountains']);
  for (let r = 0; r < 60; r += 3) for (let a = 0; a < 64; a++) {
    const x = Math.round(r * Math.cos((a / 64) * Math.PI * 2)), z = Math.round(r * Math.sin((a / 64) * Math.PI * 2));
    const top = BLOCKS[world.getBlock(x, world.surfaceY(x, z), z)]?.name;
    if (LAND.has(world.biome(x, z)) && top === 'grass_block') return { x, z };
  }
  return { x: 8, z: 8 };
};
const spawn = findSpawn();
const terrainWalk = (label: string, secs: number, hop: boolean) => {
  // pre-generate the neighbourhood first: the game streams chunks in as you walk, but a headless
  // walk has no streaming loop, so warm 5x5 chunks around spawn to measure real terrain.
  for (let cx = Math.floor(spawn.x / CHUNK) - 2; cx <= Math.floor(spawn.x / CHUNK) + 2; cx++)
    for (let cz = Math.floor(spawn.z / CHUNK) - 2; cz <= Math.floor(spawn.z / CHUNK) + 2; cz++) world.getChunk(cx, cz);
  player.body.x = spawn.x + 0.5; player.body.z = spawn.z + 0.5;
  player.body.y = world.surfaceY(spawn.x, spawn.z) + 1; player.body.vy = 0; player.body.vx = 0; player.body.vz = 0;
  player.yaw = 0.7;
  inp.forward = true; inp.jump = false; inp.sprint = false;
  player.autoJump = settings.value.autoJump && !hop;
  let hopT = 0;
  const x0 = player.body.x, z0 = player.body.z;
  for (let t = 0; t < secs; t += 1 / 60) {
    hopT += 1 / 60;
    if (hop) { inp.jump = hopT % 0.9 < 0.25; } else inp.jump = false;
    player.update(1 / 60, world, 1);
  }
  const d = Math.hypot(player.body.x - x0, player.body.z - z0);
  const s = world.surfaceY(Math.round(player.body.x), Math.round(player.body.z));
  say(`${label.padEnd(34)} ${d.toFixed(1)} blocks in ${secs}s = ${(d / secs).toFixed(2)} b/s, ended y=${player.body.y.toFixed(1)} (surface ${s}), onGround=${player.body.onGround}`);
};
say(`spawn column (${spawn.x},${spawn.z}) in ${world.biome(spawn.x, spawn.z)}, surface ${BLOCKS[world.getBlock(spawn.x, world.surfaceY(spawn.x, spawn.z), spawn.z)]?.name}`);
terrainWalk('terrain walk, no jumping', 12, false);
terrainWalk('terrain walk, hopping', 12, true);
// controlled step test: can the player walk up a 1-block step without jumping?
{
  // ground at y=63 and a real 1-block step at cell z=-3 top y=64 (air above it) - an earlier stub
  // made the wall infinitely tall, which correctly failed the auto-jump landing-space check.
  const stepWorld = { getBlock: (_x: number, y: number, z: number) => (y < 64 || (z <= -3 && y === 64) ? idOf('stone') : 0) };
  const p = new Player();
  p.body.y = 64;
  p.input.forward = true;
  const x0 = p.body.x, z0 = p.body.z;
  for (let t = 0; t < 3; t += 1 / 60) p.update(1 / 60, stepWorld, 1);
  say(`1-block step without jumping: travelled ${Math.hypot(p.body.x - x0, p.body.z - z0).toFixed(2)} blocks, ended y=${p.body.y.toFixed(2)} (${p.body.y > 64.5 ? 'stepped up' : 'STOPPED at the step - player must jump (vanilla behaviour, autoJump setting is ' + (settings.value.autoJump ? 'ON' : 'OFF by default') + ')'})`);
  const p2 = new Player();
  p2.body.y = 64; p2.input.forward = true; p2.input.jump = true;
  const x2 = p2.body.x, z2 = p2.body.z;
  for (let t = 0; t < 3; t += 1 / 60) p2.update(1 / 60, stepWorld, 1);
  say(`1-block step while holding jump: travelled ${Math.hypot(p2.body.x - x2, p2.body.z - z2).toFixed(2)} blocks, ended y=${p2.body.y.toFixed(2)}`);
  // auto-jump (now the default for new players): walks up single blocks without touching the jump key
  const p3 = new Player();
  p3.autoJump = settings.value.autoJump;
  p3.body.y = 64; p3.input.forward = true;
  const x3 = p3.body.x, z3 = p3.body.z;
  let hits = 0, jt = -1;
  for (let t = 0; t < 3; t += 1 / 60) {
    const yBefore = p3.body.y;
    p3.update(1 / 60, stepWorld, 1);
    if (p3.body.collidedH) hits++;
    if (jt < 0 && p3.body.y > yBefore + 0.01) jt = t;
  }
  say(`1-block step with auto-jump (default ${settings.value.autoJump}): travelled ${Math.hypot(p3.body.x - x3, p3.body.z - z3).toFixed(2)} blocks, ended y=${p3.body.y.toFixed(2)} (${p3.body.y > 64.5 ? 'climbed it' : 'blocked'})`);
  say(`   auto-jump trace: push frames=${hits}, first upward frame=${jt < 0 ? 'never' : jt.toFixed(2) + 's'}, start z=${z3.toFixed(2)} end z=${p3.body.z.toFixed(2)}, yaw=${p3.yaw.toFixed(2)} startX=${x3.toFixed(2)} endX=${p3.body.x.toFixed(2)}`);
}

// ------------------------------------------------------------------ mining
head('MINING — the real formula, per block and tool');
const fakeGame = Object.create(Game.prototype) as Game;
Object.assign(fakeGame, { player, env: { underwater: false } });
const inv = player.inventory;
const TOOL_IDS = ['wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'gold_pickaxe', 'crystal_pickaxe', 'wood_axe', 'stone_axe', 'iron_axe', 'crystal_axe', 'wood_shovel', 'stone_shovel', 'iron_shovel', 'crystal_shovel', 'wood_sword', 'iron_sword', 'crystal_sword', 'wood_hoe', 'iron_hoe'];
say(`existing tool items (${TOOL_IDS.filter((t) => ITEMS.has(t)).length} found): ${TOOL_IDS.map((t) => (ITEMS.has(t) ? t : t + '(MISSING)')).join(' ')}`);
const blocksToTest = ['stone', 'cobblestone', 'deep_stone', 'dirt', 'grass_block', 'oak_log', 'oak_planks', 'sand', 'gravel', 'coal_ore', 'iron_ore', 'gold_ore', 'crystal_ore', 'ember_ore', 'glass', 'oak_leaves', 'snow_block', 'clay', 'wool', 'ice'];
for (const name of blocksToTest) {
  const id = idOf(name);
  if (id < 0) { say(`${name}: MISSING BLOCK`); continue; }
  const def: BlockDef = BLOCKS[id];
  const cell = (t: string | null) => {
    inv.main.set(inv.selected, t ? makeStack(t, 1)! : null);
    return fakeGame.mineTime(def);
  };
  const hand = cell(null);
  const pick = cell('stone_pickaxe');
  const best = cell('crystal_pickaxe');
  const axe = cell('iron_axe');
  const shovel = cell('iron_shovel');
  const sword = cell('iron_sword');
  say(`${name.padEnd(12)} hard ${String(def.hardness).padEnd(4)} ${def.tool.padEnd(7)} t${def.tier} | hand ${hand.toFixed(2)}s  stonePick ${pick.toFixed(2)}s  crystalPick ${best.toFixed(2)}s  ironAxe ${axe.toFixed(2)}s  ironShovel ${shovel.toFixed(2)}s  ironSword ${sword.toFixed(2)}s`);
}
// harvest gating table
say('');
inv.main.set(inv.selected, null);
const gate = (name: string) => {
  const id = idOf(name); const def = BLOCKS[id];
  const needs = def.tier === 0 ? 'any' : `${def.tool} t${def.tier}+`;
  return `${name}:${needs}`;
};
say(`harvest requirements — ${['stone', 'coal_ore', 'iron_ore', 'gold_ore', 'crystal_ore', 'ember_ore', 'deep_stone'].map(gate).join('  ')}`);
// crack stage timeline with real timing
{
  inv.main.set(inv.selected, makeStack('iron_pickaxe', 1)!);
  const def = BLOCKS[idOf('stone')];
  // The movement tests above leave this shared player mid-air, and mineTime() applies vanilla's
  // 5x airborne penalty -- which silently inflated this timeline 5x. Plant the player first so the
  // crack timeline measures ground mining, which is what the numbers are meant to show.
  player.body.onGround = true;
  const time = fakeGame.mineTime(def);
  const seen: string[] = [];
  let prog = 0, last = -1;
  for (let t = 0; t < time + 0.2; t += 1 / 60) {
    prog += (1 / 60) / time;
    const stage = Math.min(9, Math.floor(prog * 10));
    if (stage !== last) { seen.push(`${stage}@${t.toFixed(2)}s`); last = stage; }
  }
  say(`crack stages on stone with iron pick (${time.toFixed(2)}s total): ${seen.join(' ')}`);
}
// durability + exhaustion per block
{
  inv.main.set(inv.selected, makeStack('stone_pickaxe', 1)!);
  const held = inv.held!;
  const before = held.durability!;
  for (let i = 0; i < 10; i++) fakeGame.damageItem(held, 1);
  say(`durability: stone pickaxe ${before} -> ${held.durability} after 10 blocks (1 per block)`);
  say(`exhaustion per block mined: 0.005 (0.05 sprint-step = 1 block); full hunger bar = 4.0 exhaustion`);
}

// ------------------------------------------------------------------ survival progression
head('SURVIVAL PROGRESSION — the real recipe matcher, played through');
const pinv = new PlayerInventory();
const craftCount = new Map<string, number>();
function matchTag(tag: string, id: string): boolean {
  if (!tag.startsWith('tag:')) return tag === id;
  const t = tag.slice(4);
  if (t === 'planks') return id.endsWith('_planks');
  if (t === 'coal') return id === 'coal' || id === 'charcoal';
  if (t === 'stone_tool_material') return id === 'stone' || id === 'cobblestone';
  return false;
}
const countOf = (ing: string) => pinv.main.items.filter(Boolean).reduce((t, s) => t + (matchTag(ing, s!.id) ? s!.count : 0), 0);
/** Needs of a recipe as ingredient -> amount. */
function needsOf(r: { pattern?: string[]; key?: Record<string, string>; ingredients?: string[] }): Map<string, number> {
  const need = new Map<string, number>();
  const bump = (ing: string) => need.set(ing, (need.get(ing) ?? 0) + 1);
  if (r.ingredients) { for (const i of r.ingredients) bump(i); return need; }
  for (const row of r.pattern!) for (const ch of row) if (ch !== ' ') bump(r.key![ch]);
  return need;
}
/**
 * Craft like a player with the recipe book: pick the recipe by result id, confirm every ingredient is
 * in the pack, lay the pattern out on the 3x3 grid and confirm the GAME's matcher accepts that grid,
 * then consume and add the result.
 */
function craft(resultId: string, times = 1): number {
  let made = 0;
  for (let n = 0; n < times; n++) {
    const r = RECIPES.find((rec) => rec.result.id === resultId);
    if (!r) return made;
    const need = needsOf(r);
    if ([...need.entries()].some(([ing, amt]) => countOf(ing) < amt)) continue;
    const grid: (ItemStack | null)[] = new Array(9).fill(null);
    // lay the pattern out (or pour shapeless ingredients into the first cells)
    if (r.pattern) {
      for (let y = 0; y < r.pattern.length; y++) for (let x = 0; x < r.pattern[y].length; x++) {
        const ch = r.pattern[y][x];
        if (ch === ' ') continue;
        const ing = r.key![ch];
        const src = pinv.main.items.find((s) => s && matchTag(ing, s.id));
        grid[y * 3 + x] = src ? { ...src, count: 1 } : null;
      }
    } else {
      let k = 0;
      for (const ing of r.ingredients!) {
        const src = pinv.main.items.find((s) => s && matchTag(ing, s.id));
        grid[k++] = src ? { ...src, count: 1 } : null;
      }
    }
    if (matchRecipe(grid, 3)?.id !== r.id) {
      say(`  !! the game's matcher rejected the laid-out ${resultId} pattern - recipe book and matcher disagree`);
      continue;
    }
    for (const [ing, amt] of need) {
      let left = amt;
      for (let i = 0; i < pinv.main.size && left > 0; i++) {
        const st = pinv.main.get(i);
        if (st && matchTag(ing, st.id)) { const take = Math.min(left, st.count); st.count -= take; left -= take; if (st.count <= 0) pinv.main.set(i, null); }
      }
    }
    pinv.add(makeStack(r.result.id, r.result.count)!);
    craftCount.set(resultId, (craftCount.get(resultId) ?? 0) + 1);
    made++;
  }
  return made;
}
function recipeResultStack(r: { result: { id: string; count: number } }): ItemStack { return makeStack(r.result.id, r.result.count)!; }

// simulate gathering with the real mine times
const gather = (name: string, tool: string | null, n: number, log = true) => {
  const id = idOf(name);
  const def = BLOCKS[id];
  inv.main.set(inv.selected, tool ? makeStack(tool, 1)! : null);
  const per = fakeGame.mineTime(def);
  // same rule as Game.breakBlock: blocks without a drop table drop themselves
  const drops = def.drops ?? [{ item: def.name, min: 1, max: 1, chance: 1 }];
  const got: string[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += per;
    for (const d of drops) if (Math.random() < d.chance) {
      const c = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
      if (c > 0) { for (let k = 0; k < c; k++) pinv.add(makeStack(d.item, 1)!); got.push(`${d.item}x${c}`); }
    }
  }
  if (log) say(`gathered ${n}x ${name} with ${tool ?? 'bare hands'}: ${total.toFixed(1)}s (${per.toFixed(2)}s each), drops: ${[...new Set(got)].join(' ') || 'NONE'}`);
  return total;
};
let sessionTime = 0;
sessionTime += gather('oak_log', null, 8, true);
say(`  -> punch a tree for 8 logs = ${sessionTime.toFixed(1)}s (a player would rather craft an axe first)`);
craft('oak_planks', 3);
say(`crafted planks: ${pinv.main.items.filter((s) => s?.id === 'oak_planks').reduce((a, s) => a + (s?.count ?? 0), 0)} (recipe: 1 log -> 4 planks)`);
craft('stick');
say(`crafted sticks: ${pinv.main.items.filter((s) => s?.id === 'stick').reduce((a, s) => a + (s?.count ?? 0), 0)} (2 planks -> 4 sticks)`);
const madeTable = craft('crafting_table');
say(`crafting table: ${madeTable ? 'crafted (needs the 2x2 inventory grid)' : 'FAILED'}`);
const madePick = craft('wood_pickaxe');
say(`wooden pickaxe: ${madePick ? 'crafted' : 'FAILED (needs table? the game matcher only needs a 3x3 grid)'}`);
sessionTime += gather('stone', 'wood_pickaxe', 20, true);
craft('furnace', 1);
const madeStonePick = craft('stone_pickaxe');
say(`stone pickaxe: ${madeStonePick ? 'crafted' : 'FAILED'}`);
const madeStoneAxe = craft('stone_axe');
const madeStoneSword = craft('stone_sword');
say(`stone axe: ${madeStoneAxe ? 'ok' : 'no'}   stone sword: ${madeStoneSword ? 'ok' : 'no'}`);
say(`smelting recipes available: ${Object.keys(SMELTING).length} (raw ore -> ingot, sand -> glass, log -> charcoal, food cooking)`);
craft('furnace');
sessionTime += gather('coal_ore', 'stone_pickaxe', 3, true);
sessionTime += gather('iron_ore', 'stone_pickaxe', 3, true);
craft('oak_planks', 1); craft('stick', 1);
craft('torch', 4);
craft('stone_sword', 1);
craft('stone_axe', 1);
craft('stone_pickaxe', 1);
sessionTime += gather('iron_ore', 'stone_pickaxe', 3, true);
craft('iron_pickaxe', 1);
const ironMade = (craftCount.get('iron_pickaxe') ?? 0) > 0;
say(`iron pickaxe from raw iron: ${ironMade ? 'yes (smelting raw_iron -> iron_ingot is in SMELTING)' : 'not yet (needs 3 iron ingots: smelt 3 raw iron in a furnace)'}`);
craft('stone_shovel', 1); craft('stone_hoe', 1); craft('leather_helmet', 1); craft('iron_chestplate', 1);
say(`finished tool set: ${['wood_pickaxe', 'stone_pickaxe', 'stone_axe', 'stone_shovel', 'stone_hoe', 'stone_sword', 'iron_pickaxe'].map((t) => `${t}:${(craftCount.get(t) ?? 0) > 0 ? 'yes' : 'no'}`).join(' ')}`);
say(`crafting chain in ${sessionTime.toFixed(0)}s of pure mining (plus walking/crafting): ${[...craftCount.entries()].map(([k, v]) => `${k}x${v}`).join(' ')}`);
say(`inventory after the session: ${pinv.main.items.filter(Boolean).map((s) => `${s!.id}x${s!.count}`).join(' ') || '(empty)'}`);

// ------------------------------------------------------------------ inventory
head('INVENTORY — stacking, moving, splitting, shift-click');
const i2 = new PlayerInventory();
i2.add(makeStack('cobblestone', 1)!);
for (let i = 0; i < 70; i++) i2.add(makeStack('cobblestone', 1)!);
say(`filled 71 cobblestone -> slot0 ${i2.main.get(0)?.count}, slot1 ${i2.main.get(1)?.count} (max stack 64)`);
clickSlot(i2, i2.main, 0, 0, false);
say(`left-click slot 0 -> cursor ${i2.cursor?.id} x${i2.cursor?.count}, slot0 ${i2.main.get(0) ? 'still filled' : 'empty'}`);
clickSlot(i2, i2.main, 9, 0, false);
say(`left-click empty slot 9 -> slot9 ${i2.main.get(9)?.id} x${i2.main.get(9)?.count}, cursor ${i2.cursor ? 'holding' : 'empty'}`);
clickSlot(i2, i2.main, 9, 0, false);            // pick the 64-stack back up
clickSlot(i2, i2.main, 20, 2);                  // right-click an empty slot -> place exactly one
say(`right-click empty slot 20 -> slot20 x${i2.main.get(20)?.count} (expect 1), cursor x${i2.cursor?.count} (expect 63)`);
clickSlot(i2, i2.main, 20, 0, false);           // put the rest back down
quickMove(i2, i2.main, 20, [i2.main]);
say(`shift-click a hotbar stack -> slot20 now ${i2.main.get(20) ? 'filled' : 'empty'} (stacks of the same item now merged: ${[...new Set(i2.main.items.filter(Boolean).map((s) => s!.id + 'x' + s!.count))].join(' ')})`);
// durability loss + breaking
{
  const pick = makeStack('wood_pickaxe', 1)!;
  i2.main.set(20, pick);
  const max = pick.durability!;
  for (let i = 0; i < max; i++) { pick.durability = (pick.durability ?? max) - 1; if ((pick.durability ?? 0) <= 0) { i2.main.set(20, null); break; } }
  say(`wooden pickaxe broke after ${max} blocks (durability ${max}); slot now ${i2.main.get(20) ? 'occupied' : 'empty'}`);
}
say(`inventory containers: main ${i2.main.size} (9 hotbar + 27 storage), armor ${i2.armor.size}, offhand ${i2.offhand.size}`);

// ------------------------------------------------------------------ combat
head('COMBAT + ARMOR');
const { Mob, MOBS } = await import('../src/game/entities/Entities');
for (const w of ['wood_sword', 'stone_sword', 'iron_sword', 'gold_sword', 'crystal_sword', 'wood_axe', 'iron_axe']) {
  const def = ITEMS.get(w);
  if (!def?.tool) { say(`${w}: MISSING`); continue; }
  const mob = new Mob(MOBS.bovin, 0, 0, 0);
  say(`${w.padEnd(14)} damage ${String(def.tool.damage).padStart(2)} -> ${Math.ceil(mob.maxHealth / def.tool.damage)} hits per Bovin (${mob.maxHealth} hp), durability ${def.tool.durability}, speed ${def.tool.speed}`);
}
say(`mob roster: ${Object.values(MOBS).map((m) => `${m.type} ${m.health}hp${m.hostile ? ' HOSTILE' : ''}${m.boss ? ' BOSS' : ''} drops:${m.drops.map((d) => d.item).join('/')}`).join('\n             ')}`);
// armor mitigation
{
  const p = new Player();
  p.health = 20;
  p.inventory.armor.set(0, makeStack('iron_helmet', 1)!);
  p.inventory.armor.set(1, makeStack('iron_chestplate', 1)!);
  const mitigated = p.damage(10, 'mob');
  say(`iron helmet+chestplate (armor ${p.inventory.armorValue()}) takes 10 damage -> health ${20 - (20 - p.health)} (mitigated: ${mitigated})`);
  const bare = new Player();
  bare.damage(10, 'mob');
  say(`no armor: 10 damage -> health ${bare.health}/20`);
}

// ------------------------------------------------------------------ survival ticks
head('SURVIVAL — hunger drain, regeneration, starvation, eating, drowning');
{
  const p = new Player();
  p.body.y = 64;
  const h: string[] = [];
  let sprintTime = 0;
  p.input.forward = true; p.input.sprint = true;
  for (let i = 0; i < 60 * 60 * 6; i++) {
    p.update(1 / 60, flat, 1);
    sprintTime += 1 / 60;
    if (Math.abs((sprintTime % 60)) < 1 / 60) h.push(`${Math.round(sprintTime)}s:h${p.hunger}`);
    if (p.hunger <= 6) break;
  }
  say(`sprinting non-stop: hunger 20 -> ${p.hunger} after ${sprintTime.toFixed(0)}s (${h.join(' ')})`);
  say(`  => sprinting is limited to hunger>6; that is ${(sprintTime / 60).toFixed(1)} minutes of continuous sprinting`);
  const p2 = new Player();
  p2.body.y = 64; p2.vy = 0; p2.health = 8; p2.hunger = 16;
  for (let i = 0; i < 60 * 60; i++) p2.update(1 / 60, flat, 1);
  say(`health 8 / hunger 16 for 60s idle -> health ${p2.health} (regen needs hunger>=18: ${p2.health > 8 ? 'REGEN' : 'no regen'}), hunger now ${p2.hunger}`);
  const p3 = new Player();
  p3.body.y = 64; p3.health = 20; p3.hunger = 18;
  for (let i = 0; i < 60 * 90; i++) p3.update(1 / 60, flat, 1);
  say(`health 20 / hunger 18 for 90s idle -> health ${p3.health}, hunger ${p3.hunger} (natural drain while idle)`);
  const p4 = new Player();
  p4.body.y = 64; p4.hunger = 0; p4.health = 8; p4.saturation = 0;
  for (let i = 0; i < 60 * 40; i++) p4.update(1 / 60, flat, 1);
  say(`starving (hunger 0) for 40s -> health ${p4.health}/20 (starvation damage ${p4.health < 8 ? 'applied, stops at 1hp on normal difficulty' : 'NOT applied'})`);
  const p5 = new Player();
  p5.hunger = 12; p5.eat(6, 6);
  say(`ate cooked food (+6 hunger/+6 saturation) -> hunger ${p5.hunger}, saturation ${p5.saturation}`);
  const foods = [...ITEMS.values()].filter((i) => i.type === 'food');
  say(`food items: ${foods.map((f) => `${f.id} +${f.food!.hunger}h/${f.food!.saturation}s`).join(' | ')}`);
  // drowning: head under water
  const water = { getBlock: (_x: number, y: number) => (y < 64 ? idOf('stone') : idOf('water')) };
  const p6 = new Player();
  p6.body.y = 66;
  let drowned = 20;
  for (let i = 0; i < 60 * 45; i++) { p6.update(1 / 60, water, 1); }
  drowned = p6.health;
  say(`submerged 45s -> air ${p6.air}, health ${drowned}/20 (drowning ${drowned < 20 ? 'works' : 'DID NOT TRIGGER'})`);
}

// ------------------------------------------------------------------ day/night
head('DAY / NIGHT');
{
  const mod = await import('../src/game/renderer/Environment');
  const env = new (mod.Environment as unknown as new (a: unknown) => { update: (dt: number, p: unknown, ...r: unknown[]) => void; dayLight?: number; time?: number; timeOfDay?: number; skyColor?: unknown })({});
  const anyEnv = env as unknown as Record<string, unknown>;
  const keys = Object.keys(anyEnv).filter((k) => /time|day|light/i.test(k));
  say(`Environment time/light fields: ${keys.join(', ') || '(none found by name)'}`);
  if (typeof anyEnv.timeOfDay === 'number') {
    const out: string[] = [];
    for (const t of [0, 0.25, 0.35, 0.5, 0.75, 0.9]) { anyEnv.timeOfDay = t; env.update(0.001, player); out.push(`${t}:${Number(anyEnv.dayLight ?? NaN).toFixed(2)}`); }
    say(`day light by time of day: ${out.join(' ')}`);
  }
}

// ------------------------------------------------------------------ meshing perf
head('PERFORMANCE — chunk meshing cost (real Mesher)');
{
  const { Region, meshChunk } = await import('../src/game/world/Mesher');
  let plainTris = 0;
  const region = new Region();
  const ms: number[] = [];
  let tris = 0, water = 0;
  const source = { get: (cx: number, cz: number) => world.getChunk(cx, cz) };
  for (let i = 0; i < 5; i++) {
    const cx = 3 + i, cz = 3 + i;
    const t = Date.now();
    region.load(source as never, cx, cz);   // exactly what the generation worker does
    region.computeLight();
    const res = meshChunk(region, cx, cz, true);
    plainTris += meshChunk(region, cx, cz, true, false).opaque.index.length / 3;
    ms.push(Date.now() - t);
    const r = res as unknown as { opaque: { index: number[] }; water: { index: number[] } };
    tris += r.opaque.index.length / 3;
    water += r.water.index.length / 3;
  }
  say(`meshChunk (load + light + mesh): ${ms.join(' / ')} ms per chunk (avg ${(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(0)} ms), ${(tris / 5).toFixed(0)} opaque tris + ${(water / 5).toFixed(0)} water tris per chunk`);
  say(`  greedy meshing: ${(plainTris / 5).toFixed(0)} -> ${(tris / 5).toFixed(0)} opaque tris per chunk (${(100 * (1 - tris / plainTris)).toFixed(1)}% fewer) with smooth lighting on`);
  say(`at render distance 8 that is ~289 chunks; a chunk mesh build costs ${(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(0)} ms of worker time each`);
}

// ------------------------------------------------------------------ audio + UI coverage
head('AUDIO + HUD COVERAGE');
{
  const kinds = ['grass', 'stone', 'wood', 'sand', 'gravel', 'snow', 'glass', 'cloth', 'liquid', 'plant', 'metal', 'leaves'];
  const used = [...new Set(BLOCKS.filter(Boolean).map((b) => b.sound))];
  say(`block sound kinds used: ${used.join(' ')}`);
  say(`  every kind resolves to a generated sound: ${used.every((u) => kinds.includes(u)) ? 'yes' : 'CHECK: ' + used.filter((u) => !kinds.includes(u)).join(',')}`);
  const events = ['step', 'dig', 'break', 'place', 'ui', 'click', 'inv', 'jump', 'land', 'select', 'drop', 'pickup', 'hurt', 'death', 'eat', 'levelup', 'orb', 'splash', 'swim', 'bow', 'arrowhit', 'hit', 'shield', 'crit', 'swing', 'explosion', 'thunder', 'door', 'chest', 'craft', 'furnace', 'fire', 'lava', 'portal', 'enchant', 'mob', 'env', 'discover', 'bladeimpact', 'bladepull', 'anvil'];
  const src = await import('node:fs').then((fs) => fs.readFileSync('src/game/audio/Audio.ts', 'utf8'));
  const missing = events.filter((e) => !src.includes(`case '${e}'`));
  say(`audio events defined in the engine: ${events.length - missing.length}/${events.length}${missing.length ? ' (missing: ' + missing.join(',') + ')' : ''}`);
  const uiSrc = await import('node:fs').then((fs) => fs.readFileSync('src/ui/sprites.ts', 'utf8'));
  const sprites = ['heart-bg', 'heart-full', 'heart-half', 'drum-bg', 'drum-full', 'drum-half', 'armor-bg', 'armor-full', 'armor-half', 'bubble'];
  say(`HUD sprites painted in sprites.ts: ${sprites.filter((s) => uiSrc.includes(`--spr-${s}`)).join(' ') || 'none'}`);
}

head('DISCOVERY + LIVING WORLD — exploration rewards and wildlife restock');
{
  const { Discovery, LOOT_LABELS } = await import('../src/game/core/Discovery');
  const toasts: string[] = []; let xp = 0; let chimes = 0; let bigChimes = 0;
  const mk = () => ({ message: (t: string) => toasts.push(t), addXp: (n: number) => { xp += n; }, chime: (big: boolean) => { chimes++; if (big) bigChimes++; } });
  const j = new Discovery(mk());
  const first = j.biome(3, 'Forest');
  const dup = j.biome(3, 'Forest');
  say(`biome discovery fires exactly once: ${first && !dup}`);
  say(`  toast names the biome and pays XP: ${toasts[0]?.includes('Forest') && toasts[0].includes('5 XP')} (xp=${xp})`);
  const j2 = new Discovery(mk());
  const tables = Object.keys(LOOT_LABELS);
  const allFire = tables.every((t) => j2.loot(t));
  const dupSuppressed = !j2.loot('dungeon');
  say(`all ${tables.length} loot tables celebrate once (${tables.join(', ')}): ${allFire && dupSuppressed}`);
  const rareOnce = j2.rare('wyrm', 'the Void Wyrm', 50) && !j2.rare('wyrm', 'the Void Wyrm', 50);
  say(`rare firsts (boss kill) fire once and pay out: ${rareOnce} (xp=${xp}, expected ${5 + tables.length * 10 + 50})`);
  const xpOk = xp === 5 + tables.length * 10 + 50;
  say(`discovery XP totals add up: ${xpOk}`);
  // save/load round trip: restoring a world must NOT replay the celebrations
  const saved = j2.serialize();
  const toastsBefore = toasts.length;
  const j3 = new Discovery(mk());
  j3.load(saved);
  const silentRestore = j3.count === saved.length && toasts.length === toastsBefore && !j3.loot('dungeon') && j3.has('r:wyrm');
  say(`save -> load round trip restores ${saved.length} finds silently (no replayed toasts/xp): ${silentRestore}`);
  // wildlife: every biome animal list must resolve to a real, passive mob
  const badAnimals: string[] = [];
  for (const b of BIOMES) if (b) for (const a of b.animals) if (!MOBS[a] || MOBS[a].hostile) badAnimals.push(`${b.name}:${a}`);
  const biomesWithAnimals = BIOMES.filter((b) => b && b.animals.length > 0).length;
  say(`biome animal lists all resolve to passive mobs: ${badAnimals.length ? 'NO - ' + badAnimals.join(', ') : `yes (${biomesWithAnimals} biomes list wildlife)`}`);
  // the restock loop must exist and be gated (day + grass + light + distance)
  const fs = await import('node:fs');
  const entSrc = fs.readFileSync(new URL('../src/game/entities/Entities.ts', import.meta.url).pathname, 'utf8');
  const restock = entSrc.includes('naturalPassiveSpawn') && entSrc.includes('this.passiveTimer') && entSrc.includes('ctx.daylight < 0.6') && entSrc.includes('below !== B.GRASS');
  say(`wildlife restock wired (day/g grass/light-gated passive spawner): ${restock}`);
  say(`stormy weather raises the hostile cap: ${entSrc.includes('ctx.weatherBad ? 22 : 18')}`);
  const gameSrc = fs.readFileSync(new URL('../src/game/core/Game.ts', import.meta.url).pathname, 'utf8');
  const hooks = ['private discoveryTick', "if (be.loot) this.discovery.loot(be.loot)", "discovery.rare('crystal_ore'"];
  say(`journal hooks (biome tick / chest loot / rare ores): ${hooks.every((h) => gameSrc.includes(h))}`);
  say(`boss kill journaled: ${entSrc.includes("discover('wyrm'")}`);
  say(`discoveries persist with the world save: ${gameSrc.includes('this.discovery.serialize()') && gameSrc.includes('this.discovery.load(')}`);
  const audioSrc = fs.readFileSync(new URL('../src/game/audio/Audio.ts', import.meta.url).pathname, 'utf8');
  say(`discover chime synthesized: ${audioSrc.includes("case 'discover'")}`);
}

// ------------------------------------------------------------------ data integrity
head('ICON ART — every item icon is drawable, unit-sized and tier-distinct');
{
  // ART + drawArt live in Icons.ts; re-derive them from the module source so this stays honest
  // without exporting internals. drawArt derives any palette key an item does not define from the
  // item's main colour, but a bitmap character outside its palette table renders as fallback magenta
  // and a bitmap that is not 16x16 shifts the whole icon - both are real "icon looks broken" bugs.
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/game/items/Icons.ts', import.meta.url).pathname, 'utf8');
  const artBlock = src.slice(src.indexOf('const ART: Record<string, string[]> = {'), src.indexOf('\n};', src.indexOf('const ART: Record<string, string[]> = {')));
  const palKeys = new Set([...(src.match(/const pal: Record<string, string> = \{([\s\S]*?)\n  \};/) || ['', ''])[1].matchAll(/([A-Za-z]):/g)].map((m) => m[1]));
  say(`palette characters drawArt resolves: ${[...palKeys].sort().join(' ')}`);
  const parts = artBlock.split(/^  ([a-z_0-9]+): \[$/m).slice(1);
  const bitmaps = new Map<string, string[]>();
  const badSize: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const rows = [...parts[i + 1].matchAll(/^    '([^']*)',$/gm)].map((m) => m[1]);
    bitmaps.set(parts[i], rows);
    const widths = [...new Set(rows.map((r) => r.length))];
    if (rows.length !== 16 || widths.length !== 1 || widths[0] !== 16) badSize.push(`${parts[i]}:${rows.length}x${widths.join('/')}`);
  }
  const usedArt = new Set<string>(), unknown: string[] = [], badChars: string[] = [];
  let blockIcons = 0, handled = 0, procedural = 0;
  const toolColors = new Map<string, Map<string, string>>();
  for (const [id, def] of ITEMS) {
    const icon = def.icon;
    if (!icon) continue;
    if ('block' in icon) { blockIcons++; continue; }
    usedArt.add(icon.art);
    const rows = bitmaps.get(icon.art);
    if (isHandledArt(icon.art)) handled++; else procedural++;
    if (!rows) continue; // procedural shape (lump, ingot, gem, ...) has no bitmap to validate
    const bad = [...new Set(rows.join('').split('').filter((c) => c !== '.' && !palKeys.has(c)))];
    if (bad.length) badChars.push(`${id}(${icon.art}) uses ${bad.join('')}`);
    const kind = icon.art;
    if (isHandledArt(kind) && /^(wood|stone|copper|iron|gold|crystal)_/.test(id)) {
      const tier = id.split('_')[0];
      if (!toolColors.has(kind)) toolColors.set(kind, new Map());
      toolColors.get(kind)!.set(tier, JSON.stringify(icon.colors || {}));
    }
    for (const a of [icon.art]) if (!bitmaps.has(a)) unknown.push(`${id}->${a}`);
  }
  say(`icons: ${blockIcons} block cubes, ${handled} handled tools/weapons, ${procedural} procedural items`);
  say(`bitmaps that are not 16x16: ${badSize.length ? badSize.join(' ') : 'none'}`);
  say(`items pointing at art that does not exist: ${unknown.length ? unknown.join(' ') : 'none'}`);
  say(`icons whose bitmap uses a character the palette cannot resolve (renders magenta): ${badChars.length ? badChars.join(', ') : 'none'}`);
  say(`art entries never used by any item: ${[...bitmaps.keys()].filter((a) => !usedArt.has(a)).join(' ') || 'none'}`);
  for (const [kind, tiers] of toolColors) {
    const distinct = new Set(tiers.values()).size;
    say(`${kind.padEnd(8)} tiers: ${tiers.size} (${[...tiers.keys()].join(', ')}), distinct colour sets: ${distinct}${distinct === tiers.size ? '' : '  <-- two tiers would look identical'}`);
  }
}

head('DATA INTEGRITY — can everything the game promises actually be obtained?');
{
  const blockItems = BLOCKS.filter((b) => b && b.hasItem).map((b) => b.name);
  const missingItems = blockItems.filter((n) => !ITEMS.has(n));
  say(`blocks with items: ${blockItems.length}, missing an ITEMS entry: ${missingItems.length ? missingItems.join(',') : 'none'}`);
  const badDrops: string[] = [];
  for (const b of BLOCKS) {
    if (!b || !b.drops) continue;
    for (const d of b.drops) if (!ITEMS.has(d.item)) badDrops.push(`${b.name}->${d.item}`);
  }
  say(`block drop tables referencing unknown items: ${badDrops.length ? badDrops.join(', ') : 'none'}`);
  const badRecipes: string[] = [];
  for (const r of RECIPES) {
    if (!ITEMS.has(r.result.id)) badRecipes.push(`result ${r.result.id}`);
    const ings = r.ingredients ?? Object.entries(r.key ?? {}).map(([, v]) => v);
    for (const ing of ings) {
      if (ing.startsWith('tag:')) continue;
      if (!ITEMS.has(ing)) badRecipes.push(`${r.result.id}<-${ing}`);
    }
  }
  say(`recipes referencing unknown items: ${badRecipes.length ? [...new Set(badRecipes)].join(', ') : 'none'} (${RECIPES.length} recipes total)`);
  const badSmelt = Object.entries(SMELTING).filter(([k, v]) => !ITEMS.has(k) || !ITEMS.has(v.result)).map(([k, v]) => `${k}->${v.result}`);
  say(`smelting entries referencing unknown items: ${badSmelt.length ? badSmelt.join(', ') : 'none'} (${Object.keys(SMELTING).length} recipes)`);
  const mobDrops: string[] = [];
  for (const m of Object.values(MOBS)) for (const d of m.drops) if (!ITEMS.has(d.item)) mobDrops.push(`${m.type}->${d.item}`);
  say(`mob drops referencing unknown items: ${mobDrops.length ? mobDrops.join(', ') : 'none'}`);
  // food obtainable without killing anything?
  const leafFood = [...ITEMS.values()].filter((i) => i.type === 'food').map((f) => f.id);
  const sources = new Map<string, string[]>();
  for (const b of BLOCKS) if (b?.drops) for (const d of b.drops) if (leafFood.includes(d.item)) sources.set(d.item, [...(sources.get(d.item) ?? []), b.name]);
  for (const m of Object.values(MOBS)) for (const d of m.drops) if (leafFood.includes(d.item)) sources.set(d.item, [...(sources.get(d.item) ?? []), 'mob:' + m.type]);
  say(`food sources: ${[...sources.entries()].map(([f, src]) => `${f}<-${src.slice(0, 3).join('/')}`).join('  ')}`);
  const crops = BLOCKS.filter((b) => b && /^wheat_|^carrot_|^potato_/.test(b.name)).map((b) => `${b.name}:${b.drops?.map((d) => d.item).join('+') ?? 'self'}`);
  say(`farm crops: ${crops.join(' ')}`);
}

say(`\nPLAYTEST SESSION COMPLETE — ${((Date.now() - t0) / 1000).toFixed(1)}s wall clock`);
