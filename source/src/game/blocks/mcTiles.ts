// Original 16x16 pixel art in the Minecraft material language: hard pixels, a 4-6 colour
// palette per tile, and the structures you recognise at a glance (plank seams, bark
// stripes, grass overhang, cobble mortar, ore clusters). These are not copies of any
// texture pack — the layouts are authored here.

export interface McCtx {
  set(x: number, y: number, c: number[]): void;
  hash(x: number, y: number): number;
}

type RGB = number[];
const N = 16;
const TINT = 128;

const g = (v: number, a = TINT): RGB => [v, v, v, a];

function fill(c: McCtx, col: RGB): void {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) c.set(x, y, col);
}

/** One base colour with sparse 1px specks — the flat pixel-art look, not cloudy noise. */
function speckle(c: McCtx, base: RGB, dark: RGB, light: RGB, speck: RGB, darkP = 0.14, lightP = 0.1, speckP = 0.035): void {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const h = c.hash(x, y);
    const h2 = c.hash(x + 5, y + 11);
    c.set(x, y, h2 < speckP ? speck : h < darkP ? dark : h > 1 - lightP ? light : base);
  }
}

function cracks(c: McCtx, col: RGB, count: number, seed: number): void {
  for (let k = 0; k < count; k++) {
    let x = Math.floor(c.hash(seed, k) * N);
    let y = Math.floor(c.hash(k, seed + 3) * N);
    const horiz = c.hash(k, seed + 9) > 0.5;
    const len = 3 + Math.floor(c.hash(k, seed + 1) * 4);
    for (let i = 0; i < len; i++) {
      c.set((x + N) % N, (y + N) % N, col);
      if (horiz) { x++; if (c.hash(i, k + seed) < 0.28) y += c.hash(i, k) < 0.5 ? 1 : -1; }
      else { y++; if (c.hash(i, k + seed) < 0.28) x += c.hash(i, k) < 0.5 ? 1 : -1; }
    }
  }
}

function stone(c: McCtx, base: RGB, dark: RGB, light: RGB, speck: RGB): void {
  speckle(c, base, dark, light, speck, 0.16, 0.1, 0.04);
  cracks(c, speck, 3, 4);
}

function planks(c: McCtx, base: RGB, dark: RGB, light: RGB, seam: RGB): void {
  for (let p = 0; p < 4; p++) {
    const seamX = (p % 2) * 8;
    for (let r = 0; r < 4; r++) {
      const y = p * 4 + r;
      for (let x = 0; x < N; x++) {
        if (r === 3 || x === seamX) { c.set(x, y, seam); continue; }
        if (r === 0) { c.set(x, y, light); continue; }
        const grain = c.hash(x, p * 3 + r) < 0.18;
        c.set(x, y, grain ? dark : base);
      }
    }
  }
}

function logSide(c: McCtx, bark: RGB, mid: RGB, light: RGB, groove: RGB, knots = true): void {
  // vertical strips, 2-3px, with a 1px dark groove. A 1px wobble keeps it from looking extruded.
  const cols: RGB[] = [];
  let x = 0;
  const widths = [3, 2, 3, 2, 3, 3];
  for (const w of widths) {
    const tone = c.hash(x, 2) > 0.55 ? light : c.hash(x, 4) > 0.4 ? mid : bark;
    for (let i = 0; i < w && x < N; i++, x++) cols[x] = i === w - 1 ? groove : tone;
  }
  while (cols.length < N) cols.push(bark);
  for (let y = 0; y < N; y++) {
    for (let px = 0; px < N; px++) {
      const wobble = c.hash(px, y) > 0.82 ? 1 : 0;
      c.set(px, y, cols[(px + wobble) % N]);
    }
  }
  if (knots) {
    const kx = 5, ky = 6;
    c.set(kx, ky, groove); c.set(kx + 1, ky, groove); c.set(kx, ky + 1, mid); c.set(kx + 1, ky + 1, bark);
    c.set(11, 11, groove); c.set(12, 11, groove); c.set(11, 12, bark);
  }
}

