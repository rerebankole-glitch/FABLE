/**
 * Mob skin art.
 *
 * FABLE's creatures are built from boxes (entities/Entities.ts). A box that is only ever filled with
 * one noise texture can never read like a Minecraft mob: vanilla mobs get their character from
 * *pixel art drawn on specific faces* — eyes with pupils, a unibrow, a nose, a robe with folds and a
 * belt, hooves, spots, feathers. This module gives the model builder exactly that:
 *
 *   - `toneRamp()` derives a five-step shade ramp from one base colour, with the classic pixel-art
 *     hue shift (shadows drift cool, highlights drift warm) so flat colours gain volume.
 *   - Face art is written as tiny text sheets — one character per pixel — which keeps the art
 *     readable, reviewable and diffable instead of hiding it in canvas calls.
 *   - All six faces of a box are packed into a single texture (a 3x2 grid) and the box's UVs are
 *     remapped onto it, so a detailed mob still costs exactly one draw call per box, like before.
 *
 * Art is entirely procedural and FABLE's own; nothing is sampled from another game.
 */
import * as THREE from 'three';

export type Face = 'right' | 'left' | 'top' | 'bottom' | 'back' | 'front';
/** three.js BoxGeometry group order: +X, -X, +Y, -Y, +Z, -Z. Mobs face -Z, so 'front' is the -Z face. */
export const FACE_ORDER: Face[] = ['right', 'left', 'top', 'bottom', 'back', 'front'];
/** One face of pixel art: rows top-to-bottom, one character per pixel. */
export type FaceArt = string[];

/** A text sheet helper: strips the indentation a literal is written with. */
export function art(sheet: string): FaceArt {
  return sheet.replace(/^\n/, '').replace(/\n[ \t]*$/, '').split('\n').map((r) => r.trim());
}

export interface BoxSkin {
  /** pixel resolution of every face (art sheets are padded/clipped to it). Defaults to 8x8. */
  res?: [number, number];
  /** one sheet used for every face that has no specific art */
  all?: FaceArt;
  right?: FaceArt; left?: FaceArt; top?: FaceArt; bottom?: FaceArt; back?: FaceArt; front?: FaceArt;
  /** substitute for 'e' in the art (defaults to the ink colour) */
  accent?: number;
  /** extra character -> colour, e.g. { q: 0x8a6a3a } */
  colors?: Record<string, number>;
}

// ------------------------------------------------------------ tone ramps
const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const hex = (r: number, g: number, b: number) => `rgb(${clamp255(r)},${clamp255(g)},${clamp255(b)})`;

/**
 * Five shades of one base colour, darkest first. Darker steps drift toward blue-violet and lighter
 * steps toward warm yellow — the hue shift is what stops pixel art from looking like flat plastic.
 */
export function toneRamp(color: number): string[] {
  const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
  // [brightness, red bias, blue bias]: shadows lose red and gain blue (cool), highlights the other
  // way about (warm), so the ramp shifts hue as it darkens instead of only scaling brightness.
  const steps: [number, number, number][] = [
    [0.58, 0.94, 1.16], // darkest  (coolest)
    [0.78, 0.97, 1.08], // dark
    [1, 1, 1], // base
    [1.08, 1.05, 0.96], // light
    [1.24, 1.13, 0.91], // lightest (warmest)
  ];
  return steps.map(([k, warm, cool]) => {
    // `warm`/`cool` bend the channels: r up + b down on highlights, r down + b up on shadows
    const rr = r * k * warm, gg = g * k, bb = b * k * cool;
    return hex(rr, gg, bb);
  });
}

const INK = 0x191622;
const INK2 = 0x0c0a12;
const WHITE = 0xf2efe6;

/** Named colours the art can use directly, for details that should not follow the base colour. */
const PALETTE: Record<string, number> = {
  k: INK, // ink — outlines, pupils, unibrow
  n: INK2, // near-black
  w: WHITE, // eye white / bone / wool highlight
  y: 0xd8a83c, // gold
  h: 0xd8b444, // hay / straw
  o: 0xc0692a, // orange / beak
  r: 0xa63430, // red
  g: 0x4d7a34, // green
  b: 0x3d5c9c, // blue
  p: 0x6a4a9a, // purple
  c: 0x49bcc4, // cyan / arcane glow
  m: 0x8b8f9a, // metal
  s: 0x8a8a8a, // stone
  l: 0x7a4a28, // leather
  t: 0xc8a078, // tan / skin
};

const TONE_CHAR: Record<string, number> = { '1': 0, '2': 1, '.': 2, '3': 3, '4': 4 };

function charColor(ch: string, ramp: string[], accent: number, colors: Record<string, number> | undefined): string | null {
  const tone = TONE_CHAR[ch];
  if (tone !== undefined) return ramp[tone];
  if (ch === 'e') return hex((accent >> 16) & 255, (accent >> 8) & 255, accent & 255);
  if (ch === ' ') return null; // transparent / leave as-is
  const custom = colors?.[ch];
  if (custom !== undefined) return hex((custom >> 16) & 255, (custom >> 8) & 255, custom & 255);
  const fixed = PALETTE[ch];
  if (fixed !== undefined) return hex((fixed >> 16) & 255, (fixed >> 8) & 255, fixed & 255);
  return null;
}

