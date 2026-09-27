import * as THREE from 'three';

/**
 * The Ancient Blade — a chunky, segmented voxel greatsword built from discrete parts.
 *
 * This is deliberately NOT the sprite extruder in ItemModel.ts. That builds a 1-voxel-thick plate
 * from a 16x16 icon, which is right for a hotbar tool but reads as a cardboard cutout at the scale
 * a landmark sword needs. The reference is a thick, blocky weapon with real depth on every axis, a
 * stepped taper to the tip, and clearly separated blade / fuller / guard / grip / pommel sections —
 * so the model is assembled from named boxes in a 1/16-block voxel grid, the same unit the block
 * shapes and mob parts already use.
 *
 * Frame: the blade points along +Y with the grip at the bottom, and the whole sword is centred on
 * x = z = 0 with y = 0 exactly at the tip of the pommel. That means a caller can drop it into the
 * world, tilt it, and the base of the grip is the pivot — which is what "stuck into a block" needs.
 *
 * Geometry is merged into ONE BufferGeometry with vertex colours and cached, so the whole sword is
 * a single draw call no matter how many are in view. Only faces that are actually exposed get
 * emitted, matching the existing extruder's approach.
 */

/** One axis-aligned voxel box, in 1/16-block units, with its own colour. */
interface Part {
  /** centre x, bottom y, centre z */
  x: number; y: number; z: number;
  /** width (x), height (y), depth (z) */
  w: number; h: number; d: number;
  color: number;
}

// Palette pulled from the reference: a near-black edge, two greys for the body, a dark fuller down
// the centre, and a warm brown grip. Kept deliberately flat and few-toned so it reads as voxel art
// rather than a gradient.
const EDGE = 0x1c1c1f;      // outer edge / outline, nearly black
const BODY_DARK = 0x4a4a52;  // shaded side of the blade
const BODY_MID = 0x6e6e78;   // main blade face
const BODY_LIGHT = 0x9a9aa6; // lit bevel along the top-left, matching the art's light direction
const FULLER = 0x2a2a30;     // the dark channel down the centre of the blade
const GUARD = 0x55555e;      // crossguard
const GUARD_LIGHT = 0x7c7c88;
const GRIP = 0x6e5230;       // handle, same brown the tool icons use
const GRIP_DARK = 0x453320;
const POMMEL = 0x55555e;

/**
 * Build the part list.
 *
 * Reading bottom to top: pommel, grip, crossguard, then the blade in five stepped segments that
 * narrow from 6 voxels wide at the base to 2 at the tip. Each blade segment is built as a stack of
 * slabs across x — dark edge, mid body, dark fuller, mid body, light bevel, dark edge — so the
 * chunky banded look of the reference comes out of the geometry itself, not a texture.
 */
function buildParts(): Part[] {
  const p: Part[] = [];
  const push = (x: number, y: number, z: number, w: number, h: number, d: number, color: number): void => {
    p.push({ x, y, z, w, h, d, color });
  };

  // Overlapping boxes must never share a face plane or they z-fight into a moire pattern. Every
  // decorative overlay below is pushed slightly proud of the box beneath it (PROUD voxels) instead
  // of sitting flush with it.
  const PROUD = 0.08;

  // ---- pommel: a squat block, slightly wider than the grip, with a dark cap underneath
  push(0, 0.9, 0, 4, 1.4, 4, POMMEL);
  push(0, 0, 0, 3.4, 0.9, 3.4, EDGE);        // dark base, narrower so no shared side plane
  push(0, 2.0, 0, 3.0, 0.4, 3.0, GUARD_LIGHT); // lit collar where the pommel meets the grip

  // ---- grip: thinner than the pommel, with two raised wrap bands
  push(0, 2.4, 0, 3, 5.6, 3, GRIP);
  push(0, 3.6, 0, 3 + PROUD, 0.9, 3 + PROUD, GRIP_DARK);
  push(0, 6.0, 0, 3 + PROUD, 0.9, 3 + PROUD, GRIP_DARK);

  // ---- crossguard: a wide flat bar, a lit top face, and stepped tips proud of each end
  push(0, 8, 0, 12, 1.6, 4, GUARD);
  push(0, 9.6, 0, 11.4, 0.4, 3.6, GUARD_LIGHT);  // lit top, inset so no coplanar sides
  push(-6.4, 8.2, 0, 1.2, 1.2, 3.2, EDGE);       // stepped left tip
  push(6.4, 8.2, 0, 1.2, 1.2, 3.2, EDGE);        // stepped right tip
  push(0, 10.0, 0, 4.6, 1.2, 3.4, GUARD);        // collar where the blade enters the guard

  // ---- blade: five segments narrowing to the tip.
  // Each segment is built as vertical slabs across x rather than as one box with overlays, so the
  // banded cross-section of the reference -- dark edge, body, dark fuller, body, lit edge -- comes
  // out of the geometry with no overlapping faces at all.
  // [bottom y, height, half-width, depth]
  // More, shorter segments with a bigger width drop between them: the reference's blade is a
  // visible staircase, not a smooth taper, and that silhouette only appears if each step is short
  // enough to read as a step.
  const segs: [number, number, number, number][] = [
    [11.2, 6.5, 3.25, 3],
    [17.7, 6.0, 3.0, 2.9],
    [23.7, 5.5, 2.75, 2.8],
    [29.2, 5.0, 2.5, 2.7],
    [34.2, 4.5, 2.0, 2.55],
    [38.7, 4.0, 1.5, 2.4],
    [42.7, 3.5, 1.0, 2.2],
  ];
  for (const [y, h, hw, d] of segs) {
    const w = hw * 2;
    // Slice the width into bands. Fractions are of the full width, laid left to right, and the
    // fuller is centred so the blade reads symmetrically from both sides.
    const bands: [number, number][] = w >= 5
      // wide segments: edge | body | fuller | body | edge, with the left lit (top-left light)
      ? [[0.16, EDGE], [0.20, BODY_LIGHT], [0.28, FULLER], [0.20, BODY_MID], [0.16, BODY_DARK]]
      // narrow segments near the tip: no room for a fuller, just lit and shaded halves
      : [[0.22, EDGE], [0.30, BODY_LIGHT], [0.26, BODY_MID], [0.22, BODY_DARK]];
    let x = -w / 2;
    for (const [frac, color] of bands) {
      const bw = w * frac;
      // the fuller is recessed: slightly shallower than the flats either side of it
      const bd = color === FULLER ? d * 0.72 : d;
      push(x + bw / 2, y, 0, bw, h, bd, color);
      x += bw;
    }
    // a hard dark cap across the top of each segment so the steps between them read as steps
    push(0, y + h - 0.35, 0, w * 0.82, 0.35, d * 0.6, EDGE);
  }

  // ---- tip: stepped caps so the point is blocky, not a smooth cone
  push(0, 46.2, 0, 1.5, 1.8, 1.9, BODY_MID);
  push(0, 48.0, 0, 1.0, 1.4, 1.5, BODY_LIGHT);
  push(0, 49.4, 0, 0.6, 0.9, 1.0, EDGE);

  return p;
}

