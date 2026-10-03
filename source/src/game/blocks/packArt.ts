/**
 * The pixel-art engine behind FABLE's free resource packs.
 *
 * Every free pack used to be a handful of textures (8-10 blocks) painted with one flat speckle, so
 * installing one left the world a patchwork of two art styles and the "new" textures read as a
 * colour cast rather than new art. This module fixes the two sides of that problem:
 *
 *  - **Coverage.** A pack paints a whole material family (every stone, soil, wood, ore, plant and
 *    container tile the world actually shows), so the moment it is installed the world is
 *    *entirely* the pack's art instead of built-in art with a few swapped tiles in it.
 *  - **New art, not a tint.** Each pack owns its own painters — a moss that creeps along the
 *    mortar, gem clusters with specular highlights, ordered-dither pastel ramps — rather than the
 *    same texture multiplied by another colour.
 *
 * Colour-space rules (this is what made the old packs look worse than the built-in art):
 *  - FABLE multiplies a tile by the biome colour in the world and in the item icons when a pixel's
 *    alpha is `TINT_A`. Tinted tiles (grass, leaves, tall grass, ferns) are therefore painted in
 *    *neutral greys* and flagged with `TINT_A`, exactly like the built-in tiles: the biome, not the
 *    pack, decides the hue, and the pack decides the structure.
 *  - Everything else is painted opaque, in full colour.
 */
export type RGB = [number, number, number];
export type Col = RGB | [number, number, number, number];

export const N = 16;
/** alpha flag meaning "multiply this pixel by the biome tint" (see TextureAtlas.drawTile) */
export const TINT_A = 128;

export const rgb = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
export const shade = (c: RGB, f: number): RGB => [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)];
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** quantise 0..1 into n steps */
export const q = (v: number, n: number): number => Math.max(0, Math.min(n - 1, Math.floor(v * n)));
/** n shades of `base` from factor lo to hi */
export const ramp = (base: RGB, lo: number, hi: number, n: number): RGB[] =>
  Array.from({ length: n }, (_, i) => shade(base, lo + (hi - lo) * (i / (n - 1))));
const gray = (v: number, a = 255): [number, number, number, number] => [v, v, v, a];
const wrap = (v: number): number => ((v % N) + N) % N;

/** 4x4 Bayer matrix / 16 — the ordered dither Cloudsoft shades with. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** A 16x16 painting surface with deterministic hashing and noise. */
export class S {
  readonly px = new Uint8ClampedArray(N * N * 4);
  private rs: number;
  constructor(private readonly seed: number) {
    this.rs = (Math.imul(seed, 0x9e3779b1) ^ 0x85ebca6b) >>> 0;
  }
  /** deterministic 0..1 from a coordinate (stable regardless of drawing order) */
  hash(x: number, y: number, salt = 0): number {
    let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(this.seed + salt * 7919, 0x9e3779b1)) >>> 0;
    h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  rnd(): number {
    this.rs = (Math.imul(this.rs, 1664525) + 1013904223) >>> 0;
    return this.rs / 4294967296;
  }
  ri(n: number): number {
    return Math.floor(this.rnd() * n);
  }
  set(x: number, y: number, c: Col): void {
    const X = wrap(x), Y = wrap(y);
    const i = (Y * N + X) * 4;
    this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2]; this.px[i + 3] = c.length === 4 ? c[3] : 255;
  }
  get(x: number, y: number): [number, number, number, number] {
    const i = (wrap(y) * N + wrap(x)) * 4;
    return [this.px[i], this.px[i + 1], this.px[i + 2], this.px[i + 3]];
  }
  each(fn: (x: number, y: number) => Col | null): void {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const c = fn(x, y); if (c) this.set(x, y, c); }
  }
  fill(c: Col): void {
    this.each(() => c);
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: Col): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c);
  }
  /** multiply every opaque pixel by `f` */
  shadeAll(f: number): void {
    this.each((x, y) => {
      const p = this.get(x, y);
      if (!p[3]) return null;
      return [Math.min(255, p[0] * f), Math.min(255, p[1] * f), Math.min(255, p[2] * f), p[3]];
    });
  }
  /** tileable value noise in 0..1 (cells wrap, so the tile edges match) */
  vn(x: number, y: number, scale: number, salt = 0): number {
    const cells = Math.max(1, Math.round(N / scale));
    const fx = x / scale, fy = y / scale;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const h = (a: number, b: number) => this.hash(((a % cells) + cells) % cells, ((b % cells) + cells) % cells, salt);
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * sx;
    const b = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  }
  /** two octaves of vn, biased to the middle — organic blobs instead of per-pixel static */
  blob(x: number, y: number, scale: number, salt = 0): number {
    return Math.min(0.999, Math.max(0, this.vn(x, y, scale, salt) * 0.7 + this.vn(x + 3, y + 5, scale / 2, salt + 1) * 0.3));
  }
}

// ------------------------------------------------------------------ shared material painters

/** Quantised blob fill: the base of every natural material in these packs. */
export function blobFill(s: S, pal: RGB[], scale: number, salt = 0, alpha = 255): void {
  s.each((x, y) => {
    const c = pal[q(s.blob(x, y, scale, salt), pal.length)];
    return alpha === 255 ? c : [c[0], c[1], c[2], alpha];
  });
}

/** Sparse 1px specks over the current pixels — flat pixel-art dressing, not noise. */
export function speck(s: S, dark: RGB, light: RGB, darkP = 0.12, lightP = 0.08, salt = 0): void {
  s.each((x, y) => {
    const h = s.hash(x, y, salt);
    if (h < darkP) return dark;
    if (h > 1 - lightP) return light;
    return null;
  });
}

/** Cracks: short runs of `col` with a light lip on the pixel below each crack pixel. */
export function cracks(s: S, col: RGB, count: number, len: number, salt = 0): void {
  for (let k = 0; k < count; k++) {
    let x = 1 + Math.floor(s.hash(k, salt, 3) * (N - 2));
    let y = 1 + Math.floor(s.hash(salt, k, 5) * (N - 2));
    const horiz = s.hash(k, k + salt, 7) > 0.5;
    const n = len + Math.floor(s.hash(k, salt + 1, 9) * 3);
    for (let i = 0; i < n; i++) {
      s.set(x, y, col);
      const below = s.get(horiz ? x : x + 1, horiz ? y + 1 : y);
      if (below[3] === 255) s.set(horiz ? x : x + 1, horiz ? y + 1 : y, shade([below[0], below[1], below[2]], 1.14));
      if (horiz) { x++; if (s.hash(i, k, salt + 4) < 0.3) y += s.hash(i, k, salt + 6) < 0.5 ? 1 : -1; }
      else { y++; if (s.hash(i, k, salt + 4) < 0.3) x += s.hash(i, k, salt + 6) < 0.5 ? 1 : -1; }
    }
  }
}

/**
 * Bevel every pixel `inside` the region: light where it faces up/left, dark where it faces
 * down/right. This is the single trick that makes 16px art read as a solid object.
 */
export function bevel(s: S, inside: (x: number, y: number) => boolean, light = 1.16, dark = 0.78): void {
  const copy: [number, number, number, number][] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) copy.push(s.get(x, y));
  const get = (x: number, y: number) => copy[wrap(y) * N + wrap(x)];
  s.each((x, y) => {
    if (!inside(x, y)) return null;
    const up = inside(x, wrap(y - 1)), left = inside(wrap(x - 1), y);
    const down = inside(x, wrap(y + 1)), right = inside(wrap(x + 1), y);
    const p = get(x, y);
    if (!up || !left) return shade([p[0], p[1], p[2]], light);
    if (!down || !right) return shade([p[0], p[1], p[2]], dark);
    return null;
  });
}

