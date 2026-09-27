import * as THREE from 'three';
import { itemPixels, ICON_PX, itemArtSize } from './Icons';

/**
 * Shared voxel-extruded item model.
 *
 * Vanilla builds "generated" item models by extruding the 16x16 sprite: every opaque pixel becomes
 * a cube one pixel wide and 1/16 of a block deep, with only the exposed side faces emitted. This
 * is that, for our (higher resolution) icons.
 *
 * Local frame: icon x -> +x, icon up -> +y, the icon's bottom-left corner at the origin, and the
 * model fills the 0..1 unit square in x/y with its plate centred on z = 0 — exactly the frame the
 * vanilla item display transforms (first person, ground, GUI) expect. Callers scale it to taste.
 *
 * Geometries are cached per item id and shared: the same buffer serves the held viewmodel and every
 * dropped item entity in the world, so switching hotbar slots no longer re-extrudes a sprite.
 */
const geoCache = new Map<string, THREE.BufferGeometry>();

/** Drop cached item geometry (call when icons change, e.g. a resource pack is loaded). */
export function invalidateItemModels(): void {
  for (const g of geoCache.values()) g.dispose();
  geoCache.clear();
}

export function itemModelGeometry(id: string): THREE.BufferGeometry {
  const cached = geoCache.get(id);
  if (cached) return cached;
  const img = itemPixels(id);
  // Extrude at the art's NATIVE resolution, not the (2x upscaled) icon canvas: sampling the icon
  // at every 2nd pixel keeps one voxel per painted pixel, so edges stay crisp and the mesh is a
  // quarter of the size. `step` is how many icon pixels one model voxel covers.
  const N = itemArtSize(id);
  const step = Math.max(1, Math.round(ICON_PX / N));
  const px = 1 / N;        // model is 1 unit wide, whatever the icon resolution is
  // Plate thickness. Vanilla uses 1/16; FABLE holds tools turned edge-on (the -135 degree display
  // yaw), so the SIDE faces are a large part of what the player actually sees. A flat 1/16 plate
  // reads as a paper cut-out at that angle, so the plate is a little chunkier here -- enough to
  // read as a forged object, not so much that it stops looking like pixel art.
  const depth = 2 / 16;
  const d = img.data;
  // Only fully-there pixels become voxels: icon anti-aliasing must not grow a fringe of half
  // transparent cubes around the model (that fringe is what made held tools look furry).
  const at = (x: number, y: number): number => ((y * step) * ICON_PX + x * step) * 4;
  const alpha = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < N && y < N && d[at(x, y) + 3] > 128;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  let v = 0;
  const quad = (a: number[], b: number[], c: number[], e: number[], r: number, g: number, bl: number): void => {
    pos.push(...a, ...b, ...c, ...e);
    // the top-edge highlight lifts above 1, so clamp rather than emit out-of-range vertex colours
    const cr = Math.min(1, r), cg = Math.min(1, g), cb = Math.min(1, bl);
    for (let i = 0; i < 4; i++) col.push(cr, cg, cb);
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    v += 4;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!alpha(x, y)) continue;
    const i = at(x, y);
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const x0 = x * px, x1 = x0 + px, y0 = (N - 1 - y) * px, y1 = y0 + px, z0 = -depth / 2, z1 = depth / 2;
    // Per-face shading. The ramp is DIRECTIONAL -- a notional light from the upper left -- rather
    // than symmetric: giving the two side walls the same tone made the tool look flat exactly at
    // the edge-on angle it is held at, because those walls are most of the silhouette. Splitting
    // them (left lit, right shaded) is what makes the head read as a solid wedge with volume.
    // front (+z)
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], r, g, b);
    // back (-z): darker, so the model reads as solid rather than as a decal
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], r * 0.78, g * 0.78, b * 0.78);
    // exposed sides only (interior pixel walls are skipped — half the triangles, no z-fighting)
    if (!alpha(x - 1, y)) quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], r * 0.88, g * 0.88, b * 0.88); // left wall: lit
    if (!alpha(x + 1, y)) quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], r * 0.62, g * 0.62, b * 0.62); // right wall: shaded
    if (!alpha(x, y - 1)) quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], r * 1.06, g * 1.06, b * 1.06); // top edge catches the light
    if (!alpha(x, y + 1)) quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], r * 0.52, g * 0.52, b * 0.52); // bottom edge in shadow
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  geoCache.set(id, geo);
  return geo;
}

/**
 * A ready-to-pose item mesh. `lit` picks the material: the held viewmodel uses unlit basic
 * materials (the hand pass applies its own light multiplier), world drops use a lambert material so
 * they take scene lighting like every other entity.
 */
export function itemModelMesh(id: string, lit = false): THREE.Mesh {
  const geo = itemModelGeometry(id);
  const m = lit
    ? new THREE.MeshLambertMaterial({ vertexColors: true })
    : new THREE.MeshBasicMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, m);
  mesh.frustumCulled = false;
  // shared cached geometry must survive the mesh being disposed with its owner
  mesh.userData.sharedGeometry = true;
  return mesh;
}
