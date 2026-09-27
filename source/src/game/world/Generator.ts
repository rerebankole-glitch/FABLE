import { B, BLOCKS } from '../blocks/Blocks';
import { BIOME, BIOMES, type TreeType } from './Biomes';
import { CHUNK_HEIGHT, CHUNK_SIZE, SEA_LEVEL, blockIndex, clamp, lerp, smoothstep, type WorldType } from '../core/types';
import { Simplex, hash2, mulberry32 } from './Noise';

export interface GenOptions {
  seed: number;
  structures: boolean;
  worldType: WorldType;
  dimension: 'overworld' | 'void';
}

export interface SpawnHint { type: string; x: number; y: number; z: number }
export interface LootHint { x: number; y: number; z: number; table: string }

export interface GenResult {
  data: Uint8Array;
  biomes: Uint8Array;
  heights: Uint8Array;
  spawns: SpawnHint[];
  loot: LootHint[];
}

interface Column { h: number; biome: number; temp: number; cont: number }

export type SetBlockFn = (x: number, y: number, z: number, id: number, force?: boolean) => void;

const H = CHUNK_HEIGHT;
const S = CHUNK_SIZE;
const MARGIN = 5;
const PAD = S + MARGIN * 2;

export class Generator {
  private cont: Simplex; private ero: Simplex; private peaks: Simplex; private temp: Simplex; private humid: Simplex;
  private river: Simplex; private detail: Simplex; private hills: Simplex; private cave1: Simplex; private cave2: Simplex;
  private cave3: Simplex; private mush: Simplex; private chamber: Simplex; private ravine: Simplex; private shaft: Simplex;
  seed: number;
  /** Per-seed terrain personality: every world rolls its own continent scale, sea level bias,
   * mountain power, ridge-cliff size and mountain start height, so two seeds never sculpt the
   * same kind of landscape. */
  contScale = 1400; seaBias = 0; mtnPower = 1; hillPower = 1; mtnFrom = 0.38; terrN = 6;

  constructor(public opts: GenOptions) {
    const s = opts.seed;
    this.seed = s;
    this.cont = new Simplex(s + 1); this.ero = new Simplex(s + 2); this.peaks = new Simplex(s + 3);
    this.temp = new Simplex(s + 4); this.humid = new Simplex(s + 5); this.river = new Simplex(s + 6);
    this.detail = new Simplex(s + 7); this.hills = new Simplex(s + 8); this.cave1 = new Simplex(s + 9);
    this.cave2 = new Simplex(s + 10); this.cave3 = new Simplex(s + 11); this.mush = new Simplex(s + 12);
    this.chamber = new Simplex(s + 13); this.ravine = new Simplex(s + 14); this.shaft = new Simplex(s + 15);
    const rng = mulberry32((hash2(s, 0x51e4, 0x81a7) >>> 0) || 1);
    this.contScale = 950 + rng() * 2300;      // continent wavelength: small archipelagos .. vast supercontinents
    // Land/sea balance. This used to be (rng()-0.5)*0.55, i.e. a MEAN OF ZERO -- which centres the
    // continentalness field on c=0 and makes the average world ~55% ocean by construction, with the
    // interesting land biomes starved (measured: Badlands 0.1%, Swamp 0.3%, Desert 0.4%). Biasing
    // the mean landward keeps the full range of worlds (archipelago .. supercontinent) while making
    // the typical world one a player can actually explore on foot.
    this.seaBias = 0.22 + (rng() - 0.5) * 0.5;
    this.mtnPower = 0.72 + rng() * 0.95;      // 0.72x .. 1.67x mountain amplitude
    this.hillPower = 0.75 + rng() * 0.75;     // how rolling the lowlands are
    this.mtnFrom = 0.3 + rng() * 0.14;        // ridge height at which peaks start rising
    this.terrN = 4 + Math.floor(rng() * 5);   // cliff terrace quantisation (4 .. 8)
  }

  /**
   * Landform shaping per climate. Returns a multiplier for hill amplitude, an additive offset and a "roughness"
   * for the small detail noise. Blending these by temperature/humidity (continuous fields) rather than by the
   * final biome id means neighbouring biomes flow into each other with no height seams.
   */
  private landform(t: number, hu: number, p: number, hl: number, ridge: number): { hills: number; add: number; rough: number } {
    // desert: dunes (long low ridges) + occasional mesas; savanna: flat with lone plateaus; jungle: steep lumpy hills;
    // taiga/snow: gentle; swamp handled after biome pick (flattened to sea level)
    const hot = smoothstep(0.7, 0.9, t), cold = 1 - smoothstep(0.2, 0.4, t), dry = 1 - smoothstep(0.3, 0.5, hu), wet = smoothstep(0.55, 0.8, hu);
    let hills = 1, add = 0, rough = 1;
    // deserts: dune field
    const desert = hot * dry;
    hills += desert * (-0.6 + ridge * 0.9);
    add += desert * ridge * 5;
    rough -= desert * 0.5;
    // jungle: bumpy, higher
    const jungle = hot * wet;
    hills += jungle * 1.1 * hl;
    add += jungle * 4;
    rough += jungle * 0.8;
    // cold plains: smooth
    hills -= cold * 0.35;
    rough -= cold * 0.3;
    // temperate forests: slightly rolling
    const temperate = (1 - hot) * (1 - cold);
    hills += temperate * 0.25 * hl;
    void p;
    return { hills: Math.max(0.15, hills), add, rough: Math.max(0.3, rough) };
  }

