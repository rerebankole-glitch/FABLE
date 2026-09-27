import * as THREE from 'three';
import { TILE_NAMES, ATLAS_COLS, ATLAS_ROWS, TILE_PX, T, type TileName } from './Tiles';
import { hash2, mulberry32 } from '../world/Noise';

type RGBA = [number, number, number, number];
type Painter = (ctx: PaintCtx) => void;

interface PaintCtx {
  set(x: number, y: number, c: number[]): void;
  get(x: number, y: number): RGBA;
  rnd(): number;
  hash(x: number, y: number): number;
  vn(x: number, y: number, scale: number, seed?: number): number;
  fill(c: number[]): void;
  noisy(base: number[], amt: number): void;
  each(fn: (x: number, y: number) => number[] | null): void;
  rect(x0: number, y0: number, x1: number, y1: number, c: number[]): void;
}

const TINT_A = 128;
const N = TILE_PX;

function hex(h: number, a = 255): RGBA {
  return [(h >> 16) & 255, (h >> 8) & 255, h & 255, a];
}
function shade(c: number[], f: number): number[] {
  return [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f), c[3] ?? 255];
}
function mix(a: number[], b: number[], t: number): number[] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, (a[3] ?? 255) + ((b[3] ?? 255) - (a[3] ?? 255)) * t];
}
const gray = (v: number, a = 255): RGBA => [v, v, v, a];

function makeCtx(tile: Uint8ClampedArray, seed: number): PaintCtx {
  const rnd = mulberry32(seed);
  const set = (x: number, y: number, c: number[]) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const i = (y * N + x) * 4;
    tile[i] = c[0]; tile[i + 1] = c[1]; tile[i + 2] = c[2]; tile[i + 3] = c[3] ?? 255;
  };
  const get = (x: number, y: number): RGBA => {
    const i = (((y + N) % N) * N + ((x + N) % N)) * 4;
    return [tile[i], tile[i + 1], tile[i + 2], tile[i + 3]];
  };
  const hash = (x: number, y: number) => hash2(seed, x, y);
  const vn = (x: number, y: number, scale: number, s = 0) => {
    const fx = (x / scale), fy = (y / scale);
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const cells = Math.max(1, Math.round(N / scale));
    const h = (a: number, b: number) => hash2(seed + s * 7919, ((a % cells) + cells) % cells, ((b % cells) + cells) % cells);
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * sx;
    const b = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
  const each = (fn: (x: number, y: number) => number[] | null) => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const c = fn(x, y); if (c) set(x, y, c); }
  };
  return {
    set, get, rnd, hash, vn, each,
    fill: (c) => each(() => c),
    noisy: (base, amt) => each((x, y) => { const d = (hash(x, y) - 0.5) * 2 * amt; return [base[0] + d, base[1] + d, base[2] + d, base[3] ?? 255]; }),
    rect: (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); },
  };
}

// ---------- painters ----------
// Pixel-art rules used below: every material is drawn from a small palette (5-7 shades of one base
// colour), noise is quantised into those shades so it forms soft blobs instead of per-pixel static, and
// every feature (plank, stone, brick, clod, gem) is bevelled: a lighter rim towards the top-left and a
// darker rim towards the bottom-right, which is what gives the tiles their painted, rounded look.

/** quantise 0..1 into n discrete steps (0..n-1) */
const q = (v: number, n: number): number => Math.max(0, Math.min(n - 1, Math.floor(v * n)));
/** n shades of `base` from factor lo (darkest) to hi (brightest) */
const ramp = (base: number[], lo: number, hi: number, n: number): number[][] => Array.from({ length: n }, (_, i) => shade(base, lo + (hi - lo) * (i / (n - 1))));
/** blobby 0..1 noise: two octaves of value noise, biased towards mid values */
const blob = (c: PaintCtx, x: number, y: number, scale: number, seed = 0): number => Math.min(0.999, Math.max(0, c.vn(x, y, scale, seed) * 0.72 + c.vn(x + 3, y + 5, scale / 2, seed + 1) * 0.28));
const wrap = (v: number) => ((v % N) + N) % N;
const ri = (c: PaintCtx, n: number) => Math.floor(c.rnd() * n);
/** Run `fn` over every pixel reading from a frozen copy of the tile (so neighbour lookups are stable). */
const pass = (c: PaintCtx, fn: (x: number, y: number, get: (x: number, y: number) => RGBA) => number[] | null): void => {
  const copy: RGBA[] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) copy.push(c.get(x, y));
  const get = (x: number, y: number) => copy[wrap(y) * N + wrap(x)];
  c.each((x, y) => fn(x, y, get));
};
/** Bevel every region defined by `inside`: light rim on the top/left, dark rim on the bottom/right. */
const bevel = (c: PaintCtx, inside: (x: number, y: number) => boolean, light = 1.14, dark = 0.8): void => {
  pass(c, (x, y, get) => {
    if (!inside(x, y)) return null;
    const up = inside(x, wrap(y - 1)), left = inside(wrap(x - 1), y), down = inside(x, wrap(y + 1)), right = inside(wrap(x + 1), y);
    if (!up || !left) return shade(get(x, y), light);
    if (!down || !right) return shade(get(x, y), dark);
    return null;
  });
};
/** Soft per-pixel darkening / lightening over the whole tile driven by large blobs (cloudy "painted" variation). */
const cloud = (c: PaintCtx, amount: number, scale = 8, seed = 5): void => pass(c, (x, y, get) => { const p = get(x, y); if (p[3] === 0) return null; return [...shade(p, 1 + (c.vn(x, y, scale, seed) - 0.5) * 2 * amount).slice(0, 3), p[3]]; });
/** Fill the tile with quantised blob noise from a ramp. */
const blobFill = (c: PaintCtx, pal: number[][], scale: number, seed = 0, alpha = 255): void => c.each((x, y) => { const col = pal[q(blob(c, x, y, scale, seed), pal.length)]; return [col[0], col[1], col[2], alpha]; });
/** a few short crack-like runs in `col`, with a light "lip" pixel below each crack pixel */
const cracksOn = (c: PaintCtx, col: number[], count: number, len: number, lip = 1.1): void => {
  for (let k = 0; k < count; k++) {
    let x = ri(c, N), y = ri(c, N);
    const horiz = c.rnd() < 0.5;
    const n = len + ri(c, 3);
    for (let i = 0; i < n; i++) {
      c.set(wrap(x), wrap(y), col);
      const lx = wrap(horiz ? x : x + 1), ly = wrap(horiz ? y + 1 : y);
      const below = c.get(lx, ly);
      if (below[3] === 255) c.set(lx, ly, shade(below, lip));
      if (horiz) { x++; if (c.rnd() < 0.3) y += c.rnd() < 0.5 ? 1 : -1; } else { y++; if (c.rnd() < 0.3) x += c.rnd() < 0.5 ? 1 : -1; }
    }
  }
};
/** Rounded pebble / lump with its own bevel. */
const lump = (c: PaintCtx, cx: number, cy: number, w: number, h: number, pal: number[][], tone = 2): void => {
  const inside = (x: number, y: number) => { const dx = (wrap(x) - cx + N / 2 + N) % N - N / 2, dy = (wrap(y) - cy + N / 2 + N) % N - N / 2; return (dx * dx) / (w * w) + (dy * dy) / (h * h) <= 1; };
  for (let y = Math.floor(cy - h - 1); y <= cy + h + 1; y++) for (let x = Math.floor(cx - w - 1); x <= cx + w + 1; x++) if (inside(x, y)) c.set(wrap(x), wrap(y), pal[tone]);
  for (let y = Math.floor(cy - h - 1); y <= cy + h + 1; y++) for (let x = Math.floor(cx - w - 1); x <= cx + w + 1; x++) {
    if (!inside(x, y)) continue;
    const up = inside(x, y - 1), left = inside(x - 1, y), down = inside(x, y + 1), right = inside(x + 1, y);
    if (!up || !left) c.set(wrap(x), wrap(y), pal[Math.min(pal.length - 1, tone + 1)]);
    else if (!down || !right) c.set(wrap(x), wrap(y), pal[Math.max(0, tone - 1)]);
  }
};

