import * as THREE from 'three';
import { settings } from './Settings';
import { presetById, builtinSkinCanvas, customAvatarSkinCanvas } from './Skins';
import { attachHeadwear3D } from './Headwear';

/**
 * Player skin textures: upload decoding, classic-64x32 conversion, the baked 64x64 canvas cache and
 * the vanilla voxel figure built from a skin. A "skin" is always normalized to a 64x64 canvas here;
 * anything else square is nearest-neighbour sampled down, and classic 2:1 layouts (64x32, 128x64, …)
 * are expanded to the modern layout (the right half of the figure mirrored over to the left side).
 */
export const SKIN_W = 64;

const canvasCache = new Map<string, HTMLCanvasElement>();
const busy = new Map<string, Promise<void>>();

export interface SkinInfo {
  url: string;
  name: string;
  /** slim (3px) arms were detected on this skin */
  slim: boolean;
  /** the baked, normalized 64x64 canvas */
  canvas: HTMLCanvasElement;
}

export type SkinLoadResult = { ok: true; skin: SkinInfo } | { ok: false; error: string }

function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode failed'));
    img.src = src;
  });
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('read failed'));
    fr.readAsDataURL(file);
  });
}

function newCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

function drawNearest(ctx: CanvasRenderingContext2D, img: CanvasImageSource, dw: number, dh: number): void {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, dw, dh);
  ctx.drawImage(img, 0, 0, dw, dh);
}

/** Nearest-sample any square skin down/up to 64x64. */
export function bakeSquare(img: CanvasImageSource): HTMLCanvasElement {
  const source = img as HTMLImageElement;
  // Modern HD sheets keep their pixel density while sharing the 64px UV layout.
  const side = [64, 128, 256, 512].includes(source.width) && source.width === source.height ? source.width : SKIN_W;
  const [c, g] = newCanvas(side, side);
  drawNearest(g, img, side, side);
  return c;
}

/**
 * Expand a classic 2:1 skin (only the right half of the figure is painted) into the modern 64x64
 * layout: rows 0-31 (head, body, right arm, right leg + their top faces) copy straight; the left arm
 * and left leg are built by mirroring the right side's faces, and overlay regions stay transparent.
 */
export function convertClassic(img: CanvasImageSource): HTMLCanvasElement {
  // normalize the 2:1 source into the top half of a 64x64 working canvas (1:1 pixels)
  const [src, sg] = newCanvas(SKIN_W, SKIN_W);
  sg.imageSmoothingEnabled = false;
  sg.drawImage(img, 0, 0, SKIN_W, SKIN_W / 2);
  const [c, g] = newCanvas(SKIN_W, SKIN_W);
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, SKIN_W, SKIN_W / 2, 0, 0, SKIN_W, SKIN_W / 2); // rows 0-31 stay 1:1
  const srcPx = sg.getImageData(0, 0, SKIN_W, SKIN_W).data;
  // mirror helper: copies a face rect, flips it horizontally at the pixel level and paints it at
  // the destination slot (pixel-level, so it works on every canvas implementation)
  const mirror = (sx: number, sy: number, dx: number, dy: number, w: number, h: number) => {
    const out = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = ((sy + y) * SKIN_W + (sx + x)) * 4;
        const o = (y * w + (w - 1 - x)) * 4;
        out.data[o] = srcPx[s]; out.data[o + 1] = srcPx[s + 1]; out.data[o + 2] = srcPx[s + 2]; out.data[o + 3] = srcPx[s + 3];
      }
    }
    g.putImageData(out, dx, dy);
  };
  // ---- left arm: destination net (32,48) 16 wide x 16 tall (rows 48-63). Face slots for a
  // 4-deep/4-wide arm: left=32-35, front=36-39, right=40-43, back=44-47 (same row band per face).
  // Right arm source net: (40,16): left=40-43, front=44-47, right=48-51, back=52-55, rows 16-31.
  const H = 12; // side face height rows
  // side faces: right arm rows 20..31 -> left arm rows 52..63
  mirror(48, 20, 32, 52, 4, H); // src right face  -> dst left face
  mirror(44, 20, 36, 52, 4, H); // src front face  -> dst front face
  mirror(40, 20, 40, 52, 4, H); // src left face   -> dst right face
  mirror(52, 20, 44, 52, 4, H); // src back face   -> dst back face
  // top face (src rows 16..19 at cols 44..47 -> dst rows 48..51 cols 36..39) and bottom face
  mirror(44, 16, 36, 48, 4, 4);
  mirror(44, 28, 36, 60, 4, 4);
  // ---- left leg: destination net (16,48): left=16-19, front=20-23, right=24-27, back=28-31 rows 48-63.
  // Right leg source net: (0,16): left=0-3, front=4-7, right=8-11, back=12-15.
  mirror(8, 20, 16, 52, 4, H);  // src right -> dst left
  mirror(4, 20, 20, 52, 4, H);  // src front -> dst front
  mirror(0, 20, 24, 52, 4, H);  // src left  -> dst right
  mirror(12, 20, 28, 52, 4, H); // src back  -> dst back
  mirror(4, 16, 20, 48, 4, 4);  // top
  mirror(4, 28, 20, 60, 4, 4);  // bottom
  return c;
}