/** Stone: blobby plates, bevels along every step, a few pebble lumps and cracks. */
export function stoneField(s: S, base: RGB, opts: { blotch?: number; pebbles?: number; cracks?: number; salt?: number } = {}): void {
  const salt = opts.salt ?? 0;
  const pal = ramp(base, 0.78, 1.14, 6);
  const idx = (x: number, y: number) => q(s.blob(x, y, 4 + (opts.blotch ?? 0.3) * 4, salt), 5);
  s.each((x, y) => pal[idx(x, y)]);
  // rim light on the high side of each plateau step, shadow on the low side
  s.each((x, y) => {
    const i = idx(x, y);
    if (idx(x, y - 1) < i || idx(x - 1, y) < i) return pal[Math.min(5, i + 2)];
    if (idx(x, y + 1) < i || idx(x + 1, y) < i) return pal[Math.max(0, i - 2)];
    return null;
  });
  for (let i = 0; i < (opts.pebbles ?? 3); i++) {
    const cx = s.ri(N), cy = s.ri(N), w = 1.2 + s.rnd() * 1.5, h = 0.9 + s.rnd() * 1.1;
    const inside = (x: number, y: number) => {
      const dx = wrap(x) - cx, dy = wrap(y) - cy;
      return (dx * dx) / (w * w) + (dy * dy) / (h * h) <= 1;
    };
    for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) if (inside(x, y)) s.set(x, y, pal[3]);
    bevel(s, inside, 1.18, 0.74);
  }
  if (opts.cracks) cracks(s, pal[0], opts.cracks, 3, salt + 2);
  speck(s, pal[0], pal[5], 0.05, 0.05, salt + 3);
}

/** Cobblestone: Voronoi cells with deep mortar gaps and an optional moss creeping in the gaps. */
export function cobbleField(s: S, base: RGB, opts: { moss?: RGB; mossP?: number; scatter?: number; cells?: number; salt?: number } = {}): void {
  const salt = opts.salt ?? 0;
  const pal = ramp(base, 0.74, 1.16, 6);
  const seeds: [number, number, number][] = [];
  const count = opts.cells ?? 9;
  for (let i = 0; i < count; i++) seeds.push([s.hash(i, 1, salt) * N, s.hash(i, 2, salt) * N, 1 + Math.floor(s.hash(i, 3, salt) * 3)]);
  const owner = new Array<number>(N * N).fill(-1);
  const gap = new Array<boolean>(N * N).fill(false);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let d1 = 1e9, d2 = 1e9, who = 0;
    seeds.forEach(([sx, sy, tone], si) => {
      for (let wx = -16; wx <= 16; wx += 16) for (let wy = -16; wy <= 16; wy += 16) {
        const dx = sx + wx - x - 0.5, dy = sy + wy - y - 0.5;
        const d = Math.abs(dx) + Math.abs(dy) * 0.92;
        if (d < d1) { d2 = d1; d1 = d; who = si; } else if (d < d2) d2 = d;
      }
      void tone;
    });
    owner[y * N + x] = who; gap[y * N + x] = d2 - d1 < 1.05;
  }
  const isGap = (x: number, y: number) => gap[wrap(y) * N + wrap(x)];
  s.each((x, y) => {
    if (isGap(x, y)) return [46, 44, 42];
    return pal[1 + seeds[owner[y * N + x]][2]];
  });
  bevel(s, (x, y) => !isGap(x, y), 1.2, 0.72);
  // chipped corners keep the cells from looking extruded
  for (let i = 0; i < 6; i++) {
    const x = s.ri(N), y = s.ri(N);
    if (!isGap(x, y)) s.set(x, y, pal[0]);
  }
  if (opts.moss) {
    const m = s.vn(3, 7, 5, salt + 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const nearGap = isGap(x, y) || isGap(x, y - 1) || isGap(x - 1, y) || isGap(x, y + 1) || isGap(x + 1, y);
      const v = s.blob(x, y, 4, salt + 5) + m * 0.25;
      const scatterP = opts.scatter ?? 0;
      if ((nearGap || s.hash(x + 31, y + 17, salt + 7) < scatterP) && v > (opts.mossP ?? 0.55)) {
        s.set(x, y, shade(opts.moss, 0.82 + s.hash(x, y, salt + 6) * 0.4));
      }
    }
  }
}

/** Planks: staggered boards with a light top edge, a dark seam, nail heads and optional knots. */
export function plankField(s: S, base: RGB, opts: { rows?: number; nails?: boolean; knots?: boolean; weather?: number; salt?: number } = {}): void {
  const salt = opts.salt ?? 0;
  const rows = opts.rows ?? 4;
  const rh = Math.floor(N / rows);
  const pal = ramp(base, 0.6, 1.12, 6);
  for (let r = 0; r < rows; r++) {
    const y0 = r * rh;
    const joint = Math.floor(s.hash(r, 5, salt) * (N - 6)) + 3;
    for (let x = 0; x < N; x++) {
      for (let i = 0; i < rh; i++) {
        const y = y0 + i;
        const seam = i === rh - 1 || (i === rh - 1);
        if (seam) { s.set(x, y, pal[1]); continue; }
        if (i === 0) { s.set(x, y, pal[4]); continue; }
        if (i === rh - 2) { s.set(x, y, pal[1]); continue; }
        const grain = s.vn(x * 0.5, y * 3 + r * 9, 4, salt + r) > 0.62;
        s.set(x, y, grain ? pal[2] : i === 1 ? pal[5] : pal[3]);
      }
      if (x === joint) for (let i = 0; i < rh - 1; i++) s.set(x, y0 + i, pal[0]);
    }
    if (opts.nails) {
      // one softened nail head per board end: dark studs on every row read as stripes when tiled
      s.set(wrap(joint + 1), y0 + 1, pal[1]);
      s.set(wrap(joint - 2), y0 + 1, pal[2]);
    }
    if (opts.knots && s.hash(r, 11, salt) > 0.45) {
      const kx = wrap(joint + 3 + Math.floor(s.hash(r, 13, salt) * 4));
      s.set(kx, y0 + 1, pal[1]); s.set(kx + 1, y0 + 1, pal[2]); s.set(kx, y0 + 2, pal[1]); s.set(kx + 1, y0 + 2, pal[0]);
    }
  }
  // weathered edge: a couple of worn pixels along the top board
  if (opts.weather) {
    for (let i = 0; i < 8 * opts.weather; i++) {
      const x = s.ri(N), y = s.ri(N);
      s.set(x, y, shade([...s.get(x, y).slice(0, 3)] as RGB, 1.12));
    }
  }
}

/** Bark: vertical ridges, a groove between them, and knots. */
export function barkField(s: S, base: RGB, opts: { knots?: boolean; salt?: number } = {}): void {
  const salt = opts.salt ?? 0;
  const pal = ramp(base, 0.66, 1.18, 6);
  const widths: number[] = [];
  let total = 0;
  while (total < N) {
    const wdt = 2 + Math.floor(s.hash(total, 3, salt) * 3);
    widths.push(wdt);
    total += wdt;
  }
  let x = 0;
  for (let wi = 0; wi < widths.length && x < N; wi++) {
    const wdt = widths[wi];
    const tone = 2 + Math.floor(s.hash(wi, 7, salt) * 3);
    for (let i = 0; i < wdt && x < N; i++, x++) {
      for (let y = 0; y < N; y++) {
        const wobble = s.hash(x + Math.floor(s.vn(x, y, 5, salt) * 2), y, salt + 1) > 0.72 ? -1 : 0;
        let t = tone + wobble;
        if (i === 0) t += 1;
        if (i === wdt - 1) t = 0;
        s.set(x, y, pal[Math.max(0, Math.min(5, t))]);
      }
    }
  }
  if (opts.knots) {
    const kx = 3 + Math.floor(s.hash(1, 2, salt) * 9), ky = 3 + Math.floor(s.hash(2, 1, salt) * 9);
    s.set(kx, ky, pal[0]); s.set(kx + 1, ky, pal[0]); s.set(kx, ky + 1, pal[1]); s.set(kx + 1, ky + 1, pal[2]);
  }
  speck(s, pal[0], pal[5], 0.06, 0.05, salt + 9);
}

