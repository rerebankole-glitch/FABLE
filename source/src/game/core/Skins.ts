// Built-in player skins. A preset is a palette the voxel figure (and the first-person arm) is
// painted with, exactly like the "no upload" palette path - so presets work with the in-world
// figure, the inventory preview, the menu figure and the first-person arm with no extra art.
// Adding a skin = one more entry here (the picker, previews and persistence are generic).

import { paintHeadwearSheet } from './Headwear';

export interface SkinPreset {
  id: string;
  name: string;
  skin: string; // body/face colour
  hair: string;
  shirt: string;
  pants: string;
  /** optional accent hint shown on the picker card (eyes/trim tone) */
  accent?: string;
  /** slim (3px) arm layout, like the classic "Alex" body */
  slim?: boolean;
}

export const SKIN_PRESETS: SkinPreset[] = [
  { id: 'steve', name: 'Classic', skin: '#c68e5c', hair: '#5a3a22', shirt: '#3f6f9f', pants: '#3b3b5a', accent: '#d8a878' },
  { id: 'alex', name: 'Sunny', skin: '#e0ac69', hair: '#8a5a30', shirt: '#2e8f5e', pants: '#5a4632', accent: '#0a7f5a', slim: true },
  { id: 'digger', name: 'Miner', skin: '#b07040', hair: '#4a3a28', shirt: '#9aa0a8', pants: '#3c4350', accent: '#c9a06a' },
  { id: 'knight', name: 'Knight', skin: '#d8a878', hair: '#6a4a2a', shirt: '#cfd6df', pants: '#2a2f3a', accent: '#e8c060' },
  { id: 'ember', name: 'Ember', skin: '#f0b060', hair: '#5a2a10', shirt: '#d8502f', pants: '#4a2010', accent: '#ffd080' },
  { id: 'arbor', name: 'Arbor', skin: '#8a6a42', hair: '#2f3a1f', shirt: '#3f7f3f', pants: '#4a3a28', accent: '#7fd06f' },
  { id: 'frost', name: 'Frost', skin: '#d8c8b0', hair: '#e8f0f8', shirt: '#4f8fbf', pants: '#274060', accent: '#cfe8ff' },
  { id: 'rose', name: 'Rose', skin: '#f0c8a0', hair: '#55202f', shirt: '#c0557f', pants: '#552040', accent: '#ffb0c8', slim: true },
  { id: 'stargazer', name: 'Stargazer', skin: '#b98867', hair: '#202847', shirt: '#384e9a', pants: '#27335f', accent: '#f5cf7f', slim: true },
  { id: 'tinkerer', name: 'Tinkerer', skin: '#c99163', hair: '#633d2e', shirt: '#bf7843', pants: '#394c52', accent: '#89d5c6' },
  { id: 'nightfall', name: 'Nightfall', skin: '#c99a83', hair: '#241c28', shirt: '#282c3b', pants: '#202330', accent: '#c4a4e0', slim: true },
  { id: 'cinder', name: 'Cinder Scout', skin: '#bb8064', hair: '#30222a', shirt: '#303035', pants: '#24262b', accent: '#f3a659' },
];

export function presetById(id: string): SkinPreset {
  return SKIN_PRESETS.find((p) => p.id === id) ?? SKIN_PRESETS[0];
}

// ============================================================================
// Built-in skin ART. Each preset gets a real, hand-authored 64x64 vanilla-layout
// skin sheet (the exact layout buildSkinFigure/compositeArmSkin sample), so every
// skin has its own haircut, facial features, outfit and shading instead of being a
// recolor of one silhouette. The sheet is used by the 3D figure, the first-person
// arm and the flat preview - one art source for all of them.
// The generator is PURE (RGBA buffer in, no DOM) so it can be unit-tested in node.
// Layout (u,v net rects, vanilla; faces are 8px/4px wide rows per part):
//   head base (0,0) hat ov (32,0); body (16,16) jacket ov (16,32);
//   right arm (40,16) sleeve ov (40,32); left arm (32,48) sleeve ov (48,48);
//   right leg (0,16) ov (0,32); left leg (16,48) ov (0,48).
// ============================================================================

export const SKIN_SHEET = 64;