function logTop(c: McCtx, bark: RGB, ring: RGB, wood: RGB, core: RGB): void {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x - 7.5, dy = y - 7.5;
    const md = Math.max(Math.abs(dx), Math.abs(dy));
    const d = Math.hypot(dx, dy);
    if (md > 6.6) { c.set(x, y, bark); continue; }
    if (md > 5.6) { c.set(x, y, ring); continue; }
    const band = Math.floor(d + ((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * 1.4);
    c.set(x, y, band % 3 === 0 ? ring : band % 3 === 1 ? wood : core);
  }
  c.set(7, 7, core); c.set(8, 7, core); c.set(7, 8, ring); c.set(8, 8, core);
}

/**
 * Leaves: a dense canopy, not a sieve. The tile starts fully opaque (three grey tones, so the biome
 * tint does the colour) and a handful of small cutouts - single pixels, sometimes a two-pixel notch -
 * are punched through it. You see sky through occasional gaps, not through half the block.
 * `holes` scales how many cutouts the tile gets.
 */
function leaves(c: McCtx, holes: number): void {
  const tones = [g(150), g(176), g(198), g(132)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const h = c.hash(x, y), h2 = c.hash(x + 7, y + 3);
    const t = h2 < 0.2 ? 3 : h2 > 0.82 ? 2 : h > 0.55 ? 1 : 0;
    c.set(x, y, tones[t]);
  }
  const count = Math.max(3, Math.round(holes * 26));
  for (let i = 0; i < count; i++) {
    // keep cutouts off the tile border, so neighbouring leaf blocks cannot line their holes up into
    // a visible seam, and vary the shape so they read as gaps in foliage
    const x = 1 + Math.floor(c.hash(i, 11) * (N - 2));
    const y = 1 + Math.floor(c.hash(11, i) * (N - 2));
    c.set(x, y, g(0, 0));
    if (c.hash(i, 5) < 0.4) c.set(x + (c.hash(i, 9) < 0.5 ? 1 : -1), y, g(0, 0));
    else if (c.hash(i, 7) < 0.3) c.set(x, y + 1, g(0, 0));
  }
}

function grassTop(c: McCtx): void {
  speckle(c, g(196), g(168), g(220), g(142), 0.18, 0.12, 0.05);
  // a few 1px tufts so it isn't flat static
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(c.hash(i, 2) * N), y = Math.floor(c.hash(3, i) * N);
    c.set(x, y, g(230));
    c.set((x + 1) % N, (y + 1) % N, g(140));
  }
}

function grassSide(c: McCtx, snow: boolean): void {
  const dirtBase: RGB = [134, 96, 67];
  const dirtDark: RGB = [96, 66, 44];
  const dirtLight: RGB = [158, 118, 82];
  const dirtSpeck: RGB = [72, 48, 32];
  speckle(c, dirtBase, dirtDark, dirtLight, dirtSpeck, 0.16, 0.1, 0.04);
  // jagged overhang. Heights chosen so the edge tiles (left meets right).
  const edge = snow
    ? [3, 3, 4, 3, 2, 3, 4, 3, 3, 2, 3, 4, 3, 3, 2, 3]
    : [4, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 4, 3, 4];
  const pal = snow
    ? [[236, 242, 248, 255], [248, 252, 255, 255], [210, 220, 230, 255], [255, 255, 255, 255]]
    : [g(168), g(196), g(140), g(214)];
  for (let x = 0; x < N; x++) {
    const e = edge[x];
    for (let y = 0; y < e; y++) {
      const tip = y === e - 1;
      const tone = tip ? 2 : c.hash(x, y) > 0.7 ? 3 : c.hash(x, y + 2) < 0.25 ? 0 : 1;
      c.set(x, y, pal[tone]);
    }
    // shadow under the grass, on the dirt
    const sh = c.hash(x, 8);
    c.set(x, e, shade(dirtBase, 0.62));
    if (e + 1 < N) c.set(x, e + 1, shade(dirtBase, sh > 0.5 ? 0.82 : 0.9));
  }
}

function shade(col: RGB, f: number): RGB {
  return [col[0] * f, col[1] * f, col[2] * f, col[3] ?? 255];
}