  column(x: number, z: number): Column {
    if (this.opts.worldType === 'flat') return { h: 64, biome: BIOME.PLAINS, temp: 0.6, cont: 0.5 };
    let c = clamp(this.cont.fbm2(x / this.contScale, z / this.contScale, 4) * 1.6 + this.seaBias, -1, 1);
    if (this.opts.worldType === 'islands') c -= 0.45;
    const e = (this.ero.fbm2(x / 700, z / 700, 3) + 1) / 2;
    const p = this.peaks.ridged2(x / 320, z / 320, 3);
    const d = this.detail.fbm2(x / 45, z / 45, 3);
    const hl = (this.hills.fbm2(x / 130, z / 130, 3) + 1) / 2;
    const amp = this.opts.worldType === 'amplified' ? 1.9 : 1;
    // climate fields are needed early now, because they shape the land
    // fbm rarely reaches ±1, so stretch the climate fields: without this almost the whole world is temperate
    // Climate stretch. fbm rarely reaches +-1, so the field is widened before use. 1.55 left the
    // extremes almost empty (measured: only ~3% of columns above t=0.85), which starved every
    // hot/dry biome -- Desert 0.4%, Badlands 0.1%. Widening pushes more of the world into both
    // tails, so deserts, badlands, jungles AND snowy plains all actually show up.
    let t = clamp((this.temp.fbm2(x / 950, z / 950, 3) * 2.05 + 1) / 2, 0, 1);
    const hu = clamp((this.humid.fbm2(x / 820, z / 820, 3) * 1.5 + 1) / 2, 0, 1);
    const ridge = (this.hills.ridged2(x / 60, z / 22, 2) + 1) / 2; // anisotropic: dune crests run along x
    const lf = this.landform(t, hu, p, hl, ridge);
    let h: number;
    if (c < -0.2) {
      // ocean floor: gentle undulation + deeper trenches in the deep ocean, so the seabed is not a flat plate
      const trench = smoothstep(0.55, 0.85, this.peaks.ridged2(x / 240, z / 240, 2)) * smoothstep(-0.45, -0.8, c) * 14;
      h = SEA_LEVEL - 4 + (c + 0.2) * 45 + d * 2.5 + hl * 4 - trench;
    } else if (c < -0.05) {
      h = SEA_LEVEL - 4 + ((c + 0.2) / 0.15) * 6 + d * 1.2;
    } else {
      const inland = smoothstep(0, 0.45, c);
      const base = 64 + (c + 0.05) * 12 + lf.add * inland;
      const hills = (1 - e) * 16 * hl * amp * lf.hills * this.hillPower;
      // mountains: ridged peaks, with cliff terraces (quantised ridge) so slopes read as rock faces rather than smooth mounds
      const mtn = smoothstep(this.mtnFrom, 0.85, p) * inland * (1 - e * 0.55);
      const terrace = Math.floor(p * this.terrN) / this.terrN;
      const mountains = (mtn * 58 + smoothstep(0.6, 0.9, p) * inland * terrace * 10) * amp * this.mtnPower;
      h = base + hills + mountains + d * 3 * lf.rough;
    }
    // Rivers: a carved valley (wide, gentle banks) with the water channel in the middle.
    // The river field is evaluated ONCE here and reused by the biome test below: it used to be
    // sampled twice per column with identical arguments, which is a wasted 2-octave fbm on every
    // column in the world (43k per 169 chunks).
    const riverN = c > -0.12 ? Math.abs(this.river.fbm2(x / 380, z / 380, 2)) : 1;
    if (c > -0.12) {
      const rv = riverN;
      const w = 0.03, valley = 0.075;
      if (rv < valley) {
        const bank = smoothstep(0, 1, 1 - rv / valley);
        h = lerp(h, Math.min(h, SEA_LEVEL + 2), bank * 0.75); // valley floor near sea level
      }
      if (rv < w) {
        const depth = smoothstep(0, 1, 1 - rv / w);
        h = lerp(h, Math.min(h, SEA_LEVEL - 3), depth);
      }
    }
    // Mushroom isles far in the ocean
    let mushroom = false;
    if (c < -0.5) {
      const m = this.mush.fbm2(x / 260, z / 260, 2);
      if (m > 0.5) {
        h = Math.max(h, SEA_LEVEL + 1 + (m - 0.5) * 50);
        mushroom = true;
      }
    }
    t -= Math.max(0, h - 88) * 0.012;
    let biome: number;
    const isRiver = c > -0.12 && riverN < 0.03 * 0.7;
    if (mushroom) biome = BIOME.MUSHROOM_ISLE;
    else if (h < SEA_LEVEL - 1) {
      if (isRiver && c > -0.05) biome = BIOME.RIVER;
      else if (t < 0.18) biome = BIOME.FROZEN_OCEAN;
      else biome = c < -0.55 ? BIOME.DEEP_OCEAN : BIOME.OCEAN;
    } else if (h > 96) {
      biome = t < 0.35 || h > 112 ? BIOME.SNOWY_MOUNTAINS : BIOME.MOUNTAINS;
    } else if (h <= SEA_LEVEL + 1.5 && t >= 0.2) {
      biome = isRiver ? BIOME.RIVER : BIOME.BEACH;
    } else if (t < 0.2) biome = hu > 0.5 ? BIOME.SNOWY_TAIGA : BIOME.SNOWY_PLAINS;
    else if (t < 0.4) biome = hu > 0.42 ? BIOME.TAIGA : BIOME.PLAINS;
    else if (t < 0.7) biome = hu < 0.3 ? BIOME.PLAINS : hu < 0.55 ? BIOME.FOREST : hu < 0.75 ? BIOME.BIRCH_FOREST : BIOME.DARK_FOREST;
    else if (t < 0.85) biome = hu < 0.3 ? BIOME.SAVANNA : hu < 0.6 ? BIOME.FOREST : h < 70 ? BIOME.SWAMP : BIOME.FOREST;
    else biome = hu < 0.35 ? BIOME.DESERT : hu < 0.5 ? (p > 0.55 ? BIOME.BADLANDS : BIOME.SAVANNA) : BIOME.JUNGLE;
    if (biome === BIOME.SWAMP) h = lerp(h, 63.5, 0.6);
    if (biome === BIOME.BADLANDS) h += smoothstep(0.55, 0.8, p) * 12;
    return { h, biome, temp: t, cont: c };
  }

