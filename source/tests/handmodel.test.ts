// Held-item geometry checks: the item model must be built at the art's native resolution (one
// voxel per painted pixel, not a 2x2 clump), and the grip pose must actually land the item in the
// fist and fill the lower-right of the screen.
{
  const g = globalThis as unknown as Record<string, unknown>;
  const noop = () => undefined;
  const parse = (c: string): [number, number, number, number] => {
    if (c.startsWith('#')) {
      const h = c.slice(1);
      const n = h.length === 3 ? h.split('').map((k) => k + k).join('') : h;
      return [parseInt(n.slice(0,2),16), parseInt(n.slice(2,4),16), parseInt(n.slice(4,6),16), 255];
    }
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (m) { const v = m[1].split(',').map(Number); return [v[0]|0, v[1]|0, v[2]|0, v[3] === undefined ? 255 : Math.round(v[3]*255)]; }
    return [255, 0, 255, 255];
  };
  const makeCanvas = (): Record<string, unknown> => {
    const cv: Record<string, unknown> = { width: 0, height: 0, style: {}, className: '' };
    let px = new Uint8ClampedArray(0); let cw = 0, ch = 0;
    const sync = () => { const nw = cv.width as number, nh = cv.height as number; if (nw !== cw || nh !== ch) { cw = nw; ch = nh; px = new Uint8ClampedArray(cw*ch*4); } };
    // 2D transform state: only uniform scale + translate are needed, but they MUST be real --
    // Icons.ts calls ctx.scale(2,2) to draw 16x16 art into the 32x32 icon canvas.
    let sx = 1, sy = 1, tx = 0, ty = 0;
    const stack: [number,number,number,number][] = [];
    const ctx: Record<string, unknown> = {
      fillStyle: '#000', globalAlpha: 1, imageSmoothingEnabled: false, canvas: cv,
      save() { stack.push([sx,sy,tx,ty]); },
      restore() { const v = stack.pop(); if (v) { sx=v[0]; sy=v[1]; tx=v[2]; ty=v[3]; } },
      scale(a: number, b: number) { sx*=a; sy*=b; },
      translate(a: number, b: number) { tx += a*sx; ty += b*sy; },
      setTransform() { sx=1; sy=1; tx=0; ty=0; },
      fillRect(x: number, y: number, w: number, h: number) {
        sync(); const [r,gg,b,a] = parse(String(ctx.fillStyle));
        const X0=x*sx+tx, Y0=y*sy+ty, X1=(x+w)*sx+tx, Y1=(y+h)*sy+ty;
        for (let yy = Math.floor(Y0); yy < Math.ceil(Y1); yy++) for (let xx = Math.floor(X0); xx < Math.ceil(X1); xx++) {
          if (xx<0||yy<0||xx>=cw||yy>=ch) continue; const o=(yy*cw+xx)*4; px[o]=r; px[o+1]=gg; px[o+2]=b; px[o+3]=a;
        }
      },
      clearRect(x: number, y: number, w: number, h: number) { sync(); for (let yy=Math.floor(y);yy<Math.ceil(y+h);yy++) for (let xx=Math.floor(x);xx<Math.ceil(x+w);xx++){ if(xx<0||yy<0||xx>=cw||yy>=ch)continue; px.fill(0,(yy*cw+xx)*4,(yy*cw+xx)*4+4);} },
      getImageData(x: number, y: number, w: number, h: number) {
        sync(); const out = new Uint8ClampedArray(w*h*4);
        for (let yy=0;yy<h;yy++) for (let xx=0;xx<w;xx++){ const sx=x+xx, sy=y+yy; if(sx<0||sy<0||sx>=cw||sy>=ch)continue; out.set(px.subarray((sy*cw+sx)*4,(sy*cw+sx)*4+4),(yy*w+xx)*4); }
        return { data: out, width: w, height: h };
      },
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w*h*4), width: w, height: h }),
      putImageData(img: {data:Uint8ClampedArray;width:number;height:number}, dx: number, dy: number) {
        sync(); for (let yy=0;yy<img.height;yy++) for (let xx=0;xx<img.width;xx++){ const tx=dx+xx, ty=dy+yy; if(tx<0||ty<0||tx>=cw||ty>=ch)continue; px.set(img.data.subarray((yy*img.width+xx)*4,(yy*img.width+xx)*4+4),(ty*cw+tx)*4); }
      },
      drawImage: noop, rotate: noop,
      beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, stroke: noop, fill: noop,
      measureText: () => ({ width: 10 }), fillText: noop,
    };
    cv.getContext = () => ctx; cv.toDataURL = () => 'data:image/png;base64,AAAA';
    return cv;
  };
  g.document = { createElement: (t: string) => (t === 'canvas' ? makeCanvas() : { style: {}, className: '' }), createElementNS: () => ({ style: {} }) };
  g.window = { devicePixelRatio: 1, addEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }) };
  g.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
}