/** Log ends: bark ring, growth rings spiralling around a pith. */
export function ringField(s: S, bark: RGB, ring: RGB, wood: RGB, core: RGB): void {
  const b = ramp(bark, 0.78, 1.12, 4);
  const r = ramp(ring, 0.8, 1.14, 5);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x - 7.5, dy = y - 7.5;
    const md = Math.max(Math.abs(dx), Math.abs(dy));
    const d = Math.hypot(dx, dy);
    if (md > 6.6) { s.set(x, y, b[q(s.vn(x, y, 3), 4)]); continue; }
    if (md > 5.6) { s.set(x, y, b[0]); continue; }
    const ang = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2);
    const band = Math.floor(d + ang * 1.4) % 3;
    s.set(x, y, band === 0 ? r[1] : band === 1 ? r[4] : mix(wood, r[3], 0.5));
  }
  s.rect(7, 7, 8, 8, r[0]);
  bevel(s, (x, y) => Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) <= 5.6, 1.1, 0.86);
}

/**
 * Leaves: a neutral (tint-flagged) canopy. `tone` sets the light level so birch reads paler than
 * dark oak, `holes` how open the canopy is. Cutouts stay off the tile border so stacked leaf blocks
 * cannot line their gaps up into a seam.
 */
export function canopyField(s: S, tone: number, holes: number, salt = 0): void {
  const tones = [tone - 26, tone - 8, tone + 10, tone + 24].map((v) => Math.max(24, Math.min(224, v)));
  s.each((x, y) => {
    const n = s.blob(x, y, 2.6, salt);
    const t = q(n, 4);
    const fine = s.hash(x, y, salt + 1);
    return gray(tones[fine > 0.82 ? Math.min(3, t + 1) : t], TINT_A);
  });
  // clusters: a 2px highlight with a dark pixel under it, so the canopy has depth
  for (let i = 0; i < 10; i++) {
    const x = s.ri(N), y = s.ri(N);
    s.set(x, y, gray(tones[3], TINT_A));
    s.set(x + 1, y, gray(tones[2], TINT_A));
    s.set(x, y + 1, gray(tones[0], TINT_A));
  }
  const count = Math.round(holes * 24);
  for (let i = 0; i < count; i++) {
    const x = 1 + Math.floor(s.hash(i, 21, salt) * (N - 2));
    const y = 1 + Math.floor(s.hash(21, i, salt) * (N - 2));
    s.set(x, y, [0, 0, 0, 0]);
    if (s.hash(i, 5, salt) < 0.35) s.set(x + (s.hash(i, 9, salt) < 0.5 ? 1 : -1), y, [0, 0, 0, 0]);
    else if (s.hash(i, 7, salt) < 0.25) s.set(x, y + 1, [0, 0, 0, 0]);
  }
}

/**
 * Grass-block top: neutral tufts, every pixel tint-flagged so the biome colours it. The three
 * styles are what separate the packs once the biome tint is applied: tufty (Mossweave) grows
 * clumps, speckled (Gilded) is a busier, drier mat, soft (Cloudsoft) is an even lit lawn.
 */
export function grassTopField(s: S, salt = 0, style: 'tufty' | 'speckled' | 'soft' = 'tufty'): void {
  const shades = style === 'soft' ? [176, 186, 196, 206] : [150, 166, 182, 198];
  s.each((x, y) => {
    const scale = style === 'soft' ? 4.4 : style === 'speckled' ? 2.2 : 2.8;
    const t = q(s.blob(x, y, scale, salt), 4);
    const v = s.vn(x, y, style === 'speckled' ? 3.5 : 6, salt + 3);
    return gray(shades[Math.min(3, Math.max(0, t + (v > 0.78 ? 1 : v < 0.26 ? -1 : 0)))], TINT_A);
  });
  if (style === 'speckled') {
    for (let i = 0; i < 40; i++) s.set(s.ri(N), s.ri(N), gray(120, TINT_A));
    for (let i = 0; i < 26; i++) s.set(s.ri(N), s.ri(N), gray(216, TINT_A));
    for (let i = 0; i < 5; i++) { const x = s.ri(N), y = s.ri(N); s.set(x, y, gray(230, TINT_A)); s.set(x + 1, y + 1, gray(126, TINT_A)); }
  } else if (style === 'soft') {
    for (let i = 0; i < 14; i++) s.set(s.ri(N), s.ri(N), gray(212, TINT_A));
    for (let i = 0; i < 8; i++) { const x = s.ri(N), y = s.ri(N); s.set(x, y, gray(222, TINT_A)); s.set(x + 1, y, gray(200, TINT_A)); }
  } else {
    for (let i = 0; i < 26; i++) s.set(s.ri(N), s.ri(N), gray(126, TINT_A));
    for (let i = 0; i < 18; i++) s.set(s.ri(N), s.ri(N), gray(212, TINT_A));
    for (let i = 0; i < 11; i++) {
      const x = s.ri(N), y = s.ri(N);
      s.set(x, y, gray(226, TINT_A));
      s.set(x + 1, y + 1, gray(132, TINT_A));
      if (s.rnd() < 0.5) s.set(x, y + 1, gray(176, TINT_A));
    }
  }
}

/** Grass side: a grown, wobbling overhang over the pack's soil. */
export function grassSideField(s: S, snow: boolean, soil: (s: S) => void, salt = 0): void {
  soil(s);
  const pal = snow ? [232, 244, 255, 255] : [168, 186, 202, 222];
  const lo = snow ? 2 : 3, hi = snow ? 4 : 6;
  const edges: number[] = [];
  for (let x = 0; x < N; x++) edges.push(lo + Math.floor(s.hash(x, 99, salt) * (hi - lo + 1)));
  for (let pass = 0; pass < 3; pass++) {
    for (let x = 0; x < N; x++) { const l = edges[wrap(x - 1)]; edges[x] = Math.max(l - 1, Math.min(l + 1, edges[x])); }
    for (let x = N - 1; x >= 0; x--) { const r = edges[wrap(x + 1)]; edges[x] = Math.max(r - 1, Math.min(r + 1, edges[x])); }
  }
  for (let x = 0; x < N; x++) if (s.hash(x, 55, salt) < 0.18) edges[x] = Math.max(1, edges[x] - 1);
  for (let x = 0; x < N; x++) {
    const edge = edges[x];
    for (let y = 0; y < edge; y++) {
      const streak = s.hash(x, 33, salt) < 0.2 && y > 0 && y < edge - 1;
      const t = y === edge - 1 ? 0 : q(s.blob(x, y, 3, salt + 2), 3) + 1;
      s.set(x, y, gray(pal[streak ? 0 : t], snow ? 255 : TINT_A));
    }
    s.set(x, edge, shade([...s.get(x, edge).slice(0, 3)] as RGB, 0.68));
  }
}

/** Ore: a run of faceted nuggets inside the pack's stone, optional specular sparkle. */
export function oreField(s: S, gem: RGB, opts: { stone: (s: S) => void; count?: number; big?: number; sparkle?: boolean; salt?: number } = { stone: () => undefined }): void {
  const salt = opts.salt ?? 0;
  opts.stone(s);
  const pal: RGB[] = [shade(gem, 0.42), shade(gem, 0.68), gem, shade(gem, 1.22), mix(gem, [255, 255, 255], 0.62)];
  const count = opts.count ?? 7;
  for (let i = 0; i < count; i++) {
    const x = 2 + Math.floor(s.hash(i, 3, salt) * 12);
    const y = 2 + Math.floor(s.hash(3, i, salt) * 12);
    const big = s.hash(i, i, salt) < (opts.big ?? 0.55);
    s.set(x, y, pal[4]); s.set(x + 1, y, pal[3]); s.set(x, y + 1, pal[2]); s.set(x + 1, y + 1, pal[1]);
    if (big) {
      s.set(x + 2, y, pal[3]); s.set(x + 2, y + 1, pal[2]); s.set(x + 1, y + 2, pal[2]); s.set(x + 2, y + 2, pal[1]); s.set(x, y + 2, pal[1]);
      s.set(x + 2, y + 3, pal[0]); s.set(x + 1, y + 3, pal[1]);
    }
    // occlusion ring so the gem sits *in* the rock
    const ring: [number, number][] = [[x - 1, y], [x, y - 1], [x + (big ? 3 : 2), y + 1], [x + 1, y + (big ? 3 : 2)]];
    for (const [rx, ry] of ring) {
      const p = s.get(rx, ry);
      if (p[3] === 255) s.set(rx, ry, shade([p[0], p[1], p[2]], 0.72));
    }
  }
  if (opts.sparkle) for (let i = 0; i < 5; i++) s.set(s.ri(N), s.ri(N), [255, 255, 255, 220]);
}