  generateChunk(cx: number, cz: number): GenResult {
    if (this.opts.dimension === 'void') return this.generateVoid(cx, cz);
    const data = new Uint8Array(S * S * H);
    const biomes = new Uint8Array(S * S);
    const heights = new Uint8Array(S * S);
    const spawns: SpawnHint[] = [];
    const loot: LootHint[] = [];
    const cols: Column[] = new Array(PAD * PAD);
    const ox = cx * S, oz = cz * S;
    for (let px = 0; px < PAD; px++) {
      for (let pz = 0; pz < PAD; pz++) {
        cols[px * PAD + pz] = this.column(ox + px - MARGIN, oz + pz - MARGIN);
      }
    }
    const colAt = (lx: number, lz: number) => cols[(lx + MARGIN) * PAD + (lz + MARGIN)];
    const seed = this.seed;

    // ---- cave noise on a coarse grid, trilinearly interpolated ----
    const GX = S / 4 + 1, GY = H / 4 + 1;
    const cheese = new Float32Array(GX * GY * GX);
    const sp1 = new Float32Array(GX * GY * GX);
    const sp2 = new Float32Array(GX * GY * GX);
    const cham = new Float32Array(GX * GY * GX);
    for (let gx = 0; gx < GX; gx++) for (let gz = 0; gz < GX; gz++) for (let gy = 0; gy < GY; gy++) {
      const wx = ox + gx * 4, wy = gy * 4, wz = oz + gz * 4;
      const i = (gx * GY + gy) * GX + gz;
      cheese[i] = this.cave1.noise3D(wx / 95, wy / 55, wz / 95);
      sp1[i] = this.cave2.noise3D(wx / 42, wy / 26, wz / 42);
      sp2[i] = this.cave3.noise3D(wx / 42 + 100, wy / 26, wz / 42 + 100);
      // large chambers: low-frequency, flattened vertically so they read as halls rather than spheres
      cham[i] = this.chamber.noise3D(wx / 120, wy / 30, wz / 120) + this.cave1.noise3D(wx / 30, wy / 18, wz / 30) * 0.18; // detail breaks up flat ceilings
    }
    // 2D fields per column: ravines (thin ridged canyons) and vertical shafts (rare narrow wells)
    const ravineF = new Float32Array(S * S), shaftF = new Float32Array(S * S), lakeF = new Float32Array(S * S);
    for (let lx = 0; lx < S; lx++) for (let lz = 0; lz < S; lz++) {
      const wx = ox + lx, wz = oz + lz;
      ravineF[lx * S + lz] = Math.abs(this.ravine.fbm2(wx / 210, wz / 210, 2));
      shaftF[lx * S + lz] = this.shaft.fbm2(wx / 26, wz / 26, 1);
      lakeF[lx * S + lz] = this.mush.fbm2(wx / 70 + 500, wz / 70 + 500, 2);
    }
    const tri = (arr: Float32Array, x: number, y: number, z: number) => {
      const gx = x >> 2, gy = y >> 2, gz = z >> 2;
      const fx = (x & 3) / 4, fy = (y & 3) / 4, fz = (z & 3) / 4;
      const i = (gx * GY + gy) * GX + gz;
      const c000 = arr[i], c100 = arr[i + GY * GX], c010 = arr[i + GX], c110 = arr[i + GY * GX + GX];
      const c001 = arr[i + 1], c101 = arr[i + GY * GX + 1], c011 = arr[i + GX + 1], c111 = arr[i + GY * GX + GX + 1];
      const x00 = c000 + (c100 - c000) * fx, x10 = c010 + (c110 - c010) * fx;
      const x01 = c001 + (c101 - c001) * fx, x11 = c011 + (c111 - c011) * fx;
      const y0 = x00 + (x10 - x00) * fy, y1 = x01 + (x11 - x01) * fy;
      return y0 + (y1 - y0) * fz;
    };

    // ---- terrain fill ----
    for (let lx = 0; lx < S; lx++) {
      for (let lz = 0; lz < S; lz++) {
        const col = colAt(lx, lz);
        const biome = BIOMES[col.biome];
        const h = Math.floor(col.h);
        const wx = ox + lx, wz = oz + lz;
        biomes[lx * S + lz] = col.biome;
        const base = blockIndex(lx, 0, lz);
        const soilDepth = 3 + Math.floor(hash2(seed, wx, wz) * 2);
        const stoneTop = h - soilDepth;
        const deepLine = 14 + Math.floor(hash2(seed ^ 77, wx, wz) * 5);
        const underwater = h < SEA_LEVEL;
        for (let y = 0; y <= Math.max(h, SEA_LEVEL); y++) {
          let id: number = B.AIR;
          if (y === 0 || (y < 3 && hash2(seed ^ 3, wx + y * 31, wz) < 0.5 - y * 0.2)) id = B.BEDROCK;
          else if (y <= h) {
            if (y > stoneTop) {
              if (y === h) {
                if (underwater) id = h < SEA_LEVEL - 6 ? (col.biome === BIOME.DEEP_OCEAN ? B.GRAVEL : hash2(seed, wx, wz) < 0.5 ? B.SAND : B.GRAVEL) : B.SAND;
                else id = biome.top;
                if (id === B.SAND && col.biome === BIOME.SWAMP) id = B.MUD;
                if (col.biome === BIOME.RIVER && underwater) id = hash2(seed ^ 9, wx, wz) < 0.3 ? B.CLAY : B.SAND;
              } else id = biome.filler;
              if (col.biome === BIOME.BADLANDS && y < h && ((y >> 1) & 1) === 0 && hash2(seed ^ 5, y, 0) < 0.4) id = B.RED_SAND;
            } else id = y < deepLine ? B.DEEP_STONE : B.STONE;
            // mountains: bare stone above tree line
            if (col.biome === BIOME.MOUNTAINS && y === h && h > 100) id = B.STONE;
          } else if (y <= SEA_LEVEL) {
            id = B.WATER;
            if (y === SEA_LEVEL && col.temp < 0.16) id = B.ICE;
          }
          // Caves: tunnels (two tube fields), cheese pockets, large chambers, vertical shafts and ravines
          if (id !== B.AIR && id !== B.BEDROCK && id !== B.WATER && id !== B.ICE && y > 2) {
            const depth = h - y;
            const nearSurface = depth < 6;
            const keepFloor = underwater && depth < 8;
            if (!keepFloor) {
              const s1 = tri(sp1, lx, y, lz), s2 = tri(sp2, lx, y, lz);
              const r = nearSurface ? 0.045 : 0.075;
              let carve = s1 * s1 + s2 * s2 < r * r;
              if (!carve && !nearSurface && depth > 10) {
                const ch = tri(cheese, lx, y, lz);
                const thr = y < 40 ? 0.52 : 0.6;
                carve = ch > thr;
              }
              // chambers: only deep, threshold eases with depth so the biggest halls are far down
              if (!carve && depth > 14 && y < 56) {
                const cm = tri(cham, lx, y, lz);
                carve = cm > 0.68 - (56 - y) * 0.0025;
              }
              // vertical shafts: narrow wells that connect the surface to the cave layer (rare)
              if (!carve && !underwater && shaftF[lx * S + lz] > 0.74 && y > 24 && depth > 1) carve = true; // sinkhole, ends in the chamber layer
              // ravines: deep narrow canyons open to the sky, only inland and away from water
              if (!carve && !underwater && h > SEA_LEVEL + 4 && ravineF[lx * S + lz] < 0.012 && y > Math.max(10, h - 34)) {
                const wall = 1 - ravineF[lx * S + lz] / 0.012;
                carve = y > h - 34 * wall;
              }
              if (carve) {
                // underground lakes: chamber floors below y 34 fill with water where the lake field says so; lava at the bottom
                id = y <= 10 ? B.LAVA : (y < 34 && lakeF[lx * S + lz] > 0.35 && y < 22 + lakeF[lx * S + lz] * 8) ? B.WATER : B.AIR;
              }
            }
          }
          data[base + y] = id;
        }
        let top = h;
        while (top > 0 && data[base + top] === B.AIR) top--;
        heights[lx * S + lz] = Math.max(top, SEA_LEVEL);
      }
    }

    const inChunk = (x: number, y: number, z: number) => x >= ox && x < ox + S && z >= oz && z < oz + S && y >= 0 && y < H;
    const set: SetBlockFn = (x, y, z, id, force) => {
      if (!inChunk(x, y, z)) return;
      const i = blockIndex(x - ox, y, z - oz);
      const cur = data[i];
      if (!force && cur !== B.AIR && !BLOCKS[cur].replaceable && !(id !== B.AIR && BLOCKS[cur].tint && !BLOCKS[cur].solid)) return;
      data[i] = id;
    };
    const get = (x: number, y: number, z: number) => (inChunk(x, y, z) ? data[blockIndex(x - ox, y, z - oz)] : -1);

    // ---- ores ----
    const rng = mulberry32(hash2(seed ^ 0x0ee5, cx, cz) * 4294967295);
    const vein = (id: number, count: number, minY: number, maxY: number, minSize: number, maxSize: number, chance = 1) => {
      for (let n = 0; n < count; n++) {
        if (rng() > chance) continue;
        let x = ox + Math.floor(rng() * S), z = oz + Math.floor(rng() * S);
        let y = minY + Math.floor(rng() * (maxY - minY));
        const size = minSize + Math.floor(rng() * (maxSize - minSize + 1));
        for (let i = 0; i < size; i++) {
          const cur = get(x, y, z);
          if (cur === B.STONE || cur === B.DEEP_STONE) data[blockIndex(x - ox, y, z - oz)] = id;
          const axis = Math.floor(rng() * 3);
          const dir = rng() < 0.5 ? -1 : 1;
          if (axis === 0) x += dir; else if (axis === 1) y = clamp(y + dir, 1, H - 2); else z += dir;
        }
      }
    };
    vein(B.COAL_ORE, 14, 8, 100, 5, 10);
    vein(B.COPPER_ORE, 7, 24, 72, 4, 8);
    vein(B.IRON_ORE, 9, 4, 60, 3, 7);
    vein(B.GOLD_ORE, 3, 4, 30, 3, 6);
    vein(B.EMBER_ORE, 4, 4, 16, 4, 8);
    vein(B.CRYSTAL_ORE, 1, 2, 14, 2, 5, 0.7);
    vein(B.DIRT, 3, 20, 70, 8, 14);
    vein(B.GRAVEL, 2, 10, 60, 8, 14);

    // ---- decorations: trees (from padded columns so they cross chunk borders) ----
    for (let lx = -MARGIN + 1; lx < S + MARGIN - 1; lx++) {
      for (let lz = -MARGIN + 1; lz < S + MARGIN - 1; lz++) {
        const col = colAt(lx, lz);
        const biome = BIOMES[col.biome];
        if (biome.treeDensity <= 0 || biome.trees[0] === 'none') continue;
        const h = Math.floor(col.h);
        if (h <= SEA_LEVEL) continue;
        const wx = ox + lx, wz = oz + lz;
        const r = hash2(seed ^ 0x7e3, wx, wz);
        if (r >= biome.treeDensity) continue;
        let ok = true;
        for (let dx = -2; dx <= 2 && ok; dx++) for (let dz = -2; dz <= 2; dz++) {
          if (dx === 0 && dz === 0) continue;
          if (hash2(seed ^ 0x7e3, wx + dx, wz + dz) < r) { ok = false; break; }
        }
        if (!ok) continue;
        const trng = mulberry32(r * 4294967295);
        const type = biome.trees[Math.floor(trng() * biome.trees.length)];
        placeTree(type, wx, h + 1, wz, trng, set);
      }
    }

    // ---- small vegetation ----
    for (let lx = 0; lx < S; lx++) {
      for (let lz = 0; lz < S; lz++) {
        const col = colAt(lx, lz);
        const biome = BIOMES[col.biome];
        const wx = ox + lx, wz = oz + lz;
        const base = blockIndex(lx, 0, lz);
        let top = Math.floor(col.h);
        if (top >= H - 2 || top < 1) continue;
        const ground = data[base + top];
        const above = data[base + top + 1];
        if (above !== B.AIR) continue;
        const r = hash2(seed ^ 0x99, wx, wz);
        const isGrass = ground === B.GRASS || ground === B.SNOW_GRASS || ground === B.DIRT || ground === B.MUD;
        if (isGrass) {
          if (r < biome.grassDensity) {
            data[base + top + 1] = (col.biome === BIOME.TAIGA || col.biome === BIOME.JUNGLE) && r < biome.grassDensity * 0.4 ? B.FERN : B.TALL_GRASS;
          } else if (r < biome.grassDensity + biome.flowerDensity) {
            data[base + top + 1] = biome.flowers[Math.floor(hash2(seed ^ 0x55, wx, wz) * biome.flowers.length)];
          } else if (biome.mushrooms && r > 0.995) {
            data[base + top + 1] = r > 0.9975 ? B.MUSHROOM_RED : B.MUSHROOM_BROWN;
          } else if (biome.pumpkins && r > 0.9992) {
            data[base + top + 1] = B.PUMPKIN;
          } else if (col.biome === BIOME.JUNGLE && r > 0.999) {
            data[base + top + 1] = B.MELON;
          } else if (col.biome === BIOME.MUSHROOM_ISLE && r > 0.97) {
            data[base + top + 1] = r > 0.985 ? B.MUSHROOM_RED : B.MUSHROOM_BROWN;
          }
        }
        if (ground === B.SAND || ground === B.RED_SAND) {
          if (biome.cactus && r < 0.004) {
            const hgt = 1 + Math.floor(hash2(seed ^ 0x33, wx, wz) * 3);
            let clear = true;
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const n = get(wx + dx, top + 1, wz + dz);
              if (n !== B.AIR && n !== -1) clear = false;
            }
            if (clear) for (let i = 1; i <= hgt; i++) data[base + top + i] = B.CACTUS;
          } else if (biome.deadBush && r > 0.992) data[base + top + 1] = B.DEAD_BUSH;
        }
        if (biome.reeds && top === SEA_LEVEL && (ground === B.SAND || ground === B.GRASS || ground === B.MUD || ground === B.DIRT)) {
          let nearWater = false;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (get(wx + dx, top, wz + dz) === B.WATER) nearWater = true;
          if (nearWater && r < 0.25) {
            const hgt = 2 + Math.floor(hash2(seed ^ 0x44, wx, wz) * 2);
            for (let i = 1; i <= hgt; i++) data[base + top + i] = B.REEDS;
          }
        }
      }
    }