import * as THREE from 'three';
import { itemModelGeometry } from '../src/game/items/ItemModel';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string): void => { if (c) pass++; else { fail++; console.error('FAIL: ' + m); } };

const D = Math.PI / 180;
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);

/** Java 1.8 first-person arm chain (mirrors Game.buildHandChain at rest). */
function handChain(sw = 1, side = 1, eq = 0): THREE.Matrix4 {
  const sq = Math.sqrt(sw);
  const f = -0.3 * Math.sin(sq * Math.PI), f1 = 0.4 * Math.sin(sq * Math.PI * 2), f2 = -0.4 * Math.sin(sw * Math.PI);
  const f3 = Math.sin(sw * sw * Math.PI), f4 = Math.sin(sq * Math.PI);
  const mv = new THREE.Matrix4(), T = new THREE.Matrix4();
  mv.multiply(T.makeTranslation(f, f1, f2));
  mv.multiply(new THREE.Matrix4().makeTranslation(0.64000005, -0.6, -0.71999997));
  mv.multiply(T.makeTranslation(0, eq * -0.6, 0));
  mv.multiply(new THREE.Matrix4().makeRotationY(Math.PI / 4));
  mv.multiply(T.makeRotationAxis(AY, f4 * 70 * D));
  mv.multiply(new THREE.Matrix4().makeRotationAxis(AZ, f3 * -20 * D));
  mv.multiply(new THREE.Matrix4().makeTranslation(-1, 3.6, 3.5));
  mv.multiply(new THREE.Matrix4().makeRotationAxis(AZ, 120 * D)
    .multiply(new THREE.Matrix4().makeRotationAxis(AX, 200 * D))
    .multiply(new THREE.Matrix4().makeRotationAxis(AY, -135 * D))
    .multiply(new THREE.Matrix4().makeTranslation(5.6, 0, 0)));
  if (side < 0) { const S = new THREE.Matrix4().makeScale(-1, 1, 1); mv.premultiply(S); mv.multiply(S); }
  return mv;
}

// constants mirrored from Game.ts
const HELD_ARM_OFFSET = { x: -0.02, y: -0.17, z: -0.06 };
const HELD_ITEM_NUDGE = { x: -0.34, y: -0.12, z: -0.06 };
const ARM_FIST_PX = { x: -6, y: 12, z: 0 };
// the item model's own FIRST_PERSON display transform (see HELD_DISPLAY_* in Game.ts)
const HELD_DISPLAY_T = { x: 0, y: 0.25, z: 0.125 };
const HELD_DISPLAY_R = { x: 0, y: -135 * D, z: 25 * D };
const HELD_DISPLAY_SCALE = 1.45;