const stoneLike = (base: number[], amt: number, blotch = 0.25, pebbles = 4): Painter => (c) => {
  const k = Math.min(0.5, amt / 60);
  const pal = ramp(base, 1 - k * 0.9, 1 + k * 0.5, 7);
  // plateaus: blob noise quantised into 4 tones, then every step between plateaus gets a bevel so the
  // surface reads as layered, chipped rock instead of a smooth gradient
  const idx = (x: number, y: number) => 1 + q(blob(c, wrap(x), wrap(y), 5 + blotch * 4), 4);
  c.each((x, y) => pal[idx(x, y)]);
  c.each((x, y) => {
    const i = idx(x, y);
    if (idx(x, y - 1) < i || idx(x - 1, y) < i) return pal[Math.min(6, i + 2)];
    if (idx(x, y + 1) < i || idx(x + 1, y) < i) return pal[Math.max(0, i - 1)];
    return null;
  });
  for (let i = 0; i < pebbles; i++) lump(c, ri(c, N), ri(c, N), 1 + c.rnd() * 1.4, 0.8 + c.rnd() * 1.0, pal, 2 + ri(c, 3));
  cracksOn(c, pal[0], 2 + Math.round(blotch * 4), 3, 1.12);
  cloud(c, 0.04);
};
const dirt: Painter = (c) => {
  const pal = ramp(hex(0x8b6444), 0.66, 1.14, 6);
  blobFill(c, pal, 3.2);
  for (let i = 0; i < 5; i++) lump(c, ri(c, N), ri(c, N), 1 + c.rnd() * 1.2, 0.8 + c.rnd() * 0.8, pal, 3);
  for (let i = 0; i < 4; i++) { const x = ri(c, N), y = ri(c, N); c.set(x, y, pal[0]); c.set(wrap(x + 1), y, pal[1]); }
  for (let i = 0; i < 3; i++) { const x = ri(c, N), y = ri(c, N); c.set(x, y, mix(pal[5], gray(200), 0.5)); }
  cloud(c, 0.05);
};
const grassTop: Painter = (c) => {
  // vanilla grass-block top: a fairly even base tone with per-pixel clumps of 2-3 shades, sparse
  // darker speckle and a few 1px highlight tufts; every pixel is a tint pixel so the biome colours it
  const shades = [136, 148, 159, 170, 182];
  // broad 2-4px patches of slightly darker/lighter green (like the vanilla noise layer)
  c.each((x, y) => {
    const s = q(blob(c, x, y, 2.6, 5), 5);
    let tone = shades[s];
    const v = c.vn(x, y, 7, 23);
    if (v < 0.3) tone = shades[Math.max(0, s - 1)];
    else if (v > 0.74) tone = shades[Math.min(4, s + 1)];
    return gray(tone, TINT_A);
  });
  // sparse dark speckle (soil poking through / shadowed blades) + sparse light flecks
  for (let i = 0; i < 22; i++) c.set(ri(c, N), ri(c, N), gray(120, TINT_A));
  for (let i = 0; i < 14; i++) c.set(ri(c, N), ri(c, N), gray(196, TINT_A));
  // small grass-tuft clusters: a light tip pixel with a shadowed neighbour below-right
  for (let i = 0; i < 9; i++) {
    const x = ri(c, N), y = ri(c, N);
    c.set(x, y, gray(200, TINT_A));
    c.set(wrap(x + 1), wrap(y + 1), gray(128, TINT_A));
    if (c.rnd() < 0.4) c.set(x, wrap(y + 1), gray(168, TINT_A));
  }
};
const grassSide = (snow: boolean): Painter => (c) => {
  dirt(c);
  const pal = snow ? [226, 238, 248, 255] : [128, 156, 182, 206];
  // wandering overhang height per column, smoothed so the edge looks grown rather than zippered
  const lo = snow ? 2 : 3, hi = snow ? 4 : 6;
  const edges: number[] = [];
  for (let x = 0; x < N; x++) edges.push(lo + Math.floor(c.hash(x, 99) * (hi - lo + 1)));
  for (let p = 0; p < 3; p++) {
    for (let x = 0; x < N; x++) { const l = edges[(x + N - 1) % N]; edges[x] = Math.max(l - 1, Math.min(l + 1, edges[x])); }
    for (let x = N - 1; x >= 0; x--) { const r = edges[(x + 1) % N]; edges[x] = Math.max(r - 1, Math.min(r + 1, edges[x])); }
  }
  // a couple of shallow notches break the silhouette
  for (let x = 0; x < N; x++) if (c.hash(x, 55) < 0.16) edges[x] = Math.max(1, edges[x] - 1);
  for (let x = 0; x < N; x++) {
    const edge = edges[x];
    for (let y = 0; y < edge; y++) {
      // most columns are mid tones; a few are darker top-to-bottom for texture
      const streak = c.hash(x, 33) < 0.2 && y > 0 && y < edge - 1;
      const t = y === edge - 1 ? 0 : q(blob(c, x, y, 3), 3) + 1;
      c.set(x, y, gray(pal[streak ? 0 : t], snow ? 255 : TINT_A));
    }
    // shadow line under the overhang (on the dirt)
    c.set(x, edge, shade(c.get(x, edge), 0.7));
    c.set(x, edge + 1, shade(c.get(x, edge + 1), 0.86));
  }
};
const logSide = (bark: number[], amt: number): Painter => (c) => {
  const k = Math.min(0.4, amt / 70);
  const pal = ramp(bark, 1 - k, 1 + k * 0.7, 6);
  // strips: widths 2-4 px, each with its own tone; grooves between strips
  const strips: number[] = []; let x = 0;
  while (x < N) { const w = Math.min(N - x, 2 + ri(c, 3)); strips.push(w); x += w; }
  if (strips[strips.length - 1] === 1) { strips.pop(); strips[strips.length - 1]++; }
  let sx = 0;
  strips.forEach((w, si) => {
    const tone = 2 + ri(c, 3);
    for (let y = 0; y < N; y++) {
      const wobble = c.vn(si * 5, y, 5, 3) > 0.6 ? 1 : 0;
      for (let i = 0; i < w; i++) {
        const px = wrap(sx + i);
        let t = tone + (c.vn(px, y, 3, 1) > 0.66 ? -1 : 0) - wobble;
        if (i === 0) t = Math.min(5, t + 1);          // light left rim
        if (i === w - 1) t = 0;                         // groove
        c.set(px, y, pal[Math.max(0, Math.min(5, t))]);
      }
    }
    sx += w;
  });
  // knots
  const knots = 1 + ri(c, 2);
  for (let i = 0; i < knots; i++) { const kx = 2 + ri(c, 12), ky = 2 + ri(c, 12); lump(c, kx, ky, 1.6, 2.2, pal, 1); c.set(kx, ky, pal[0]); c.set(kx, wrap(ky + 1), pal[0]); }
  cloud(c, 0.04);
};
const logTop = (bark: number[], inner: number[]): Painter => (c) => {
  const barkPal = ramp(bark, 0.8, 1.1, 4);
  const ringPal = ramp(inner, 0.72, 1.12, 6);
  c.each((x, y) => {
    const dx = x - 7.5, dy = y - 7.5, d = Math.sqrt(dx * dx + dy * dy);
    const md = Math.max(Math.abs(dx), Math.abs(dy));
    if (md > 6.5) return barkPal[q(c.vn(x, y, 3), 4)];
    if (md > 5.5) return barkPal[0];
    // spiralling growth rings (the angle term offsets the ring start so it reads as one curl)
    const ang = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2);
    const ring = Math.floor(d * 1.15 + ang) % 3;
    return ringPal[ring === 0 ? 1 : ring === 1 ? 4 : 3];
  });
  c.rect(7, 7, 8, 8, ringPal[0]);
  bevel(c, (x, y) => Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) <= 5.5, 1.12, 0.85);
};
const planks = (col: number[]): Painter => (c) => {
  const pal = ramp(col, 0.56, 1.14, 7);
  const rows = 4;
  c.each((x, y) => {
    const row = Math.floor(y / 4);
    const off = (row % 2) * 8;
    const plank = Math.floor((x + off) / 16) + row * 2;
    const base = 3 + (c.hash(plank, 31) > 0.5 ? 1 : 0);
    if (y % 4 === 3) return pal[0];                       // horizontal seam
    if ((x + off) % 16 === 0) return pal[0];              // vertical seam
    if (y % 4 === 0) return pal[Math.min(6, base + 2)];   // bevel: light top edge
    if (y % 4 === 2) return pal[Math.max(1, base - 1)];   // bevel: dark bottom edge
    // grain: long horizontal runs of a slightly darker shade
    const g = c.vn(x * 0.3, y * 4 + row * 11, 5, row);
    return pal[g > 0.66 ? base - 1 : g < 0.24 ? base + 1 : base];
  });
  for (let row = 0; row < rows; row++) {
    const off = (row % 2) * 8;
    // seam start pixel (light) so each plank end reads
    c.set(wrap(off + 1), row * 4, pal[6]);
    // nails at plank ends
    c.set(wrap(off + 2), row * 4 + 1, pal[1]); c.set(wrap(off + 13), row * 4 + 1, pal[1]);
    // knot on some planks
    if (c.rnd() < 0.35) { const kx = wrap(off + 5 + ri(c, 6)); c.set(kx, row * 4 + 1, pal[1]); c.set(wrap(kx + 1), row * 4 + 1, pal[2]); c.set(kx, row * 4 + 2, pal[0]); }
  }
};
const leaves = (base: number, holes: number, dark = 0.5): Painter => (c) => {
  const pal = [base * dark, base * (dark + 0.16), base * (dark + 0.3), base * (dark + 0.42), Math.min(255, base * (dark + 0.55))];
  c.each((x, y) => {
    const v = blob(c, x, y, 2.6);
    // Java-style open canopy: a large share of the tile is see-through. Two decorrelated hashes
    // are mixed so the holes land as organic per-pixel speckle (measured Java oak/birch/spruce/
    // dark oak leaves: 35-40% transparent, jungle ~21%) instead of rare clustered blobs.
    const open = c.hash(x, y) * 0.7 + c.hash(x + 7, y + 13) * 0.3;
    if (open < holes) return [0, 0, 0, 0];
    return gray(pal[q(v, 5)], TINT_A);
  });
  // leaf clusters: a light 2x1 tip with a dark pixel beneath (depth)
  for (let i = 0; i < 9; i++) {
    const x = ri(c, N), y = ri(c, N);
    if (c.get(x, y)[3] === 0) continue;
    c.set(x, y, gray(pal[4], TINT_A)); c.set(wrap(x + 1), y, gray(pal[3], TINT_A)); c.set(x, wrap(y + 1), gray(pal[0], TINT_A));
  }
};
const ore = (col: number[], count: number, glow = false): Painter => (c) => {
  stoneLike(hex(0x7d7d7d), 12)(c);
  const pal = [shade(col, 0.55), shade(col, 0.8), col, shade(col, glow ? 1.3 : 1.18), mix(col, gray(255), glow ? 0.6 : 0.45)];
  for (let i = 0; i < count; i++) {
    const x = 1 + ri(c, 13), y = 1 + ri(c, 13);
    const big = c.rnd() < 0.5;
    // faceted nugget: light top-left, mid body, dark bottom-right, half outline
    c.set(x, y, pal[3]); c.set(x + 1, y, pal[2]); c.set(x, y + 1, pal[2]); c.set(x + 1, y + 1, pal[1]);
    if (big) { c.set(x + 2, y, pal[2]); c.set(x + 2, y + 1, pal[1]); c.set(x + 1, y + 2, pal[1]); c.set(x + 2, y + 2, pal[0]); c.set(x, y + 2, pal[1]); }
    c.set(x, y, pal[4]);
    const sh = shade(c.get(x + (big ? 3 : 2), y + 1), 0.7); c.set(x + (big ? 3 : 2), y + 1, sh);
    const sh2 = shade(c.get(x + 1, y + (big ? 3 : 2)), 0.7); c.set(x + 1, y + (big ? 3 : 2), sh2);
  }
};
const cobble = (mossy: boolean): Painter => (c) => {
  const seeds: number[][] = [];
  for (let i = 0; i < 10; i++) seeds.push([c.rnd() * 16, c.rnd() * 16, q(c.rnd(), 4)]);
  const pal = ramp(hex(0x8a8a8a), 0.7, 1.18, 6);
  const moss = ramp(hex(0x5a8a3a), 0.8, 1.15, 3);
  const owner: number[] = new Array(N * N).fill(-1);
  const gap: boolean[] = new Array(N * N).fill(false);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let d1 = 99, d2 = 99, s = 0;
    seeds.forEach((sd, si) => {
      for (let wx = -16; wx <= 16; wx += 16) for (let wy = -16; wy <= 16; wy += 16) {
        const dx = sd[0] + wx - x - 0.5, dy = sd[1] + wy - y - 0.5;
        const d = Math.abs(dx) + Math.abs(dy) * 0.9; // diamond metric -> chunkier stones
        if (d < d1) { d2 = d1; d1 = d; s = si; } else if (d < d2) d2 = d;
      }
    });
    owner[y * N + x] = s; gap[y * N + x] = d2 - d1 < 1.0;
  }
  c.each((x, y) => gap[y * N + x] ? gray(58) : pal[1 + seeds[owner[y * N + x]][2]]);
  bevel(c, (x, y) => !gap[y * N + x], 1.16, 0.78);
  if (mossy) c.each((x, y) => (!gap[y * N + x] && c.vn(x, y, 5, 3) > 0.55 ? moss[q(c.vn(x, y, 2, 4), 3)] : null));
};
const brickPattern = (brick: number[], mortar: number[], bw: number, bh: number, tones = 4): Painter => (c) => {
  const pal = ramp(brick, 0.78, 1.12, tones + 2);
  const isMortar = (x: number, y: number) => { const row = Math.floor(wrap(y) / bh); const off = (row % 2) * (bw / 2); return (wrap(x) + off) % bw === 0 || wrap(y) % bh === bh - 1; };
  c.each((x, y) => {
    if (isMortar(x, y)) return mortar;
    const row = Math.floor(y / bh);
    const off = (row % 2) * (bw / 2);
    const id = Math.floor((x + off) / bw) * 3 + row;
    let i = 1 + q(c.hash(id, 77), tones);
    if (c.hash(x, y) < 0.05) i = Math.max(0, i - 2); // chip
    return pal[i];
  });
  bevel(c, (x, y) => !isMortar(x, y), 1.12, 0.82);
};
const cross = (fn: (x: number, y: number, c: PaintCtx) => number[] | null): Painter => (c) => {
  c.fill([0, 0, 0, 0]);
  c.each((x, y) => fn(x, y, c));
};
/** light left / dark right rim on any opaque sprite (plants, torches ...) */
const spriteShade = (c: PaintCtx, light = 1.12, dark = 0.78): void => pass(c, (x, y, get) => {
  const p = get(x, y); if (p[3] === 0) return null;
  const l = get(x - 1, y)[3] === 0, r = get(x + 1, y)[3] === 0, u = get(x, y - 1)[3] === 0;
  if (l || u) return [...shade(p, light).slice(0, 3), p[3]];
  if (r) return [...shade(p, dark).slice(0, 3), p[3]];
  return null;
});
const tallGrass: Painter = (c) => {
  c.fill([0, 0, 0, 0]);
  for (let i = 0; i < 10; i++) {
    const x = 1 + ri(c, 14), h = 6 + ri(c, 9);
    const tone = 130 + ri(c, 70);
    for (let y = 15; y > 15 - h; y--) {
      const lean = y < 15 - h + 3 ? (i % 2 === 0 ? 1 : -1) : 0;
      const t = y > 15 - h + 2 ? tone - 20 : tone + 30;
      c.set(x + lean, y, gray(t, TINT_A));
    }
  }
};
const flower = (petal: number[], center: number[]): Painter => (c) => {
  cross((x, y) => {
    if (x >= 7 && x <= 8 && y >= 8) return hex(x === 7 ? 0x4a9a34 : 0x387a26);
    if ((x === 5 || x === 6) && y === 12) return hex(0x4a9a30);
    if (x === 5 && y === 11) return hex(0x5aaa3a);
    if ((x === 9 || x === 10) && y === 10) return hex(0x4a9a30);
    if (x === 10 && y === 9) return hex(0x5aaa3a);
    const dx = x - 7.5, dy = y - 5;
    const d = dx * dx + dy * dy;
    if (d < 2.2) return center;
    if (d < 9.5 && !(Math.abs(dx) > 1.6 && Math.abs(dy) > 1.6)) return shade(petal, dy < 0 || dx < 0 ? 1.08 : 0.86);
    return null;
  })(c);
  spriteShade(c, 1.15, 0.8);
};
const mushroom = (cap: number[], dots: boolean): Painter => (c) => {
  cross((x, y, cc) => {
    if (x >= 7 && x <= 8 && y >= 9) return hex(x === 7 ? 0xe0d0b0 : 0xb8a888);
    if (y >= 5 && y <= 9 && x >= 4 && x <= 11 && !((y === 5) && (x < 6 || x > 9))) {
      if (dots && cc.hash(x, y) > 0.8) return gray(245);
      return shade(cap, y <= 6 ? 1.1 : y >= 9 ? 0.72 : 0.92);
    }
    return null;
  })(c);
  spriteShade(c);
};
const crop = (stage: number, max: number, color: number[], ripe?: number[]): Painter => (c) => {
  c.fill([0, 0, 0, 0]);
  const h = 4 + Math.round((stage / max) * 10);
  for (let i = 0; i < 6; i++) {
    const x = 1 + i * 2 + ri(c, 2);
    const hh = h - ri(c, 3);
    for (let y = 15; y > 15 - hh; y--) c.set(x, y, shade(color, 0.8 + c.hash(x, y) * 0.4));
    if (ripe && stage === max) { c.set(x, 15 - hh, ripe); c.set(x, 16 - hh, ripe); c.set(x + 1, 16 - hh, shade(ripe, 0.85)); }
  }
  spriteShade(c, 1.1, 0.82);
};
/**
 * Break-progress overlay, stages 0..9. Bold, high-contrast cracks radiate from a common centre so the same
 * block "shatters" progressively: each stage extends the existing cracks (same seed), thickens them and
 * finally knocks chips out of the surface. Drawn as black with a dark-grey halo so it reads on any block.
 */