    // ---- structures ----
    if (this.opts.structures) this.structures(cx, cz, colAt, set, get, spawns, loot);

    // ---- passive animal spawn hints ----
    const center = colAt(8, 8);
    const cb = BIOMES[center.biome];
    if (cb.animals.length && hash2(seed ^ 0xa11, cx, cz) < 0.14) {
      const type = cb.animals[Math.floor(hash2(seed ^ 0xa12, cx, cz) * cb.animals.length)];
      const n = 2 + Math.floor(hash2(seed ^ 0xa13, cx, cz) * 3);
      for (let i = 0; i < n; i++) {
        const lx = 3 + Math.floor(hash2(seed ^ (0xa20 + i), cx, cz) * 10);
        const lz = 3 + Math.floor(hash2(seed ^ (0xa30 + i), cx, cz) * 10);
        const top = heights[lx * S + lz];
        if (top > SEA_LEVEL && data[blockIndex(lx, top + 1, lz)] === B.AIR) spawns.push({ type, x: ox + lx + 0.5, y: top + 1, z: oz + lz + 0.5 });
      }
    }
    // recompute heights after decoration
    for (let lx = 0; lx < S; lx++) for (let lz = 0; lz < S; lz++) {
      const base = blockIndex(lx, 0, lz);
      let y = H - 1;
      while (y > 0 && data[base + y] === B.AIR) y--;
      heights[lx * S + lz] = y;
    }
    return { data, biomes, heights, spawns, loot };
  }

  private structures(cx: number, cz: number, colAt: (x: number, z: number) => Column, set: SetBlockFn,
    _get: (x: number, y: number, z: number) => number, spawns: SpawnHint[], loot: LootHint[]): void {
    const seed = this.seed;
    const ox = cx * S, oz = cz * S;
    const sr = hash2(seed ^ 0xabc, cx, cz);
    const rng = mulberry32(hash2(seed ^ 0xabd, cx, cz) * 4294967295);
    const c = colAt(8, 8);
    const biome = BIOMES[c.biome];
    const hs = [colAt(2, 2).h, colAt(13, 2).h, colAt(2, 13).h, colAt(13, 13).h, c.h];
    const flat = Math.max(...hs) - Math.min(...hs) < 3.5;
    const hc = Math.floor(c.h);
    const fill = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number, force = true) => {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) set(x, y, z, id, force);
    };
    const villageRegion = hash2(seed ^ 0x1111, Math.floor(cx / 5), Math.floor(cz / 5)) < 0.16;

    if (biome.villages && flat && hc > SEA_LEVEL + 1 && ((villageRegion && sr < 0.5) || sr < 0.012)) {
      // ---- village house ----
      const desert = c.biome === BIOME.DESERT;
      const wall = desert ? B.SANDSTONE : B.OAK_PLANKS;
      const post = desert ? B.SANDSTONE : B.OAK_LOG;
      const roof = desert ? B.SANDSTONE : B.SPRUCE_PLANKS;
      const w = 6 + Math.floor(rng() * 2), d = 6 + Math.floor(rng() * 2);
      const x0 = ox + 4, z0 = oz + 4, x1 = x0 + w, z1 = z0 + d, y0 = hc;
      // foundation
      fill(x0, y0 - 3, z0, x1, y0, z1, B.COBBLESTONE);
      fill(x0 + 1, y0, z0 + 1, x1 - 1, y0, z1 - 1, desert ? B.SANDSTONE : B.OAK_PLANKS);
      // clear interior
      fill(x0, y0 + 1, z0, x1, y0 + 8, z1, B.AIR);
      // walls
      for (let y = y0 + 1; y <= y0 + 3; y++) {
        for (let x = x0; x <= x1; x++) { set(x, y, z0, wall, true); set(x, y, z1, wall, true); }
        for (let z = z0; z <= z1; z++) { set(x0, y, z, wall, true); set(x1, y, z, wall, true); }
      }
      for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) for (let y = y0 + 1; y <= y0 + 4; y++) set(x, y, z, post, true);
      // windows
      set(x0, y0 + 2, z0 + Math.floor(d / 2), B.GLASS, true); set(x1, y0 + 2, z0 + Math.floor(d / 2), B.GLASS, true);
      set(x0 + Math.floor(w / 2) + 2, y0 + 2, z1, B.GLASS, true);
      // door on -z side
      const dx = x0 + Math.floor(w / 2);
      set(dx, y0 + 1, z0, B.DOOR_LOWER_Z, true); set(dx, y0 + 2, z0, B.DOOR_UPPER_Z, true);
      fill(dx, y0, z0 - 1, dx, y0, z0 - 2, B.COBBLESTONE); fill(dx, y0 + 1, z0 - 1, dx, y0 + 3, z0 - 2, B.AIR);
      // roof
      const half = Math.ceil(w / 2);
      for (let i = 0; i <= half; i++) {
        const y = y0 + 4 + i;
        for (let z = z0 - 1; z <= z1 + 1; z++) {
          set(x0 - 1 + i, y, z, i === half ? roof : roof, true);
          set(x1 + 1 - i, y, z, roof, true);
        }
        if (i > 0 && i < half) {
          for (let x = x0 + i; x <= x1 - i; x++) { set(x, y, z0, wall, true); set(x, y, z1, wall, true); }
        }
      }
      // interior
      set(x0 + 1, y0 + 1, z1 - 1, B.CRAFTING_TABLE, true);
      set(x1 - 1, y0 + 1, z1 - 1, B.CHEST, true); loot.push({ x: x1 - 1, y: y0 + 1, z: z1 - 1, table: 'village' });
      set(x1 - 1, y0 + 1, z0 + 1, B.FURNACE, true);
      set(x0 + 1, y0 + 1, z0 + 1, B.BED, true);
      set(x0 + 1, y0 + 3, z0 + 1, B.TORCH, true); set(x1 - 1, y0 + 3, z1 - 1, B.TORCH, true);
      set(dx, y0 + 1, z0 - 2, B.OAK_FENCE, true); set(dx, y0 + 2, z0 - 2, B.LANTERN, true);
      // farm patch
      if (rng() < 0.6 && !desert) {
        const fx = ox + 1, fz = oz + 12;
        fill(fx, hc - 1, fz, fx + 2, hc, fz + 3, B.DIRT);
        fill(fx, hc, fz, fx + 2, hc, fz + 3, B.FARMLAND);
        fill(fx + 1, hc, fz, fx + 1, hc, fz + 3, B.WATER);
        fill(fx, hc + 1, fz, fx + 2, hc + 1, fz + 3, B.AIR);
        for (let z = fz; z <= fz + 3; z++) { set(fx, hc + 1, z, rng() < 0.5 ? B.WHEAT_3 : B.CARROT_2, true); set(fx + 2, hc + 1, z, rng() < 0.5 ? B.WHEAT_2 : B.POTATO_2, true); }
        fill(fx - 1, hc, fz - 1, fx + 3, hc, fz - 1, B.OAK_LOG); fill(fx - 1, hc, fz + 4, fx + 3, hc, fz + 4, B.OAK_LOG);
      }
      spawns.push({ type: 'keeper', x: dx + 0.5, y: y0 + 1, z: z0 + 3.5 });
      if (rng() < 0.4) spawns.push({ type: 'keeper', x: x0 + 2.5, y: y0 + 1, z: z0 - 3.5 });
      return;
    }
    if (c.biome === BIOME.DESERT && sr >= 0.5 && sr < 0.53 && flat) {
      // ---- desert temple (pyramid) ----
      const y0 = hc - 1, cxw = ox + 8, czw = oz + 8;
      for (let i = 0; i < 7; i++) {
        const r = 7 - i;
        fill(cxw - r, y0 + i, czw - r, cxw + r, y0 + i, czw + r, B.SANDSTONE);
      }
      fill(cxw - 3, y0 + 1, czw - 3, cxw + 3, y0 + 3, czw + 3, B.AIR);
      fill(cxw - 1, y0 - 4, czw - 1, cxw + 1, y0 - 1, czw + 1, B.AIR);
      fill(cxw - 2, y0 - 5, czw - 2, cxw + 2, y0 - 5, czw + 2, B.SANDSTONE);
      set(cxw, y0 + 1, czw, B.STONE_BRICKS, true);
      fill(cxw - 1, y0, czw - 1, cxw + 1, y0, czw + 1, B.TERRACOTTA); set(cxw, y0, czw, B.SANDSTONE, true);
      set(cxw + 2, y0 - 4, czw, B.CHEST, true); loot.push({ x: cxw + 2, y: y0 - 4, z: czw, table: 'temple' });
      set(cxw - 2, y0 - 4, czw, B.CHEST, true); loot.push({ x: cxw - 2, y: y0 - 4, z: czw, table: 'temple' });
      set(cxw, y0 - 3, czw, B.LANTERN, true);
      // entrance on -z
      fill(cxw, y0 + 1, czw - 7, cxw, y0 + 2, czw - 4, B.AIR);
      for (const [x, z] of [[cxw - 3, czw - 3], [cxw + 3, czw - 3], [cxw - 3, czw + 3], [cxw + 3, czw + 3]]) set(x, y0 + 3, z, B.TORCH, true);
      spawns.push({ type: 'void_archer', x: cxw + 0.5, y: y0 - 4, z: czw - 1.5 });
      return;
    }
    if (sr >= 0.53 && sr < 0.542 && hc > SEA_LEVEL + 1 && c.biome !== BIOME.DESERT) {
      // ---- ruined tower ----
      const x0 = ox + 5, z0 = oz + 5, y0 = hc - 2, ht = 9 + Math.floor(rng() * 4);
      fill(x0, y0, z0, x0 + 4, y0, z0 + 4, B.STONE_BRICKS);
      for (let y = y0 + 1; y <= y0 + ht; y++) {
        for (let x = x0; x <= x0 + 4; x++) for (let z = z0; z <= z0 + 4; z++) {
          const edge = x === x0 || x === x0 + 4 || z === z0 || z === z0 + 4;
          if (!edge) { set(x, y, z, B.AIR, true); continue; }
          const broken = y > y0 + ht - 3 && rng() < 0.4;
          if (!broken) set(x, y, z, rng() < 0.2 ? B.MOSSY_COBBLESTONE : B.STONE_BRICKS, true);
        }
        set(x0 + 1, y, z0 + 1, B.LADDER, true);
      }
      set(x0 + 2, y0 + 1, z0, B.AIR, true); set(x0 + 2, y0 + 2, z0, B.AIR, true);
      fill(x0 + 1, y0 + ht - 2, z0 + 1, x0 + 3, y0 + ht - 2, z0 + 3, B.OAK_PLANKS); set(x0 + 1, y0 + ht - 2, z0 + 1, B.LADDER, true);
      set(x0 + 3, y0 + ht - 1, z0 + 3, B.CHEST, true); loot.push({ x: x0 + 3, y: y0 + ht - 1, z: z0 + 3, table: 'tower' });
      set(x0 + 2, y0 + ht - 1, z0 + 3, B.TORCH, true);
      spawns.push({ type: 'void_archer', x: x0 + 2.5, y: y0 + ht - 1, z: z0 + 2.5 });
      spawns.push({ type: 'night_stalker', x: x0 + 2.5, y: y0 + 1, z: z0 + 2.5 });
      return;
    }
    if (sr >= 0.56 && sr < 0.575 && hc > SEA_LEVEL + 1 && biome.grassDensity > 0) {
      // ---- surface ruins ----
      const x0 = ox + 4 + Math.floor(rng() * 5), z0 = oz + 4 + Math.floor(rng() * 5), y0 = hc;
      for (let x = x0; x <= x0 + 5; x++) for (let z = z0; z <= z0 + 5; z++) {
        const edge = x === x0 || x === x0 + 5 || z === z0 || z === z0 + 5;
        if (!edge) continue;
        const hgt = Math.floor(rng() * 3);
        for (let y = y0; y <= y0 + hgt; y++) set(x, y, z, rng() < 0.4 ? B.MOSSY_COBBLESTONE : B.COBBLESTONE, true);
      }
      if (rng() < 0.6) { set(x0 + 2, y0 + 1, z0 + 2, B.CHEST, true); loot.push({ x: x0 + 2, y: y0 + 1, z: z0 + 2, table: 'ruins' }); }
      return;
    }
    if ((c.biome === BIOME.OCEAN || c.biome === BIOME.DEEP_OCEAN) && sr >= 0.6 && sr < 0.625) {
      // ---- shipwreck ----
      const x0 = ox + 4, z0 = oz + 3, y0 = hc;
      fill(x0, y0, z0, x0 + 6, y0, z0 + 10, B.DARK_PLANKS);
      for (let y = y0 + 1; y <= y0 + 3; y++) {
        for (let z = z0; z <= z0 + 10; z++) { if (rng() < 0.85) set(x0, y, z, B.DARK_PLANKS, true); if (rng() < 0.85) set(x0 + 6, y, z, B.DARK_PLANKS, true); }
        for (let x = x0; x <= x0 + 6; x++) { set(x, y, z0, B.DARK_PLANKS, true); if (rng() < 0.5) set(x, y, z0 + 10, B.DARK_PLANKS, true); }
      }
      fill(x0 + 1, y0 + 1, z0 + 1, x0 + 5, y0 + 3, z0 + 9, B.WATER);
      fill(x0 + 3, y0 + 1, z0 + 5, x0 + 3, y0 + 8, z0 + 5, B.DARK_LOG);
      set(x0 + 2, y0 + 1, z0 + 2, B.CHEST, true); loot.push({ x: x0 + 2, y: y0 + 1, z: z0 + 2, table: 'shipwreck' });
      set(x0 + 4, y0 + 1, z0 + 8, B.CHEST, true); loot.push({ x: x0 + 4, y: y0 + 1, z: z0 + 8, table: 'shipwreck' });
      return;
    }
    // ---- underground dungeon ----
    const dr = hash2(seed ^ 0xd00, cx, cz);
    if (dr < 0.07 && hc > 30) {
      const y0 = 6 + Math.floor(rng() * Math.min(hc - 22, 44));
      const x0 = ox + 4, z0 = oz + 4;
      fill(x0, y0, z0, x0 + 7, y0 + 5, z0 + 7, B.COBBLESTONE);
      for (let x = x0; x <= x0 + 7; x++) for (let z = z0; z <= z0 + 7; z++) for (let y = y0; y <= y0 + 5; y++) {
        const edge = x === x0 || x === x0 + 7 || z === z0 || z === z0 + 7 || y === y0 || y === y0 + 5;
        if (edge) { if (rng() < 0.3) set(x, y, z, B.MOSSY_COBBLESTONE, true); }
        else set(x, y, z, B.AIR, true);
      }
      set(x0 + 1, y0 + 1, z0 + 1, B.CHEST, true); loot.push({ x: x0 + 1, y: y0 + 1, z: z0 + 1, table: 'dungeon' });
      if (rng() < 0.5) { set(x0 + 6, y0 + 1, z0 + 6, B.CHEST, true); loot.push({ x: x0 + 6, y: y0 + 1, z: z0 + 6, table: 'dungeon' }); }
      set(x0 + 4, y0 + 1, z0 + 4, B.LUMEN, true);
      spawns.push({ type: 'cave_crawler', x: x0 + 3.5, y: y0 + 1, z: z0 + 2.5 });
      spawns.push({ type: 'cave_crawler', x: x0 + 5.5, y: y0 + 1, z: z0 + 5.5 });
      if (y0 < 25 && rng() < 0.35) spawns.push({ type: 'stone_guardian', x: x0 + 3.5, y: y0 + 1, z: z0 + 5.5 });
      // exit tunnel
      fill(x0 + 7, y0 + 1, z0 + 3, x0 + 12, y0 + 2, z0 + 4, B.AIR);
    }
  }

  private generateVoid(cx: number, cz: number): GenResult {
    const data = new Uint8Array(S * S * H);
    const biomes = new Uint8Array(S * S);
    const heights = new Uint8Array(S * S);
    const spawns: SpawnHint[] = [];
    const loot: LootHint[] = [];
    const ox = cx * S, oz = cz * S;
    const LAVA = 34;
    for (let lx = 0; lx < S; lx++) for (let lz = 0; lz < S; lz++) {
      const wx = ox + lx, wz = oz + lz;
      const base = blockIndex(lx, 0, lz);
      const floorN = this.hills.fbm2(wx / 90, wz / 90, 3);
      const floorH = 30 + floorN * 14 + this.detail.fbm2(wx / 30, wz / 30, 2) * 4;
      for (let y = 0; y < H; y++) {
        let id: number = B.AIR;
        if (y < 2 || y > H - 3) id = B.BEDROCK;
        else if (y < floorH) id = B.HELLSTONE;
        else if (y <= LAVA) id = B.LAVA;
        else if (y > 100) {
          const n = this.cave1.noise3D(wx / 40, y / 25, wz / 40);
          if (n + (y - 100) / 25 > 0.55) id = B.HELLSTONE;
        } else {
          const n = this.cave2.noise3D(wx / 38, y / 32, wz / 38) + this.cave3.noise3D(wx / 15, y / 15, wz / 15) * 0.3;
          if (n > 0.52) id = B.HELLSTONE;
        }
        data[base + y] = id;
      }
      // Ores, and the violet veining that gives the Emberdeep its look: voidstone runs in broad
      // bands through the rock rather than as lone specks, and lumen grows on the ceilings so the
      // light in this dimension comes from above and below rather than from a sky.
      const vein = this.detail.fbm2(wx / 26, wz / 26, 3);
      for (let y = 3; y < H - 3; y++) {
        if (data[base + y] !== B.HELLSTONE) continue;
        const r = hash2(this.seed ^ 0x3333, wx + y * 131, wz);
        const banded = vein + this.detail.fbm2((wx + y * 7) / 34, (wz - y * 5) / 34, 2) * 0.7;
        const ceiling = data[base + y + 1] === B.AIR;
        const floorFace = data[base + y - 1] === B.AIR;
        if (banded > 0.62) data[base + y] = B.VOIDSTONE;
        if (r < 0.02 && ceiling && y > LAVA + 6) data[base + y] = B.LUMEN;
        else if (r < 0.005 && floorFace) data[base + y] = B.LUMEN;
        else if (r > 0.995) data[base + y] = B.EMBER_ORE;
        else if (r > 0.9925 && y < 40) data[base + y] = B.GOLD_ORE;
      }
      let top = H - 3; while (top > 0 && data[base + top] === B.AIR) top--;
      heights[lx * S + lz] = top;
      biomes[lx * S + lz] = BIOME.BADLANDS;
    }
    if (hash2(this.seed ^ 0xf0f, cx, cz) < 0.05) {
      const lx = 8, lz = 8, y = heights[lx * S + lz];
      if (data[blockIndex(lx, y, lz)] === B.HELLSTONE) {
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
          const idx = blockIndex(lx + dx, y + 1, lz + dz);
          data[idx] = B.VOIDSTONE;
        }
        data[blockIndex(lx, y + 2, lz)] = B.CHEST;
        loot.push({ x: ox + lx, y: y + 2, z: oz + lz, table: 'void' });
        spawns.push({ type: 'stone_guardian', x: ox + lx + 2.5, y: y + 2, z: oz + lz + 0.5 });
      }
    }
    if (hash2(this.seed ^ 0xf1f, cx, cz) < 0.2) spawns.push({ type: 'shadow_flyer', x: ox + 8, y: 70, z: oz + 8 });
    return { data, biomes, heights, spawns, loot };
  }
}