/** The right-arm base net spans atlas columns 40-56. Wide arms fill all 16 columns; slim (3px)
 *  arms stop after 14, leaving the last two columns transparent. */
export function guessSlim(c: HTMLCanvasElement): boolean {
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return false;
  const side = c.width;
  const scale = side / SKIN_W;
  const d = g.getImageData(0, 0, side, side).data;
  const ink = (x: number) => { let n = 0; for (let y = 20 * scale; y < 32 * scale; y++)
    for (let dx = 0; dx < scale; dx++) if (d[(y * side + x * scale + dx) * 4 + 3] > 100) n++; return n; };
  // column 55 (and 54) belong to the arm's back face on wide skins only
  const wideBack = ink(55) + ink(54);
  // sanity: the face/sleeve columns must actually exist (avoid guessing on empty/edge skins)
  let face = 0; for (let x = 44; x < 48; x++) face += ink(x);
  return face > 12 * scale * scale && wideBack < 4 * scale * scale;
}

/** Ensure the baked canvas for `url` exists (idempotent; safe to call repeatedly). */
export function prepareSkinCanvas(url: string): Promise<void> {
  if (!url || canvasCache.has(url)) return Promise.resolve();
  let p = busy.get(url);
  if (!p) {
    p = (async () => {
      try {
        const img = await loadImageEl(url);
        if (!img.width || !img.height) return;
        const c = img.width === img.height ? bakeSquare(img) : img.width === img.height * 2 ? convertClassic(img) : null;
        if (c) canvasCache.set(url, c);
      } catch { /* unreadable / CORS-blocked: leave missing */ }
      finally { busy.delete(url); }
    })();
    busy.set(url, p);
  }
  return p;
}

/** Synchronous access to an already-baked skin canvas (prepares in the background if missing). */
export function getSkinCanvas(url: string): HTMLCanvasElement | null {
  if (!url) return null;
  const hit = canvasCache.get(url);
  if (hit) return hit;
  void prepareSkinCanvas(url);
  return null;
}

/** Decode + normalize an uploaded skin file. The returned canvas is cached under its data URL so
 *  figure previews and the in-game arm can pick it up synchronously afterwards. */
export async function loadSkinFile(file: File): Promise<SkinLoadResult> {
  let url: string;
  try {
    url = await readFileAsDataURL(file);
  } catch {
    return { ok: false, error: 'Could not read that file.' };
  }
  const mime = (url.match(/^data:([^;]+)/) || [])[1] || '';
  if (!/^image\/(png|jpeg)$/.test(mime)) return { ok: false, error: 'Please choose a PNG or JPEG image.' };
  try {
    const img = await loadImageEl(url);
    if (!img.width || !img.height) return { ok: false, error: 'Could not decode that image.' };
    if (![64, 128, 256, 512].includes(img.width) || (img.height !== img.width && img.height !== img.width / 2)) {
      return { ok: false, error: 'Use a 64, 128, 256 or 512px square PNG/JPEG skin, or a 64x32 classic skin.' };
    }
    const canvas = img.width === img.height ? bakeSquare(img) : convertClassic(img);
    canvasCache.set(url, canvas);
    return { ok: true, skin: { url, name: file.name, slim: guessSlim(canvas), canvas } };
  } catch {
    return { ok: false, error: 'Could not decode that image.' };
  }
}