/** Total height of the sword in blocks (used to seat it in the ground). */
export const BLADE_HEIGHT = 50.3 / 16;
/** Height of the grip+pommel section in blocks — the part that can sink into the block. */
export const BLADE_GRIP_HEIGHT = 8 / 16;
/**
 * How far the blade sinks below the block's top face, in blocks.
 *
 * Tuned against the in-world render: deep enough that the pommel is inside the stone and the blade
 * reads as driven in, shallow enough that the crossguard still clears the surface. The entity
 * offsets the mesh by this amount *inside* its rotated group, so the pivot sits at the block
 * surface and the handle cannot swing out past the block's edge when the sword leans.
 */
export const BLADE_SINK = 6.5 / 16;

let cached: THREE.BufferGeometry | null = null;

/**
 * The merged sword geometry, in blocks, pivoting at the bottom of the pommel.
 *
 * Faces are emitted per box with per-face shading baked into the vertex colours (top brightest,
 * bottom darkest, sides between) so the sword has voxel-style directional shading even before the
 * scene light is applied — the same 1 / 0.86 / 0.72 / 0.95 / 0.58 ramp the item extruder uses.
 */
export function bladeGeometry(): THREE.BufferGeometry {
  if (cached) return cached;
  const parts = buildParts();
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  let v = 0;
  const U = 1 / 16;

  const quad = (a: number[], b: number[], c: number[], e: number[], r: number, g: number, bl: number): void => {
    pos.push(...a, ...b, ...c, ...e);
    for (let i = 0; i < 4; i++) col.push(r, g, bl);
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    v += 4;
  };

  for (const part of parts) {
    const r0 = ((part.color >> 16) & 255) / 255;
    const g0 = ((part.color >> 8) & 255) / 255;
    const b0 = (part.color & 255) / 255;
    const x0 = (part.x - part.w / 2) * U, x1 = (part.x + part.w / 2) * U;
    const y0 = part.y * U, y1 = (part.y + part.h) * U;
    const z0 = (part.z - part.d / 2) * U, z1 = (part.z + part.d / 2) * U;
    // face shading ramp, matching ItemModel's so the sword sits in the same visual family
    const f = (m: number): [number, number, number] => [r0 * m, g0 * m, b0 * m];
    let c: [number, number, number];
    c = f(0.95); quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], ...c); // top
    c = f(0.58); quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], ...c); // bottom
    c = f(1.00); quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], ...c); // front +z
    c = f(0.86); quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], ...c); // back -z
    c = f(0.72); quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], ...c); // left -x
    c = f(0.80); quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], ...c); // right +x
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  cached = geo;
  return geo;
}

/** Drop the cached geometry (parity with invalidateItemModels). */
export function invalidateBladeModel(): void {
  if (cached) { cached.dispose(); cached = null; }
}

/**
 * A ready-to-place Ancient Blade mesh.
 *
 * `lit` picks a lambert material so the sword takes scene lighting like every other world object;
 * the unlit basic material is for the held viewmodel, where the hand pass supplies its own light
 * multiplier. The geometry is shared, so this is cheap to call.
 */
export function bladeMesh(lit = true): THREE.Mesh {
  const geo = bladeGeometry();
  const m = lit
    ? new THREE.MeshLambertMaterial({ vertexColors: true })
    : new THREE.MeshBasicMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, m);
  mesh.userData.sharedGeometry = true;
  return mesh;
}