function cobble(c: McCtx, mossy: boolean): void {
  const seeds: [number, number][] = [[1, 2], [6, 1], [12, 2], [3, 6], [9, 7], [14, 6], [2, 11], [8, 12], [13, 12], [6, 15]];
  const tone = [1, 2, 1, 0, 2, 1, 2, 0, 1, 2];
  const pal: RGB[] = [[98, 98, 98], [128, 128, 128], [154, 154, 154]];
  const mortar: RGB = [52, 52, 52];
  const hi: RGB = [176, 176, 176];
  const lo: RGB = [72, 72, 72];
  const owner = new Int16Array(N * N);
  const gap = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let d1 = 99, d2 = 99, s = 0;
    for (let i = 0; i < seeds.length; i++) {
      for (let wx = -N; wx <= N; wx += N) for (let wy = -N; wy <= N; wy += N) {
        const dx = seeds[i][0] + wx - x, dy = seeds[i][1] + wy - y;
        const d = Math.abs(dx) + Math.abs(dy) * 0.82;
        if (d < d1) { d2 = d1; d1 = d; s = i; } else if (d < d2) d2 = d;
      }
    }
    owner[y * N + x] = s;
    gap[y * N + x] = d2 - d1 < 0.95 ? 1 : 0;
  }
  const wrapO = (x: number, y: number) => owner[((y + N) % N) * N + ((x + N) % N)];
  const wrapG = (x: number, y: number) => gap[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (gap[y * N + x]) { c.set(x, y, mortar); continue; }
    const s = owner[y * N + x];
    const up = wrapG(x, y - 1) || wrapO(x, y - 1) !== s;
    const left = wrapG(x - 1, y) || wrapO(x - 1, y) !== s;
    const down = wrapG(x, y + 1) || wrapO(x, y + 1) !== s;
    const right = wrapG(x + 1, y) || wrapO(x + 1, y) !== s;
    let col = pal[tone[s]];
    if (up || left) col = hi;
    else if (down || right) col = lo;
    c.set(x, y, col);
  }
  if (mossy) {
    const moss: RGB[] = [[58, 110, 42], [78, 140, 52], [46, 90, 34]];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (gap[y * N + x]) continue;
      if (c.hash(x, y + 4) > 0.62) c.set(x, y, moss[Math.floor(c.hash(y, x) * 3)]);
    }
  }
}

/**
 * Vein silhouettes. Ore has to read as *mineral embedded in rock*, which is a shape problem before
 * it is a colour problem: blobs with a lumpy outline and lit tops, never rectangles. Each row is one
 * pixel; '#' is mineral.
 */
const ORE_VEINS: string[][] = [
  ['..#..', '.###.', '####.', '.###.', '..#..'],
  ['.##.', '####', '.###', '..#.'],
  ['###..', '#####', '.####', '..##.'],
  ['..#.', '.###', '####', '###.', '.#..'],
  ['##.', '###', '##.', '.#.'],
  ['..##..', '.####.', '######', '.####.', '..##..'],
];

function ore(c: McCtx, col: RGB, glow = false): void {
  stone(c, [125, 125, 125], [104, 104, 104], [146, 146, 146], [78, 78, 78]);
  const hi = glow ? mix(col, [255, 255, 255], 0.62) : mix(col, [255, 255, 255], 0.4);
  const mid = col;
  const lo = shade(col, 0.66);
  const deep = shade(col, 0.34);
  const rim = shade(col, 0.22);
  // fixed placements, deliberately uneven, so a tile has a direction when it repeats
  const spots: [number, number, number, number][] = [
    [1, 1, 0, 1], [10, 0, 2, 0], [5, 5, 1, -1], [12, 7, 4, 1],
    [2, 8, 3, 0], [8, 11, 5, 1], [1, 13, 2, 1], [12, 13, 0, -1],
  ];
  for (const [vx, vy, si, flip] of spots) {
    const shape = ORE_VEINS[si % ORE_VEINS.length];
    const h = shape.length, w = Math.max(...shape.map((r) => r.length));
    const at = (dx: number, dy: number): boolean => {
      const x = flip ? w - 1 - dx : dx;
      const row = shape[dy] ?? '';
      return (row[x] ?? '.') === '#';
    };
    // darken the rock around the vein: that halo is most of what makes it look embedded
    for (let dy = -1; dy <= h; dy++) for (let dx = -1; dx <= w; dx++) {
      if (at(dx, dy)) continue;
      const touches = at(dx - 1, dy) || at(dx + 1, dy) || at(dx, dy - 1) || at(dx, dy + 1);
      if (touches) c.set(vx + dx, vy + dy, rim);
    }
    // the ore itself: lit along the top edge, shadowed along the bottom, bright speck inside
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      if (!at(dx, dy)) continue;
      const top = !at(dx, dy - 1), bottom = !at(dx, dy + 1);
      c.set(vx + dx, vy + dy, top ? hi : bottom ? lo : mid);
    }
    const sx = vx + (flip ? 1 : w - 2), sy = vy + Math.min(h - 1, 1);
    if (at(flip ? w - 2 : 1, 1)) c.set(sx, sy, deep);
  }
  // a few loose specks: the seam shedding into the rock
  c.set(7, 4, mid); c.set(13, 5, lo); c.set(4, 11, lo); c.set(9, 9, rim);
  if (glow) { c.set(6, 2, hi); c.set(14, 9, hi); c.set(3, 5, hi); }
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] ?? 255];
}