// ------------------------------------------------------------ textures
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function makeCanvas(w: number, h: number): { c: HTMLCanvasElement; ctx: Ctx2D } {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, ctx: c.getContext('2d') as Ctx2D };
}

/** identity per art sheet, so equal art shares one texture without stringifying it every box */
const artIds = new WeakMap<FaceArt, number>();
let nextArtId = 1;
function artId(a: FaceArt): number {
  let id = artIds.get(a);
  if (id === undefined) { id = nextArtId++; artIds.set(a, id); }
  return id;
}

const texCache = new Map<string, THREE.CanvasTexture>();

/**
 * The default "hide" sheet for a colour: flat base tone, one lighter top row, one darker bottom row
 * and a handful of dither pixels. Minecraft mob skins are mostly flat colour with a few detail
 * pixels — this is what makes a plain box read as a crafted texture instead of noise.
 */
function paintPlain(ctx: Ctx2D, ox: number, oy: number, w: number, h: number, ramp: string[], seedIn: number): void {
  let seed = seedIn >>> 0 || 1;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  ctx.fillStyle = ramp[2];
  ctx.fillRect(ox, oy, w, h);
  ctx.fillStyle = ramp[3];
  for (let x = 0; x < w; x++) if (rnd() < 0.8) ctx.fillRect(ox + x, oy, 1, 1);
  ctx.fillStyle = ramp[4];
  for (let x = 0; x < w; x++) if (rnd() < 0.35) ctx.fillRect(ox + x, oy + 1, 1, 1);
  ctx.fillStyle = ramp[1];
  for (let x = 0; x < w; x++) if (rnd() < 0.8) ctx.fillRect(ox + x, oy + h - 1, 1, 1);
  ctx.fillStyle = ramp[0];
  for (let x = 0; x < w; x++) if (rnd() < 0.3) ctx.fillRect(ox + x, oy + h - 2, 1, 1);
  const dots = Math.max(2, Math.round(w * h * 0.06));
  for (let i = 0; i < dots; i++) {
    ctx.fillStyle = rnd() < 0.5 ? ramp[1] : ramp[3];
    ctx.fillRect(ox + Math.floor(rnd() * w), oy + 1 + Math.floor(rnd() * (h - 2)), 1, 1);
  }
}

function paintFace(ctx: Ctx2D, sheet: FaceArt | undefined, ox: number, oy: number, rw: number, rh: number, ramp: string[], accent: number, colors: Record<string, number> | undefined): void {
  if (!sheet) return;
  for (let y = 0; y < Math.min(rh, sheet.length); y++) {
    const row = sheet[y];
    for (let x = 0; x < Math.min(rw, row.length); x++) {
      const fill = charColor(row[x], ramp, accent, colors);
      if (fill) { ctx.fillStyle = fill; ctx.fillRect(ox + x, oy + y, 1, 1); }
    }
  }
}

/**
 * One texture holding all six faces of a box in a 3x2 grid (3 columns, 2 rows). A box therefore
 * keeps a single material and a single draw call while still having per-face art.
 */
export function boxTexture(skin: BoxSkin, color: number): THREE.CanvasTexture {
  const [rw, rh] = skin.res ?? [8, 8];
  const accent = skin.accent ?? INK;
  const key = `${rw}x${rh}|${color >>> 0}|${accent}|${skin.all ? artId(skin.all) : 0}|${FACE_ORDER.map((f) => (skin[f] ? artId(skin[f]!) : 0)).join(',')}|${skin.colors ? Object.entries(skin.colors).map(([k, v]) => k + v).join('') : ''}`;
  const hit = texCache.get(key);
  if (hit) return hit;

  const { c, ctx } = makeCanvas(rw * 3, rh * 2);
  const ramp = toneRamp(color);
  for (let i = 0; i < 6; i++) {
    const face = FACE_ORDER[i];
    const ox = (i % 3) * rw, oy = Math.floor(i / 3) * rh;
    paintPlain(ctx, ox, oy, rw, rh, ramp, color + i * 7919);
    const sheet = skin[face] ?? skin.all;
    // a sheet may be bigger than the cell (a tall head face): crop from its top-left
    paintFace(ctx, sheet, ox, oy, rw, rh, ramp, accent, skin.colors);
  }
  const t = new THREE.CanvasTexture(c as unknown as HTMLCanvasElement);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

/** The plain (art-free) hide texture for a colour, six identical faces in the same 3x2 layout. */
export function plainTexture(color: number): THREE.CanvasTexture {
  return boxTexture({}, color);
}

/**
 * Remap a BoxGeometry's UVs onto the 3x2 face grid of `boxTexture`. Every geometry that uses a
 * face-atlas texture needs this exactly once.
 */
export function remapFaceUV(geometry: THREE.BoxGeometry): void {
  const attr = geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
  if (!attr) return;
  const arr = attr.array as Float32Array;
  for (let f = 0; f < 6; f++) {
    const col = f % 3, row = Math.floor(f / 3);
    const u0 = col / 3, du = 1 / 3;
    const v0 = 1 - (row + 1) / 2, dv = 1 / 2;
    for (let k = 0; k < 4; k++) {
      const i = (f * 4 + k) * 2;
      arr[i] = u0 + arr[i] * du;
      arr[i + 1] = v0 + arr[i + 1] * dv;
    }
  }
  attr.needsUpdate = true;
}