/** Ordered-dither fill (Cloudsoft): soft ramps with a visible 4x4 weave instead of random static. */
export function ditherFill(s: S, pal: RGB[], scale: number, salt = 0, alpha = 255): void {
  s.each((x, y) => {
    const v = s.blob(x, y, scale, salt) * 0.85 + BAYER[(y % 4) * 4 + (x % 4)] * 0.15;
    const c = pal[q(v, pal.length)];
    return alpha === 255 ? c : [c[0], c[1], c[2], alpha];
  });
}

/** Woven cloth: 2x2 basket weave with a soft thread highlight. */
export function weaveField(s: S, base: RGB, salt = 0): void {
  const pal = ramp(base, 0.86, 1.08, 4);
  s.each((x, y) => {
    const over = ((x >> 1) + (y >> 1)) % 2;
    const thread = (over ? x : y) % 2 === 0;
    const edge = (x % 2 === 1 && y % 2 === 1) ? 1 : 0;
    const i = 1 + (thread ? 2 : 0) + edge + (s.hash(x, y, salt) > 0.9 ? -1 : 0);
    return pal[Math.max(0, Math.min(3, i))];
  });
}

/** A plant sprite drawn as a cross (transparent background), neutral + tint-flagged. */
export function plantField(s: S, kind: 'grass' | 'fern', salt = 0): void {
  s.fill([0, 0, 0, 0]);
  if (kind === 'grass') {
    for (let i = 0; i < 11; i++) {
      const x = 1 + Math.floor(s.hash(i, 2, salt) * 14);
      const h = 6 + Math.floor(s.hash(3, i, salt) * 9);
      const lean = s.hash(i, 4, salt) < 0.5 ? 1 : -1;
      for (let y = 15; y > 15 - h; y--) {
        const bend = y < 15 - h + 4 ? lean : 0;
        const tone = y > 15 - h + 3 ? 150 : 190 + Math.floor(s.hash(x, y, salt) * 30);
        s.set(x + bend, y, gray(Math.max(110, tone), TINT_A));
      }
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const dir = i % 2 ? 1 : -1;
      for (let step = 0; step < 8; step++) {
        const x = 7 + dir * step, y = 14 - i * 2 - Math.floor(step * 0.7);
        s.set(x, y, gray(158, TINT_A));
        if (step % 2) s.set(x, y - 1, gray(196, TINT_A));
      }
    }
    s.rect(7, 4, 8, 15, gray(146, TINT_A));
    s.rect(7, 4, 7, 15, gray(180, TINT_A));
  }
}

/** Glass: a frame, a diagonal highlight and a faint tint, no fill. */
export function glassField(s: S, tint: RGB): void {
  s.fill([0, 0, 0, 0]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    const streak = x + y === 5 || x + y === 6 || x + y === 19 || x + y === 20;
    if (edge) s.set(x, y, mix(tint, [255, 255, 255], 0.55));
    else if (streak) s.set(x, y, [255, 255, 255, 118]);
    else if (s.hash(x, y, 4) > 0.94) s.set(x, y, [255, 255, 255, 40]);
  }
}

/** Loose soil / sand / gravel / snow: quantised blobs plus a coarse grain overlay. */
export function grainField(s: S, base: RGB, opts: { scale?: number; dark?: number; light?: number; lumps?: number; grainP?: number; salt?: number } = {}): void {
  const salt = opts.salt ?? 0;
  const pal = ramp(base, opts.dark ?? 0.72, opts.light ?? 1.12, 6);
  s.each((x, y) => pal[q(s.blob(x, y, opts.scale ?? 3, salt), 6)]);
  const lumps = opts.lumps ?? 4;
  for (let i = 0; i < lumps; i++) {
    const cx = s.ri(N), cy = s.ri(N);
    const inside = (x: number, y: number) => ((wrap(x) - cx) ** 2) / 4 + ((wrap(y) - cy) ** 2) / 2.6 <= 1;
    for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) if (inside(x, y)) s.set(x, y, pal[4]);
    bevel(s, inside, 1.14, 0.8);
  }
  speck(s, pal[0], pal[5], opts.grainP ?? 0.1, opts.grainP ?? 0.1, salt + 1);
}

/** Water: two crossing swells with foam on the crests. */
export function waterField(s: S, base: RGB): void {
  const pal = ramp(base, 0.7, 1.2, 6);
  const swell = (x: number, y: number) => {
    const u = (x + 0.5) / N, v = (y + 0.5) / N;
    const a = Math.sin((u * 1 + v * 2) * Math.PI * 2) * 0.5 + 0.5;
    const b = Math.sin((u * 2 - v) * Math.PI * 2 + 2.3) * 0.5 + 0.5;
    return a * 0.5 + b * 0.5;
  };
  s.each((x, y) => pal[q(Math.min(0.999, swell(x, y) * 0.45 + s.blob(x, y, 6, 2) * 0.55), 6)]);
  s.each((x, y) => (swell(x, y) > 0.92 && s.vn(x, y, 5, 2) > 0.6 && s.hash(x, y, 3) > 0.4 ? mix(base, [255, 255, 255], 0.72) : null));
}

/** Ice: pale plates with bright fracture lines. */
export function iceField(s: S, base: RGB): void {
  const pal = ramp(base, 0.88, 1.08, 5);
  blobFill(s, pal, 5);
  cracks(s, mix(base, [255, 255, 255], 0.7), 3, 4, 3);
  cracks(s, shade(base, 0.72), 2, 3, 8);
}

/** Brick wall: staggered bricks, recessed mortar, chipped corners. */
export function brickField(s: S, brick: RGB, mortar: RGB, opts: { bw?: number; bh?: number; salt?: number } = {}): void {
  const salt = opts.salt ?? 0;
  const bw = opts.bw ?? 8, bh = opts.bh ?? 4;
  const pal = ramp(brick, 0.8, 1.16, 5);
  const isMortar = (x: number, y: number) => {
    const row = Math.floor(wrap(y) / bh);
    const off = (row % 2) * (bw / 2);
    return (wrap(x) + off) % bw === 0 || wrap(y) % bh === bh - 1;
  };
  s.each((x, y) => {
    if (isMortar(x, y)) return mortar;
    const row = Math.floor(y / bh);
    const off = (row % 2) * (bw / 2);
    const id = Math.floor((x + off) / bw) * 3 + row;
    const i = 1 + q(s.hash(id, 77, salt), 4);
    if (s.hash(x, y, salt + 1) < 0.06) return pal[0];
    return pal[Math.min(4, i)];
  });
  bevel(s, (x, y) => !isMortar(x, y), 1.12, 0.82);
}

/** Farmland: soil with shallow furrows every 4 rows and darker troughs. */
export function farmlandField(s: S, soil: RGB, salt = 0): void {
  grainField(s, soil, { scale: 3, lumps: 2, salt });
  for (let y = 0; y < N; y++) if (y % 4 === 1) for (let x = 0; x < N; x++) s.set(x, y, shade(soil, 0.52));
  for (let y = 0; y < N; y++) if (y % 4 === 2) for (let x = 0; x < N; x++) s.set(x, y, shade([...s.get(x, y).slice(0, 3)] as RGB, 0.9));
}