function water(c: McCtx): void {
  const deep: RGB = [26, 68, 156], base: RGB = [40, 98, 196], light: RGB = [78, 146, 224], crest: RGB = [156, 208, 244];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    // two crossing swells whose wavelengths divide the tile, so it still tiles perfectly
    const w = Math.sin(2 * Math.PI * (x / 16) + 2 * Math.PI * (y / 8)) * 0.62
      + Math.sin(2 * Math.PI * (x / 8) - 2 * Math.PI * (y / 16)) * 0.38;
    // crests are single pixels riding the top of a swell: that is what reads as moving water
    let col = w > 0.86 ? crest : w > 0.42 ? light : w < -0.72 ? deep : base;
    if (col !== crest && c.hash(x, y) < 0.05) col = light;
    c.set(x, y, col);
  }
}

function lava(c: McCtx): void {
  fill(c, [58, 16, 8]);
  const crust: RGB[] = [[42, 12, 6], [72, 22, 8], [90, 28, 10]];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const h = c.hash(x, y);
    c.set(x, y, h < 0.2 ? crust[0] : h > 0.8 ? crust[2] : crust[1]);
  }
  // molten cracks along a few hard paths
  const hot: RGB[] = [[255, 196, 64], [255, 120, 24], [180, 48, 8]];
  const paths: [number, number, number][] = [[0, 4, 1], [3, 0, 0], [8, 7, 1], [12, 2, 0], [5, 11, 1]];
  for (const [sx, sy, dir] of paths) {
    let x = sx, y = sy;
    for (let i = 0; i < 8; i++) {
      c.set((x + N) % N, (y + N) % N, hot[0]);
      c.set((x + 1) % N, y, hot[1]);
      c.set(x, (y + 1) % N, hot[2]);
      if (dir) x++; else y++;
      if (c.hash(i, sx + sy) < 0.3) { if (dir) y += 1; else x += 1; }
    }
  }
}

function bricks(c: McCtx, brick: RGB, mortar: RGB, light: RGB, dark: RGB): void {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const row = Math.floor(y / 4);
    const off = (row % 2) * 4;
    const inMortar = (x + off) % 8 === 0 || y % 4 === 3;
    if (inMortar) { c.set(x, y, mortar); continue; }
    const top = y % 4 === 0;
    const bot = y % 4 === 2;
    const chip = c.hash(x, y) < 0.05;
    c.set(x, y, chip ? dark : top ? light : bot ? dark : brick);
  }
}

function craftingSide(c: McCtx): void {
  planks(c, [156, 122, 74], [122, 92, 54], [186, 150, 96], [74, 52, 28]);
  // the tool-grid face: a dark inset with a pale grid and a saw-like mark. Original layout.
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) c.set(x, y, [92, 68, 38]);
  for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) c.set(x, y, [168, 132, 80]);
  for (let i = 0; i < 10; i += 3) {
    for (let x = 3; x < 13; x++) c.set(x, 3 + i, [110, 82, 48]);
    for (let y = 3; y < 13; y++) c.set(3 + i, y, [110, 82, 48]);
  }
  // saw blade suggestion on the right half
  for (let i = 0; i < 5; i++) { c.set(8 + i, 5 + i, [210, 210, 214]); c.set(8 + i, 6 + i, [140, 140, 146]); }
  c.set(9, 6, [240, 240, 244]);
}

function craftingTop(c: McCtx): void {
  planks(c, [156, 122, 74], [122, 92, 54], [186, 150, 96], [74, 52, 28]);
  for (let i = 0; i < N; i++) {
    c.set(i, 0, [74, 52, 28]); c.set(0, i, [74, 52, 28]);
    c.set(i, 15, [74, 52, 28]); c.set(15, i, [74, 52, 28]);
  }
  for (let i = 2; i < 14; i += 4) {
    for (let x = 2; x < 14; x++) c.set(x, i, [90, 64, 36]);
    for (let y = 2; y < 14; y++) c.set(i, y, [90, 64, 36]);
  }
}