// ------------------------------------------------------------------ first-person arm

/**
 * The first-person right arm built straight from the player's OWN skin canvas (Java's held-arm
 * model): the vanilla right-arm net — base at (40,16), sleeve overlay at (40,32) — on one box per
 * limb, so the on-screen arm shows the skin's real sleeve/hand art and always matches the
 * character the player sees in previews. `px` scales one skin pixel into world units; the arm
 * occupies 0..12*px along +y (shoulder at the origin, hand at the tip). Materials are supplied by
 * the caller (the first-person view tints everything with its own lighting).
 */
/**
 * Bake a single canvas for the first-person arm: the skin's right-arm base net (40,16,16x16) with the
 * sleeve-overlay net (40,32,16x16) composited on top of it. Modern 64x64 skins paint their sleeve there;
 * classic converted skins leave it empty, so the base arm shows. Rendering the arm from ONE mesh + one
 * material removes the two-box overlay trick (which caused see-through / fringe / white edges where the
 * overlay box poked through the base box).
 */
export function compositeArmSkin(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas');
  const scale = canvas.width / SKIN_W;
  out.width = canvas.width; out.height = canvas.height;
  const g = out.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, out.width, out.height);
  g.drawImage(canvas, 0, 0); // whole skin first (base + everything else)
  // The right-arm base block lives at rows 16-31, cols 40-55; the overlay block is the same 16x16
  // block 16 rows lower (rows 32-47). Source-over the overlay block back onto the base block so the
  // sleeve/hand overlay art shows where the skin paints it and stays transparent where it does not.
  g.drawImage(canvas, 40 * scale, 32 * scale, 16 * scale, 16 * scale, 40 * scale, 16 * scale, 16 * scale, 16 * scale);
  return out;
}

/**
 * Build the first-person right arm EXACTLY like Java's held-arm model (ModelBiped right arm +
 * ModelBox/TexturedQuad): one 4x12x4-px (or 3x12x4 slim) box whose faces carry the vanilla net UVs
 * for the skin's right-arm block at (40,16), sampled 1:1 from the baked 64x64 canvas. The returned
 * geometry lives in the vanilla MODEL space of the arm (absolute skin px: x -8..-4 classic / -7..-4
 * slim, y 0..12 shoulder->fist, z -2..2, pivot px (-5,2,0) / (-5,2.5,0)) so the caller can drive it
 * through Java's own ItemRenderer first-person chain and scale it by 1/16 of a block.
 */