/** Cactus: vertical ribs with a highlight column and spines. */
export function cactusField(s: S, base: RGB, top: boolean): void {
  s.fill([0, 0, 0, 0]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (top) {
      if (x === 0 || x === 15 || y === 0 || y === 15) { s.set(x, y, shade(base, 0.72)); continue; }
      const d = Math.hypot(x - 7.5, y - 7.5);
      s.set(x, y, shade(base, d > 6 ? 0.84 : 1 + (d < 4 ? 0.08 : 0)));
      continue;
    }
    if (x === 0 || x === 15) { s.set(x, y, shade(base, 0.66)); continue; }
    const rib = x % 4;
    s.set(x, y, shade(base, rib === 2 ? 0.8 : rib === 3 ? 1.08 : 1 + s.hash(x, y, 5) * 0.05));
    if (x % 8 === 4 && y % 5 === 2) s.set(x, y, mix(base, [255, 255, 255], 0.55));
  }
}

/** A plant sprite family: flowers, mushrooms, dead bushes, reeds. */
export function spriteField(s: S, kind: 'flower' | 'mushroom' | 'bush' | 'reeds', pal: RGB[], salt = 0): void {
  s.fill([0, 0, 0, 0]);
  if (kind === 'flower') {
    const [petal, center, stem] = pal;
    for (let y = 8; y < 16; y++) s.set(7, y, y % 3 === 0 ? shade(stem, 0.8) : stem);
    s.set(8, 12, shade(stem, 1.15)); s.set(5, 11, shade(stem, 1.05)); s.set(10, 10, shade(stem, 1.05));
    for (let y = 3; y <= 7; y++) for (let x = 5; x <= 10; x++) {
      const dx = x - 7.5, dy = y - 5;
      const r = Math.hypot(dx, dy * 1.15);
      if (r > 3.4) continue;
      if (r < 1.15) { s.set(x, y, center); continue; }
      s.set(x, y, dx + dy < 0 ? shade(petal, 1.12) : shade(petal, 0.86));
    }
    s.set(7, 5, mix(center, [255, 255, 255], 0.5));
  } else if (kind === 'mushroom') {
    const [cap, dot] = pal;
    for (let y = 9; y < 15; y++) { s.set(7, y, shade([230, 224, 200], 0.86)); s.set(8, y, [230, 224, 200]); }
    for (let y = 5; y <= 9; y++) for (let x = 4; x <= 11; x++) {
      if (y === 5 && (x < 6 || x > 9)) continue;
      if (y === 9 && (x < 5 || x > 10)) continue;
      const dotted = dot && s.hash(x, y, salt) > 0.78;
      s.set(x, y, dotted ? [246, 240, 232] : shade(cap, y <= 6 ? 1.1 : 0.86));
    }
    s.set(6, 6, shade(cap, 1.25));
  } else if (kind === 'bush') {
    const [twig, tip] = pal;
    s.rect(7, 8, 8, 15, twig);
    for (let i = 0; i < 6; i++) {
      const x = 3 + Math.floor(s.hash(i, 3, salt) * 10);
      const y = 4 + Math.floor(s.hash(i, 5, salt) * 7);
      s.set(x, y, tip); s.set(x + 1, y, shade(tip, 0.85)); s.set(x, y + 1, shade(twig, 0.9));
    }
  } else {
    const [stalk, leaf] = pal;
    for (let x = 6; x <= 9; x++) for (let y = 3; y < 16; y++) {
      if (y % 5 === 0) { s.set(x, y, shade(stalk, 0.72)); continue; }
      s.set(x, y, x === 7 ? shade(stalk, 1.14) : stalk);
    }
    s.set(5, 7, leaf); s.set(10, 11, leaf); s.set(5, 13, shade(leaf, 0.85));
  }
}

/** Ribbed gourd: pumpkin / melon sides and tops. */
export function gourdField(s: S, base: RGB, opts: { top?: boolean; watermelon?: boolean; salt?: number } = {}): void {
  const salt = opts.salt ?? 0;
  if (opts.top) {
    s.each((x, y) => {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (opts.watermelon) return shade(base, (Math.floor((Math.atan2(y - 7.5, x - 7.5) + Math.PI) * 3) % 2 ? 0.86 : 1.06) + s.hash(x, y, salt) * 0.05);
      if (d < 2.2) return shade(base, 0.78);
      return shade(base, (d > 6.4 ? 0.8 : 1) + s.hash(x, y, salt) * 0.06);
    });
    return;
  }
  s.each((x, y) => {
    if (opts.watermelon) {
      const stripe = Math.floor(x / 2) % 2 === 0;
      return shade(base, (stripe ? 0.7 : 1.1) + s.hash(x, y, salt) * 0.05);
    }
    const rib = x % 5;
    return shade(base, (rib === 0 ? 0.74 : rib === 1 ? 1.1 : 1) + s.hash(x, y, salt) * 0.06);
  });
  if (!opts.watermelon) { s.rect(0, 0, 15, 0, shade(base, 0.7)); s.rect(0, 15, 15, 15, shade(base, 0.7)); }
}

// ------------------------------------------------------------------ furniture & fittings
// Villages, mines and player builds show far more than terrain: doors, torches, furnaces, chests and
// barrels. Leaving those on built-in art is what makes an installed pack look like a patchwork, so
// every pack paints them too.

/** Smooth planed timber (stripped logs and table tops): long vertical grain, no bark. */
export function strippedField(s: S, base: RGB, salt = 0): void {
  const pal = ramp(base, 0.74, 1.14, 5);
  s.each((x, y) => {
    const g = s.vn(x * 1.6, y * 0.25, 3, salt);
    return pal[q(g, 5)];
  });
  for (let x = 0; x < N; x++) if (s.hash(x, 5, salt) > 0.62) for (let y = 0; y < N; y++) {
    const p = s.get(x, y);
    s.set(x, y, shade([p[0], p[1], p[2]], 0.88));
  }
}

/** Furnace / oven front: a stone face with a dark mouth, optionally lit. */
export function furnaceFrontField(s: S, stone: (s: S) => void, lit: boolean, salt = 0): void {
  stone(s);
  const dark = rgb(0x232326);
  s.rect(3, 6, 12, 14, dark);
  s.rect(4, 7, 11, 13, shade(dark, 0.7));
  s.rect(3, 5, 12, 5, rgb(0x605c58));           // lintel
  s.rect(2, 14, 13, 14, shade(dark, 0.55));
  if (lit) {
    // the whole mouth glows amber with a bright fire bed, so a lit furnace reads at a glance
    for (let x = 4; x <= 11; x++) {
      const h = 3 + Math.floor(s.hash(x, 3, salt) * 4);
      for (let y = 13; y > 13 - h; y--) {
        const t = (13 - y) / 6;
        s.set(x, y, t < 0.25 ? rgb(0xfff0b0) : t < 0.5 ? rgb(0xffc24a) : t < 0.75 ? rgb(0xf2861c) : rgb(0xc04c0c));
      }
    }
    for (let x = 5; x <= 10; x += 2) s.set(x, 12, rgb(0xfff6d0));
    s.set(6, 9, rgb(0xffe07a)); s.set(9, 8, rgb(0xffc84a));
  }
}