function chest(c: McCtx, front: boolean): void {
  planks(c, [150, 108, 58], [118, 82, 42], [180, 136, 76], [70, 46, 24]);
  for (let x = 0; x < N; x++) { c.set(x, 0, [70, 46, 24]); c.set(x, 15, [70, 46, 24]); c.set(x, 5, [48, 32, 16]); c.set(x, 6, [190, 148, 84]); }
  for (let y = 0; y < N; y++) { c.set(0, y, [70, 46, 24]); c.set(15, y, [70, 46, 24]); }
  if (front) {
    c.set(7, 3, [230, 230, 234]); c.set(8, 3, [180, 180, 186]);
    c.set(7, 4, [200, 200, 206]); c.set(8, 4, [150, 150, 156]);
    c.set(7, 5, [80, 80, 86]); c.set(8, 5, [60, 60, 66]);
    c.set(7, 6, [160, 160, 166]); c.set(8, 6, [120, 120, 126]);
  }
}

function furnace(c: McCtx, lit: boolean): void {
  cobble(c, false);
  // soot: the face is darker than a plain cobble wall, with a stone lip around the mouth
  for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) {
    const mouth = y >= 6 && y <= 14 && x >= 3 && x <= 12;
    if (mouth) continue;
    const h = c.hash(x, y);
    c.set(x, y, h < 0.35 ? [72, 72, 74] : h < 0.7 ? [96, 96, 98] : [118, 118, 120]);
  }
  for (let y = 7; y <= 14; y++) for (let x = 4; x <= 11; x++) c.set(x, y, [22, 22, 24]);
  for (let x = 3; x <= 12; x++) c.set(x, 7, [120, 120, 124]);
  for (let y = 7; y <= 15; y++) c.set(3, y, [110, 110, 114]);
  if (lit) {
    const fire: RGB[] = [[255, 220, 80], [255, 140, 32], [220, 60, 12], [255, 240, 160]];
    const pix: [number, number, number][] = [
      [6, 9, 3], [7, 9, 0], [8, 9, 1], [9, 9, 2],
      [5, 10, 1], [6, 10, 0], [7, 10, 3], [8, 10, 0], [9, 10, 1], [10, 10, 2],
      [6, 11, 1], [7, 11, 0], [8, 11, 1], [9, 11, 2],
      [7, 12, 2], [8, 12, 1], [7, 13, 2], [8, 13, 2],
    ];
    for (const [x, y, i] of pix) c.set(x, y, fire[i]);
  }
}

function glass(c: McCtx): void {
  fill(c, [255, 255, 255, 0]);
  for (let i = 0; i < N; i++) {
    c.set(i, 0, [214, 232, 242, 210]); c.set(0, i, [214, 232, 242, 210]);
    c.set(i, 15, [170, 198, 214, 180]); c.set(15, i, [170, 198, 214, 180]);
  }
  // a single diagonal highlight, the way a pane reads
  for (let i = 2; i < 8; i++) c.set(i, i, [255, 255, 255, 120]);
  for (let i = 3; i < 7; i++) c.set(i, i + 1, [255, 255, 255, 70]);
}

function flower(c: McCtx, petal: RGB, center: RGB): void {
  fill(c, [0, 0, 0, 0]);
  const stem: RGB = [58, 130, 42, 255];
  const stemD: RGB = [40, 96, 30, 255];
  c.set(7, 8, stem); c.set(7, 9, stem); c.set(7, 10, stemD); c.set(7, 11, stem);
  c.set(7, 12, stem); c.set(7, 13, stemD); c.set(7, 14, stem); c.set(7, 15, stemD);
  c.set(6, 11, stem); c.set(8, 13, stem);
  //  plus-shaped bloom, the classic voxel flower
  const bloom: [number, number][] = [[7, 3], [6, 4], [7, 4], [8, 4], [5, 5], [6, 5], [8, 5], [9, 5], [6, 6], [7, 6], [8, 6], [7, 7]];
  for (const [x, y] of bloom) c.set(x, y, petal);
  c.set(7, 5, center); c.set(6, 5, shade(petal, 0.8)); c.set(8, 6, shade(petal, 0.75));
  c.set(5, 5, shade(petal, 1.1)); c.set(9, 4, shade(petal, 1.08));
}