type RGB = [number, number, number];
const hexRgb = (h: string): RGB => {
  const v = parseInt(h.startsWith('#') ? h.slice(1) : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const tone = (c: RGB, f: number): RGB => [
  Math.min(255, Math.max(0, Math.round(c[0] * f))),
  Math.min(255, Math.max(0, Math.round(c[1] * f))),
  Math.min(255, Math.max(0, Math.round(c[2] * f))),
];

/** rectangle in sheet px (x0,y0 inclusive .. x1,y1 exclusive) */
type Rect = [number, number, number, number];
/** net for a cube part in the vanilla layout: u,v top-left; w/h face size; d depth */
interface Net { u: number; v: number; w: number; h: number; d: number }

function netRects(n: Net): { left: Rect; front: Rect; right: Rect; back: Rect; top: Rect; bottom: Rect } {
  const { u, v, w, h, d } = n;
  return {
    left: [u, v + d, u + d, v + d + h],
    front: [u + d, v + d, u + w + d, v + d + h],
    right: [u + w + d, v + d, u + w + d * 2, v + d + h],
    back: [u + w + d * 2, v + d, u + w * 2 + d * 2, v + d + h],
    top: [u + d, v, u + w + d, v + d],
    bottom: [u + w + d, v, u + w * 2 + d, v + d],
  };
}

const HEAD: Net = { u: 0, v: 0, w: 8, h: 8, d: 8 };
const HAT: Net = { u: 32, v: 0, w: 8, h: 8, d: 8 };
const BODY: Net = { u: 16, v: 16, w: 8, h: 12, d: 4 };
const JACKET: Net = { u: 16, v: 32, w: 8, h: 12, d: 4 };
const ARM_RIGHT: Net = { u: 40, v: 16, w: 4, h: 12, d: 4 };
const SLEEVE_RIGHT: Net = { u: 40, v: 32, w: 4, h: 12, d: 4 };
const ARM_LEFT: Net = { u: 32, v: 48, w: 4, h: 12, d: 4 };
const SLEEVE_LEFT: Net = { u: 48, v: 48, w: 4, h: 12, d: 4 };
const RLEG: Net = { u: 0, v: 16, w: 4, h: 12, d: 4 };
const RLEGOV: Net = { u: 0, v: 32, w: 4, h: 12, d: 4 };
const LLEG: Net = { u: 16, v: 48, w: 4, h: 12, d: 4 };
const LLEGOV: Net = { u: 0, v: 48, w: 4, h: 12, d: 4 };

interface Brush {
  buf: Uint8ClampedArray;
  px(x: number, y: number, c: RGB): void;
  rect(r: Rect, c: RGB): void;
  /** paint a face with a flat base colour and per-face tone (front full, sides dimmed). */
  face(n: Net, kind: keyof ReturnType<typeof netRects>, c: RGB, toneF?: number): void;
}

function brushOf(buf: Uint8ClampedArray): Brush {
  const px = (x: number, y: number, c: RGB) => {
    if (x < 0 || y < 0 || x >= SKIN_SHEET || y >= SKIN_SHEET) return;
    const i = (y * SKIN_SHEET + x) * 4;
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
  };
  const rect = (r: Rect, c: RGB) => { for (let y = r[1]; y < r[3]; y++) for (let x = r[0]; x < r[2]; x++) px(x, y, c); };
  const face = (n: Net, kind: keyof ReturnType<typeof netRects>, c: RGB, tf = 1) => rect(netRects(n)[kind], tone(c, tf));
  return { buf, px, rect, face };
}

/** local coords of the head FRONT face: local x/y 0..7 (front rect is 8..16, 8..16) */
function headFront(b: Brush, pxLocal: (lx: number, ly: number) => void): void {
  for (let ly = 0; ly < 8; ly++) for (let lx = 0; lx < 8; lx++) pxLocal(lx, ly);
}

/**
 * Generate the 64x64 RGBA sheet for a preset (pure; no DOM). Paints every base face so no part is
 * ever transparent, then adds the preset's hair / face / outfit art and per-face shading tones.
 */
export function builtinSkinPixels(preset: SkinPreset): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(SKIN_SHEET * SKIN_SHEET * 4);
  const b = brushOf(buf);
  // Slim (3px) arm UV nets occupy 14 rather than 16 columns. Keeping a 4px net
  // here shifts the front and back faces onto the wrong parts of the sheet.
  const RARM: Net = { ...ARM_RIGHT, w: preset.slim ? 3 : 4 };
  const RSLEEVE: Net = { ...SLEEVE_RIGHT, w: preset.slim ? 3 : 4 };
  const LARM: Net = { ...ARM_LEFT, w: preset.slim ? 3 : 4 };
  const LSLEEVE: Net = { ...SLEEVE_LEFT, w: preset.slim ? 3 : 4 };
  const SKIN = hexRgb(preset.skin), HAIR = hexRgb(preset.hair), SHIRT = hexRgb(preset.shirt), PANTS = hexRgb(preset.pants);
  const ACC = preset.accent ? hexRgb(preset.accent) : tone(SHIRT, 1.2);
  const slim = !!preset.slim;
  const EYE = [0x2b as number, 0x2b as number, 0x33] as RGB;
  const WHITE = [255, 255, 255] as RGB;
  const MOUTH = tone(SKIN, 0.55) as RGB;

  // ---- helpers that act in local head-face coords (front face 8x8, rows 8..16) ----
  const fPx = (lx: number, ly: number, c: RGB) => b.px(8 + lx, 8 + ly, c);
  const fRect = (x0: number, y0: number, x1: number, y1: number, c: RGB) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) fPx(x, y, c); };

  // base parts ---------------------------------------------------------------
  // head: skin with mild side dimming; top lit
  for (const k of ['front', 'back', 'left', 'right'] as const) b.face(HEAD, k, SKIN, k === 'front' || k === 'back' ? 1 : 0.92);
  b.face(HEAD, 'top', SKIN, 1.06);
  b.face(HEAD, 'bottom', SKIN, 0.8);
  // head right/left side faces are cols 16..24 / 0..8: give them a hair silhouette too later per style.
  // body + legs + arms base: shirt / pants / skin-tone arms (sleeves come from the overlay nets)
  for (const k of ['front', 'back'] as const) { b.face(BODY, k, SHIRT, 1); b.face(RLEG, k, PANTS, 1); b.face(LLEG, k, PANTS, 1); b.face(RARM, k, SKIN, 1); b.face(LARM, k, SKIN, 1); }
  for (const k of ['left', 'right'] as const) { b.face(BODY, k, SHIRT, 0.88); b.face(RLEG, k, PANTS, 0.85); b.face(LLEG, k, PANTS, 0.85); b.face(RARM, k, SKIN, 0.88); b.face(LARM, k, SKIN, 0.88); }
  b.face(BODY, 'top', SHIRT, 1.1); b.face(BODY, 'bottom', SHIRT, 0.6);
  for (const net of [RLEG, LLEG]) { b.face(net, 'top', PANTS, 1.08); b.face(net, 'bottom', PANTS, 0.55); }
  for (const net of [RARM, LARM]) { b.face(net, 'top', SKIN, 1.1); b.face(net, 'bottom', SKIN, 0.6); }
  // sleeve overlays (alphaTest cut): fill later per style; boots/shoes hem on leg bases:
  for (const net of [RLEG, LLEG]) { const r = netRects(net); const hem = tone(PANTS, 0.55); for (const k of ['front', 'back', 'left', 'right'] as const) { const rr = netRects(net)[k]; for (let x = rr[0]; x < rr[2]; x++) b.px(x, rr[3] - 2, hem); b.px(rr[0], rr[3] - 1, hem); b.px(rr[2] - 1, rr[3] - 1, hem); } }

  // eyes: a helper painting both eyes (local face coords)
  const eyes = (cols: [number, number], row = 3, color: RGB = EYE, w = 2, hgt = 2) => { for (const cx of cols) fRect(cx, row, cx + w, row + hgt, color); };
  const eyesWithWhites = (row = 3) => {
    fRect(1, row, 3, row + 3, WHITE); fRect(5, row, 7, row + 3, WHITE);
    fRect(1, row + 1, 3, row + 3, EYE); fRect(5, row + 1, 7, row + 3, EYE);
  };
  const mouth = () => fRect(3, 6, 5, 7, MOUTH);

  // ==========================================================================
  // per-skin art (front face + top/back/side silhouettes + outfits)
  // ==========================================================================
  if (preset.id === 'steve' || preset.id === 'custom') {
    // classic: short full hair cap, plain tunic, simple trousers
    fRect(0, 0, 8, 3, HAIR);                       // cap rows
    fRect(0, 3, 2, 5, HAIR); fRect(6, 3, 8, 5, HAIR); // fringe sides over forehead
    fPx(0, 5, HAIR); fPx(7, 5, HAIR);
    for (const k of ['top', 'back', 'left', 'right'] as const) {
      const r = netRects(HEAD)[k];
      if (k === 'top') b.rect(r, tone(HAIR, 1.05));
      else if (k === 'back') b.rect(r, HAIR); // full hair back
      else { b.rect([r[0], r[1], r[2], r[1] + 4], HAIR); b.px(r[0], r[1] + 5, HAIR); b.px(r[2] - 1, r[1] + 5, HAIR); }
    }
    eyes([1, 5], 3, EYE, 2, 2);
    mouth();
    // tunic: hem + shoulder shading
    const bf = netRects(BODY).front; for (let x = bf[0]; x < bf[2]; x++) b.px(x, bf[3] - 1, tone(SHIRT, 0.7));
    for (const net of [RSLEEVE, LSLEEVE]) { for (const k of ['front', 'back', 'left', 'right'] as const) { const r = netRects(net)[k]; const full = k === 'front' || k === 'back'; const c = full ? SHIRT : tone(SHIRT, 0.88); const rr = [r[0], r[1], r[2], r[1] + 8] as Rect; b.rect(rr, c); b.rect([r[0], r[3] - 4, r[2], r[3]], tone(SKIN, k === 'front' || k === 'back' ? 1 : 0.9)); } }
  } else if (preset.id === 'alex') {
    // shoulder-length hair with bangs, bright tee with short sleeves, slim
    fRect(0, 0, 8, 2, HAIR);
    fRect(0, 2, 8, 3, tone(HAIR, 1.05));
    fRect(0, 2, 2, 6, HAIR); fRect(6, 2, 8, 6, HAIR); // side hair panels
    fPx(0, 6, HAIR); fPx(7, 6, HAIR);
    for (const k of ['top', 'back', 'left', 'right'] as const) {
      const r = netRects(HEAD)[k];
      if (k === 'top') b.rect(r, HAIR);
      else if (k === 'back') b.rect(r, HAIR);
      else b.rect([r[0], r[1], r[2], r[1] + 5], HAIR);
    }
    eyesWithWhites(3);
    mouth();
    // tee body + short sleeves: sleeve overlay rows 0..4 only, bare lower arm
    const bf = netRects(BODY).front; b.rect([bf[0], bf[3] - 2, bf[2], bf[3]], tone(SHIRT, 0.75));
    for (const net of [RSLEEVE, LSLEEVE]) { for (const k of ['front', 'back', 'left', 'right'] as const) { const r = netRects(net)[k]; const c = k === 'front' || k === 'back' ? SHIRT : tone(SHIRT, 0.88); b.rect([r[0], r[1], r[2], r[1] + 5], c); } }
    // trousers with turn-ups
    for (const net of [RLEG, LLEG]) { const r = netRects(net).front; b.rect([r[0], r[1] + 10, r[2], r[3]], tone(PANTS, 0.8)); }
  } else if (preset.id === 'digger') {
    // miner: hard hat, stubble, high-vis jacket stripes, work gloves
    // hard hat (overlay head net): full top + brim
    for (const k of ['top', 'front', 'back', 'left', 'right'] as const) {
      const r = netRects(HAT)[k];
      if (k === 'top') b.rect(r, tone(hexRgb('#e8b820'), 1.05));
      else if (k === 'front') { b.rect([r[0], r[1], r[2], r[1] + 2], hexRgb('#e8b820')); b.rect([r[0], r[1] + 2, r[2], r[1] + 3], tone(hexRgb('#e8b820'), 0.7)); }
      else b.rect([r[0], r[1], r[2], r[1] + 2], tone(hexRgb('#e8b820'), 0.9));
    }
    fRect(0, 3, 8, 5, tone(SKIN, 0.8)); // stubble band under the brim
    eyes([1, 5], 3, EYE, 2, 1);
    mouth();
    // jacket: chest with reflective band
    const bf = netRects(BODY).front;
    b.rect([bf[0], bf[3] - 2, bf[2], bf[3]], tone(SHIRT, 0.7));
    for (let y = bf[1] + 4; y < bf[1] + 6; y++) for (let x = bf[0]; x < bf[2]; x++) b.px(x, y, tone(ACC, 1));
    for (const net of [RSLEEVE, LSLEEVE]) for (const k of ['front', 'back', 'left', 'right'] as const) { const r = netRects(net)[k]; const c = k === 'front' || k === 'back' ? SHIRT : tone(SHIRT, 0.85); b.rect([r[0], r[1], r[2], r[1] + 7], c); b.rect([r[0], r[1] + 7, r[2], r[3]], hexRgb('#4a3a28')); }
  } else if (preset.id === 'knight') {
    // knight: steel helm with face opening, chainmail hints, red tabard
    for (const k of ['top', 'front', 'back', 'left', 'right'] as const) {
      const r = netRects(HAT)[k];
      if (k === 'top') b.rect(r, tone(hexRgb('#cfd6df'), 1.05));
      else if (k === 'front') {
        b.rect([r[0], r[1], r[2], r[1] + 1], hexRgb('#cfd6df'));          // brow band
        b.rect([r[0], r[1] + 5, r[2], r[3]], hexRgb('#cfd6df'));          // chin guard
        b.rect([r[0], r[1] + 1, r[0] + 1, r[3]], hexRgb('#cfd6df'));      // cheeks
        b.rect([r[2] - 1, r[1] + 1, r[2], r[3]], hexRgb('#cfd6df'));
        b.rect([r[0] + 2, r[1] + 2, r[2] - 2, r[1] + 3], hexRgb('#2a2f3a')); // eye slit
      }
      else b.rect([r[0], r[1], r[2], r[1] + 2], hexRgb('#cfd6df'));
    }
    fRect(2, 3, 6, 5, SKIN); fRect(2, 5, 6, 6, tone(SKIN, 0.85)); // face opening + beard shadow
    // tabard
    const bf = netRects(BODY).front;
    b.rect([bf[0] + 2, bf[1], bf[0] + 6, bf[3]], hexRgb('#b03030'));
    b.rect([bf[0] + 3, bf[1], bf[0] + 5, bf[3]], tone(hexRgb('#b03030'), 1.2));
    for (let y = bf[1]; y < bf[3]; y++) { if ((y & 1) === 0) { b.px(bf[0] + 1, y, tone(SHIRT, 0.8)); b.px(bf[2] - 2, y, tone(SHIRT, 0.8)); } }
    for (const net of [RSLEEVE, LSLEEVE]) for (const k of ['front', 'back', 'left', 'right'] as const) { const r = netRects(net)[k]; const c = k === 'front' || k === 'back' ? hexRgb('#aab2bd') : tone(hexRgb('#aab2bd'), 0.85); b.rect([r[0], r[1], r[2], r[1] + 8], c); for (let x = r[0]; x < r[2]; x++) { if (((x + r[1]) & 1) === 0) b.px(x, r[1] + 1, tone(hexRgb('#aab2bd'), 0.75)); } }
    for (const net of [RLEG, LLEG]) { const r = netRects(net).front; b.rect([r[0], r[1] + 10, r[2], r[3]], tone(hexRgb('#3a3f4a'), 1)); }
  } else if (preset.id === 'ember') {
    // ember: flame-tipped spiky hair, ember-scarred clothes
    fRect(0, 0, 8, 1, hexRgb('#e0502f'));
    for (let lx = 0; lx < 8; lx++) { if (lx % 2 === 0) fPx(lx, 1, hexRgb('#ffd080')); else fPx(lx, 1, hexRgb('#c03020')); }
    fRect(0, 2, 8, 3, hexRgb('#a02018'));
    fPx(0, 3, hexRgb('#e0502f')); fPx(7, 3, hexRgb('#e0502f')); fPx(1, 4, hexRgb('#a02018')); fPx(6, 4, hexRgb('#a02018'));
    for (const k of ['top', 'back', 'left', 'right'] as const) {
      const r = netRects(HEAD)[k];
      if (k === 'top') { b.rect(r, hexRgb('#c03020')); for (let x = r[0]; x < r[2]; x++) if ((x & 1) === 0) b.px(x, r[1], hexRgb('#ffd080')); }
      else if (k === 'back') b.rect(r, hexRgb('#a02018'));
      else { b.rect([r[0], r[1], r[2], r[1] + 3], hexRgb('#a02018')); b.px(r[0], r[1] + 3, hexRgb('#e0502f')); b.px(r[2] - 1, r[1] + 3, hexRgb('#e0502f')); }
    }
    eyes([1, 5], 3, EYE, 2, 2);
    mouth();
    // ember-scorched coat: dark seams zigzag
    const bf = netRects(BODY).front;
    b.rect([bf[0], bf[3] - 2, bf[2], bf[3]], tone(SHIRT, 0.7));
    for (let y = bf[1] + 2; y < bf[3] - 2; y += 3) { const off = (y >> 1) & 1; b.px(bf[0] + off, y, hexRgb('#401810')); b.px(bf[2] - 2 + off, y, hexRgb('#401810')); }
    b.rect([bf[0] + 3, bf[1] + 4, bf[0] + 5, bf[1] + 9], hexRgb('#ffd080'));
    for (const net of [RSLEEVE, LSLEEVE]) for (const k of ['front', 'back', 'left', 'right'] as const) { const r = netRects(net)[k]; const c = k === 'front' || k === 'back' ? SHIRT : tone(SHIRT, 0.85); b.rect([r[0], r[1], r[2], r[1] + 9], c); b.rect([r[0], r[1] + 9, r[2], r[3]], hexRgb('#401810')); }
  } else if (preset.id === 'arbor') {
    // arbor: leafy bowl cut, mossy green tunic with leaf flecks
    fRect(0, 0, 8, 3, HAIR);
    fRect(0, 3, 1, 6, HAIR); fRect(7, 3, 8, 6, HAIR);
    fPx(0, 3, ACC); fPx(7, 3, ACC); // leaf flecks on the fringe corners (clear of the eyes)
    for (const k of ['top', 'back', 'left', 'right'] as const) {
      const r = netRects(HEAD)[k];
      if (k === 'top') b.rect(r, tone(HAIR, 1.05));
      else if (k === 'back') b.rect(r, HAIR);
      else { b.rect([r[0], r[1], r[2], r[1] + 5], HAIR); b.px(r[0], r[1] + 5, tone(HAIR, 1.2)); b.px(r[2] - 1, r[1] + 5, tone(HAIR, 1.2)); }
    }
    eyes([1, 5], 3, EYE, 2, 2);
    mouth();
    const bf = netRects(BODY).front;
    b.rect([bf[0], bf[1], bf[2], bf[1] + 2], tone(SHIRT, 1.12)); // moss highlight collar
    for (let y = bf[1] + 2; y < bf[3] - 2; y++) for (let x = bf[0] + 1; x < bf[2] - 1; x++) { if (((x + y * 3) % 9) === 0) b.px(x, y, ACC); }
    b.rect([bf[0], bf[3] - 3, bf[2], bf[3]], tone(hexRgb('#6a4a2a'), 1)); // belt
    for (const net of [RSLEEVE, LSLEEVE]) for (const k of ['front', 'back', 'left', 'right'] as const) { const r = netRects(net)[k]; const c = k === 'front' || k === 'back' ? SHIRT : tone(SHIRT, 0.88); b.rect([r[0], r[1], r[2], r[1] + 8], c); }
  } else if (preset.id === 'frost') {
    // frost: pale ice hair, winter coat with zip
    fRect(0, 0, 8, 3, HAIR);
    fRect(0, 2, 8, 4, tone(HAIR, 1.05));
    fRect(0, 3, 2, 7, HAIR); fRect(6, 3, 8, 7, HAIR);
    fPx(1, 7, HAIR); fPx(6, 7, HAIR);
    for (const k of ['top', 'back', 'left', 'right'] as const) {
      const r = netRects(HEAD)[k];
      if (k === 'top') b.rect(r, HAIR);
      else if (k === 'back') b.rect(r, HAIR);
      else b.rect([r[0], r[1], r[2], r[1] + 6], HAIR);
    }
    eyesWithWhites(3);
    fRect(3, 6, 5, 7, tone(SKIN, 0.7));
    const bf = netRects(BODY).front;
    b.rect([bf[0], bf[1], bf[2], bf[1] + 2], tone(hexRgb('#e8f4ff'), 1));  // collar
    b.rect([bf[0] + 3, bf[1] + 2, bf[0] + 5, bf[3] - 1], hexRgb('#e8f4ff')); // zip
    b.rect([bf[0] + 2, bf[1] + 2, bf[0] + 3, bf[3] - 1], tone(SHIRT, 0.75)); // zip shadow
    for (let y = bf[1] + 3; y < bf[3] - 2; y += 3) b.px(bf[0] + 4, y, hexRgb('#9fb8d0'));
    b.rect([bf[0], bf[3] - 2, bf[2], bf[3]], tone(SHIRT, 0.7));
    for (const net of [RSLEEVE, LSLEEVE]) for (const k of ['front', 'back', 'left', 'right'] as const) { const r = netRects(net)[k]; const c = k === 'front' || k === 'back' ? SHIRT : tone(SHIRT, 0.85); b.rect([r[0], r[1], r[2], r[1] + 9], c); b.rect([r[0], r[1] + 9, r[2], r[3]], hexRgb('#dce8f0')); }
    for (const net of [RLEG, LLEG]) { const r = netRects(net).front; b.rect([r[0], r[1] + 10, r[2], r[3]], hexRgb('#dce8f0')); }
  } else if (preset.id === 'rose') {
    // rose: bob with flower clip, puff-sleeve dress with skirt
    fRect(0, 0, 8, 2, HAIR);
    fRect(0, 2, 8, 4, tone(HAIR, 1.08)); // bangs
    fRect(0, 3, 2, 7, HAIR); fRect(6, 3, 8, 7, HAIR);
    fPx(6, 2, hexRgb('#ff9ecf')); fPx(6, 3, hexRgb('#ff9ecf')); fPx(7, 2, hexRgb('#ffe0f0')); // flower clip
    for (const k of ['top', 'back', 'left', 'right'] as const) {
      const r = netRects(HEAD)[k];
      if (k === 'top') b.rect(r, HAIR);
      else if (k === 'back') b.rect(r, HAIR);
      else b.rect([r[0], r[1], r[2], r[1] + 6], HAIR);
    }
    eyesWithWhites(3);
    fRect(1, 5, 2, 6, tone(SKIN, 1.08)); fRect(5, 5, 6, 6, tone(SKIN, 1.08)); // freckles
    fRect(3, 6, 5, 7, tone(SKIN, 0.7));
    // puff sleeves + dress top, skirt over the legs' upper rows
    for (const net of [RSLEEVE, LSLEEVE]) for (const k of ['front', 'back', 'left', 'right'] as const) { const r = netRects(net)[k]; const c = k === 'front' || k === 'back' ? SHIRT : tone(SHIRT, 0.88); b.rect([r[0], r[1], r[2], r[1] + 3], tone(c, 1.05)); }
    const bf = netRects(BODY).front;
    b.rect([bf[0], bf[1], bf[2], bf[1] + 2], tone(SHIRT, 1.15)); // sweetheart collar
    b.rect([bf[0], bf[3] - 2, bf[2], bf[3]], tone(SHIRT, 0.7));
    for (const net of [RLEGOV, LLEGOV]) { for (const k of ['front', 'back', 'left', 'right'] as const) { const r = netRects(net)[k]; const c = k === 'front' || k === 'back' ? SHIRT : tone(SHIRT, 0.9); b.rect([r[0], r[1], r[2], r[1] + 6], c); b.rect([r[0], r[1] + 6, r[2], r[1] + 7], tone(SHIRT, 0.75)); } }
    for (const net of [RLEG, LLEG]) for (const k of ['front', 'back', 'left', 'right'] as const) { const r = netRects(net)[k]; b.rect([r[0], r[1] + 6, r[2], r[3]], PANTS); }
    for (const net of [RLEG, LLEG]) { const r = netRects(net).front; b.rect([r[0], r[1] + 10, r[2], r[3]], hexRgb('#e8a0c0')); }
  } else if (preset.id === 'stargazer') {
    // midnight hood with a gold star on the hood and coat
    fRect(0, 0, 8, 2, HAIR); fRect(0, 2, 2, 7, HAIR); fRect(6, 2, 8, 7, HAIR);
    for (const k of ['top', 'back', 'left', 'right'] as const) b.rect(netRects(HEAD)[k], tone(HAIR, k === 'top' ? 1.2 : 0.9));
    eyesWithWhites(3); mouth();
    b.px(11, 1, ACC); b.px(10, 2, ACC); b.px(11, 2, ACC); b.px(12, 2, ACC); b.px(11, 3, ACC);
    const r = netRects(BODY).front;
    for (let y = r[1] + 1; y < r[3] - 1; y++) b.px(r[0] + 4, y, ACC);
    for (const n of [RSLEEVE, LSLEEVE]) for (const k of ['front', 'back', 'left', 'right'] as const) {
      const sr = netRects(n)[k]; b.rect([sr[0], sr[1], sr[2], sr[3] - 3], SHIRT);
      b.rect([sr[0], sr[3] - 4, sr[2], sr[3] - 3], ACC);
    }
  } else if (preset.id === 'tinkerer') {
    // copper goggles, teal lenses, workshop apron and cuffed sleeves
    fRect(0, 0, 8, 2, HAIR);
    for (const k of ['top', 'back', 'left', 'right'] as const) b.rect(netRects(HEAD)[k], HAIR);
    fRect(0, 3, 8, 4, tone(SHIRT, 0.65));
    fRect(1, 3, 3, 5, ACC); fRect(5, 3, 7, 5, ACC); mouth();
    const r = netRects(BODY).front;
    b.rect([r[0] + 1, r[1] + 4, r[2] - 1, r[3]], tone(SHIRT, 0.72));
    b.rect([r[0] + 3, r[1] + 7, r[0] + 5, r[1] + 9], ACC);
    for (const n of [RSLEEVE, LSLEEVE]) for (const k of ['front', 'back', 'left', 'right'] as const) {
      const sr = netRects(n)[k]; b.rect([sr[0], sr[1], sr[2], sr[1] + 7], SHIRT);
      b.rect([sr[0], sr[1] + 7, sr[2], sr[1] + 8], ACC);
    }
  } else if (preset.id === 'nightfall' || preset.id === 'cinder') {
    // Layered streetwear / explorer looks: the base garment has real face shading,
    // while an independent transparent second layer adds coat, hood, cuffs and straps.
    // Inspired by the density of hand-pixelled skin sheets, not copied from any skin.
    const night = preset.id === 'nightfall';
    const edge = tone(SHIRT, 1.45), shadow = tone(SHIRT, 0.64);
    const metal = night ? hexRgb('#e1d0f3') : hexRgb('#ddd0a6');
    const hairLight = tone(HAIR, 1.55);
    fRect(0, 0, 8, 2, HAIR); fRect(0, 2, 2, 5, HAIR); fRect(6, 2, 8, 5, HAIR);
    fPx(2, 2, HAIR); fPx(3, 2, hairLight); fPx(5, 2, HAIR);
    fPx(1, 5, HAIR); fPx(6, 5, HAIR);
    // The hood covers the back and crown but leaves the front hair and face visible.
    for (const k of ['top', 'back', 'left', 'right'] as const) {
      const r = netRects(HEAD)[k]; b.rect(r, k === 'top' ? edge : shadow);
      if (k !== 'top') for (let x = r[0]; x < r[2]; x += 2) b.px(x, r[1] + 1, SHIRT);
    }
    // Small eyes, highlights and a face shadow; no giant flat eye rectangles.
    fPx(2, 4, hexRgb('#f5ede7')); fPx(5, 4, hexRgb('#f5ede7'));
    fPx(2, 5, night ? hexRgb('#716995') : hexRgb('#806b56'));
    fPx(5, 5, night ? hexRgb('#716995') : hexRgb('#806b56'));
    fPx(3, 7, tone(SKIN, .78)); fPx(4, 7, tone(SKIN, .78));
    // Hood lip on the actual raised hat layer, with little metallic stitch points.
    const hood = netRects(HAT).front;
    b.rect([hood[0], hood[1], hood[2], hood[1] + 1], edge);
    b.px(hood[0], hood[1] + 2, edge); b.px(hood[2] - 1, hood[1] + 2, edge);
    b.px(hood[0], hood[1] + 4, shadow); b.px(hood[2] - 1, hood[1] + 4, shadow);
    for (const k of ['top', 'back', 'left', 'right'] as const) {
      const r = netRects(HAT)[k]; b.rect(r, k === 'top' ? edge : SHIRT);
      for (let x = r[0] + 1; x < r[2]; x += 3) b.px(x, r[1] + 1, shadow);
    }
    // Tailored jacket over the base: cuffs and side seams are repeated on all four faces.
    for (const k of ['front', 'back', 'left', 'right'] as const) {
      const r = netRects(JACKET)[k];
      b.rect(r, k === 'front' ? edge : SHIRT);
      for (let y = r[1] + 2; y < r[3] - 2; y += 3) {
        b.px(r[0], y, shadow); b.px(r[2] - 1, y, shadow);
      }
      b.rect([r[0], r[3] - 2, r[2], r[3] - 1], shadow);
    }
    const jf = netRects(JACKET).front;
    b.rect([jf[0] + 2, jf[1], jf[2] - 2, jf[1] + 2], shadow); // open collar
    for (let y = jf[1] + 2; y < jf[3] - 2; y++) {
      b.px(jf[0] + 3, y, shadow); b.px(jf[0] + 4, y, ACC);
      if (y % 3 === 0) b.px(jf[0] + 3, y, metal); // fasteners
    }
    b.rect([jf[0] + 1, jf[3] - 4, jf[2] - 1, jf[3] - 3], ACC); // belt
    b.px(jf[0] + 3, jf[3] - 4, metal); b.px(jf[0] + 4, jf[3] - 4, metal);
    if (night) { // lavender asymmetric shoulder emblem
      b.px(jf[0] + 1, jf[1] + 3, ACC); b.px(jf[0] + 2, jf[1] + 4, metal);
      b.px(jf[0] + 1, jf[1] + 5, ACC);
    } else { // warm diagonally crossed utility strap
      for (let y = 1; y < 7; y++) b.px(jf[0] + Math.min(6, y), jf[1] + y, ACC);
      b.px(jf[0] + 5, jf[1] + 5, metal);
    }
    for (const n of [RSLEEVE, LSLEEVE]) for (const k of ['front', 'back', 'left', 'right'] as const) {
      const r = netRects(n)[k]; b.rect(r, SHIRT);
      b.rect([r[0], r[1] + 2, r[2], r[1] + 3], edge);
      b.rect([r[0], r[3] - 3, r[2], r[3] - 1], shadow);
      for (let y = r[1] + 4; y < r[3] - 3; y += 3) b.px(r[0] + 1, y, ACC);
    }
    for (const n of [RLEGOV, LLEGOV]) for (const k of ['front', 'back', 'left', 'right'] as const) {
      const r = netRects(n)[k]; b.rect([r[0], r[1], r[2], r[1] + 3], SHIRT);
      b.rect([r[0], r[1] + 2, r[2], r[1] + 3], ACC);
      b.rect([r[0], r[3] - 3, r[2], r[3] - 2], shadow);
    }
    for (const n of [RLEG, LLEG]) for (const k of ['front', 'back', 'left', 'right'] as const) {
      const r = netRects(n)[k]; b.rect([r[0], r[3] - 3, r[2], r[3]], shadow);
      b.rect([r[0], r[3] - 3, r[2], r[3] - 2], ACC);
    }
  } else {
    // generic fallback (any future preset): hair cap + plain shirt so nothing is ever empty
    fRect(0, 0, 8, 3, HAIR);
    for (const k of ['top', 'back', 'left', 'right'] as const) { const r = netRects(HEAD)[k]; if (k === 'top') b.rect(r, tone(HAIR, 1.05)); else b.rect([r[0], r[1], r[2], r[1] + (k === 'back' ? 3 : 4)], HAIR); }
    eyes([1, 5], 3, EYE, 2, 2); mouth();
  }

  // Minecraft eyes. Painted last so hair, stubble, bangs and goggles cannot replace them.
  // The shape is the one every default skin uses: a 2x2 eye, white sclera on top, coloured
  // iris below, darker pupil toward the nose, sitting on rows 4-5 of the 8x8 face with a
  // one-pixel skin margin and a two-pixel nose between them. Solid dark rectangles and
  // single-pixel dots do not read as Minecraft eyes.
  {
    const IRIS: Record<string, RGB> = {
      steve: [58, 98, 168],
      alex: [52, 148, 64],
      digger: [72, 82, 104],
      knight: [86, 108, 146],
      ember: [214, 108, 36],
      arbor: [62, 128, 54],
      frost: [120, 176, 220],
      rose: [72, 138, 86],
      stargazer: [168, 146, 214],
      tinkerer: [48, 150, 142],
      nightfall: [132, 112, 184],
      cinder: [196, 128, 62],
    };
    const iris = IRIS[preset.id] ?? [58, 98, 168];
    const pupil = tone(iris, 0.45);
    const white: RGB = [255, 255, 255];
    // The older helpers painted a solid dark block on the row above the real eye. That bar is
    // what made the face read as two black rectangles. The Minecraft eye is exactly two pixels
    // tall, with skin (not hair, not a dark block) on the row above it.
    fPx(1, 3, SKIN); fPx(2, 3, SKIN); fPx(5, 3, SKIN); fPx(6, 3, SKIN);
    fPx(1, 4, white); fPx(2, 4, white);
    fPx(1, 5, iris); fPx(2, 5, pupil);
    fPx(5, 4, white); fPx(6, 4, white);
    fPx(5, 5, pupil); fPx(6, 5, iris);
    // nose: two darker skin pixels under the bridge. Leave row 6 alone so the mouth stays.
    fPx(3, 5, tone(SKIN, 0.84)); fPx(4, 5, tone(SKIN, 0.74));
    // helm / hood overlays must not paint over the eyes — cut a window so the whites show
    if (preset.id === 'knight' || preset.id === 'digger' || preset.id === 'nightfall' || preset.id === 'cinder' || preset.id === 'tinkerer') {
      const hx0 = 40, hy0 = 8; // hat-overlay front face
      for (const [lx, ly] of [[1, 4], [2, 4], [1, 5], [2, 5], [5, 4], [6, 4], [5, 5], [6, 5]] as const) {
        const i = ((hy0 + ly) * SKIN_SHEET + (hx0 + lx)) * 4;
        buf[i + 3] = 0;
      }
    }
  }

  // Shoulder caps of the arm overlays: whatever the branch painted on the sleeve's first side row is
  // carried onto the 8x4 cap face above it, so the shoulder reads as cloth (sleeve / pauldron /
  // parka shoulder) on the figure and the first-person arm instead of bare skin. Generic, so future
  // presets inherit it for free.
  for (const net of [RSLEEVE, LSLEEVE]) {
    const fr = netRects(net).front;
    const i = (fr[1] * SKIN_SHEET + fr[0]) * 4;
    if (buf[i + 3] > 128) b.rect(netRects(net).top, [buf[i], buf[i + 1], buf[i + 2]]);
  }
  // Hand-pixelled fabric grain on flat base faces only. Matching the original RGB
  // preserves individually painted features and overlays (eyes, insignia, buckles).
  for (const [net, base] of [[BODY, SHIRT], [RLEG, PANTS], [LLEG, PANTS]] as const) {
    for (const face of ['front', 'back'] as const) {
      const r = netRects(net)[face];
      for (let y = r[1] + 1; y < r[3] - 1; y++) for (let x = r[0] + 1; x < r[2] - 1; x++) {
        const i = (y * SKIN_SHEET + x) * 4;
        if (buf[i] !== base[0] || buf[i + 1] !== base[1] || buf[i + 2] !== base[2]) continue;
        const fleck = (x * 19 + y * 37 + preset.id.length * 7) % 11;
        if (fleck === 0 || fleck === 3) {
          const c = tone(base, fleck === 0 ? 1.13 : .89);
          buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
        }
      }
    }
  }
  return buf;
}