const cracks = (stage: number): Painter => (c) => {
  c.fill([0, 0, 0, 0]);
  let seed = 0x9e3779b9;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  const ink = (x: number, y: number, a: number) => { if (x < 0 || y < 0 || x > 15 || y > 15) return; const p = c.get(x, y); if (p[3] < a) c.set(x, y, [0, 0, 0, a]); };
  const arms = 6;
  const a0 = 205 + stage * 5;
  const t = stage / 9;
  for (let a = 0; a < arms; a++) {
    let fx = 7.5 + (rnd() - 0.5), fy = 7.5 + (rnd() - 0.5);
    const dir = (a / arms) * Math.PI * 2 + rnd() * 0.9;
    let dx = Math.cos(dir), dy = Math.sin(dir);
    const len = 2.5 + t * 9 + rnd() * 2;
    for (let s = 0; s < len; s++) {
      const x = Math.round(fx), y = Math.round(fy);
      ink(x, y, a0);
      // the trunk of each crack thickens near the centre as the block gives way
      if (stage >= 4 && s < 2 + stage * 0.5 && s % 2 === 0) ink(x + (Math.abs(dx) > Math.abs(dy) ? 0 : 1), y + (Math.abs(dx) > Math.abs(dy) ? 1 : 0), a0 - 50);
      // side branches from the middle stages on
      if (stage >= 3 && s > 1 && rnd() < 0.12 + t * 0.18) {
        let bx = fx, by = fy; const bd = dir + (rnd() < 0.5 ? 1.0 : -1.0) + (rnd() - 0.5) * 0.4;
        const bl = 1 + rnd() * (1.5 + stage * 0.4);
        for (let k = 0; k < bl; k++) { bx += Math.cos(bd); by += Math.sin(bd); ink(Math.round(bx), Math.round(by), a0 - 40); }
      }
      const jitter = (rnd() - 0.5) * 1.0;
      const ndx = dx - dy * jitter, ndy = dy + dx * jitter;
      const n = Math.hypot(ndx, ndy) || 1; dx = ndx / n; dy = ndy / n;
      fx += dx; fy += dy;
    }
  }
  // late stages: stray splinters near the edges and a shattered core
  if (stage >= 6) for (let b = 0; b < (stage - 5) * 2; b++) {
    let x = Math.floor(rnd() * 16), y = Math.floor(rnd() * 16);
    for (let s = 0; s < 2 + stage - 6; s++) { ink(x, y, 160); if (rnd() < 0.5) x += rnd() < 0.5 ? 1 : -1; else y += rnd() < 0.5 ? 1 : -1; }
  }
  if (stage >= 7) { ink(7, 7, 255); ink(8, 7, 255); ink(7, 8, 255); ink(8, 8, 255); }
  if (stage >= 9) { ink(6, 7, 230); ink(9, 8, 230); ink(7, 6, 230); ink(8, 9, 230); ink(6, 6, 200); ink(9, 9, 200); }
};