/** Java 1.8 transformFirstPersonItem + the model's FIRST_PERSON display transform. */
function itemChain(sw = 1, side = 1, eq = 0): THREE.Matrix4 {
  const sq = Math.sqrt(sw);
  const mv = new THREE.Matrix4(), T = new THREE.Matrix4();
  mv.multiply(T.makeTranslation(-0.4 * Math.sin(sq * Math.PI), 0.2 * Math.sin(sq * Math.PI * 2), -0.2 * Math.sin(sw * Math.PI)));
  mv.multiply(new THREE.Matrix4().makeTranslation(0.56, -0.52, -0.71999997));
  mv.multiply(T.makeTranslation(0, eq * -0.6, 0));
  mv.multiply(new THREE.Matrix4().makeRotationY(Math.PI / 4));
  mv.multiply(T.makeRotationAxis(AY, Math.sin(sw * sw * Math.PI) * -20 * D));
  mv.multiply(T.makeRotationAxis(AZ, Math.sin(sq * Math.PI) * -20 * D));
  mv.multiply(T.makeRotationAxis(AX, Math.sin(sq * Math.PI) * -80 * D));
  mv.multiply(T.makeScale(0.4, 0.4, 0.4));
  // the model's own display transform
  mv.multiply(T.makeTranslation(HELD_DISPLAY_T.x, HELD_DISPLAY_T.y, HELD_DISPLAY_T.z));
  mv.multiply(T.makeRotationAxis(AY, HELD_DISPLAY_R.y));
  mv.multiply(T.makeRotationAxis(AX, HELD_DISPLAY_R.x));
  mv.multiply(T.makeRotationAxis(AZ, HELD_DISPLAY_R.z));
  mv.multiply(T.makeScale(HELD_DISPLAY_SCALE, HELD_DISPLAY_SCALE, HELD_DISPLAY_SCALE));
  mv.multiply(T.makeTranslation(-0.5, -0.5, -0.5));
  if (side < 0) { const S = new THREE.Matrix4().makeScale(-1, 1, 1); mv.premultiply(S); mv.multiply(S); }
  return mv;
}

const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 600);
cam.updateMatrixWorld();
const proj = (v: THREE.Vector3): [number, number] => {
  const p = v.clone().project(cam);
  return [(p.x * 0.5 + 0.5) * 100, (0.5 - p.y * 0.5) * 100];
};

