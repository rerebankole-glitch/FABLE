// Crisp flat 2.5D ("cabinet") renderer for character skins.
//
// The 3D preview rig is great for the inventory, but it is the wrong tool for a store grid: one
// WebGL context per card exhausts the browser's context budget, and downscaling a render into a
// small card turns 16x16 skin texels to mush. This renderer instead projects the vanilla cuboids
// through an oblique cabinet projection and paints every visible face of the 64x64 sheet with
// nearest-neighbour sampling, so the art keeps hard pixel edges at any size (the classic
// Minecraft skin-card look) with no WebGL involved.
//
// Geometry (texel units, 16 per block; x centred on the body, y up from the soles, z towards
// the viewer, +z at the front of the model):
//   head   x -4..4   y 24..32  z -4..4
//   body   x -4..4   y 12..24  z -2..2
//   arms   x 4..8 and -8..-4   y 12..24  z -2..2
//   legs   x 0..4 and -4..0    y  0..12  z -2..2
// Overlay layers (hat, jacket, sleeves, trouser overlays) are the same cuboids inflated by 1/16
// of each dimension, exactly like vanilla's 1.125-scale overlay pass.

import { skinPartFaceRects, type FaceRect, type SkinPartRects } from './Skins';

/** Receding-axis foreshortening: cabinet projection at 45°, halved (0.354 texels per depth texel). */
const K = Math.SQRT1_2 / 2;
/** Depth of the head's front plane. It is the near plane, so it projects with no offset and the
 *  rest of the figure steps back/up-left from it. */
const Z_REF = 4;

export interface ViewBox { x: number; y: number; w: number; h: number }

/** Viewing box in texels (x to the right, y up): the whole figure, centred, with ~0.5 texel of
 *  margin all round (the overlay layers stick 0.25 texels out on every side, the soles included). */
export const FIGURE_BOX: ViewBox = { x: -11.42, y: -0.61, w: 20.0, h: 36.6 };
/** Viewing box for a lone head (store avatars, chips): the hat overlay plus the oblique offset. */
export const HEAD_BOX: ViewBox = { x: -8.1, y: 22.72, w: 13.38, h: 13.38 };

/** Width / height ratio of a view box — cards size their art box with this. */
export const viewAspect = (b: ViewBox): number => b.w / b.h;
export const FIGURE_ASPECT = viewAspect(FIGURE_BOX);

/** Device pixels per skin texel when a view box is fitted into a `w` x `h` buffer. */
export const fitScale = (box: ViewBox, width: number, height: number): number =>
  Math.max(1, Math.min(width / box.w, height / box.h));

interface Box { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }
type Face = 'top' | 'right' | 'front';

interface PartSpec {
  name: keyof SkinPartRects;
  box: Box;
  /** overlay inflation per axis (texels) */
  inflate: [number, number, number];
}

const FACE_ORDER: Face[] = ['top', 'right', 'front'];

/** Body parts in painter order: far-side limbs first, head last (its front plane is nearest). */
function bodyParts(armWidth: number): PartSpec[] {
  const aw = armWidth;
  const leg = (x0: number, x1: number): Box => ({ x0, x1, y0: 0, y1: 12, z0: -2, z1: 2 });
  const arm = (x0: number, x1: number): Box => ({ x0, x1, y0: 12, y1: 24, z0: -2, z1: 2 });
  const limb = (w: number): [number, number, number] => [w / 16, 12 / 16, 4 / 16];
  return [
    { name: 'leftArm', box: arm(4, 4 + aw), inflate: limb(aw) },
    { name: 'leftLeg', box: leg(0, 4), inflate: limb(4) },
    { name: 'body', box: arm(-4, 4), inflate: limb(8) },
    { name: 'rightLeg', box: leg(-4, 0), inflate: limb(4) },
    { name: 'rightArm', box: arm(-4 - aw, -4), inflate: limb(aw) },
    // the hat layer is 1.125x the head in every direction: half a texel per side
    { name: 'head', box: { x0: -4, x1: 4, y0: 24, y1: 32, z0: -4, z1: 4 }, inflate: [0.5, 0.5, 0.5] },
  ];
}

export interface FigureBounds { minX: number; minY: number; maxX: number; maxY: number }

/** Projected extent (texels, y up) of the whole figure including every overlay layer. */
export function figureBounds(slim = false): FigureBounds {
  const b: FigureBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const { box, inflate } of bodyParts(slim ? 3 : 4)) {
    const p: Box = {
      x0: box.x0 - inflate[0], x1: box.x1 + inflate[0],
      y0: box.y0 - inflate[1], y1: box.y1 + inflate[1],
      z0: box.z0 - inflate[2], z1: box.z1 + inflate[2],
    };
    for (const [x, y, z] of [
      [p.x0, p.y0, p.z0], [p.x0, p.y1, p.z0], [p.x1, p.y0, p.z0], [p.x1, p.y1, p.z0],
      [p.x0, p.y0, p.z1], [p.x0, p.y1, p.z1], [p.x1, p.y0, p.z1], [p.x1, p.y1, p.z1],
    ]) {
      const [vx, vy] = project(x, y, z);
      b.minX = Math.min(b.minX, vx); b.maxX = Math.max(b.maxX, vx);
      b.minY = Math.min(b.minY, vy); b.maxY = Math.max(b.maxY, vy);
    }
  }
  return b;
}