// ---- canvas wrapper (browser only) -----------------------------------------
const builtinCache = new Map<string, HTMLCanvasElement>();
export function builtinSkinCanvas(preset: SkinPreset): HTMLCanvasElement | null {
  let c = builtinCache.get(preset.id);
  if (!c) {
    const pix = builtinSkinPixels(preset);
    c = document.createElement('canvas');
    c.width = SKIN_SHEET; c.height = SKIN_SHEET;
    const g = c.getContext('2d');
    if (!g) return null; // no 2D context: callers fall back to the palette figure/arm
    const img = g.createImageData(SKIN_SHEET, SKIN_SHEET);
    img.data.set(pix);
    g.putImageData(img, 0, 0);
    builtinCache.set(preset.id, c);
  }
  return c;
}

// ---- picker portrait --------------------------------------------------------
// A 16x32 front-view portrait assembled from the SAME sheet the model uses: head/body/arms/legs
// front faces with their overlay faces (hair, hat, sleeves, jacket, skirt) composited on top, so a
// picker card is a faithful miniature of the 3D figure - not a separate drawing.

function sampleRegion(src: Uint8ClampedArray, rx: number, ry: number, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((ry + y) * SKIN_SHEET + (rx + x)) * 4;
    const d = (y * w + x) * 4;
    out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2]; out[d + 3] = src[s + 3];
  }
  return out;
}