const OAK = hex(0x9c7a4a), BIRCH = hex(0xd8cfa8), SPRUCE = hex(0x6b4b2a), DARK = hex(0x4a3320);

const PAINTERS: Record<TileName, Painter> = {
  stone: stoneLike(hex(0x7d7d7d), 12),
  deep_stone: stoneLike(hex(0x4c4c52), 10, 0.35, 3),
  dirt,
  grass_top: grassTop,
  grass_side: grassSide(false),
  snow_grass_side: grassSide(true),
  snow: (c) => { blobFill(c, ramp(hex(0xf2f6ff), 0.9, 1, 5), 4); for (let i = 0; i < 4; i++) c.set(ri(c, N), ri(c, N), gray(255)); for (let i = 0; i < 3; i++) lump(c, ri(c, N), ri(c, N), 1.5, 1, ramp(hex(0xf2f6ff), 0.9, 1, 5), 2); },
  sand: (c) => { const pal = ramp(hex(0xdbd2a0), 0.86, 1.08, 6); c.each((x, y) => pal[q(Math.min(0.999, c.vn(x, y * 2, 6) * 0.7 + blob(c, x, y, 3) * 0.3), 6)]); for (let i = 0; i < 6; i++) c.set(ri(c, N), ri(c, N), shade(pal[0], 0.92)); for (let i = 0; i < 4; i++) c.set(ri(c, N), ri(c, N), pal[5]); },
  red_sand: (c) => { const pal = ramp(hex(0xb8642e), 0.84, 1.08, 6); c.each((x, y) => pal[q(Math.min(0.999, c.vn(x, y * 2, 6) * 0.7 + blob(c, x, y, 3) * 0.3), 6)]); for (let i = 0; i < 6; i++) c.set(ri(c, N), ri(c, N), shade(pal[0], 0.92)); },
  gravel: (c) => { const pal = ramp(hex(0x8a8580), 0.62, 1.16, 6); blobFill(c, pal, 2.5, 2); for (let i = 0; i < 9; i++) lump(c, ri(c, N), ri(c, N), 1 + c.rnd() * 1.3, 0.8 + c.rnd() * 0.9, pal, 2 + ri(c, 3)); c.each((x, y) => (c.hash(x, y) < 0.06 ? pal[0] : null)); },
  clay: stoneLike(hex(0x9ea4b0), 6, 0.15, 3),
  mud: (c) => { stoneLike(hex(0x4a3b33), 10, 0.3, 2)(c); for (let i = 0; i < 3; i++) { const x = ri(c, N), y = ri(c, N); c.set(x, y, hex(0x2e231d)); c.set(wrap(x + 1), y, hex(0x2e231d)); } },
  ice: (c) => { blobFill(c, ramp(hex(0xa6cdf6), 0.9, 1.06, 5), 5); cracksOn(c, hex(0xe0f2ff), 3, 4, 1); cracksOn(c, hex(0x7aa8e0), 2, 3, 1); cloud(c, 0.05, 6); },
  packed_ice: (c) => { blobFill(c, ramp(hex(0x86b2e4), 0.88, 1.06, 5), 4); cracksOn(c, hex(0xb8d8f8), 2, 3, 1); },
  // Water: deep blue base with soft tileable swells. Two wrapping sine bands at shallow angles give the
  // rolling wave shape, value noise breaks up the banding, and sparse foam pixels sit only on the crests.
  water: (c) => {
    const pal = ramp(hex(0x2f62c8), 0.66, 1.18, 6);
    const swell = (x: number, y: number) => {
      const u = (x + 0.5) / N, v = (y + 0.5) / N;
      const s1 = Math.sin((u * 1 + v * 2) * Math.PI * 2) * 0.5 + 0.5;
      const s2 = Math.sin((u * 2 - v * 1) * Math.PI * 2 + 2.3) * 0.5 + 0.5;
      return s1 * 0.5 + s2 * 0.5;
    };
    c.each((x, y) => {
      const h = Math.min(0.999, swell(x, y) * 0.45 + blob(c, x, y, 6, 2) * 0.55);
      return pal[q(h, 6)];
    });
    // sparse foam: only where a swell peak and the noise peak coincide, so highlights sit on wave tops
    c.each((x, y) => (swell(x, y) > 0.9 && c.vn(x, y, 5, 2) > 0.62 && c.hash(x, y) > 0.4 ? hex(0xbcdcfb) : null));
    cloud(c, 0.05, 7, 3);
  },
  // Lava: dark basalt crust plates dominate, with thin bright molten cracks running along the plate seams
  // (seamless worley) and a hot glow bleeding a pixel or two out of each crack. A few ember specks on top.
  lava: (c) => {
    const seeds: number[][] = []; for (let i = 0; i < 4; i++) seeds.push([c.rnd() * N, c.rnd() * N]);
    const crustPal = ramp(hex(0x431409), 0.7, 1.5, 5);
    c.each((x, y) => {
      let d1 = 1e9, d2 = 1e9;
      for (const sd of seeds) for (let wx = -N; wx <= N; wx += N) for (let wy = -N; wy <= N; wy += N) {
        const d = Math.hypot(sd[0] + wx - x - 0.5, sd[1] + wy - y - 0.5);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      const n = c.vn(x, y, 5, 9);
      const edge = (d2 - d1) + (n - 0.5) * 0.8; // wobble the seam so cracks aren't straight
      if (edge < 0.22) return hex(0xffce6a);            // white-hot crack core
      if (edge < 0.55) return mix(hex(0xe8730f), hex(0xffae33), c.hash(x, y)); // molten shoulder
      if (edge < 0.95) return mix(hex(0x7a1e05), hex(0xb83c08), c.hash(x, y)); // cooling glow at the crack rim
      return crustPal[q(Math.min(0.999, n * 0.75 + c.hash(x, y) * 0.25), 5)]; // dark crust plate
    });
    // ember specks in the crust and a couple of darkest cooled scabs
    for (let i = 0; i < 4; i++) { const x = ri(c, N), y = ri(c, N); c.set(x, y, hex(0xd4601a)); }
    for (let i = 0; i < 5; i++) { const x = ri(c, N), y = ri(c, N); c.set(x, y, hex(0x2a0b04)); c.set(wrap(x + 1), y, hex(0x351005)); }
    cloud(c, 0.06, 6, 4);
  },
  bedrock: stoneLike(hex(0x484848), 45, 0.2, 5),
  sandstone_top: (c) => { blobFill(c, ramp(hex(0xd9cd93), 0.9, 1.05, 5), 4); cloud(c, 0.04); },
  sandstone_side: (c) => { const pal = ramp(hex(0xd9cd93), 0.76, 1.06, 6); c.each((x, y) => (y % 5 === 4 ? pal[0] : y % 5 === 0 ? pal[5] : pal[2 + q(blob(c, x, y, 4), 3)])); for (let i = 0; i < 3; i++) { const x = ri(c, N), y = ri(c, N); if (y % 5 !== 4) c.set(x, y, pal[1]); } },
  terracotta: (c) => { const pal = ramp(hex(0x9a5a3c), 0.84, 1.08, 6); c.each((x, y) => pal[q(c.vn(x, y * 0.5, 4), 6)]); cloud(c, 0.04); },
  oak_log: logSide(hex(0x6a4f2c), 30), oak_log_top: logTop(hex(0x6a4f2c), OAK), oak_planks: planks(OAK), oak_leaves: leaves(180, 0.42),
  birch_log: (c) => { logSide(hex(0xe4e0d2), 16)(c); for (let i = 0; i < 6; i++) { const x = ri(c, N), y = ri(c, N), w = 1 + ri(c, 3); for (let k = 0; k < w; k++) c.set(wrap(x + k), y, hex(0x2c2c2c)); if (c.rnd() < 0.5) c.set(wrap(x + 1), wrap(y + 1), hex(0x3a3a3a)); } },
  birch_log_top: logTop(hex(0xe4e0d2), BIRCH), birch_planks: planks(BIRCH), birch_leaves: leaves(190, 0.42),
  spruce_log: logSide(hex(0x4a3320), 25), spruce_log_top: logTop(hex(0x4a3320), SPRUCE), spruce_planks: planks(SPRUCE), spruce_leaves: leaves(150, 0.40, 0.55),
  dark_log: logSide(hex(0x3a2818), 20), dark_log_top: logTop(hex(0x3a2818), DARK), dark_planks: planks(DARK), dark_leaves: leaves(140, 0.44, 0.55),
  stripped_log: (c) => { const pal = ramp(OAK, 0.8, 1.12, 6); c.each((x, y) => pal[q(c.vn(x * 1.5, y * 0.3, 3), 6)]); for (let x = 0; x < N; x += 5) for (let y = 0; y < N; y++) if (c.hash(x, Math.floor(y / 4)) > 0.5) c.set(x, y, pal[1]); },
  stripped_log_top: logTop(OAK, OAK),
  oak_sapling: (c) => { cross((x, y, cc) => (x >= 7 && x <= 8 && y >= 9 ? hex(0x6a4f2c) : (Math.abs(x - 7.5) + Math.abs(y - 6) < 5 && cc.hash(x, y) > 0.2 ? shade(hex(0x4d9a34), 0.8 + cc.hash(x, y) * 0.4) : null)))(c); spriteShade(c); },
  birch_sapling: (c) => { cross((x, y, cc) => (x >= 7 && x <= 8 && y >= 9 ? hex(0xd8d0c0) : (Math.abs(x - 7.5) + Math.abs(y - 6) < 5 && cc.hash(x, y) > 0.2 ? shade(hex(0x74b34a), 0.8 + cc.hash(x, y) * 0.4) : null)))(c); spriteShade(c); },
  spruce_sapling: (c) => { cross((x, y, cc) => (x >= 7 && x <= 8 && y >= 10 ? hex(0x4a3320) : (Math.abs(x - 7.5) < (y - 1) / 2.2 && y >= 2 && y < 12 && cc.hash(x, y) > 0.25 ? shade(hex(0x2f6b3a), 0.8 + cc.hash(x, y) * 0.4) : null)))(c); spriteShade(c); },
  coal_ore: ore(hex(0x262626), 8), copper_ore: ore(hex(0xc87a45), 7), iron_ore: ore(hex(0xd8b092), 7), gold_ore: ore(hex(0xf2d243), 6),
  ember_ore: ore(hex(0xf04a20), 7, true), crystal_ore: ore(hex(0x5fe8e0), 5, true),
  cobblestone: cobble(false), mossy_cobblestone: cobble(true),
  stone_bricks: brickPattern(hex(0x8a8a8a), hex(0x565656), 8, 4),
  bricks: brickPattern(hex(0x9c4a3a), hex(0xb8ab9c), 8, 4, 3),
  glass: (c) => c.each((x, y) => (x === 0 || y === 0 || x === 15 || y === 15 ? hex(0xe6f3fc) : (x + y === 5 || x + y === 6 || x + y === 19 || x + y === 20) ? [255, 255, 255, 110] : [255, 255, 255, 0])),
  wool: (c) => { const pal = ramp(hex(0xe0e6ec), 0.8, 1.04, 5); c.each((x, y) => { const k = ((x >> 1) + (y >> 1)) % 2; const n = q(c.vn(x, y, 3), 3); return pal[Math.min(4, n + k + (x % 2 === 0 && y % 2 === 0 ? 1 : 0))]; }); },
  voidstone: (c) => { stoneLike(hex(0x2a1e3e), 20, 0.3, 3)(c); c.each((x, y) => (c.hash(x, y + 9) > 0.94 ? hex(0x6a4aa0) : null)); },
  lumen: (c) => {
    const pal = ramp(hex(0xb8862c), 0.72, 1.04, 5); blobFill(c, pal, 3);
    for (let i = 0; i < 6; i++) { const x = ri(c, N), y = ri(c, N); lump(c, x, y, 1.5 + c.rnd(), 1.2 + c.rnd() * 0.6, [hex(0xd8a83a), hex(0xf2cc5a), hex(0xfff0a8), hex(0xfffbe0), hex(0xffffff)], 2); c.set(x, y, hex(0xfffbe0)); }
  },
  hellstone: (c) => { stoneLike(hex(0x6e2424), 18, 0.4, 4)(c); c.each((x, y) => (c.hash(x, y + 3) > 0.9 ? hex(0x3a1010) : null)); },
  crafting_table_top: (c) => { planks(OAK)(c); c.each((x, y) => (x % 5 === 2 || y % 5 === 2 ? hex(0x4a3320) : (x < 2 || y < 2 || x > 13 || y > 13) ? shade(OAK, 0.72) : null)); c.each((x, y) => ((x % 5 === 3 || y % 5 === 3) && !(x % 5 === 2 || y % 5 === 2) ? shade(c.get(x, y), 1.1) : null)); },
  crafting_table_side: (c) => { planks(OAK)(c); c.rect(0, 0, 15, 1, shade(OAK, 0.72)); c.rect(0, 2, 15, 2, shade(OAK, 1.1)); c.rect(3, 4, 5, 6, hex(0x9a9a9a)); c.rect(3, 4, 5, 4, hex(0xc4c4c4)); c.rect(4, 7, 4, 12, hex(0x4a3320)); c.rect(10, 4, 12, 5, hex(0xc0c0c0)); c.rect(10, 4, 12, 4, hex(0xe8e8e8)); c.rect(11, 6, 11, 12, hex(0x4a3320)); },
  furnace_side: (c) => { cobble(false)(c); c.each((x, y) => shade(c.get(x, y), 0.82)); },
  furnace_front: (c) => { cobble(false)(c); c.each((x, y) => shade(c.get(x, y), 0.82)); c.rect(4, 8, 11, 14, gray(26)); c.rect(4, 8, 11, 8, gray(60)); c.rect(4, 8, 4, 14, gray(48)); c.rect(3, 7, 12, 7, gray(110)); c.rect(3, 7, 3, 15, gray(110)); },
  furnace_front_lit: (c) => { cobble(false)(c); c.each((x, y) => shade(c.get(x, y), 0.82)); c.rect(4, 8, 11, 14, gray(26)); c.rect(3, 7, 12, 7, gray(110)); c.rect(3, 7, 3, 15, gray(110)); c.each((x, y) => (x >= 5 && x <= 10 && y >= 10 && y <= 14 && c.hash(x, y) > 0.25 ? mix(hex(0xff6a00), hex(0xffe066), Math.min(1, c.hash(x, y + 9) + (14 - y) * 0.1)) : null)); },
  chest_top: (c) => { planks(hex(0x8a5a2c))(c); c.rect(0, 0, 15, 0, hex(0x4a3320)); c.rect(0, 15, 15, 15, hex(0x4a3320)); c.rect(0, 0, 0, 15, hex(0x4a3320)); c.rect(15, 0, 15, 15, hex(0x4a3320)); c.rect(1, 1, 14, 1, hex(0xb08050)); c.rect(1, 1, 1, 14, hex(0xb08050)); },
  chest_side: (c) => { planks(hex(0x8a5a2c))(c); c.rect(0, 5, 15, 5, hex(0x3a2818)); c.rect(0, 6, 15, 6, hex(0xb08050)); c.rect(0, 0, 0, 15, hex(0x4a3320)); c.rect(15, 0, 15, 15, hex(0x4a3320)); c.rect(0, 15, 15, 15, hex(0x4a3320)); c.rect(0, 0, 15, 0, hex(0x4a3320)); },
  chest_front: (c) => { planks(hex(0x8a5a2c))(c); c.rect(0, 5, 15, 5, hex(0x3a2818)); c.rect(0, 6, 15, 6, hex(0xb08050)); c.rect(0, 0, 0, 15, hex(0x4a3320)); c.rect(15, 0, 15, 15, hex(0x4a3320)); c.rect(0, 15, 15, 15, hex(0x4a3320)); c.rect(0, 0, 15, 0, hex(0x4a3320)); c.rect(7, 3, 8, 7, hex(0xb8b8b8)); c.rect(7, 3, 7, 7, hex(0xe0e0e0)); c.rect(7, 5, 8, 6, hex(0x505050)); },
  torch: (c) => { c.fill([0, 0, 0, 0]); c.rect(7, 8, 8, 15, hex(0x8a6a3a)); c.rect(7, 8, 7, 15, hex(0xa8824c)); c.rect(8, 9, 8, 15, hex(0x6a4a24)); c.each((x, y) => (y >= 10 && c.hash(x, y) > 0.7 ? shade(c.get(x, y), 0.85) : null)); c.rect(7, 5, 8, 7, hex(0xffd23a)); c.rect(6, 7, 9, 7, hex(0xff9a1a)); c.set(7, 5, hex(0xfff6c0)); c.set(8, 5, hex(0xffe27a)); c.set(6, 7, hex(0xffb84a)); c.set(9, 7, hex(0xd87818)); },
  lantern: (c) => { c.fill([0, 0, 0, 0]); c.rect(5, 7, 10, 15, hex(0xffd870)); c.rect(6, 8, 9, 14, hex(0xfff0b0)); c.rect(5, 7, 10, 7, hex(0x3a3a44)); c.rect(5, 15, 10, 15, hex(0x3a3a44)); c.rect(5, 7, 5, 15, hex(0x3a3a44)); c.rect(10, 7, 10, 15, hex(0x3a3a44)); c.rect(5, 11, 10, 11, hex(0x3a3a44)); c.rect(7, 4, 8, 6, hex(0x3a3a44)); c.rect(7, 12, 8, 13, hex(0xffffff)); },
  ladder: (c) => { c.fill([0, 0, 0, 0]); c.rect(1, 0, 2, 15, hex(0x8a6a3a)); c.rect(13, 0, 14, 15, hex(0x8a6a3a)); c.rect(1, 0, 1, 15, hex(0xa48050)); c.rect(13, 0, 13, 15, hex(0xa48050)); for (let y = 1; y < 16; y += 4) { c.rect(1, y, 14, y + 1, hex(0xa07a44)); c.rect(1, y, 14, y, hex(0xb89058)); } },
  door_top: (c) => { planks(OAK)(c); c.rect(0, 0, 15, 0, shade(OAK, 0.6)); c.rect(0, 0, 0, 15, shade(OAK, 0.6)); c.rect(15, 0, 15, 15, shade(OAK, 0.6)); c.rect(5, 3, 10, 8, shade(OAK, 0.6)); c.rect(6, 4, 9, 7, hex(0xbfe8ff)); c.set(7, 4, hex(0xffffff)); c.set(6, 5, hex(0xe8f8ff)); },
  door_bottom: (c) => { planks(OAK)(c); c.rect(0, 15, 15, 15, shade(OAK, 0.6)); c.rect(0, 0, 0, 15, shade(OAK, 0.6)); c.rect(15, 0, 15, 15, shade(OAK, 0.6)); c.rect(5, 3, 10, 9, shade(OAK, 0.75)); c.rect(6, 4, 9, 8, shade(OAK, 0.95)); c.rect(12, 2, 13, 3, hex(0xb0b0b0)); c.set(12, 2, hex(0xe0e0e0)); },
  bed_top: (c) => { c.each((x, y) => (y < 5 ? gray(226 + c.hash(x, y) * 24) : shade(hex(0xb03030), 0.88 + c.hash(x, y) * 0.16))); c.rect(0, 5, 15, 5, hex(0x8a2020)); c.rect(0, 4, 15, 4, gray(200)); c.rect(0, 0, 15, 0, hex(0x5a3a1a)); c.rect(0, 15, 15, 15, hex(0x5a3a1a)); c.rect(0, 0, 0, 15, hex(0x5a3a1a)); c.rect(15, 0, 15, 15, hex(0x5a3a1a)); },
  bed_side: (c) => { planks(OAK)(c); c.rect(0, 7, 15, 10, hex(0xb03030)); c.rect(0, 7, 15, 7, hex(0xc84848)); c.rect(0, 10, 15, 10, hex(0x8a2020)); },
  altar_top: (c) => { PAINTERS.voidstone(c); c.rect(3, 3, 12, 12, hex(0x2a1e44)); c.each((x, y) => ((x === 7 || x === 8) && y >= 4 && y <= 11 || (y === 7 || y === 8) && x >= 4 && x <= 11 ? hex(0x5fe8e0) : null)); bevel(c, (x, y) => x >= 3 && x <= 12 && y >= 3 && y <= 12, 1.3, 0.7); },
  altar_side: (c) => { PAINTERS.voidstone(c); c.rect(0, 4, 15, 5, hex(0x5fe8e0)); c.rect(0, 4, 15, 4, hex(0x9ff4ee)); c.rect(0, 0, 15, 1, hex(0x3a2a5a)); },
  barrel_side: (c) => { c.each((x, y) => shade(hex(0x8a6a3a), 0.85 + (x % 3 === 0 ? -0.18 : x % 3 === 1 ? 0.08 : 0) + c.hash(x, y) * 0.1)); c.rect(0, 2, 15, 3, hex(0x4a4a50)); c.rect(0, 2, 15, 2, hex(0x6a6a72)); c.rect(0, 12, 15, 13, hex(0x4a4a50)); c.rect(0, 12, 15, 12, hex(0x6a6a72)); },
  barrel_top: (c) => { planks(hex(0x8a6a3a))(c); c.each((x, y) => { const d = Math.hypot(x - 7.5, y - 7.5); return d > 6.5 && d < 7.6 ? hex(0x4a4a50) : null; }); },
  // ---- Spark circuitry. Unpowered parts are a dull verdigris; powered parts light to a hot
  // cyan-white, so a live wire reads at a glance in a dark corridor.
  spark_dust: (c) => { c.fill([0, 0, 0, 0]); c.rect(0, 7, 15, 8, hex(0x2a6a66)); c.rect(0, 7, 15, 7, hex(0x3a8a84)); c.rect(7, 0, 8, 15, hex(0x2a6a66)); c.rect(7, 0, 7, 15, hex(0x3a8a84)); c.each((x, y) => (c.hash(x, y) > 0.86 && ((y >= 6 && y <= 9) || (x >= 6 && x <= 9)) ? hex(0x1a4a46) : null)); },
  spark_dust_on: (c) => { c.fill([0, 0, 0, 0]); c.rect(0, 7, 15, 8, hex(0x5fe8e0)); c.rect(0, 7, 15, 7, hex(0xb0fff8)); c.rect(7, 0, 8, 15, hex(0x5fe8e0)); c.rect(7, 0, 7, 15, hex(0xb0fff8)); c.each((x, y) => (c.hash(x, y) > 0.88 && ((y >= 6 && y <= 9) || (x >= 6 && x <= 9)) ? hex(0xe8fffc) : null)); },
  spark_torch: (c) => { c.fill([0, 0, 0, 0]); c.rect(7, 8, 8, 15, hex(0x8a6a3a)); c.rect(7, 8, 7, 15, hex(0xa8824c)); c.rect(8, 9, 8, 15, hex(0x6a4a24)); c.rect(7, 5, 8, 7, hex(0x5fe8e0)); c.rect(6, 6, 9, 6, hex(0x9ff4ee)); c.set(7, 5, hex(0xe8fffc)); c.set(8, 6, hex(0xb0fff8)); },
  spark_torch_off: (c) => { c.fill([0, 0, 0, 0]); c.rect(7, 8, 8, 15, hex(0x6a5230)); c.rect(7, 8, 7, 15, hex(0x84663c)); c.rect(7, 5, 8, 7, hex(0x2a4a48)); c.rect(6, 6, 9, 6, hex(0x35605c)); },
  spark_lever: (c) => { PAINTERS.cobblestone(c); c.rect(6, 10, 9, 14, hex(0x4a4a52)); c.rect(6, 10, 9, 10, hex(0x6a6a74)); c.rect(9, 4, 10, 10, hex(0x8a6a3a)); c.set(9, 3, hex(0x2a6a66)); c.set(10, 3, hex(0x2a6a66)); },
  spark_lever_on: (c) => { PAINTERS.cobblestone(c); c.rect(6, 10, 9, 14, hex(0x4a4a52)); c.rect(6, 10, 9, 10, hex(0x6a6a74)); c.rect(5, 4, 6, 10, hex(0x8a6a3a)); c.set(5, 3, hex(0x5fe8e0)); c.set(6, 3, hex(0xb0fff8)); },
  spark_plate: (c) => { c.fill([0, 0, 0, 0]); c.rect(1, 1, 14, 14, hex(0x6a6a74)); c.rect(1, 1, 14, 1, hex(0x8a8a94)); c.rect(1, 14, 14, 14, hex(0x3a3a42)); c.rect(1, 1, 1, 14, hex(0x8a8a94)); c.rect(14, 1, 14, 14, hex(0x3a3a42)); },
  spark_plate_on: (c) => { c.fill([0, 0, 0, 0]); c.rect(1, 1, 14, 14, hex(0x5a7a7c)); c.rect(1, 1, 14, 1, hex(0x9ff4ee)); c.rect(1, 14, 14, 14, hex(0x2a4a48)); c.rect(1, 1, 1, 14, hex(0x7fd8d2)); c.rect(14, 1, 14, 14, hex(0x2a4a48)); },
  shunt_side: (c) => { planks(hex(0x9a7a4a))(c); c.rect(0, 0, 15, 2, hex(0x6a6a74)); c.rect(0, 0, 15, 0, hex(0x8a8a94)); c.rect(0, 13, 15, 15, hex(0x4a4a52)); c.each((x, y) => (c.hash(x, y) > 0.93 ? shade(c.get(x, y), 0.8) : null)); },
  shunt_face: (c) => { c.each(() => hex(0x8a8a94)); c.rect(2, 2, 13, 13, hex(0x6a6a74)); c.rect(2, 2, 13, 2, hex(0xa0a0aa)); c.rect(2, 13, 13, 13, hex(0x3a3a42)); c.rect(6, 6, 9, 9, hex(0x2a6a66)); },
  shunt_head: (c) => { c.each(() => hex(0xa8824c)); c.rect(0, 0, 15, 1, hex(0xc8a06a)); c.rect(0, 14, 15, 15, hex(0x7a5a30)); c.rect(5, 5, 10, 10, hex(0x8a6a3a)); bevel(c, (x, y) => x >= 5 && x <= 10 && y >= 5 && y <= 10, 1.2, 0.75); },
  // ---- Brewing Hearth: a squat stone basin with a cyan steep glowing in the bowl.
  hearth_top: (c) => { PAINTERS.stone_bricks(c); c.each((x, y) => { const d = Math.hypot(x - 7.5, y - 7.5); return d < 5 ? hex(0x2a4a48) : d < 6 ? hex(0x4a4a52) : null; }); c.each((x, y) => { const d = Math.hypot(x - 7.5, y - 7.5); return d < 3.4 ? shade(hex(0x5fe8e0), 0.8 + c.hash(x, y) * 0.5) : null; }); c.set(6, 6, hex(0xe8fffc)); bevel(c, (x, y) => Math.hypot(x - 7.5, y - 7.5) < 6, 1.25, 0.72); },
  hearth_side: (c) => { PAINTERS.stone_bricks(c); c.rect(3, 5, 12, 11, hex(0x4a4a52)); c.rect(3, 5, 12, 5, hex(0x6a6a74)); c.rect(4, 6, 11, 10, hex(0x2a4a48)); c.rect(5, 8, 10, 9, hex(0x5fe8e0)); c.rect(5, 8, 10, 8, hex(0x9ff4ee)); },
  // ---- Trackway: two iron rails on dark sleepers. The curve tile bends the rails through the
  // tile so a corner reads as a corner, and the slope tile adds a shadow gradient up the ramp.
  track_straight: (c) => {
    c.fill([0, 0, 0, 0]);
    for (let y = 1; y < 16; y += 5) c.rect(1, y, 14, y + 1, hex(0x5a4630));       // sleepers
    for (let y = 1; y < 16; y += 5) c.rect(1, y, 14, y, hex(0x74593c));
    c.rect(3, 0, 4, 15, hex(0xb8bcc4)); c.rect(3, 0, 3, 15, hex(0xe0e4ec));       // left rail
    c.rect(11, 0, 12, 15, hex(0xb8bcc4)); c.rect(11, 0, 11, 15, hex(0xe0e4ec));   // right rail
  },
  track_curve: (c) => {
    c.fill([0, 0, 0, 0]);
    // sleepers fanned around the corner
    for (let i = 0; i < 4; i++) { const o = 1 + i * 4; c.rect(o, o, o + 3, o + 1, hex(0x5a4630)); }
    // two quarter-arcs of rail
    c.each((x, y) => { const d = Math.hypot(x - 15.5, y - 15.5); return d > 10.5 && d < 12.0 ? hex(0xb8bcc4) : null; });
    c.each((x, y) => { const d = Math.hypot(x - 15.5, y - 15.5); return d > 3.0 && d < 4.5 ? hex(0xb8bcc4) : null; });
    c.each((x, y) => { const d = Math.hypot(x - 15.5, y - 15.5); return d > 10.5 && d < 11.2 ? hex(0xe0e4ec) : null; });
  },
  track_slope: (c) => {
    c.fill([0, 0, 0, 0]);
    for (let y = 1; y < 16; y += 5) c.rect(1, y, 14, y + 1, hex(0x5a4630));
    for (let y = 1; y < 16; y += 5) c.rect(1, y, 14, y, hex(0x74593c));
    c.rect(3, 0, 4, 15, hex(0xb8bcc4)); c.rect(11, 0, 12, 15, hex(0xb8bcc4));
    // a gradient so the ramp reads as climbing even from directly above
    c.each((x, y) => shade(c.get(x, y), 0.72 + (15 - y) / 15 * 0.45));
  },
  // ---- Mending Stone: a stone block with an iron face plate and a worn hammer mark.
  mending_top: (c) => {
    PAINTERS.stone_bricks(c);
    c.rect(2, 2, 13, 13, hex(0x6a6a74)); c.rect(2, 2, 13, 2, hex(0x9a9aa6)); c.rect(2, 13, 13, 13, hex(0x3a3a42));
    c.rect(5, 5, 10, 10, hex(0x55555e));
    c.each((x, y) => (c.hash(x, y) > 0.9 && x > 4 && x < 11 && y > 4 && y < 11 ? hex(0x84848e) : null));
    bevel(c, (x, y) => x >= 2 && x <= 13 && y >= 2 && y <= 13, 1.25, 0.72);
  },
  mending_side: (c) => {
    PAINTERS.stone_bricks(c);
    c.rect(0, 3, 15, 6, hex(0x6a6a74)); c.rect(0, 3, 15, 3, hex(0x9a9aa6)); c.rect(0, 6, 15, 6, hex(0x3a3a42));
    c.rect(4, 8, 11, 12, hex(0x55555e)); c.rect(4, 8, 11, 8, hex(0x7c7c88));
  },
  tall_grass: tallGrass,
  fern: (c) => { c.fill([0, 0, 0, 0]); for (let i = 0; i < 4; i++) { const dir = i % 2 ? 1 : -1; for (let s = 0; s < 8; s++) { const x = 7 + dir * s, y = 14 - i * 2 - Math.floor(s * 0.7); c.set(x, y, gray(130 + c.rnd() * 70, TINT_A)); if (s % 2) c.set(x, y - 1, gray(170, TINT_A)); } } c.rect(7, 4, 8, 15, gray(120, TINT_A)); c.rect(7, 4, 7, 15, gray(150, TINT_A)); },
  flower_red: flower(hex(0xd83030), hex(0x2a2a2a)), flower_yellow: flower(hex(0xf2d843), hex(0xc88a20)), flower_blue: flower(hex(0x4a70e0), hex(0xf0e060)),
  mushroom_brown: mushroom(hex(0x8a6a4a), false), mushroom_red: mushroom(hex(0xd03030), true),
  dead_bush: (c) => { cross((x, y, cc) => (x >= 7 && x <= 8 && y >= 8 ? hex(0x7a5a2a) : (Math.abs(x - 7.5) < (14 - y) * 0.9 && y > 2 && y < 12 && cc.hash(x, y) > 0.72 ? hex(0x8a6a3a) : null)))(c); spriteShade(c); },
  cactus_side: (c) => c.each((x, y) => (x === 0 || x === 15 ? [0, 0, 0, 0] : shade(hex(0x5f9e3a), (x % 4 === 2 ? 0.78 : x % 4 === 3 ? 1.08 : 1) + (c.hash(x, y) > 0.92 ? 0.3 : 0) + c.hash(x, y) * 0.06))),
  cactus_top: (c) => c.each((x, y) => (x === 0 || x === 15 || y === 0 || y === 15 ? hex(0x4a7a2a) : shade(hex(0x6fae4a), 0.9 + c.hash(x, y) * 0.15))),
  reeds: (c) => { cross((x, y, cc) => (x >= 6 && x <= 9 ? shade(hex(0x9ac86a), (y % 5 === 0 ? 0.75 : 1) + cc.hash(x, y) * 0.1) : null))(c); spriteShade(c); },
  farmland: (c) => { dirt(c); c.each((x, y) => (y % 4 === 1 ? shade(c.get(x, y), 0.55) : y % 4 === 2 ? shade(c.get(x, y), 0.85) : null)); },
  wheat_0: crop(0, 3, hex(0x6fbf4a)), wheat_1: crop(1, 3, hex(0x7fc04a)), wheat_2: crop(2, 3, hex(0xa8b848)), wheat_3: crop(3, 3, hex(0xc8a840), hex(0xe8c860)),
  carrot_0: crop(0, 2, hex(0x4faa3a)), carrot_1: crop(1, 2, hex(0x4faa3a)), carrot_2: (c) => { crop(2, 2, hex(0x3f9a30))(c); for (let x = 2; x < 15; x += 4) { c.rect(x, 14, x + 1, 15, hex(0xf08030)); c.set(x, 14, hex(0xffa050)); } },
  potato_0: crop(0, 2, hex(0x5fa04a)), potato_1: crop(1, 2, hex(0x5fa04a)), potato_2: (c) => { crop(2, 2, hex(0x4f9040))(c); for (let x = 3; x < 15; x += 5) { c.rect(x, 13, x + 1, 14, hex(0xd8b060)); c.set(x, 13, hex(0xe8c880)); } },
  pumpkin_side: (c) => { c.each((x, y) => shade(hex(0xd67a1a), (x % 5 === 0 ? 0.72 : x % 5 === 1 ? 1.1 : 1) + c.hash(x, y) * 0.08)); c.rect(0, 0, 15, 0, hex(0xa85a10)); c.rect(0, 15, 15, 15, hex(0xa85a10)); },
  pumpkin_top: (c) => c.each((x, y) => (Math.abs(x - 7.5) < 1.5 && Math.abs(y - 7.5) < 1.5 ? hex(0x5a8a2a) : shade(hex(0xd67a1a), (Math.hypot(x - 7.5, y - 7.5) > 7 ? 0.78 : 1) + c.hash(x, y) * 0.08))),
  melon_side: (c) => c.each((x, y) => shade(hex(0x6fae4a), (c.vn(x, y, 3) > 0.5 ? 0.66 : 1.06) + c.hash(x, y) * 0.08)),
  melon_top: (c) => c.each((x, y) => shade(hex(0x6fae4a), (c.vn(y, x, 3) > 0.5 ? 0.66 : 1.06) + c.hash(x, y) * 0.08)),
  crack_0: cracks(0), crack_1: cracks(1), crack_2: cracks(2), crack_3: cracks(3), crack_4: cracks(4), crack_5: cracks(5), crack_6: cracks(6), crack_7: cracks(7), crack_8: cracks(8), crack_9: cracks(9),
  white: (c) => c.fill([255, 255, 255, 255]),
  sun: (c) => c.each((x, y) => { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); return d > 6 ? [0, 0, 0, 0] : d > 4.5 ? hex(0xffe89a, 230) : hex(0xfff6d0); }),
  moon: (c) => c.each((x, y) => { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); if (d > 5) return [0, 0, 0, 0]; const cr = c.vn(x, y, 3) > 0.62; return cr ? hex(0xa8b0c0) : hex(0xdde4f0); }),
  portal: (c) => c.each((x, y) => mix(hex(0x5a1a9a, 200), hex(0xc06aff, 200), c.vn(x, y, 4))),
};