const HEAD_PART: PartSpec = { name: 'head', box: { x0: -4, x1: 4, y0: 24, y1: 32, z0: -4, z1: 4 }, inflate: [0.5, 0.5, 0.5] };

/** Project a model-space point onto the view plane (texels, y up). */
function project(x: number, y: number, z: number): [number, number] {
  const back = K * (Z_REF - z); // deeper points step up and to the left
  return [x - back, y + back];
}

/** Face dimensions (texels): front = w x h, side = d x h, top = w x d. */
function faceSize(face: Face, b: Box): [number, number] {
  const w = b.x1 - b.x0, h = b.y1 - b.y0, d = b.z1 - b.z0;
  if (face === 'front') return [w, h];
  if (face === 'right') return [d, h];
  return [w, d];
}

/** Maps a face's local texture space (u right, v down, in sheet texels) onto the view plane. */
function faceMatrix(face: Face, b: Box): [number, number, number, number, number, number] {
  if (face === 'front') {
    const [ox, oy] = project(b.x0, b.y1, b.z1);
    return [1, 0, 0, -1, ox, oy];
  }
  // the side and the top face both start at the box's back-top corner
  const [ox, oy] = project(b.x0, b.y1, b.z0);
  if (face === 'right') return [K, -K, 0, -1, ox, oy]; // u runs back -> front along z
  return [1, 0, K, -K, ox, oy];                        // u runs left -> right along x
}

/**
 * Paint one face of a cuboid. `bleed` (device px) grows the quad slightly so two faces that share
 * an edge never leave a hairline of background between them.
 */
function paintFace(
  ctx: CanvasRenderingContext2D, sheet: CanvasImageSource, rect: FaceRect, face: Face, b: Box,
  view: ViewBox, scale: number, bleedPx: number, off: [number, number],
): void {
  const [fw, fh] = faceSize(face, b);
  if (fw <= 0 || fh <= 0) return;
  const [a, b1, c, d, e, f] = faceMatrix(face, b);
  const bleed = bleedPx / scale;
  const su = 1 + (2 * bleed) / fw, sv = 1 + (2 * bleed) / fh;
  const na = a * su, nb = b1 * su, nc = c * sv, nd = d * sv;
  const ne = e - bleed * a - bleed * c;
  const nf = f - bleed * b1 - bleed * d;
  ctx.save();
  // view box -> device pixels (flipped y, centred in the buffer), then the face's own local frame
  ctx.setTransform(scale, 0, 0, -scale, off[0] - view.x * scale, off[1] + (view.y + view.h) * scale);
  ctx.transform(na, nb, nc, nd, ne, nf);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet, rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1], 0, 0, fw, fh);
  ctx.restore();
}

/** Paint a list of parts (base + overlay layers) into an already prepared context. */
function paintParts(
  ctx: CanvasRenderingContext2D, sheet: CanvasImageSource, slim: boolean, parts: PartSpec[],
  view: ViewBox, scale: number, bleedPx: number, off: [number, number],
): void {
  const { base, overlay } = skinPartFaceRects(slim);
  for (const { name, box, inflate } of parts) {
    const inflated: Box = {
      x0: box.x0 - inflate[0], x1: box.x1 + inflate[0],
      y0: box.y0 - inflate[1], y1: box.y1 + inflate[1],
      z0: box.z0 - inflate[2], z1: box.z1 + inflate[2],
    };
    for (const face of FACE_ORDER) paintFace(ctx, sheet, base[name][face], face, box, view, scale, bleedPx, off);
    for (const face of FACE_ORDER) paintFace(ctx, sheet, overlay[name][face], face, inflated, view, scale, bleedPx, off);
  }
}

export interface FigureDrawOptions {
  /** device pixels per texel */
  scale: number;
  /** half-extent (device px) painted around each face so neighbouring faces never leave a seam */
  bleed?: number;
}

/** Paint the full character. The context is cleared first; the figure fills the buffer. */
export function drawFigure(
  ctx: CanvasRenderingContext2D, sheet: CanvasImageSource, slim: boolean, opts: FigureDrawOptions & { width: number; height: number; view?: ViewBox; shadow?: boolean },
): void {
  const view = opts.view ?? FIGURE_BOX;
  const { width, height, scale } = opts;
  const off: [number, number] = [(width - view.w * scale) / 2, (height - view.h * scale) / 2];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (opts.shadow !== false) {
    // soft contact shadow, squashed onto the oblique ground plane under the soles
    const cx = width / 2, cy = off[1] + (view.y + view.h - 0.7) * scale;
    const rx = 4.8 * scale, ry = 1.35 * scale;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    g.addColorStop(0, 'rgba(0,0,0,0.32)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.14)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  paintParts(ctx, sheet, slim, bodyParts(slim ? 3 : 4), view, scale, opts.bleed ?? 0.5, off);
}

/** Just the head in oblique view: a compact avatar for lists, chips and the coin pill. */
export function drawHead(ctx: CanvasRenderingContext2D, sheet: CanvasImageSource, opts: { size: number; bleed?: number }): void {
  const scale = fitScale(HEAD_BOX, opts.size, opts.size);
  const off: [number, number] = [(opts.size - HEAD_BOX.w * scale) / 2, (opts.size - HEAD_BOX.h * scale) / 2];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, opts.size, opts.size);
  paintParts(ctx, sheet, false, [HEAD_PART], HEAD_BOX, scale, opts.bleed ?? 0.5, off);
}