// ---------------- Trees ----------------
const LEAF: Record<string, number> = { oak: B.OAK_LEAVES, birch: B.BIRCH_LEAVES, spruce: B.SPRUCE_LEAVES, dark: B.DARK_LEAVES, jungle: B.OAK_LEAVES, acacia: B.OAK_LEAVES, swamp: B.OAK_LEAVES };
const LOG: Record<string, number> = { oak: B.OAK_LOG, birch: B.BIRCH_LOG, spruce: B.SPRUCE_LOG, dark: B.DARK_LOG, jungle: B.DARK_LOG, acacia: B.DARK_LOG, swamp: B.OAK_LOG };

export function placeTree(type: TreeType, x: number, y: number, z: number, rng: () => number, set: SetBlockFn): void {
  if (type === 'none') return;
  const leaf = LEAF[type], log = LOG[type];
  const blob = (cx: number, cy: number, cz: number, r: number, flat = false) => {
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) for (let dy = flat ? 0 : -r; dy <= (flat ? 0 : r); dy++) {
      const d2 = dx * dx + dz * dz + (flat ? 0 : dy * dy * 1.5);
      if (d2 > r * r + 0.5) continue;
      if (Math.abs(dx) === r && Math.abs(dz) === r && rng() < 0.6) continue;
      set(cx + dx, cy + dy, cz + dz, leaf);
    }
  };
  if (type === 'oak' || type === 'swamp') {
    const h = 4 + Math.floor(rng() * 3);
    for (let i = 0; i < h; i++) set(x, y + i, z, log, true);
    blob(x, y + h - 1, z, 2);
    blob(x, y + h + 1, z, 1);
    if (rng() < 0.4) { set(x + 1, y + h - 2, z, log, true); blob(x + 2, y + h - 2, z, 1); }
  } else if (type === 'birch') {
    const h = 5 + Math.floor(rng() * 3);
    for (let i = 0; i < h; i++) set(x, y + i, z, log, true);
    blob(x, y + h - 2, z, 2, true);
    blob(x, y + h - 1, z, 2, true);
    blob(x, y + h, z, 1);
    set(x, y + h + 1, z, leaf);
  } else if (type === 'spruce') {
    const h = 7 + Math.floor(rng() * 5);
    for (let i = 0; i < h; i++) set(x, y + i, z, log, true);
    let r = 1;
    for (let ly = y + h; ly >= y + 2; ly--) {
      const layer = y + h - ly;
      const rad = layer === 0 ? 0 : layer % 2 === 1 ? Math.min(r, 3) : Math.min(r - 1, 2);
      if (layer % 2 === 0 && layer > 0) r++;
      blob(x, ly, z, Math.max(rad, 0), true);
    }
    set(x, y + h, z, leaf); set(x, y + h + 1, z, leaf);
  } else if (type === 'dark') {
    const h = 6 + Math.floor(rng() * 3);
    for (let i = 0; i < h; i++) { set(x, y + i, z, log, true); set(x + 1, y + i, z, log, true); set(x, y + i, z + 1, log, true); set(x + 1, y + i, z + 1, log, true); }
    for (let dy = -2; dy <= 1; dy++) {
      const r = dy === 1 ? 2 : 4 - Math.abs(dy);
      for (let dx = -r; dx <= r + 1; dx++) for (let dz = -r; dz <= r + 1; dz++) {
        if ((Math.abs(dx - 0.5) + Math.abs(dz - 0.5)) > r + 1.5) continue;
        set(x + dx, y + h - 1 + dy, z + dz, leaf);
      }
    }
  } else if (type === 'jungle') {
    const h = 9 + Math.floor(rng() * 6);
    for (let i = 0; i < h; i++) set(x, y + i, z, log, true);
    blob(x, y + h - 1, z, 3, true); blob(x, y + h, z, 3, true); blob(x, y + h + 1, z, 2);
    for (let b = 0; b < 2; b++) {
      const by = y + 3 + Math.floor(rng() * (h - 5));
      const dx = rng() < 0.5 ? -1 : 1, dz = rng() < 0.5 ? -1 : 1;
      set(x + dx, by, z, log, true); set(x + dx * 2, by + 1, z + dz, log, true); blob(x + dx * 2, by + 2, z + dz, 2, true); blob(x + dx * 2, by + 3, z + dz, 1, true);
    }
  } else if (type === 'acacia') {
    const h = 4 + Math.floor(rng() * 2);
    const dx = Math.floor(rng() * 3) - 1, dz = Math.floor(rng() * 3) - 1;
    for (let i = 0; i < h; i++) set(x, y + i, z, log, true);
    for (let i = 0; i < 2; i++) set(x + dx * (i + 1), y + h + i, z + dz * (i + 1), log, true);
    const tx = x + dx * 2, tz = z + dz * 2, ty = y + h + 2;
    blob(tx, ty, tz, 3, true); blob(tx, ty + 1, tz, 2, true);
  }
}