export function buildSkinArmMesh(canvas: HTMLCanvasElement, slim: boolean): { mesh: THREE.Mesh; canvas: HTMLCanvasElement } {
  const baked = compositeArmSkin(canvas);
  // vanilla net geometry — face corner order is ModelBox's TexturedQuad vertex order, UVs assigned
  // exactly like TexturedQuad's (u2,v1),(u1,v1),(u1,v2),(u2,v2) per face.
  const dx = slim ? 3 : 4;             // arm width (px)
  const d = 4;                         // arm depth (px)
  const x0 = slim ? -7 : -8;           // outer face px
  const x1 = x0 + dx;                  // inner face px
  const y0 = 0, y1 = 12;               // shoulder..fist
  const z0 = -2, z1 = 2;
  const u0 = 40;                       // skin right-arm block left edge
  const vTop = 16, vSide0 = 20, vSide1 = 32;
  const uSide0 = u0;                   // outer (x-) face
  const uFront0 = u0 + d;              // z- (front) face
  const uInner0 = u0 + d + dx;         // inner (x+) face
  const uBack0 = u0 + d + dx + d;      // z+ (back) face
  const uv = (u1: number, u2: number, v1: number, v2: number): [number, number][] => [
    [u2, v1], [u1, v1], [u1, v2], [u2, v2],
  ];
  // face corner order = ModelBox's quad vertex order, so TexturedQuad's corner->uv assignment
  // ((u2,v1),(u1,v1),(u1,v2),(u2,v2)) lands on the exact same corners as vanilla.
  const faces: { pts: [number, number, number][]; uvs: [number, number][] }[] = [
    { pts: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], uvs: uv(uSide0, uSide0 + d, vSide0, vSide1) },                          // x- outer
    { pts: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], uvs: uv(uInner0, uInner0 + d, vSide0, vSide1) },                        // x+ inner
    { pts: [[x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]], uvs: uv(uInner0, uInner0 + dx, vSide0, vTop) },                        // y+ fist cap
    { pts: [[x1, y0, z1], [x0, y0, z1], [x0, y0, z0], [x1, y0, z0]], uvs: uv(uFront0, uFront0 + dx, vTop, vSide0) },                        // y- shoulder cap
    { pts: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], uvs: uv(uBack0, uBack0 + dx, vSide0, vSide1) },                        // z+ back
    { pts: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], uvs: uv(uFront0, uFront0 + dx, vSide0, vSide1) },                      // z- front
  ];
  const pos: number[] = [];
  const uvsA: number[] = [];
  const idx: number[] = [];
  faces.forEach((f, fi) => {
    const base = fi * 4;
    f.pts.forEach(([x, y, z]) => pos.push(x, y, z));
    f.uvs.forEach(([u, v]) => uvsA.push(u / SKIN_W, 1 - v / SKIN_W)); // flip y: row 0 is the image top
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvsA, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return { mesh: new THREE.Mesh(geo), canvas: baked };
}

// ------------------------------------------------------------------ per-face UV mapping

function faceUV(u: number, v: number, w: number, h: number, d: number, x1: number, y1: number, x2: number, y2: number) {
  return [
    new THREE.Vector2(x1 / SKIN_W, 1 - y2 / SKIN_W),
    new THREE.Vector2(x2 / SKIN_W, 1 - y2 / SKIN_W),
    new THREE.Vector2(x2 / SKIN_W, 1 - y1 / SKIN_W),
    new THREE.Vector2(x1 / SKIN_W, 1 - y1 / SKIN_W),
  ];
}

/** Assign the atlas rect for a cube net (u,v = top-left, size w x h x d) onto a BoxGeometry's UVs.
 *  Net layout (vanilla): [left][front][right][back] across, [top][bottom] above. */
export function setBoxUVs(box: THREE.BoxGeometry, u: number, v: number, w: number, h: number, d: number): void {
  const top = faceUV(u, v, w, h, d, u + d, v, u + w + d, v + d);
  const bottom = faceUV(u, v, w, h, d, u + w + d, v, u + w * 2 + d, v + d);
  const left = faceUV(u, v, w, h, d, u, v + d, u + d, v + d + h);
  const front = faceUV(u, v, w, h, d, u + d, v + d, u + w + d, v + d + h);
  const right = faceUV(u, v, w, h, d, u + w + d, v + d, u + w + d * 2, v + d + h);
  const back = faceUV(u, v, w, h, d, u + w + d * 2, v + d, u + w * 2 + d * 2, v + d + h);
  const uv = box.attributes.uv as THREE.BufferAttribute;
  const out: number[] = [];
  // three.js BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 verts each)
  for (const face of [right, left, top, bottom, front, back]) {
    const arr = face === top ? [3, 2, 0, 1] : face === bottom ? [0, 1, 3, 2] : [3, 2, 0, 1];
    for (const i of arr) out.push(face[i].x, face[i].y);
  }
  uv.set(new Float32Array(out));
  uv.needsUpdate = true;
}

/** A cube: geometry of gw x gh x gd, textured from the atlas net at (u,v) with face size fw x fh x fd. */
export function skinBox(gw: number, gh: number, gd: number, u: number, v: number, fw: number, fh: number, fd: number, mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.BoxGeometry(gw, gh, gd);
  setBoxUVs(geo, u, v, fw, fh, fd);
  return new THREE.Mesh(geo, mat);
}

// ------------------------------------------------------------------ figure

export interface SkinFigureParts {
  root: THREE.Group;
  head: THREE.Group;
  body: THREE.Mesh;
  arms: THREE.Mesh[];
  legs: THREE.Mesh[];
  materials: (THREE.Material | THREE.Texture)[];
}

/**
 * Build the vanilla player figure (head/hat + body/jacket + arms/sleeves + legs) from a skin texture.
 * Geometry is in world units: 1 skin pixel = 1/16 block, i.e. the figure is 32 px tall → 2 units
 * with the hat (top ≈ 2.03), matching the preview camera and the palette figure. The group origin
 * sits at the feet; limb meshes are pivoted at their top (shoulder / hip).
 */
export function buildSkinFigure(canvas: HTMLCanvasElement, slim: boolean, headwear?: string): SkinFigureParts {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const inner = new THREE.MeshLambertMaterial({ map: tex });
  // Cutout clothing layers must write depth. Transparent blending sorted whole sleeves/hat
  // behind the body and made overlapping pixels appear to flicker or show through.
  const outer = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.1, side: THREE.FrontSide, depthWrite: true });
  const materials = [tex, inner, outer];
  const aw = slim ? 3 : 4;
  const P = 1 / 16; // skin px -> world units

  const root = new THREE.Group();
  // head + hat (top of the 64x64: base at (0,0), overlay at (32,0))
  const head = new THREE.Group();
  head.position.set(0, 24 / 16, 0);
  const headBox = skinBox(8 * P, 8 * P, 8 * P, 0, 0, 8, 8, 8, inner); headBox.position.y = 4 / 16; head.add(headBox);
  const hat = skinBox(9 * P, 9 * P, 9 * P, 32, 0, 8, 8, 8, outer); hat.position.y = 4 / 16; head.add(hat);
  const hw = headwear ?? (settings.value.headwear || 'none');
  if (hw && hw !== 'none') {
    attachHeadwear3D(head, hw);
  }
  root.add(head);
  // body (16,16) + jacket (16,32)
  const body = skinBox(8 * P, 12 * P, 4 * P, 16, 16, 8, 12, 4, inner); body.position.set(0, 18 / 16, 0); root.add(body);
  const jacket = skinBox(8.5 * P, 12.5 * P, 4.5 * P, 16, 32, 8, 12, 4, outer); jacket.position.set(0, 18.25 / 16, 0); root.add(jacket);
  // right arm at atlas (40,16), overlay (40,32); pivot at the shoulder (top of the arm box)
  const armGeo = (u: number, v: number, gw: number, fw: number, mat: THREE.Material) => {
    const g = new THREE.BoxGeometry(gw * P, 12 * P, 4 * P);
    setBoxUVs(g, u, v, fw, 12, 4);
    g.translate(0, -6 * P, 0); // box now spans -12px..0 in y: 0 = shoulder
    const m = new THREE.Mesh(g, mat);
    m.position.set(0, 24 / 16, 0);
    return m;
  };
  const rightArm = armGeo(40, 16, aw, aw, inner); rightArm.position.x = -(4 + aw / 2) / 16;
  const rightSleeve = armGeo(40, 32, slim ? 3.5 : 4.5, aw, outer); rightSleeve.position.x = -(4 + aw / 2) / 16;
  const leftArm = armGeo(32, 48, aw, aw, inner); leftArm.position.x = (4 + aw / 2) / 16;
  const leftSleeve = armGeo(48, 48, slim ? 3.5 : 4.5, aw, outer); leftSleeve.position.x = (4 + aw / 2) / 16;
  root.add(rightArm, rightSleeve, leftArm, leftSleeve);
  // legs: right base (0,16) + overlay (0,32); left base (16,48) + overlay (0,48); pivot at the hip
  const legGeo = (u: number, v: number, gw: number, mat: THREE.Material) => {
    const g = new THREE.BoxGeometry(gw * P, 12 * P, 4 * P);
    setBoxUVs(g, u, v, 4, 12, 4);
    g.translate(0, -6 * P, 0); // spans -12px..0 in y: 0 = hip
    const m = new THREE.Mesh(g, mat);
    m.position.set(0, 12 / 16, 0);
    return m;
  };
  const rightLeg = legGeo(0, 16, 4, inner); rightLeg.position.x = -2 / 16;
  const rightLegOv = legGeo(0, 32, 4.5, outer); rightLegOv.position.x = -2 / 16;
  const leftLeg = legGeo(16, 48, 4, inner); leftLeg.position.x = 2 / 16;
  const leftLegOv = legGeo(0, 48, 4.5, outer); leftLegOv.position.x = 2 / 16;
  root.add(rightLeg, rightLegOv, leftLeg, leftLegOv);
  return { root, head, body, arms: [rightArm, leftArm], legs: [rightLeg, leftLeg], materials };
}