function tallGrass(c: McCtx): void {
  fill(c, [0, 0, 0, 0]);
  const blades = [2, 5, 8, 11, 14];
  for (const x of blades) {
    const h = 7 + Math.floor(c.hash(x, 1) * 6);
    for (let y = 15; y > 15 - h; y--) {
      const lean = y < 15 - h + 2 ? (x % 2 ? 1 : -1) : 0;
      const v = y > 13 ? 140 : 175 + (c.hash(x, y) > 0.5 ? 20 : 0);
      c.set(x + lean, y, g(v));
    }
  }
}

const OAK = { bark: [92, 70, 40], mid: [118, 90, 52], light: [146, 112, 66], groove: [58, 42, 24], wood: [176, 140, 86], ring: [130, 98, 56], core: [108, 80, 46] };
const BIRCH = { bark: [214, 208, 190], mid: [230, 226, 210], light: [242, 238, 226], groove: [48, 48, 48], wood: [214, 196, 150], ring: [176, 156, 112], core: [150, 130, 90] };
const SPRUCE = { bark: [62, 44, 26], mid: [84, 60, 34], light: [108, 78, 44], groove: [36, 24, 14], wood: [140, 106, 62], ring: [96, 70, 40], core: [72, 52, 30] };
const DARK = { bark: [48, 34, 22], mid: [66, 46, 28], light: [84, 58, 36], groove: [28, 18, 12], wood: [112, 82, 48], ring: [74, 52, 30], core: [52, 36, 22] };