/** Chest: planked lid and body with iron bands and a latch (front = latch side). */
export function chestField(s: S, wood: RGB, band: RGB, part: 'top' | 'side' | 'front'): void {
  const pal = ramp(wood, 0.62, 1.12, 5);
  if (part === 'top') {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      s.set(x, y, pal[3 - Math.min(3, Math.floor(y / 4))]);
      if (y % 5 === 4) s.set(x, y, pal[0]);
    }
    s.rect(3, 0, 4, 15, shade(band, 0.9));
    s.rect(11, 0, 12, 15, shade(band, 0.9));
    return;
  }
  // body: two horizontal planks, a band across the middle, iron corners
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const seam = y === 5 || y === 14;
    s.set(x, y, seam ? pal[0] : y < 5 ? pal[3] : y < 14 ? pal[2] : pal[1]);
  }
  s.rect(0, 6, 15, 8, band);
  s.rect(0, 6, 15, 6, shade(band, 1.25));
  s.rect(0, 8, 15, 8, shade(band, 0.7));
  s.rect(0, 0, 0, 15, shade(band, 0.85));
  s.rect(15, 0, 15, 15, shade(band, 0.85));
  if (part === 'front') {
    s.rect(6, 4, 9, 11, shade(band, 1.1));
    s.rect(7, 5, 8, 7, rgb(0xf2d24a));
    s.rect(7, 8, 8, 10, shade(band, 0.8));
  }
}

/** Torch / lantern sprites (transparent background, drawn as a cross). */
export function lightSpriteField(s: S, kind: 'torch' | 'lantern', wood: RGB, flame: RGB, metal: RGB, salt = 0): void {
  s.fill([0, 0, 0, 0]);
  if (kind === 'torch') {
    for (let y = 8; y < 16; y++) { s.set(7, y, wood); s.set(8, y, shade(wood, 0.72)); }
    s.set(7, 8, flame); s.set(8, 8, shade(flame, 0.85));
    s.set(7, 7, mix(flame, [255, 245, 200], 0.6)); s.set(8, 7, flame);
    s.set(7, 6, mix(flame, [255, 255, 255], 0.75)); s.set(8, 6, shade(flame, 1.2));
    s.set(6, 7, shade(flame, 0.8)); s.set(9, 8, shade(flame, 0.7));
    s.set(7, 5, shade(flame, 1.35));
  } else {
    // cage: metal top and bottom with a glowing pane between
    s.rect(5, 3, 10, 4, shade(metal, 1.2));
    s.rect(5, 11, 10, 12, shade(metal, 0.8));
    for (let y = 5; y <= 10; y++) for (let x = 5; x <= 10; x++) {
      const edge = x === 5 || x === 10 || y === 5 || y === 10;
      s.set(x, y, edge ? metal : mix(flame, [255, 255, 255], 0.35 + s.hash(x, y, salt) * 0.3));
    }
    s.set(7, 7, [255, 252, 230]); s.set(8, 8, [255, 248, 210]);
    s.set(6, 2, metal); s.set(9, 2, shade(metal, 0.85));
    s.set(7, 13, shade(metal, 0.8)); s.set(8, 13, shade(metal, 0.7));
  }
}

/** Ladder: two rails and evenly spaced rungs. */
export function ladderField(s: S, wood: RGB, salt = 0): void {
  s.fill([0, 0, 0, 0]);
  const pal = ramp(wood, 0.7, 1.16, 4);
  for (let y = 0; y < N; y++) {
    s.set(1, y, pal[2]); s.set(2, y, pal[1]);
    s.set(13, y, pal[2]); s.set(14, y, pal[1]);
  }
  for (let y = 2; y < N; y += 4) {
    for (let x = 1; x <= 14; x++) s.set(x, y, pal[3]);
    for (let x = 1; x <= 14; x++) s.set(x, y + 1, pal[0]);
    void salt;
  }
}

/** Door / barrel panels: framed boards with a handle. */
export function panelField(s: S, wood: RGB, opts: { bands?: boolean; handle?: boolean; top?: boolean; salt?: number } = {}): void {
  const salt = opts.salt ?? 0;
  plankField(s, wood, { rows: opts.top ? 2 : 3, nails: true, salt });
  const dark = shade(wood, 0.5);
  s.rect(0, opts.top ? 7 : 13, 15, opts.top ? 8 : 15, dark); // meets the other half of the door
  if (opts.bands) {
    const metal = rgb(0x6a6458);
    s.rect(0, 3, 15, 4, metal);
    s.rect(0, 3, 15, 3, shade(metal, 1.3));
    if (!opts.top) s.rect(0, 11, 15, 12, shade(metal, 0.9));
  }
  s.rect(0, 0, 0, 15, shade(wood, 0.62));
  s.rect(15, 0, 15, 15, shade(wood, 0.72));
  if (opts.handle) {
    s.rect(12, 8, 14, 8, rgb(0x8a8378));
    s.rect(12, 9, 14, 9, rgb(0x5c564c));
    s.set(14, 8, rgb(0xc0b8a8));
  }
}

/** Barrel: planked staves hooped with iron. */
export function barrelField(s: S, wood: RGB, top: boolean, salt = 0): void {
  plankField(s, wood, { rows: top ? 4 : 4, nails: false, salt });
  const metal = rgb(0x6a6458);
  if (top) {
    s.rect(2, 2, 13, 13, shade(wood, 1.05));
    s.rect(3, 3, 12, 12, shade(wood, 0.92));
    s.set(7, 7, shade(metal, 0.9)); s.set(8, 8, shade(metal, 0.9));
    s.set(8, 7, shade(metal, 1.1)); s.set(7, 8, shade(metal, 1.1));
    return;
  }
  for (let x = 0; x < N; x++) if (x % 4 === 3) for (let y = 0; y < N; y++) s.set(x, y, shade(wood, 0.6));
  s.rect(0, 1, 15, 2, metal);
  s.rect(0, 1, 15, 1, shade(metal, 1.3));
  s.rect(0, 13, 15, 14, shade(metal, 0.9));
}

/** Crafting table: a marked work surface on top, tool racks on the sides. */
export function tableField(s: S, wood: RGB, part: 'top' | 'side', salt = 0): void {
  if (part === 'top') {
    plankField(s, wood, { rows: 2, nails: false, salt });
    const ink = shade(wood, 0.42);
    for (let i = 3; i <= 12; i++) { s.set(i, 3, ink); s.set(i, 12, ink); s.set(3, i, ink); s.set(12, i, ink); }
    s.rect(7, 3, 8, 12, ink);
    s.rect(3, 7, 12, 8, ink);
    s.set(4, 4, shade(wood, 1.2)); s.set(11, 4, shade(wood, 1.2));
    s.set(4, 11, shade(wood, 1.2)); s.set(11, 11, shade(wood, 1.2));
    return;
  }
  plankField(s, wood, { rows: 3, nails: true, knots: true, salt });
  // tool rack: a saw and a hammer silhouette
  const iron = rgb(0x9a948a);
  s.rect(2, 3, 6, 3, iron); s.rect(2, 4, 2, 6, shade(wood, 0.7));
  s.rect(9, 4, 12, 4, shade(iron, 0.9)); s.rect(10, 5, 11, 8, shade(wood, 0.7));
}

/** Sapling sprite: a stem with a small canopy, drawn as a cross. */
export function saplingField(s: S, leaf: RGB, trunk: RGB, shape: 'round' | 'birch' | 'cone', salt = 0): void {
  s.fill([0, 0, 0, 0]);
  for (let y = 10; y < 15; y++) s.set(7, y, trunk);
  const put = (x: number, y: number, t: number) => { if (s.hash(x, y, salt) > 0.18) s.set(x, y, shade(leaf, 0.78 + t * 0.42)); };
  if (shape === 'round') {
    for (let y = 4; y <= 11; y++) for (let x = 3; x <= 12; x++) {
      if (Math.hypot(x - 7.5, (y - 8) * 0.85) <= 4.1) put(x, y, (11 - y) / 8);
    }
  } else if (shape === 'birch') {
    for (let y = 5; y <= 11; y++) for (let x = 4; x <= 11; x++) {
      if (Math.abs(x - 7.5) <= (y - 3) / 1.9) put(x, y, (11 - y) / 7);
    }
  } else {
    for (let y = 3; y <= 12; y++) for (let x = 2; x <= 13; x++) {
      if (Math.abs(x - 7.5) <= (y - 1) / 1.7) put(x, y, (12 - y) / 9);
    }
  }
  s.set(7, 11, trunk); s.set(7, 12, shade(trunk, 0.85));
}