/** Compose base + overlay front faces (overlay wins where painted). */
function frontPair(src: Uint8ClampedArray, base: Rect, over: Rect): Uint8ClampedArray {
  const w = base[2] - base[0], h = base[3] - base[1];
  const b = sampleRegion(src, base[0], base[1], w, h);
  const o = sampleRegion(src, over[0], over[1], over[2] - over[0], over[3] - over[1]);
  for (let i = 0; i < w * h; i++) if (o[i * 4 + 3] > 128) { b[i * 4] = o[i * 4]; b[i * 4 + 1] = o[i * 4 + 1]; b[i * 4 + 2] = o[i * 4 + 2]; b[i * 4 + 3] = 255; }
  return b;
}

/** 16x32 RGBA front portrait (pure) built from the preset's own sheet. */
export function builtinPortraitPixels(preset: SkinPreset): Uint8ClampedArray {
  const sheet = builtinSkinPixels(preset);
  const R = netRects;
  const aw = preset.slim ? 3 : 4;
  const rArmNet = { ...ARM_RIGHT, w: aw }, lArmNet = { ...ARM_LEFT, w: aw };
  const rSleeveNet = { ...SLEEVE_RIGHT, w: aw }, lSleeveNet = { ...SLEEVE_LEFT, w: aw };
  const head = frontPair(sheet, R(HEAD).front, R(HAT).front);       // 8x8
  const body = frontPair(sheet, R(BODY).front, R(JACKET).front);   // 8x12
  const rArm = frontPair(sheet, R(rArmNet).front, R(rSleeveNet).front);  // 4x12
  const lArm = frontPair(sheet, R(lArmNet).front, R(lSleeveNet).front);  // 4x12
  const rLeg = frontPair(sheet, R(RLEG).front, R(RLEGOV).front);   // 4x12
  const lLeg = frontPair(sheet, R(LLEG).front, R(LLEGOV).front);   // 4x12
  const out = new Uint8ClampedArray(16 * 32 * 4);
  const place = (part: Uint8ClampedArray, w: number, h: number, dx: number, dy: number) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const a = part[s + 3];
      if (a < 128) continue;
      const d = ((dy + y) * 16 + (dx + x)) * 4;
      out[d] = part[s]; out[d + 1] = part[s + 1]; out[d + 2] = part[s + 2]; out[d + 3] = 255;
    }
  };
  place(head, 8, 8, 4, 0);
  place(body, 8, 12, 4, 8);
  place(rArm, aw, 12, 4 - aw, 8);
  place(lArm, aw, 12, 12, 8);
  place(rLeg, 4, 12, 4, 20);
  place(lLeg, 4, 12, 8, 20);
  return out;
}