// ------------------------------------------------------------------ default palette arm art

/**
 * Paint the vanilla-style right-arm net (base block at cols 40-55, rows 16-31 of the 64x64 layout)
 * with the avatar's palette colors, shaded like Steve's arm art (light top rows, darker column edges,
 * dark hem/outline rows, hand rows with a crease). Used for the first-person arm when no skin texture
 * is uploaded, so the arm matches the palette figure but reads as a real textured Minecraft arm.
 * Everything outside the net stays transparent (cut out by the material's alphaTest).
 */
const paletteArmCache = new Map<string, HTMLCanvasElement>();

/** Cached palette arm canvas for the current avatar colors (see paintPaletteArm). */
export function paletteArmCanvas(shirt: number, skin: number, slim: boolean): HTMLCanvasElement {
  const key = `${slim ? 's' : 'w'}|${shirt.toString(16)}|${skin.toString(16)}`;
  let c = paletteArmCache.get(key);
  if (!c) { c = paintPaletteArm(shirt, skin, slim); paletteArmCache.set(key, c); }
  return c;
}

/** Pure pixel builder for the palette arm art (64x64 RGBA). Split out so tests can check pixels. */
export function paletteArmPixels(shirt: number, skin: number, slim: boolean): Uint8ClampedArray {
  const out = new Uint8ClampedArray(SKIN_W * SKIN_W * 4);
  const sh = (v: number, f: number) => Math.min(255, Math.max(0, Math.round(v * f)));
  const col = (rgb: number, f: number): [number, number, number] => {
    const r = sh((rgb >> 16) & 255, f), gg = sh((rgb >> 8) & 255, f), b = sh(rgb & 255, f);
    return [r, gg, b];
  };
  const setP = (x: number, y: number, rgb: [number, number, number]) => {
    if (x < 0 || y < 0 || x >= SKIN_W || y >= SKIN_W) return;
    const i = (y * SKIN_W + x) * 4;
    out[i] = rgb[0]; out[i + 1] = rgb[1]; out[i + 2] = rgb[2]; out[i + 3] = 255;
  };
  const aw = slim ? 3 : 4;
  const u0 = 40;
  // vanilla right-arm net: x-faces span the 4px depth, z-faces span the arm width (3px slim / 4px classic)
  const widths = slim ? [4, 3, 4, 3] : [4, 4, 4, 4];
  const bands: number[] = [];
  let bx = u0;
  for (const w of widths) { bands.push(bx); bx += w; }
  const bandTone = [0.72, 1, 0.78, 1]; // left/front/right/back face multipliers (left = outer, slightly dark)
  const topCaps = 16, faceRow0 = 20, faceRows = 12, shirtRows = 9;
  // caps (rows 16..19): top face above the front band, bottom face above the inner band
  for (let r = topCaps; r < faceRow0; r++) {
    for (let x = bands[1]; x < bands[1] + widths[1]; x++) setP(x, r, col(shirt, 1.12));
    for (let x = bands[2]; x < bands[2] + widths[2]; x++) setP(x, r, col(shirt, 0.42));
  }
  for (let i = 0; i < 4; i++) {
    const bandX = bands[i];
    const tone = bandTone[i];
    const w = widths[i];
    for (let rr = 0; rr < faceRows; rr++) {
      const y = faceRow0 + rr;
      const isSleeve = rr < shirtRows;
      const baseRGB = isSleeve ? shirt : skin;
      for (let c0 = 0; c0 < w; c0++) {
        const x = bandX + c0;
        let f = tone;
        if (isSleeve) {
          if (rr === 0) f = tone * 1.1;                          // lit shoulder row
          else if (rr === shirtRows - 1) f = 0.5;               // dark cuff/hem row
          else if (c0 === 0 || c0 === w - 1) f = tone * 0.78;  // darker column edges
        } else {
          if (rr === shirtRows) f = tone * 1.08;                // lit knuckle row
          else if (rr === faceRows - 1) f = tone * 0.45;        // dark outline row under the fist
          else if (c0 === 0 || c0 === w - 1) f = tone * 0.8;
          else if (rr === shirtRows + 1 && (i === 1 || i === 3)) f = tone * 0.85; // crease line
        }
        setP(x, y, col(baseRGB, f));
      }
    }
  }
  return out;
}