// ------------------------------------------------------------------ item-icon painters

export function ingotItem(s: S, metal: RGB): void {
  s.fill([0, 0, 0, 0]);
  const pal = [shade(metal, 0.5), shade(metal, 0.76), metal, shade(metal, 1.2), mix(metal, [255, 255, 255], 0.7)];
  const bar = (y0: number) => {
    for (let y = y0; y <= y0 + 2; y++) for (let x = 3; x <= 12; x++) {
      const top = y === y0, bottom = y === y0 + 2;
      if (x === 3 && (y === y0 || y === y0 + 2)) continue;
      if (x === 12 && (y === y0 || y === y0 + 2)) continue;
      s.set(x, y, top ? pal[4] : bottom ? pal[0] : x === 3 ? pal[3] : x === 12 ? pal[1] : pal[2]);
    }
  };
  bar(4); bar(9);
  s.set(5, 5, pal[4]); s.set(10, 10, pal[0]);
}

/** A faceted crystal: hexagonal silhouette, cut lines, glint. */
export function gemItem(s: S, jewel: RGB): void {
  s.fill([0, 0, 0, 0]);
  const pal = [shade(jewel, 0.44), shade(jewel, 0.7), jewel, shade(jewel, 1.22), mix(jewel, [255, 255, 255], 0.75)];
  const rows = [[6, 9], [5, 10], [4, 11], [3, 12], [3, 12], [3, 12], [4, 11], [5, 10], [6, 9], [7, 8]];
  rows.forEach(([x0, x1], i) => {
    const y = 3 + i;
    for (let x = x0; x <= x1; x++) {
      const left = x - x0, right = x1 - x;
      s.set(x, y, i < 4 && left <= 1 ? pal[4] : right <= 1 ? pal[0] : left <= 2 ? pal[3] : x === x1 - 2 ? pal[1] : pal[2]);
    }
  });
  s.set(6, 5, pal[4]); s.set(5, 6, pal[4]);
  s.set(10, 10, pal[0]); s.set(9, 11, pal[0]);
}

/** A chunky rock lump: irregular silhouette, light top-left facets, dark underside. */
export function lumpItem(s: S, rock: RGB): void {
  s.fill([0, 0, 0, 0]);
  const pal = [shade(rock, 0.5), shade(rock, 0.76), rock, shade(rock, 1.16), mix(rock, [255, 255, 255], 0.38)];
  const inside = (x: number, y: number) => {
    const dx = (x - 7.5) / 5.2, dy = (y - 8.5) / 4.6;
    const wobble = s.hash(x, y, 2) * 0.22;
    return dx * dx + dy * dy + wobble <= 1;
  };
  for (let y = 3; y <= 14; y++) for (let x = 2; x <= 13; x++) {
    if (!inside(x, y)) continue;
    const up = inside(x, y - 1), left = inside(x - 1, y), down = inside(x, y + 1), right = inside(x + 1, y);
    if (!up || !left) s.set(x, y, pal[4]);
    else if (!down || !right) s.set(x, y, pal[0]);
    else {
      const n = s.blob(x, y, 3, 3);
      s.set(x, y, n > 0.68 ? pal[3] : n < 0.34 ? pal[1] : pal[2]);
    }
  }
  // facets: two lit plates and one shadowed notch so the lump has volume
  const plate = (cx: number, cy: number, tone: RGB) => {
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 2; x++) if (inside(x, y)) s.set(x, y, tone);
  };
  plate(5, 6, pal[3]); plate(10, 11, pal[1]);
  s.set(6, 5, pal[4]); s.set(11, 10, pal[0]);
}

/** A small heap of powder / dust. */
export function dustItem(s: S, dust: RGB): void {
  s.fill([0, 0, 0, 0]);
  const pal = [shade(dust, 0.52), shade(dust, 0.78), dust, mix(dust, [255, 255, 255], 0.6)];
  for (let y = 7; y <= 13; y++) for (let x = 3; x <= 12; x++) {
    const d = (y - 6.5) / 6.5 + Math.abs(x - 7.5) / 7 - s.hash(x, y, 3) * 0.3;
    if (d > 0.98) continue;
    s.set(x, y, y >= 12 ? pal[0] : y > 9 ? pal[1] : s.hash(x, y, 5) > 0.75 ? pal[3] : pal[2]);
  }
  for (let i = 0; i < 5; i++) { const x = 3 + s.ri(10); const y = 3 + s.ri(4); s.set(x, y, pal[3]); s.set(x + 1, y + 1, pal[2]); }
}

export function stickItem(s: S, wood: RGB): void {
  s.fill([0, 0, 0, 0]);
  const pal = [shade(wood, 0.5), wood, shade(wood, 1.25), shade(wood, 0.72)];
  for (let i = 0; i < 11; i++) {
    const x = 4 + i, y = 12 - i;
    s.set(x, y, i % 4 === 1 ? pal[2] : pal[1]);
    s.set(x + 1, y, pal[0]);
    s.set(x, y + 1, pal[3]);
    if (i % 5 === 3) s.set(x, y, pal[3]);
  }
  s.set(3, 12, pal[0]); s.set(3, 13, pal[0]); s.set(14, 1, pal[0]);
}

/** A ball (snowball, egg): rounded, lit from the upper left. */
export function ballItem(s: S, base: RGB): void {
  s.fill([0, 0, 0, 0]);
  const pal = [shade(base, 0.7), shade(base, 0.86), base, shade(base, 1.12), mix(base, [255, 255, 255], 0.7)];
  for (let y = 3; y <= 12; y++) for (let x = 3; x <= 12; x++) {
    const dx = x - 7.5, dy = y - 7.5;
    const d = Math.hypot(dx, dy);
    if (d > 5) continue;
    s.set(x, y, d > 4.2 ? pal[0] : dx + dy < -3 ? pal[4] : dx + dy < 0 ? pal[3] : dx + dy < 3 ? pal[2] : pal[1]);
  }
  s.set(6, 5, [255, 255, 255]); s.set(7, 5, [255, 255, 255]);
}

/** A feather: a curved quill with a soft vane. */
export function featherItem(s: S, plume: RGB): void {
  s.fill([0, 0, 0, 0]);
  const pal = [shade(plume, 0.62), shade(plume, 0.85), plume, mix(plume, [255, 255, 255], 0.6)];
  for (let i = 0; i < 12; i++) {
    const x = 11 - i, y = 3 + i;
    s.set(x, y, pal[1]);
    const w = Math.max(1, 4 - Math.floor(i * 0.28));
    for (let k = 1; k <= w; k++) {
      s.set(x - k, y, k === w ? pal[0] : pal[2]);
      s.set(x, y - k, k === w ? pal[0] : k === 1 ? pal[3] : pal[2]);
    }
  }
  for (let i = 0; i < 3; i++) s.set(12 - i, 5 + i, shade(plume, 0.5));
  s.set(3, 14, shade(plume, 0.5)); s.set(4, 13, shade(plume, 0.55));
}

/** A coil of thread / silk. */
export function cordItem(s: S, thread: RGB): void {
  s.fill([0, 0, 0, 0]);
  const pal = [shade(thread, 0.6), shade(thread, 0.82), thread, mix(thread, [255, 255, 255], 0.55)];
  for (let y = 3; y <= 13; y++) {
    for (let x = 3; x <= 13; x++) {
      const dx = (x - 8) / 5.2, dy = (y - 8) / 5.2;
      const d = Math.hypot(dx, dy);
      if (d > 1) continue;
      const ring = Math.floor(d * 5.5) % 2;
      s.set(x, y, ring ? pal[0] : (x < 8 ? pal[3] : pal[2]));
    }
  }
  // the loose end trailing off the coil
  s.set(3, 4, pal[1]); s.set(2, 3, pal[1]); s.set(2, 2, pal[2]);
}