/** Returns true if this tile was replaced with the Minecraft-style art. */
export function mcPaint(name: string, c: McCtx): boolean {
  switch (name) {
    case 'stone': stone(c, [127, 127, 127], [108, 108, 108], [148, 148, 148], [82, 82, 82]); return true;
    case 'deep_stone': stone(c, [78, 78, 84], [62, 62, 68], [96, 96, 104], [46, 46, 52]); return true;
    case 'dirt': speckle(c, [134, 96, 67], [104, 72, 48], [164, 122, 86], [72, 48, 32], 0.18, 0.1, 0.05); cracks(c, [72, 48, 32], 2, 2); return true;
    case 'grass_top': grassTop(c); return true;
    case 'grass_side': grassSide(c, false); return true;
    case 'snow_grass_side': grassSide(c, true); return true;
    case 'snow': speckle(c, [236, 242, 248], [214, 224, 234], [255, 255, 255], [190, 204, 218], 0.1, 0.12, 0.03); return true;
    case 'sand': speckle(c, [218, 208, 158], [196, 184, 132], [232, 224, 180], [168, 152, 104], 0.12, 0.1, 0.04); return true;
    case 'red_sand': speckle(c, [186, 98, 48], [154, 74, 34], [210, 122, 64], [120, 52, 24], 0.14, 0.1, 0.04); return true;
    case 'gravel': speckle(c, [132, 128, 124], [96, 94, 90], [160, 156, 150], [68, 66, 64], 0.22, 0.14, 0.08); return true;
    case 'clay': speckle(c, [160, 166, 176], [136, 142, 154], [184, 190, 198], [110, 116, 128], 0.12, 0.08, 0.03); return true;
    case 'oak_log': logSide(c, OAK.bark, OAK.mid, OAK.light, OAK.groove); return true;
    case 'oak_log_top': logTop(c, OAK.groove, OAK.ring, OAK.wood, OAK.core); return true;
    case 'oak_planks': planks(c, [176, 140, 86], [140, 106, 62], [204, 168, 108], [92, 66, 36]); return true;
    case 'oak_leaves': leaves(c, 0.38); return true;
    case 'birch_log': logSide(c, BIRCH.bark, BIRCH.mid, BIRCH.light, BIRCH.groove, false);
      // birch's black dashes
      for (let i = 0; i < 7; i++) {
        const x = Math.floor(c.hash(i, 6) * 13) + 1, y = Math.floor(c.hash(8, i) * 14) + 1, w = 1 + Math.floor(c.hash(i, 9) * 3);
        for (let k = 0; k < w; k++) c.set(x + k, y, [36, 36, 36]);
      }
      return true;
    case 'birch_log_top': logTop(c, [48, 48, 48], BIRCH.ring, BIRCH.wood, BIRCH.core); return true;
    case 'birch_planks': planks(c, [206, 192, 142], [176, 160, 114], [228, 216, 172], [120, 106, 72]); return true;
    case 'birch_leaves': leaves(c, 0.36); return true;
    case 'spruce_log': logSide(c, SPRUCE.bark, SPRUCE.mid, SPRUCE.light, SPRUCE.groove); return true;
    case 'spruce_log_top': logTop(c, SPRUCE.groove, SPRUCE.ring, SPRUCE.wood, SPRUCE.core); return true;
    case 'spruce_planks': planks(c, [118, 88, 52], [90, 64, 36], [146, 112, 68], [58, 40, 22]); return true;
    case 'spruce_leaves': leaves(c, 0.4); return true;
    case 'dark_log': logSide(c, DARK.bark, DARK.mid, DARK.light, DARK.groove); return true;
    case 'dark_log_top': logTop(c, DARK.groove, DARK.ring, DARK.wood, DARK.core); return true;
    case 'dark_planks': planks(c, [82, 60, 36], [60, 42, 24], [104, 78, 48], [40, 26, 14]); return true;
    case 'dark_leaves': leaves(c, 0.42); return true;
    case 'stripped_log': planks(c, [176, 140, 86], [196, 160, 104], [210, 176, 118], [150, 116, 70]); return true;
    case 'stripped_log_top': logTop(c, OAK.wood, OAK.ring, OAK.wood, OAK.core); return true;
    case 'coal_ore': ore(c, [38, 38, 40]); return true;
    case 'copper_ore': ore(c, [196, 112, 64]); return true;
    case 'iron_ore': ore(c, [214, 176, 146]); return true;
    case 'gold_ore': ore(c, [242, 206, 64]); return true;
    case 'ember_ore': ore(c, [240, 72, 28], true); return true;
    case 'crystal_ore': ore(c, [80, 220, 214], true); return true;
    case 'cobblestone': cobble(c, false); return true;
    case 'mossy_cobblestone': cobble(c, true); return true;
    case 'stone_bricks': bricks(c, [128, 128, 128], [78, 78, 78], [156, 156, 156], [96, 96, 96]); return true;
    case 'bricks': bricks(c, [156, 86, 68], [188, 176, 160], [180, 108, 86], [110, 58, 46]); return true;
    case 'water': water(c); return true;
    case 'lava': lava(c); return true;
    case 'glass': glass(c); return true;
    case 'crafting_table_top': craftingTop(c); return true;
    case 'crafting_table_side': craftingSide(c); return true;
    case 'furnace_side': cobble(c, false); return true;
    case 'furnace_front': furnace(c, false); return true;
    case 'furnace_front_lit': furnace(c, true); return true;
    case 'chest_top': chest(c, false); return true;
    case 'chest_side': chest(c, false); return true;
    case 'chest_front': chest(c, true); return true;
    case 'farmland': {
      speckle(c, [110, 74, 48], [78, 50, 32], [136, 96, 64], [56, 36, 22], 0.16, 0.08, 0.04);
      for (let y = 0; y < N; y++) if (y % 4 === 1) for (let x = 0; x < N; x++) c.set(x, y, [48, 32, 20]);
      return true;
    }
    case 'flower_red': flower(c, [208, 48, 48], [240, 210, 48]); return true;
    case 'flower_yellow': flower(c, [240, 208, 48], [150, 90, 24]); return true;
    case 'flower_blue': flower(c, [64, 104, 214], [240, 220, 80]); return true;
    case 'tall_grass': tallGrass(c); return true;
    case 'wool': {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const n = ((x >> 1) + (y >> 1)) % 2;
        const v = n ? 214 : 232;
        c.set(x, y, [v, v + 2, v + 6]);
      }
      return true;
    }
    case 'bedrock': stone(c, [72, 72, 72], [48, 48, 48], [96, 96, 96], [28, 28, 28]); cracks(c, [20, 20, 20], 4, 9); return true;
    case 'sandstone_top': speckle(c, [218, 206, 150], [196, 184, 128], [232, 222, 172], [168, 152, 100], 0.1, 0.08, 0.03); return true;
    case 'sandstone_side': {
      const pal: RGB[] = [[168, 152, 100], [210, 198, 146], [228, 216, 164], [150, 134, 86]];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (y < 2 || y > 13) c.set(x, y, y === 0 || y === 15 ? pal[3] : pal[0]);
        else c.set(x, y, c.hash(x, y) < 0.12 ? pal[0] : pal[1 + (c.hash(x, y + 1) > 0.8 ? 1 : 0)]);
      }
      return true;
    }
    default: return false;
  }
}