/** Draw the palette arm art (see paletteArmPixels) onto a fresh 64x64 canvas. */
export function paintPaletteArm(shirt: number, skin: number, slim: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = SKIN_W; c.height = SKIN_W;
  const g = c.getContext('2d')!;
  const px = g.createImageData(SKIN_W, SKIN_W);
  const pix = paletteArmPixels(shirt, skin, slim);
  px.data.set(pix);
  g.putImageData(px, 0, 0);
  return c;
}


// ------------------------------------------------------------------ active skin resolver
// The player's appearance is either an uploaded file (settings.skinUrl) or one of the built-in
// presets (settings.skinPreset) - both resolve to a 64x64 sheet, so the figure, the first-person
// arm and the flat preview all share one code path. Returns null only in the legacy "custom
// colours with no sheet" case, which falls back to the palette figures/arms.

export function activeSkinCanvas(): HTMLCanvasElement | null {
  const st = settings.value;
  if (st.skinUrl) return getSkinCanvas(st.skinUrl);
  if (st.skinPreset && st.skinPreset !== 'custom') {
    const preset = presetById(st.skinPreset);
    if (st.headwear && st.headwear !== 'none') {
      return customAvatarSkinCanvas(preset.skin, preset.hair, preset.shirt, preset.pants, !!preset.slim, st.headwear);
    }
    return builtinSkinCanvas(preset);
  }
  const sk = st.skin ?? { skin: '#d8a878', hair: '#5a3a22', shirt: '#3f6f9f', pants: '#3b3b5a' };
  return customAvatarSkinCanvas(sk.skin, sk.hair, sk.shirt, sk.pants, st.skinSlim, st.headwear || 'none');
}

export function activeSkinSlim(): boolean {
  const st = settings.value;
  if (st.skinUrl) return !!st.skinSlim;
  if (st.skinPreset && st.skinPreset !== 'custom') return !!presetById(st.skinPreset).slim;
  return !!st.skinSlim;
}

/** Stable identity of the active appearance (uploaded url + slim flag, or preset id, or palette, plus headwear). */
export function activeSkinKey(): string {
  const st = settings.value;
  const hw = st.headwear || 'none';
  if (st.skinUrl) return 'u|' + st.skinUrl + (st.skinSlim ? '|s' : '|w') + '|' + hw;
  if (st.skinPreset && st.skinPreset !== 'custom') return 'p|' + st.skinPreset + '|' + hw;
  const sk = st.skin ?? { skin: '#d8a878', hair: '#5a3a22', shirt: '#3f6f9f', pants: '#3b3b5a' };
  return 'c|' + sk.skin + '|' + sk.hair + '|' + sk.shirt + '|' + sk.pants + '|' + (st.skinSlim ? 's' : 'w') + '|' + hw;
}