/** A bone: shaft with knuckle knobs at both ends. */
export function boneItem(s: S, bone: RGB): void {
  s.fill([0, 0, 0, 0]);
  const pal = [shade(bone, 0.66), shade(bone, 0.86), bone, mix(bone, [255, 255, 255], 0.55)];
  for (let x = 4; x <= 12; x++) { s.set(x, 7, pal[3]); s.set(x, 8, pal[2]); s.set(x, 9, pal[1]); s.set(x, 10, pal[0]); }
  const knob = (cx: number) => {
    for (let y = 4; y <= 12; y++) for (let x = cx - 2; x <= cx + 2; x++) {
      const dx = (x - cx) / 2.2, dy = (y - 8) / 3.2;
      if (dx * dx + dy * dy > 1) continue;
      s.set(x, y, y <= 7 ? pal[3] : y >= 10 ? pal[1] : pal[2]);
    }
  };
  knob(4); knob(12);
  s.set(4, 5, [255, 255, 255]); s.set(12, 5, [255, 255, 255]);
}

/** A knapped flint shard: angular, dark, with a sharp lit edge. */
export function flintItem(s: S, stone: RGB): void {
  s.fill([0, 0, 0, 0]);
  const pal = [shade(stone, 0.5), shade(stone, 0.75), shade(stone, 1.05), shade(stone, 1.3)];
  for (let y = 3; y <= 13; y++) {
    const t = (y - 3) / 10;
    const x0 = 4 + Math.round(t * 4), x1 = 11 - Math.round(t * 4) + 3;
    for (let x = x0; x <= x1; x++) {
      s.set(x, y, x === x0 ? pal[3] : x >= x1 - 1 ? pal[0] : y % 3 === 0 ? pal[1] : pal[2]);
    }
  }
  s.set(8, 5, pal[3]); s.set(7, 6, pal[3]);
}

/** A cured pelt: irregular hide with a lighter flank and a darker border. */
export function peltItem(s: S, hide: RGB): void {
  s.fill([0, 0, 0, 0]);
  const pal = [shade(hide, 0.52), shade(hide, 0.72), shade(hide, 0.92), shade(hide, 1.16)];
  const inside = (x: number, y: number) => {
    const dx = (x - 7.5) / 5.4, dy = (y - 8) / 4.6;
    return dx * dx + dy * dy + s.hash(x, y, 7) * 0.18 <= 1;
  };
  for (let y = 3; y <= 13; y++) for (let x = 2; x <= 13; x++) {
    if (!inside(x, y)) continue;
    const up = inside(x, y - 1), down = inside(x, y + 1), left = inside(x - 1, y), right = inside(x + 1, y);
    if (!up || !left) s.set(x, y, pal[3]);
    else if (!down || !right) s.set(x, y, pal[0]);
    else s.set(x, y, x < 7 ? pal[2] : pal[1]);
  }
  // stitching holes along the flank
  for (let i = 0; i < 4; i++) s.set(5 + i * 2, 11, pal[0]);
}

export function fruitItem(s: S, skin: RGB, leaf: RGB): void {
  s.fill([0, 0, 0, 0]);
  const pal = [shade(skin, 0.5), shade(skin, 0.78), skin, shade(skin, 1.16)];
  for (let y = 4; y <= 13; y++) for (let x = 3; x <= 12; x++) {
    const dx = (x - 7.5) / 5, dy = (y - 9) / 5;
    const d = Math.hypot(dx, dy);
    if (d > 1) continue;
    s.set(x, y, d > 0.86 ? pal[0] : x + y < 12 ? pal[3] : x - y > 2 ? pal[1] : pal[2]);
  }
  s.set(6, 6, mix(skin, [255, 255, 255], 0.65)); s.set(7, 5, mix(skin, [255, 255, 255], 0.5));
  s.set(8, 2, shade(leaf, 1.1)); s.set(9, 3, leaf); s.set(8, 3, shade(leaf, 0.8));
}

export function loafItem(s: S, crust: RGB): void {
  s.fill([0, 0, 0, 0]);
  const pal = [shade(crust, 0.52), shade(crust, 0.74), crust, shade(crust, 1.2)];
  for (let y = 5; y <= 12; y++) for (let x = 3; x <= 12; x++) {
    const dx = (x - 7.5) / 5, dy = (y - 8.5) / 4;
    const d = Math.hypot(dx, dy);
    if (d > 1) continue;
    s.set(x, y, d > 0.82 ? pal[0] : y < 7 ? pal[3] : y > 10 ? pal[1] : pal[2]);
  }
  for (let i = 0; i < 4; i++) { const x = 5 + i * 2; s.set(x, 6, pal[0]); s.set(x + 1, 7, pal[0]); }
  s.set(5, 6, pal[2]); s.set(9, 6, pal[2]);
}

export function sheafItem(s: S, grain: RGB, stalk: RGB): void {
  s.fill([0, 0, 0, 0]);
  const pal = [shade(grain, 0.58), grain, shade(grain, 1.18), shade(stalk, 0.9)];
  for (let i = 0; i < 4; i++) {
    const x = 5 + i * 2;
    const top = 4 + (i % 2);
    for (let y = top; y <= 12; y++) s.set(x, y, y % 3 === 0 ? pal[2] : pal[1]);
    // grain heads
    s.set(x, top, pal[2]); s.set(x - 1, top + 1, pal[0]); s.set(x + 1, top + 2, pal[0]);
    s.set(x, top + 3, pal[2]); s.set(x + 1, top + 4, pal[0]);
  }
  for (let x = 4; x <= 12; x++) s.set(x, 13, pal[3]);
  s.set(10, 12, pal[3]); s.set(5, 12, pal[3]);
}

/** A shard of glass / crystal splinter. */
export function shardItem(s: S, glass: RGB): void {
  s.fill([0, 0, 0, 0]);
  const pal = [shade(glass, 0.62), glass, shade(glass, 1.2), mix(glass, [255, 255, 255], 0.7)];
  for (let y = 3; y <= 13; y++) {
    const t = (y - 3) / 10;
    const x0 = Math.round(7 - t * 3), x1 = Math.round(8 + t * 3);
    for (let x = x0; x <= x1; x++) s.set(x, y, x === x0 ? pal[3] : x === x1 ? pal[0] : x < 8 ? pal[2] : pal[1]);
  }
  s.set(7, 4, pal[3]); s.set(6, 5, pal[3]);
}

// ------------------------------------------------------------------ registry

export interface PackArtist {
  id: string;
  /** FABLE tile names this artist paints (see blocks/Tiles.ts). */
  tiles: string[];
  /** FABLE item ids this artist ships icons for (see items/Items.ts). */
  items: string[];
  /** tile names shown in the storefront card preview */
  preview: string[];
  paint(tile: string, s: S): boolean;
  paintItem(id: string, s: S): boolean;
}

const artists = new Map<string, PackArtist>();
export function registerArtist(a: PackArtist): void {
  artists.set(a.id, a);
}
export function getArtist(id: string): PackArtist | undefined {
  return artists.get(id);
}
export function artistIds(): string[] {
  return [...artists.keys()];
}
/** Paint one tile of a pack as 16x16 RGBA, or null when the pack has no art for it. */
export function paintPackTile(packId: string, tile: string, seed: number): Uint8ClampedArray | null {
  const a = artists.get(packId);
  if (!a || !a.tiles.includes(tile)) return null;
  const s = new S(seed * 7919 + hashName(tile));
  return a.paint(tile, s) ? s.px : null;
}
/** Paint one item icon of a pack as 16x16 RGBA, or null. */
export function paintPackIcon(packId: string, item: string, seed: number): Uint8ClampedArray | null {
  const a = artists.get(packId);
  if (!a || !a.items.includes(item)) return null;
  const s = new S(seed * 33331 + hashName(item));
  return a.paintItem(item, s) ? s.px : null;
}
function hashName(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