export class TextureAtlas {
  readonly width = ATLAS_COLS * TILE_PX;
  readonly height = ATLAS_ROWS * TILE_PX;
  readonly data: Uint8Array;
  readonly tiles: Uint8ClampedArray[] = [];
  readonly avg: Float32Array;
  readonly texture: THREE.DataTexture;

  constructor() {
    this.data = new Uint8Array(this.width * this.height * 4);
    this.avg = new Float32Array(TILE_NAMES.length * 3);
    TILE_NAMES.forEach((name, t) => {
      const tile = new Uint8ClampedArray(N * N * 4);
      const ctx = makeCtx(tile, 1000 + t * 7919);
      (PAINTERS[name] || PAINTERS.white)(ctx);
      this.tiles[t] = tile;
      const col = t % ATLAS_COLS, row = Math.floor(t / ATLAS_COLS);
      let r = 0, g = 0, b = 0, n = 0;
      for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
        const si = (py * N + px) * 4;
        const ax = col * N + px, ay = row * N + (N - 1 - py);
        const di = (ay * this.width + ax) * 4;
        this.data[di] = tile[si]; this.data[di + 1] = tile[si + 1]; this.data[di + 2] = tile[si + 2]; this.data[di + 3] = tile[si + 3];
        if (tile[si + 3] > 0) { r += tile[si]; g += tile[si + 1]; b += tile[si + 2]; n++; }
      }
      if (n) { this.avg[t * 3] = r / n / 255; this.avg[t * 3 + 1] = g / n / 255; this.avg[t * 3 + 2] = b / n / 255; }
    });
    this.texture = new THREE.DataTexture(this.data, this.width, this.height, THREE.RGBAFormat);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.flipY = false;
    this.texture.needsUpdate = true;
  }

  /** Draw a tile onto a 2D canvas context with an optional tint for tinted pixels. */
  /**
   * Draw a tile into a 2D canvas (item icons, hand model, crack overlay). Block tiles use the alpha channel as a
   * "tint this pixel" flag, so they are drawn fully opaque; `keepAlpha` preserves real transparency instead
   * (used by the crack overlay textures, which must show the block underneath).
   */
  drawTile(ctx: CanvasRenderingContext2D, t: number, x: number, y: number, size: number, tint?: [number, number, number], shadeF = 1, keepAlpha = false): void {
    const tile = this.tiles[t];
    const img = ctx.createImageData(N, N);
    for (let i = 0; i < N * N; i++) {
      let r = tile[i * 4], g = tile[i * 4 + 1], b = tile[i * 4 + 2];
      const a = tile[i * 4 + 3];
      if (a === 0) continue;
      if (a < 200 && tint) { r *= tint[0]; g *= tint[1]; b *= tint[2]; }
      img.data[i * 4] = r * shadeF; img.data[i * 4 + 1] = g * shadeF; img.data[i * 4 + 2] = b * shadeF; img.data[i * 4 + 3] = keepAlpha ? a : 255;
    }
    const tmp = document.createElement('canvas');
    tmp.width = N; tmp.height = N;
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, x, y, size, size);
  }

  /**
   * Resource-pack support: replace the painted pixels of the given tiles with pack art (already
   * downsampled to 16x16 and tinted where the source is a grayscale Minecraft texture). Icons,
   * held blocks and the world mesh all read from these arrays, so one write updates everything.
   * Returns how many tiles were replaced (the original pixels are kept for resetTiles()).
   */
  private originals = new Map<number, Uint8ClampedArray>();
  applyTileOverrides(overrides: Map<number, HTMLCanvasElement>): number {
    let n = 0;
    for (const [t, cv] of overrides) {
      if (t < 0 || t >= this.tiles.length) continue;
      if (!this.originals.has(t)) this.originals.set(t, new Uint8ClampedArray(this.tiles[t]));
      const ctx2d = cv.getContext('2d')!;
      const src = ctx2d.getImageData(0, 0, N, N).data;
      const tile = this.tiles[t];
      tile.set(src);
      const col = t % ATLAS_COLS, row = Math.floor(t / ATLAS_COLS);
      let r = 0, g = 0, b = 0, cnt = 0;
      for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
        const si = (py * N + px) * 4;
        const ax = col * N + px, ay = row * N + (N - 1 - py);
        const di = (ay * this.width + ax) * 4;
        this.data[di] = tile[si]; this.data[di + 1] = tile[si + 1]; this.data[di + 2] = tile[si + 2]; this.data[di + 3] = tile[si + 3];
        if (tile[si + 3] > 0) { r += tile[si]; g += tile[si + 1]; b += tile[si + 2]; cnt++; }
      }
      this.avg[t * 3] = cnt ? r / cnt / 255 : 0; this.avg[t * 3 + 1] = cnt ? g / cnt / 255 : 0; this.avg[t * 3 + 2] = cnt ? b / cnt / 255 : 0;
      n++;
    }
    this.texture.needsUpdate = true;
    return n;
  }

  /** Restore every overridden tile to FABLE's built-in painted art. */
  resetTiles(): void {
    if (!this.originals.size) return;
    const map = new Map<number, HTMLCanvasElement>();
    this.applyTileOverrides(map); // no-op pass, just to keep texture flag symmetric
    for (const [t, original] of this.originals) {
      this.tiles[t].set(original);
      const col = t % ATLAS_COLS, row = Math.floor(t / ATLAS_COLS);
      let r = 0, g = 0, b = 0, cnt = 0;
      for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
        const si = (py * N + px) * 4;
        const ax = col * N + px, ay = row * N + (N - 1 - py);
        const di = (ay * this.width + ax) * 4;
        this.data[di] = original[si]; this.data[di + 1] = original[si + 1]; this.data[di + 2] = original[si + 2]; this.data[di + 3] = original[si + 3];
        if (original[si + 3] > 0) { r += original[si]; g += original[si + 1]; b += original[si + 2]; cnt++; }
      }
      this.avg[t * 3] = cnt ? r / cnt / 255 : 0; this.avg[t * 3 + 1] = cnt ? g / cnt / 255 : 0; this.avg[t * 3 + 2] = cnt ? b / cnt / 255 : 0;
    }
    this.originals.clear();
    this.texture.needsUpdate = true;
  }

  tileColor(t: number): [number, number, number] {
    return [this.avg[t * 3], this.avg[t * 3 + 1], this.avg[t * 3 + 2]];
  }

  crackTile(stage: number): number {
    return T.crack_0 + Math.max(0, Math.min(9, stage));
  }
}

let atlasInstance: TextureAtlas | null = null;
export function getAtlas(): TextureAtlas {
  if (!atlasInstance) atlasInstance = new TextureAtlas();
  return atlasInstance;
}