const portraitCache = new Map<string, HTMLCanvasElement>();
export function builtinPortraitCanvas(preset: SkinPreset, scale: number): HTMLCanvasElement | null {
  const key = preset.id + '@' + scale;
  let c = portraitCache.get(key);
  if (!c) {
    const pix = builtinPortraitPixels(preset);
    c = document.createElement('canvas');
    c.width = 16 * scale; c.height = 32 * scale;
    const g = c.getContext('2d');
    if (!g) return null;
    const img = g.createImageData(16, 32);
    img.data.set(pix);
    const tmp = document.createElement('canvas');
    tmp.width = 16; tmp.height = 32;
    const tg = tmp.getContext('2d');
    if (!tg) return null;
    tg.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(tmp, 0, 0, c.width, c.height);
    portraitCache.set(key, c);
  }
  return c;
}

/** Pure RGBA pixel builder for a customized avatar palette with optional headwear. */
export function customAvatarSkinPixels(skin: string, hair: string, shirt: string, pants: string, slim: boolean, headwear = 'none'): Uint8ClampedArray {
  const p: SkinPreset = {
    id: 'custom',
    name: 'Custom',
    skin,
    hair,
    shirt,
    pants,
    slim,
  };
  const buf = builtinSkinPixels(p);
  if (headwear && headwear !== 'none') {
    paintHeadwearSheet(buf, headwear);
  }
  return buf;
}

const customAvatarCache = new Map<string, HTMLCanvasElement>();
/** Cached 64x64 canvas for customized avatar palette and headwear. */
export function customAvatarSkinCanvas(skin: string, hair: string, shirt: string, pants: string, slim: boolean, headwear = 'none'): HTMLCanvasElement {
  const key = `${skin}|${hair}|${shirt}|${pants}|${slim ? 's' : 'c'}|${headwear}`;
  let c = customAvatarCache.get(key);
  if (!c) {
    const pix = customAvatarSkinPixels(skin, hair, shirt, pants, slim, headwear);
    c = document.createElement('canvas');
    c.width = SKIN_SHEET; c.height = SKIN_SHEET;
    const g = c.getContext('2d');
    if (g) {
      const img = g.createImageData(SKIN_SHEET, SKIN_SHEET);
      img.data.set(pix);
      g.putImageData(img, 0, 0);
    }
    customAvatarCache.set(key, c);
  }
  return c;
}

