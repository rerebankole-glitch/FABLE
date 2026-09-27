// Section 1 of the brief: "pickaxe, axe, shovel, hoe, sword, food, blocks, torches ... must NOT
// all use the exact same position and rotation."
//
// This asserts the hold poses are genuinely DISTINCT, that each category resolves to its own pose,
// and -- crucially -- that every pose still lands the item on screen. A pose table that looked
// varied but flung the sword off the viewport would be worse than the single shared pose it
// replaced, so each one is projected through the real first-person chain and bounds-checked.
import * as THREE from 'three';
import { heldPoseFor, type HeldPose } from '../src/game/core/Game';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); c ? pass++ : fail++; };

const D = Math.PI / 180;
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const T = new THREE.Matrix4();

/** The real first-person chain (Game.buildItemChain at rest) with a given pose applied. */
function poseMatrix(p: HeldPose, side = 1): THREE.Matrix4 {
  const mv = new THREE.Matrix4();
  mv.multiply(new THREE.Matrix4().makeTranslation(0.56, -0.52, -0.71999997));
  mv.multiply(new THREE.Matrix4().makeRotationY(Math.PI / 4));
  mv.multiply(T.makeRotationAxis(AX, Math.sin(Math.PI) * -80 * D));
  mv.multiply(T.makeScale(0.4, 0.4, 0.4));
  mv.multiply(T.makeTranslation(p.t.x, p.t.y, p.t.z));
  mv.multiply(T.makeRotationAxis(AY, p.r.y));
  mv.multiply(T.makeRotationAxis(AX, p.r.x));
  mv.multiply(T.makeRotationAxis(AZ, p.r.z));
  mv.multiply(T.makeScale(p.s, p.s, p.s));
  mv.multiply(T.makeTranslation(-0.5, -0.5, -0.5));
  if (side < 0) { const S = new THREE.Matrix4().makeScale(-1, 1, 1); mv.premultiply(S); mv.multiply(S); }
  return mv;
}

// The real updateHand() decomposes the chain, scales the position by fovK, then adds a
// camera-space nudge. Omitting that gave coordinates that were not what the player actually sees.
const HELD_ITEM_NUDGE = { x: -0.06, y: 0.04, z: 0.02 };
const FOVK = Math.tan(Math.PI * 35 / 180) / Math.tan(70 * D / 2); // 1 at the fixed 70-degree hand FOV

const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 600);
cam.updateMatrixWorld();
const proj = (v: THREE.Vector3): [number, number] => {
  const q = v.clone().project(cam);
  return [(q.x * 0.5 + 0.5) * 100, (0.5 - q.y * 0.5) * 100];
};

// ---- every category resolves to a pose
const CASES: [string, string | null, boolean][] = [
  ['pickaxe', 'iron_pickaxe', false], ['axe', 'iron_axe', false], ['shovel', 'iron_shovel', false],
  ['hoe', 'iron_hoe', false], ['sword', 'iron_sword', false], ['bow', 'bow', false],
  ['food', 'apple', false], ['block', 'cobblestone', true], ['torch', 'torch', true],
  ['default', 'stick', false],
];
const seen = new Map<string, HeldPose>();
for (const [label, id, isBlock] of CASES) {
  const p = heldPoseFor(id, isBlock);
  ok(`${label}: resolves to a pose`, !!p && typeof p.s === 'number');
  seen.set(label, p);
}

// ---- the tool poses must actually DIFFER from one another (the brief's explicit requirement)
const sig = (p: HeldPose) => [p.t.x, p.t.y, p.t.z, p.r.x, p.r.y, p.r.z, p.s].map((n) => n.toFixed(4)).join('|');
const tools = ['pickaxe', 'axe', 'shovel', 'hoe', 'sword'];
const toolSigs = new Set(tools.map((t) => sig(seen.get(t)!)));
ok('the five tool poses are all distinct', toolSigs.size === tools.length, `${toolSigs.size}/${tools.length} unique`);
ok('food differs from tools', sig(seen.get('food')!) !== sig(seen.get('sword')!));
ok('torch differs from the generic block pose', sig(seen.get('torch')!) !== sig(seen.get('block')!));
ok('blocks differ from flat items', sig(seen.get('block')!) !== sig(seen.get('default')!));

// ---- but every pose must still put the item on screen, in both hands
for (const [label, p] of seen) {
  for (const side of [1, -1]) {
    const m = poseMatrix(p, side);
    const nudge = new THREE.Vector3(side * HELD_ITEM_NUDGE.x, HELD_ITEM_NUDGE.y, HELD_ITEM_NUDGE.z).multiplyScalar(FOVK);
    const pts: [number, number][] = [];
    let minZ = Infinity;
    for (const c of [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0.5,0.5,0]] as const) {
      const v = new THREE.Vector3(c[0], c[1], c[2]).applyMatrix4(m).multiplyScalar(FOVK).add(nudge);
      minZ = Math.min(minZ, -v.z);
      pts.push(proj(v));
    }
    const hand = side > 0 ? 'R' : 'L';
    ok(`${label} ${hand}: in front of the camera`, minZ > 0.05, `z=${minZ.toFixed(2)}`);
    // What matters is that a useful part of the item is VISIBLE, not where its centre lands: a
    // held item legitimately runs off the bottom corner (the haft disappears into the fist), and a
    // block is a cube whose true centre is (0.5,0.5,0.5) rather than the sprite-plane midpoint.
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const onScreen = pts.filter((q) => q[0] > 0 && q[0] < 100 && q[1] > 0 && q[1] < 100).length;
    ok(`${label} ${hand}: part of the item is on screen`, onScreen > 0,
      `x[${Math.min(...xs).toFixed(0)},${Math.max(...xs).toFixed(0)}] y[${Math.min(...ys).toFixed(0)},${Math.max(...ys).toFixed(0)}]`);
    ok(`${label} ${hand}: on its own side of the screen`, side > 0 ? Math.max(...xs) > 50 : Math.min(...xs) < 50);
    ok(`${label} ${hand}: sits in the lower half`, Math.max(...ys) > 50);
  }
}

// ---- scales stay sane (no item blown up or shrunk to nothing)
for (const [label, p] of seen) {
  ok(`${label}: scale is sensible`, p.s > 0.5 && p.s < 2.0, `s=${p.s}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