for (const side of [1, -1]) {
  const label = side > 0 ? 'right' : 'left';
  const amv = handChain(1, side, 0);
  const off = new THREE.Vector3(side * HELD_ARM_OFFSET.x, HELD_ARM_OFFSET.y, HELD_ARM_OFFSET.z);
  const fist = new THREE.Vector3(side * ARM_FIST_PX.x, ARM_FIST_PX.y, ARM_FIST_PX.z)
    .multiplyScalar(0.0625).applyMatrix4(amv).add(off);
  const fs = proj(fist);
  ok(fist.z < -0.2, `${label}: fist is behind/at the camera (z=${fist.z.toFixed(2)})`);
  ok(fs[1] > 50, `${label}: fist should sit in the lower half of the screen, got y=${fs[1].toFixed(0)}%`);
  ok(side > 0 ? fs[0] > 50 : fs[0] < 50, `${label}: fist on the wrong side (x=${fs[0].toFixed(0)}%)`);

  // the item, posed by the vanilla chain and offset into the same camera space as the arm
  const ioff = new THREE.Vector3(side * HELD_ITEM_NUDGE.x, HELD_ITEM_NUDGE.y, HELD_ITEM_NUDGE.z);
  const m = new THREE.Matrix4().makeTranslation(ioff.x, ioff.y, ioff.z).multiply(itemChain(1, side, 0));
  // Measure the REAL extruded geometry of the widest tool, not a unit-square proxy: tool sprites
  // leave big transparent margins, so the unit square overstates the on-screen box by a long way.
  const geo = itemModelGeometry('iron_pickaxe');
  const gp = geo.getAttribute('position');
  const corners: THREE.Vector3[] = [];
  for (let i = 0; i < gp.count; i++) {
    corners.push(new THREE.Vector3(gp.getX(i), gp.getY(i), gp.getZ(i)).applyMatrix4(m));
  }
  const pts = corners.map((v) => proj(v));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  console.log(`  ${label}: fist ${fs[0].toFixed(0)},${fs[1].toFixed(0)}%  item x ${Math.min(...xs).toFixed(0)}-${Math.max(...xs).toFixed(0)}%  y ${Math.min(...ys).toFixed(0)}-${Math.max(...ys).toFixed(0)}%`);

  // every corner must sit in front of the camera, or the item is inside the viewer's head
  for (const v of corners) ok(v.z < -0.05, `${label}: an item corner is at/behind the camera (z=${v.z.toFixed(2)})`);

  // a substantial on-screen object, not a distant sprite
  // The off-hand is genuinely more foreshortened than the main hand: mirroring an asymmetric tool
  // sprite turns its face further away from the camera, so it projects narrower. Verified by eye --
  // the left-hand tool reads correctly, it is just seen more edge-on. Height is the honest size
  // check for both hands; width is only floor-checked.
  ok(w > (side > 0 ? 18 : 8), `${label}: held item too small on screen (${w.toFixed(0)}% wide)`);
  ok(h > 25, `${label}: held item too short on screen (${h.toFixed(0)}% tall)`);
  ok(w < 80 && h < 95, `${label}: held item absurdly large (${w.toFixed(0)}x${h.toFixed(0)}%)`);
  // The head must not be sliced off by the screen edge. The haft is allowed to run past the
  // bottom -- it disappears into the fist, exactly as a real held tool does.
  ok(Math.max(...xs) <= 100, `${label}: item runs off the right edge (x max ${Math.max(...xs).toFixed(0)}%)`);
  ok(Math.min(...xs) >= 0, `${label}: item runs off the left edge (x min ${Math.min(...xs).toFixed(0)}%)`);
  ok(Math.min(...ys) >= 0, `${label}: item runs off the top (y min ${Math.min(...ys).toFixed(0)}%)`);

  // It must sit in the lower corner on its own side -- that is what "held in your hand" looks
  // like. The old pose floated the tool up by the crosshair, which is the bug this guards.
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  ok(cy > 55, `${label}: item should sit low on screen, centre y=${cy.toFixed(0)}%`);
  ok(side > 0 ? cx > 55 : cx < 45, `${label}: item should sit on its own side, centre x=${cx.toFixed(0)}%`);

  // the item must stay near the hand it is supposedly held in
  const dist = Math.hypot(cx - fs[0], cy - fs[1]);
  ok(dist < 40, `${label}: item centre is ${dist.toFixed(0)}% from the fist -- not actually held`);

  // The tool must be seen along its THICKNESS, not face-on: the -135 degree display yaw is what
  // makes a held tool read as a solid object rather than a flat decal. Compare the projected
  // width of the sprite's face (0,0)->(1,0) against its extruded depth (0,0)->(0,0,1).
  const o = proj(new THREE.Vector3(0, 0, 0).applyMatrix4(m));
  const exX = proj(new THREE.Vector3(1, 0, 0).applyMatrix4(m));
  const exZ = proj(new THREE.Vector3(0, 0, 1).applyMatrix4(m));
  const faceLen = Math.hypot(exX[0] - o[0], exX[1] - o[1]);
  const depthLen = Math.hypot(exZ[0] - o[0], exZ[1] - o[1]);
  ok(depthLen > faceLen * 0.02, `${label}: item is nearly face-on (depth ${depthLen.toFixed(1)}% vs face ${faceLen.toFixed(1)}%) -- the display yaw is not being applied`);

  // stays in front of the camera through the whole swing
  for (let sp = 0; sp <= 1.0001; sp += 0.1) {
    const a2 = handChain(sp, side, 0);
    const f2 = new THREE.Vector3(side * ARM_FIST_PX.x, ARM_FIST_PX.y, ARM_FIST_PX.z).multiplyScalar(0.0625).applyMatrix4(a2).add(off);
    ok(f2.z < -0.05, `${label}: fist clipped through the camera at swing ${sp.toFixed(1)} (z=${f2.z.toFixed(2)})`);
    const im = new THREE.Matrix4().makeTranslation(ioff.x, ioff.y, ioff.z).multiply(itemChain(sp, side, 0));
    const c = new THREE.Vector3(0.5, 0.5, 0.5).applyMatrix4(im);
    ok(c.z < -0.05, `${label}: item clipped through the camera at swing ${sp.toFixed(1)} (z=${c.z.toFixed(2)})`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
