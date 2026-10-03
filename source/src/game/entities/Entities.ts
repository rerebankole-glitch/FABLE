import * as THREE from 'three';
import { B, BLOCKS } from '../blocks/Blocks';
import { getAtlas } from '../blocks/TextureAtlas';
import type { EntitySave, ItemStack } from '../core/types';
import { itemDef, makeStack } from '../items/Items';
import { itemModelMesh } from '../items/ItemModel';
import { bladeMesh, BLADE_SINK } from '../items/BladeModel';
import {
  solveShape, exitDir, opposite, ascendDir, trackCentre, DIRS,
  stepCartSpeed, type Dir, type TrackShape,
} from '../world/Rails';
import { stepBuoyancy, submersionAt, stepPaddle, stepHeading, SKIFF_DRAFT } from '../world/Boating';
import { makeBody, moveBody, type Body } from '../player/Physics';
import type { Player } from '../player/Player';
import type { World } from '../world/World';
import type { ParticleSystem } from '../particles/Particles';
import { audio } from '../audio/Audio';
import { BIOMES } from '../world/Biomes';
import { entityPalette, packedColor, packGeneration, type EntityPalette, type PartRole } from '../core/PackEntities';
import { boxTexture, plainTexture, remapFaceUV, type BoxSkin, type FaceArt } from './MobArt';
import {
  KEEPER_PROFESSIONS, keeperSkins, KEEPER_HEAD_SKIN, KEEPER_NOSE_SKIN, KEEPER_ARMS_SKIN,
  KEEPER_SLEEVE_SKIN, KEEPER_LEG_SKIN, KEEPER_COLLAR,
  BOVIN_FACE, BOVIN_HIDE, BOVIN_MUZZLE, SNOUTER_FACE, SNOUTER_SNOUT, SNOUTER_HIDE,
  WOOLLY_FACE, WOOLLY_WOOL, CLUCKER_FACE, CLUCKER_WING, STALKER_FACE, ARCHER_FACE,
  GUARDIAN_FACE, GUARDIAN_HIDE, WYRM_FACE, WYRM_SCALES, WYRM_BELLY, HOOF,
} from './MobSkins';

// ------------------------------------------------------------ materials / models
class ModelBuilder {
  group = new THREE.Group();
  mats: THREE.MeshLambertMaterial[] = [];
  /**
   * Resource-pack palette for the mob being built (undefined = FABLE's own colours). Each box is
   * painted with `packedColor`, so a loaded entity pack recolours the model as it is constructed
   * and mobs rebuild into the pack's look. Emissive boxes (eyes, glows) are always accents.
   */
  palette: EntityPalette | undefined;
  private geoCache = new Map<string, THREE.BoxGeometry>();
  /**
   * One box of the model.
   *
   * `skin` turns the box from a plain hide-textured cube into a painted one: face art is packed
   * into a single 3x2 texture and the geometry's UVs are remapped onto it, so per-face detail
   * (eyes, a nose, robe folds, hooves) costs no extra draw calls. All art colours are derived from
   * the resolved colour, so a resource pack still recolours the whole model.
   */
  box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, pivotTop = false, emissive = 0, role: PartRole = 'body', skin?: BoxSkin): THREE.Mesh {
    const c = packedColor(color, emissive ? 'accent' : role, this.palette);
    const [rw, rh] = skin?.res ?? [8, 8];
    const key = `${w},${h},${d},${pivotTop},${skin ? `${rw}x${rh}` : 'p'}`;
    let g = this.geoCache.get(key);
    if (!g) {
      g = new THREE.BoxGeometry(w / 16, h / 16, d / 16);
      if (pivotTop) g.translate(0, -h / 32, 0);
      if (skin) remapFaceUV(g);
      this.geoCache.set(key, g);
    }
    const map = emissive ? undefined : (skin ? boxTexture(skin, c) : plainTexture(c));
    // only pass `map` when there is a texture — passing `map: undefined` makes THREE warn per material
    const m = new THREE.MeshLambertMaterial({ ...(map ? { map } : {}), color: emissive ? c : 0xffffff, emissive: emissive ? c : 0x000000, emissiveIntensity: emissive });
    this.mats.push(m);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x / 16, y / 16, z / 16);
    this.group.add(mesh);
    return mesh;
  }
}

export interface Parts { head?: THREE.Object3D; legs: THREE.Object3D[]; arms: THREE.Object3D[]; wings: THREE.Object3D[]; body?: THREE.Object3D; tail?: THREE.Object3D[] }
/**
 * Per-mob build context. `variant` is a stable small number the mob's own identity decides (its id),
 * which is how the Keeper's three professions get three different robes and hats while every other
 * creature ignores it.
 */
export interface BuildContext { variant: number }
type Builder = (m: ModelBuilder, ctx: BuildContext) => Parts;

const humanoid = (skin: number, shirt: number, pants: number, eye: number, extra?: (m: ModelBuilder, parts: Parts) => void, opts?: { face?: FaceArt; hair?: FaceArt; cloth?: FaceArt }): Builder => (m) => {
  const legSkin: BoxSkin | undefined = opts?.cloth ? { res: [8, 12], all: opts.cloth } : undefined;
  const bodySkin: BoxSkin | undefined = opts?.cloth ? { res: [8, 12], all: opts.cloth } : undefined;
  const headSkin: BoxSkin | undefined = opts?.face ? { res: [8, 8], front: opts.face, all: opts.hair ?? opts.face } : undefined;
  const legs = [m.box(4, 12, 4, pants, -2, 12, 0, true, 0, 'legs', legSkin), m.box(4, 12, 4, pants, 2, 12, 0, true, 0, 'legs', legSkin)];
  const body = m.box(8, 12, 4, shirt, 0, 18, 0, false, 0, 'body', bodySkin);
  const arms = [m.box(4, 12, 4, shirt, -6, 24, 0, true, 0, 'body', bodySkin), m.box(4, 12, 4, shirt, 6, 24, 0, true, 0, 'body', bodySkin)];
  const head = new THREE.Group(); head.position.set(0, 24 / 16, 0);
  const hb = m.box(8, 8, 8, skin, 0, 4, 0, false, 0, 'head', headSkin); head.add(hb); m.group.remove(hb);
  const e1 = m.box(2, 1, 1, eye, -2, 4.5, -4, false, 1.2), e2 = m.box(2, 1, 1, eye, 2, 4.5, -4, false, 1.2);
  head.add(e1, e2); m.group.remove(e1); m.group.remove(e2);
  m.group.add(head);
  const parts: Parts = { head, legs, arms, wings: [], body };
  extra?.(m, parts);
  return parts;
};

const quadruped = (bodyC: number, headC: number, legC: number, bw: number, bh: number, bd: number, legH: number, headW: number, headH: number, headD: number, extra?: (m: ModelBuilder, p: Parts) => void, opts?: { hide?: FaceArt; face?: FaceArt }): Builder => (m) => {
  const bodySkin: BoxSkin | undefined = opts?.hide ? { res: [bw, bh], all: opts.hide } : undefined;
  const legSkin: BoxSkin | undefined = { res: [4, legH], all: HOOF };
  const headSkin: BoxSkin | undefined = opts?.face ? { res: [headW, headH], front: opts.face } : undefined;
  const body = m.box(bw, bh, bd, bodyC, 0, legH + bh / 2, 0, false, 0, 'body', bodySkin);
  const lx = bw / 2 - 2, lz = bd / 2 - 2;
  const legs = [m.box(4, legH, 4, legC, -lx, legH, -lz, true, 0, 'legs', legSkin), m.box(4, legH, 4, legC, lx, legH, -lz, true, 0, 'legs', legSkin), m.box(4, legH, 4, legC, -lx, legH, lz, true, 0, 'legs', legSkin), m.box(4, legH, 4, legC, lx, legH, lz, true, 0, 'legs', legSkin)];
  const head = new THREE.Group(); head.position.set(0, (legH + bh - 2) / 16, -bd / 32);
  const hb = m.box(headW, headH, headD, headC, 0, headH / 2 - 2, -headD / 2, false, 0, 'head', headSkin); head.add(hb); m.group.remove(hb);
  const e1 = m.box(1, 1, 1, 0x101010, -headW / 4, headH / 2, -headD - 0.1, false, 0, 'accent'), e2 = m.box(1, 1, 1, 0x101010, headW / 4, headH / 2, -headD - 0.1, false, 0, 'accent');
  head.add(e1, e2); m.group.remove(e1); m.group.remove(e2);
  m.group.add(head);
  const parts: Parts = { head, legs, arms: [], wings: [], body };
  extra?.(m, parts);
  return parts;
};

/**
 * The Keeper — FABLE's trader, built to read as a villager rather than a recoloured humanoid:
 * a heavy unibrow and deep-set eyes, a nose that pushes two pixels out of the face, a long robe
 * with a collar yoke, a hem and a belt, arms folded across the chest, and a profession hat.
 * The profession comes from the mob's id (the same number its trade list is built from), so the
 * Farmer, Smith and Mystic each look like what they sell.
 *
 * Built at ~37 px tall and scaled to 0.88, which lands the whole figure just under two blocks —
 * the stocky villager proportion.
 */
const keeperBuild: Builder = (m, ctx) => {
  const prof = KEEPER_PROFESSIONS[(((ctx?.variant ?? 0) % 3) + 3) % 3];
  const { robe: robeSkin, hat: hatSkin, brim, hatTop } = keeperSkins(prof);
  const skinColor = 0xc8a078, hairColor = 0x4a3a2a;
  const legs = [
    m.box(3, 12, 4, prof.pants, -2, 12, 0, true, 0, 'legs', KEEPER_LEG_SKIN),
    m.box(3, 12, 4, prof.pants, 2, 12, 0, true, 0, 'legs', KEEPER_LEG_SKIN),
  ];
  // the robe reaches the knees and is deeper than a humanoid torso: that silhouette is the read
  const body = m.box(8, 15, 6, prof.robe, 0, 19.5, 0, false, 0, 'body', robeSkin);
  // shoulder yoke + collar band, a touch wider than the robe
  m.box(8, 2, 6, prof.trim, 0, 26.5, 0, false, 0, 'body', { res: [8, 4], all: KEEPER_COLLAR });
  const arms = [
    m.box(4, 12, 4, prof.robe, -6, 27, 0, true, 0, 'body', KEEPER_SLEEVE_SKIN),
    m.box(4, 12, 4, prof.robe, 6, 27, 0, true, 0, 'body', KEEPER_SLEEVE_SKIN),
  ];
  m.box(8, 4, 4, prof.robe, 0, 20.5, -4.4, false, 0, 'body', KEEPER_ARMS_SKIN);

  const head = new THREE.Group(); head.position.set(0, 27 / 16, 0);
  const hb = m.box(8, 8, 7, skinColor, 0, 4, 0, false, 0, 'head', KEEPER_HEAD_SKIN);
  const nose = m.box(2, 3, 2, skinColor, 0, 3.5, -4.5, false, 0, 'head', KEEPER_NOSE_SKIN);
  head.add(hb, nose); m.group.remove(hb); m.group.remove(nose);
  // the hat belongs to the head group so it turns with it
  const hat: THREE.Mesh[] = [];
  if (prof.hat === 'straw') {
    hat.push(m.box(11, 1, 11, prof.hatColor, 0, 8.5, 0, false, 0, 'head', { res: [8, 2], all: brim, top: hatTop, bottom: hatTop }));
    hat.push(m.box(7, 4, 7, prof.hatColor, 0, 11, 0, false, 0, 'head', hatSkin));
  } else if (prof.hat === 'cap') {
    hat.push(m.box(9, 1, 9, prof.hatColor, 0, 8.5, 0, false, 0, 'head', { res: [8, 2], all: brim, top: hatTop, bottom: hatTop }));
    hat.push(m.box(8, 3, 8, prof.hatColor, 0, 10.5, 0, false, 0, 'head', hatSkin));
  } else {
    // a cowl sits a pixel back so the face and nose stay clear of its opening
    hat.push(m.box(9, 8, 8, prof.hatColor, 0, 4, 0.9, false, 0, 'head', hatSkin));
    hat.push(m.box(4, 3, 4, prof.hatColor, 0, 3, 4.4, false, 0, 'head', { res: [6, 4], all: brim }));
  }
  head.add(...hat); for (const h of hat) m.group.remove(h);
  m.group.add(head);
  m.group.scale.setScalar(0.88);
  return { head, legs, arms, wings: [], body };
};

/** Move a freshly built box under the head group so it turns with the head (no-op if there is none). */
function headChild(m: ModelBuilder, p: Parts, mesh: THREE.Mesh): THREE.Mesh {
  if (p.head) { p.head.add(mesh); m.group.remove(mesh); }
  return mesh;
}

export interface Drop { item: string; min: number; max: number; chance: number }
export interface MobDef {
  type: string; name: string; w: number; h: number; speed: number; health: number; damage: number; hostile: boolean;
  drops: Drop[]; xp: number; flying?: boolean; ranged?: boolean; burnsInSun?: boolean; food?: string[]; sound: string;
  build: Builder; eyeColor?: number; attackRange?: number; sightRange?: number; boss?: boolean; trader?: boolean;
}

export const MOBS: Record<string, MobDef> = {
  bovin: { type: 'bovin', name: 'Bovin', w: 0.45, h: 1.3, speed: 1.6, health: 10, damage: 0, hostile: false, xp: 2, sound: 'bovin', food: ['wheat'],
    drops: [{ item: 'raw_beef', min: 1, max: 3, chance: 1 }, { item: 'leather', min: 0, max: 2, chance: 1 }],
    build: quadruped(0x5a3a22, 0x6a4a2c, 0x4a2e1a, 12, 10, 18, 11, 8, 8, 6, (m, p) => {
      // horns rise off the top corners of the head, so they travel with it
      for (const sx of [-1, 1]) {
        const horn = m.box(1, 3, 1, 0xe8dcc0, sx * 3, 7, -3); headChild(m, p, horn);
        horn.rotation.z = sx * 0.35;
      }
      // pale muzzle and udder, both proud of the surface instead of buried inside the body
      const muzzle = m.box(4, 3, 1, 0xf0c0c0, 0, 3.5, -6.4, false, 0, 'head', { res: [4, 4], front: BOVIN_MUZZLE });
      headChild(m, p, muzzle);
    }, { hide: BOVIN_HIDE, face: BOVIN_FACE }) },
  woolly: { type: 'woolly', name: 'Woolly', w: 0.45, h: 1.2, speed: 1.5, health: 8, damage: 0, hostile: false, xp: 2, sound: 'woolly', food: ['wheat'],
    drops: [{ item: 'raw_mutton', min: 1, max: 2, chance: 1 }, { item: 'wool', min: 1, max: 1, chance: 1 }],
    build: quadruped(0xf2f0e8, 0xc0a890, 0x3a3a3a, 10, 10, 14, 10, 6, 6, 6, (m, p) => {
      // a fleece cap over the skull, and a woolly tail
      const cap = m.box(7, 4, 7, 0xf2f0e8, 0, 3, 0, false, 0, 'head', { res: [8, 8], all: WOOLLY_WOOL });
      headChild(m, p, cap);
      m.box(3, 3, 3, 0xf2f0e8, 0, 16, 8, false, 0, 'body', { res: [4, 4], all: WOOLLY_WOOL });
    }, { hide: WOOLLY_WOOL, face: WOOLLY_FACE }) },
  snouter: { type: 'snouter', name: 'Snouter', w: 0.45, h: 0.9, speed: 1.7, health: 10, damage: 0, hostile: false, xp: 2, sound: 'snouter', food: ['carrot', 'potato'],
    drops: [{ item: 'raw_porkchop', min: 1, max: 3, chance: 1 }],
    build: quadruped(0xf0a0a8, 0xf0a0a8, 0xf0a0a8, 10, 8, 16, 6, 8, 8, 8, (m, p) => {
      const snout = m.box(4, 3, 1, 0xd88088, 0, 3.5, -8.5, false, 0, 'head', { res: [4, 4], front: SNOUTER_SNOUT });
      headChild(m, p, snout);
      for (const sx of [-1, 1]) { // floppy ears, pushed out past the sides of the skull
        const ear = m.box(1, 2, 2, 0xd88088, sx * 4.5, 6, -4, false, 0, 'head');
        headChild(m, p, ear);
      }
    }, { hide: SNOUTER_HIDE, face: SNOUTER_FACE }) },
  clucker: { type: 'clucker', name: 'Clucker', w: 0.25, h: 0.7, speed: 1.4, health: 4, damage: 0, hostile: false, xp: 1, sound: 'clucker', food: ['wheat_seeds'],
    drops: [{ item: 'raw_chicken', min: 1, max: 1, chance: 1 }, { item: 'feather', min: 0, max: 2, chance: 1 }],
    build: (m) => {
      const body = m.box(6, 6, 8, 0xf4f4f4, 0, 8, 0, false, 0, 'body', { res: [6, 6], all: CLUCKER_WING });
      const legs = [m.box(1, 5, 1, 0xe8c040, -1.5, 5, 0, true), m.box(1, 5, 1, 0xe8c040, 1.5, 5, 0, true)];
      const head = new THREE.Group(); head.position.set(0, 10 / 16, -3 / 16);
      const hb = m.box(4, 6, 3, 0xf4f4f4, 0, 3, -1, false, 0, 'head', { res: [4, 8], front: CLUCKER_FACE }); const beak = m.box(4, 2, 2, 0xe8a020, 0, 2, -3.5); const wat = m.box(2, 2, 1, 0xd03030, 0, 0, -3);
      head.add(hb, beak, wat); m.group.remove(hb); m.group.remove(beak); m.group.remove(wat);
      const e1 = m.box(1, 1, 1, 0x101010, -1.5, 4, -2.6), e2 = m.box(1, 1, 1, 0x101010, 1.5, 4, -2.6); head.add(e1, e2); m.group.remove(e1); m.group.remove(e2);
      m.group.add(head);
      const wings = [
        m.box(1, 4, 6, 0xe8e8e8, -3.5, 9, 0, false, 0, 'body', { res: [6, 4], all: CLUCKER_WING }),
        m.box(1, 4, 6, 0xe8e8e8, 3.5, 9, 0, false, 0, 'body', { res: [6, 4], all: CLUCKER_WING }),
      ];
      return { head, legs, arms: [], wings, body };
    } },
  keeper: { type: 'keeper', name: 'Keeper', w: 0.3, h: 1.9, speed: 1.4, health: 20, damage: 0, hostile: false, xp: 0, sound: 'keeper', trader: true, drops: [],
    build: keeperBuild },
  night_stalker: { type: 'night_stalker', name: 'Night Stalker', w: 0.3, h: 1.9, speed: 2.3, health: 20, damage: 4, hostile: true, xp: 5, sound: 'night_stalker', burnsInSun: true,
    drops: [{ item: 'bone', min: 0, max: 2, chance: 1 }, { item: 'string', min: 0, max: 1, chance: 0.5 }, { item: 'carrot', min: 1, max: 1, chance: 0.05 }, { item: 'potato', min: 1, max: 1, chance: 0.05 }],
    build: humanoid(0x2a2a3a, 0x1e2a3a, 0x1a1a28, 0xff3020, undefined, { face: STALKER_FACE }) },
  void_archer: { type: 'void_archer', name: 'Void Archer', w: 0.3, h: 1.9, speed: 2.0, health: 18, damage: 3, hostile: true, xp: 6, sound: 'void_archer', ranged: true, burnsInSun: true, attackRange: 14,
    drops: [{ item: 'arrow', min: 0, max: 3, chance: 1 }, { item: 'bone', min: 0, max: 2, chance: 1 }, { item: 'bow', min: 1, max: 1, chance: 0.08 }],
    build: humanoid(0x3a4050, 0x2a3040, 0x202838, 0xa040ff, (m, p) => { const bow = m.box(1, 12, 1, 0x8a6a3a, 0, -8, -3); (p.arms[1] as THREE.Mesh).add(bow); m.group.remove(bow); m.box(10, 2, 10, 0x1a2030, 0, 33, 0); }, { face: ARCHER_FACE, hair: ARCHER_FACE }) },
  cave_crawler: { type: 'cave_crawler', name: 'Cave Crawler', w: 0.6, h: 0.8, speed: 2.6, health: 16, damage: 3, hostile: true, xp: 5, sound: 'cave_crawler',
    drops: [{ item: 'spider_silk', min: 0, max: 2, chance: 1 }, { item: 'string', min: 1, max: 2, chance: 1 }],
    build: (m) => {
      const body = m.box(10, 6, 12, 0x2a2020, 0, 6, 2);
      const head = new THREE.Group(); head.position.set(0, 6 / 16, -4 / 16);
      const hb = m.box(8, 6, 6, 0x3a2a2a, 0, 0, -3); head.add(hb); m.group.remove(hb);
      for (let i = 0; i < 4; i++) { const e = m.box(1, 1, 1, 0xff2020, -3 + i * 2, 1 + (i % 2), -7.1, false, 1.5); head.add(e); m.group.remove(e); }
      m.group.add(head);
      const legs: THREE.Object3D[] = [];
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
        const leg = m.box(14, 2, 2, 0x2a2020, s * 11, 6, -4 + i * 4);
        leg.rotation.z = s * 0.5; legs.push(leg);
      }
      return { head, legs, arms: [], wings: [], body };
    } },
  shadow_flyer: { type: 'shadow_flyer', name: 'Shadow Flyer', w: 0.4, h: 0.6, speed: 4.5, health: 12, damage: 2, hostile: true, xp: 6, sound: 'shadow_flyer', flying: true,
    drops: [{ item: 'shadow_wing', min: 0, max: 1, chance: 1 }, { item: 'void_essence', min: 1, max: 1, chance: 0.4 }],
    build: (m) => {
      const body = m.box(6, 6, 8, 0x1a1a2a, 0, 5, 0);
      m.box(1, 1, 1, 0xc060ff, -1.5, 6, -4.1, false, 1.5); m.box(1, 1, 1, 0xc060ff, 1.5, 6, -4.1, false, 1.5);
      const wings = [m.box(14, 1, 8, 0x241e38, -10, 6, 0), m.box(14, 1, 8, 0x241e38, 10, 6, 0)];
      (wings[0] as THREE.Mesh).geometry = (wings[0] as THREE.Mesh).geometry.clone().translate(-7 / 16 + 10 / 16, 0, 0); wings[0].position.x = -3 / 16;
      (wings[1] as THREE.Mesh).geometry = (wings[1] as THREE.Mesh).geometry.clone().translate(7 / 16 - 10 / 16, 0, 0); wings[1].position.x = 3 / 16;
      return { legs: [], arms: [], wings, body };
    } },
  stone_guardian: { type: 'stone_guardian', name: 'Stone Guardian', w: 0.6, h: 2.7, speed: 1.3, health: 70, damage: 9, hostile: true, xp: 25, sound: 'stone_guardian', attackRange: 2.2,
    drops: [{ item: 'sky_crystal', min: 0, max: 2, chance: 1 }, { item: 'ember_dust', min: 2, max: 5, chance: 1 }, { item: 'stone_bricks', min: 2, max: 6, chance: 1 }],
    build: (m) => {
      const stone: BoxSkin = { res: [8, 8], all: GUARDIAN_HIDE };
      const legs = [m.box(6, 14, 6, 0x5a5a5a, -4, 14, 0, true, 0, 'legs', stone), m.box(6, 14, 6, 0x5a5a5a, 4, 14, 0, true, 0, 'legs', stone)];
      const body = m.box(14, 18, 8, 0x6a6a6a, 0, 23, 0, false, 0, 'body', stone);
      const arms = [m.box(6, 18, 6, 0x5a5a5a, -10, 32, 0, true, 0, 'body', stone), m.box(6, 18, 6, 0x5a5a5a, 10, 32, 0, true, 0, 'body', stone)];
      const head = new THREE.Group(); head.position.set(0, 32 / 16, 0);
      const hb = m.box(10, 10, 10, 0x707070, 0, 5, 0, false, 0, 'head', { res: [8, 8], front: GUARDIAN_FACE, all: GUARDIAN_HIDE }); head.add(hb); m.group.remove(hb);
      const e1 = m.box(2, 2, 1, 0x60ffe0, -2.5, 5, -5.1, false, 1.5), e2 = m.box(2, 2, 1, 0x60ffe0, 2.5, 5, -5.1, false, 1.5); head.add(e1, e2); m.group.remove(e1); m.group.remove(e2);
      m.group.add(head);
      m.box(4, 4, 4, 0x60ffe0, 0, 24, -4.5, false, 0.8);
      return { head, legs, arms, wings: [], body };
    } },
  void_wyrm: { type: 'void_wyrm', name: 'Void Wyrm', w: 1.2, h: 2.4, speed: 5, health: 300, damage: 8, hostile: true, xp: 250, sound: 'boss', flying: true, boss: true,
    drops: [{ item: 'void_essence', min: 8, max: 12, chance: 1 }, { item: 'sky_crystal', min: 10, max: 16, chance: 1 }, { item: 'honey_apple', min: 2, max: 4, chance: 1 }],
    build: (m) => {
      const head = new THREE.Group(); head.position.set(0, 1.4, -1.0);
      const hb = m.box(18, 14, 20, 0x2a1a44, 0, 0, 0, false, 0, 'head', { res: [18, 14], front: WYRM_FACE, all: WYRM_SCALES }); head.add(hb); m.group.remove(hb);
      for (const s of [-1, 1]) { const e = m.box(3, 3, 1, 0x60ffe0, s * 5, 3, -10.1, false, 2); head.add(e); m.group.remove(e); const h = m.box(3, 8, 3, 0x1a1030, s * 7, 10, 4); head.add(h); m.group.remove(h); }
      const jaw = m.box(14, 4, 14, 0x3a2a54, 0, -8, -2); head.add(jaw); m.group.remove(jaw);
      m.group.add(head);
      const body = m.box(20, 18, 28, 0x2a1a44, 0, 22, 8, false, 0, 'body', { res: [20, 18], all: WYRM_SCALES, bottom: WYRM_BELLY });
      const tail = [
        m.box(16, 14, 20, 0x241638, 0, 20, 30, false, 0, 'body', { res: [16, 14], all: WYRM_SCALES }),
        m.box(12, 10, 18, 0x1e1230, 0, 18, 48, false, 0, 'body', { res: [12, 10], all: WYRM_SCALES }),
        m.box(8, 6, 16, 0x1a1030, 0, 16, 64, false, 0, 'body', { res: [8, 6], all: WYRM_SCALES }),
      ];
      const wings = [m.box(40, 2, 24, 0x3a2a60, -30, 30, 8), m.box(40, 2, 24, 0x3a2a60, 30, 30, 8)];
      (wings[0] as THREE.Mesh).geometry = (wings[0] as THREE.Mesh).geometry.clone().translate(-20 / 16, 0, 0); wings[0].position.x = -10 / 16;
      (wings[1] as THREE.Mesh).geometry = (wings[1] as THREE.Mesh).geometry.clone().translate(20 / 16, 0, 0); wings[1].position.x = 10 / 16;
      m.box(6, 6, 6, 0x60ffe0, 0, 24, -6, false, 1.2);
      return { head, legs: [], arms: [], wings, body, tail };
    } },
};

// ------------------------------------------------------------ context
export interface EntityContext {
  world: World;
  player: Player;
  particles: ParticleSystem;
  daylight: number;
  isNight: boolean;
  difficulty: string;
  dimension: string;
  /** true while rain/storm is falling in the overworld: hostiles venture out more boldly */
  weatherBad: boolean;
  dropItem(x: number, y: number, z: number, stack: ItemStack, vx?: number, vy?: number, vz?: number): void;
  spawnXp(x: number, y: number, z: number, amount: number): void;
  spawnMob(type: string, x: number, y: number, z: number): Mob | null;
  spawnProjectile(p: Projectile): void;
  damagePlayer(amount: number, source: 'mob' | 'arrow' | 'explosion', fromX: number, fromZ: number): void;
  explode(x: number, y: number, z: number, radius: number, breakBlocks: boolean): void;
  message(text: string): void;
  onBossUpdate(boss: Mob | null): void;
  /** one-of-a-kind find (boss kills, ...): celebrated once per world by the discovery journal */
  discover(key: string, label: string, xp: number): void;
}

// ------------------------------------------------------------ base entity
let nextId = 1;
export abstract class Entity {
  id = nextId++;
  body: Body;
  yaw = 0;
  obj = new THREE.Group();
  dead = false;
  removed = false;
  age = 0;
  constructor(x: number, y: number, z: number, w: number, h: number) {
    this.body = makeBody(x, y, z, w, h);
  }
  abstract update(dt: number, ctx: EntityContext, near: boolean): void;
  get x() { return this.body.x; }
  get y() { return this.body.y; }
  get z() { return this.body.z; }
  distTo(x: number, y: number, z: number): number { return Math.hypot(this.body.x - x, this.body.y - y, this.body.z - z); }
  syncObj(): void { this.obj.position.set(this.body.x, this.body.y, this.body.z); this.obj.rotation.y = this.yaw; }
}

// ------------------------------------------------------------ mobs
type AIState = 'idle' | 'wander' | 'chase' | 'flee' | 'follow' | 'circle';

/**
 * Build a mob's model on its own (no scene, no Mob instance). Used by the offline model preview
 * tool (tools/mob-preview.ts) and available to any gallery/UI that wants to show a creature.
 */
export function buildMobModel(type: string, palette?: EntityPalette, variant = 0): { group: THREE.Group; parts: Parts } {
  const def = MOBS[type];
  if (!def) throw new Error(`unknown mob type: ${type}`);
  const mb = new ModelBuilder();
  mb.palette = palette;
  const parts = def.build(mb, { variant });
  return { group: mb.group, parts };
}

export class Mob extends Entity {
  def: MobDef;
  health: number;
  maxHealth: number;
  parts: Parts;
  mats: THREE.MeshLambertMaterial[];
  state: AIState = 'idle';
  stateTimer = 1 + Math.random() * 2;
  moveDirX = 0; moveDirZ = 0;
  hurtFlash = 0;
  attackCooldown = 0;
  soundTimer = 5 + Math.random() * 10;
  fireTicks = 0;
  fireTimer = 0;
  legPhase = 0;
  deathTimer = -1;
  private poofed = false;
  baby = false;
  growTimer = 0;
  love = 0;
  breedCooldown = 0;
  lastAttacker: 'player' | null = null;
  targetY = 0;
  phase = 1;
  summonTimer = 0;
  lightTimer = 0;
  persistent = false;
  /** 1 right after being hit, decays to 0: drives the squash-and-stretch hurt animation */
  squash = 0;
  /** 1 right after this mob attacks, decays: drives the lunge / arm swing */
  lunge = 0;
  /** random phase so hovering flyers do not bob and drift in lockstep with each other */
  bob = Math.random() * Math.PI * 2;
  /** seconds until a cruising flyer picks a new heading */
  hoverTimer = 0;
  /** 0..1 cruise multiplier for the idle drift; walkers leave this at 0 */
  moveDirAmount = 0;
  /** last damage amount taken (read by the HUD for damage numbers) */
  lastDamage = 0;
  private jumpCooldown = 0;
  private stuckTimer = 0;
  /** the model group currently in the scene (swapped out when a resource pack re-skins the mob) */
  private modelGroup: THREE.Group;
  /** pack generation this model was built with: a mismatch means the skin changed under us */
  private packGen = 0;

  /**
   * Rebuild the visual model against the current resource-pack palette. Called when a pack is
   * loaded or cleared so mobs already walking around take the new skin instead of only newly
   * spawned ones. Animation state lives on `parts`, which is rebuilt with the model, so the mob
   * simply continues animating with the new boxes.
   */
  private reskin(): void {
    const mb = new ModelBuilder();
    mb.palette = entityPalette(this.def.type);
    this.obj.remove(this.modelGroup);
    this.modelGroup.traverse((c) => {
      const mesh = c as THREE.Mesh;
      const mm = mesh.material as THREE.Material | THREE.Material[] | undefined;
      for (const x of Array.isArray(mm) ? mm : mm ? [mm] : []) x.dispose();
    });
    this.parts = this.def.build(mb, { variant: this.id });
    this.mats = mb.mats;
    this.modelGroup = mb.group;
    this.packGen = packGeneration();
    this.obj.add(mb.group);
    if (this.baby) this.obj.scale.setScalar(0.5);
  }

  constructor(def: MobDef, x: number, y: number, z: number) {
    super(x, y, z, def.w, def.h);
    this.def = def;
    this.health = this.maxHealth = def.health;
    const mb = new ModelBuilder();
    mb.palette = entityPalette(def.type);
    this.parts = def.build(mb, { variant: this.id });
    this.mats = mb.mats;
    this.modelGroup = mb.group;
    this.packGen = packGeneration();
    this.obj.add(mb.group);
    this.yaw = Math.random() * Math.PI * 2;
    this.body.stepHeight = def.type === 'cave_crawler' ? 1.05 : 0.6;
    this.targetY = y + 6;
    if (def.boss) this.persistent = true;
  }

  setBaby(b: boolean): void {
    this.baby = b;
    this.obj.scale.setScalar(b ? 0.5 : 1);
    this.body.h = this.def.h * (b ? 0.5 : 1);
    this.body.w = this.def.w * (b ? 0.5 : 1);
    if (b) this.growTimer = 120;
  }

  damage(amount: number, fromX: number, fromZ: number, byPlayer: boolean, ctx: EntityContext, knock = 1): void {
    if (this.dead) return;
    this.health -= amount;
    this.hurtFlash = 0.3;
    this.squash = 1;
    this.lastDamage = amount;
    const dx = this.body.x - fromX, dz = this.body.z - fromZ;
    const l = Math.hypot(dx, dz) || 1;
    if (!this.def.boss) {
      this.body.vx += (dx / l) * 5 * knock; this.body.vz += (dz / l) * 5 * knock; this.body.vy = Math.max(this.body.vy, 4 * knock);
    }
    audio.play(`mob.${this.def.sound}_hurt`, { pos: [this.body.x, this.body.y + 1, this.body.z], volume: 0.8 });
    ctx.particles.hit(this.body.x, this.body.y, this.body.z);
    if (byPlayer) this.lastAttacker = 'player';
    if (this.health <= 0) this.die(ctx, byPlayer);
    else if (!this.def.hostile) { this.state = 'flee'; this.stateTimer = 4; this.moveDirX = dx / l; this.moveDirZ = dz / l; }
    else if (byPlayer) { this.state = 'chase'; this.stateTimer = 20; }
  }

  die(ctx: EntityContext, byPlayer: boolean): void {
    if (this.dead) return;
    this.dead = true;
    this.deathTimer = 0.8;
    audio.play(`mob.${this.def.sound}_hurt`, { pos: [this.body.x, this.body.y + 1, this.body.z], pitch: 0.7 });
    for (const d of this.def.drops) {
      if (Math.random() > d.chance) continue;
      const n = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
      if (n > 0) ctx.dropItem(this.body.x, this.body.y + 0.5, this.body.z, makeStack(d.item, n), (Math.random() - 0.5) * 2, 3, (Math.random() - 0.5) * 2);
    }
    if (byPlayer && this.def.xp > 0) ctx.spawnXp(this.body.x, this.body.y + 0.5, this.body.z, this.def.xp);
    if (this.def.boss) {
      ctx.particles.explosion(this.body.x, this.body.y + 1, this.body.z);
      ctx.message('The Void Wyrm has been defeated!');
      ctx.discover('wyrm', 'the Void Wyrm', 50);
      ctx.onBossUpdate(null);
      audio.play('explosion', { volume: 1 });
    }
  }

  update(dt: number, ctx: EntityContext, near: boolean): void {
    this.age += dt;
    const b = this.body;
    if (this.dead) {
      this.deathTimer -= dt;
      const t = (0.8 - Math.max(0, this.deathTimer)) / 0.8;
      this.obj.rotation.z = t * (Math.PI / 2);
      // fade-out via a squash in the last third plus a puff of smoke as the body vanishes
      this.obj.scale.setScalar(t > 0.66 ? Math.max(0.05, 1 - (t - 0.66) / 0.34) : 1);
      if (this.deathTimer <= 0.05 && !this.poofed) { this.poofed = true; ctx.particles.smoke(b.x, b.y + b.h * 0.5, b.z, 8, false); }
      this.obj.position.set(b.x, b.y, b.z);
      if (this.deathTimer <= 0) this.removed = true;
      return;
    }
    if (!near) return;
    const p = ctx.player;
    const dx = p.body.x - b.x, dz = p.body.z - b.z, dy = p.body.y - b.y;
    const dist = Math.hypot(dx, dz, dy);
    this.stateTimer -= dt;
    this.attackCooldown -= dt;
    this.jumpCooldown -= dt;
    if (this.breedCooldown > 0) this.breedCooldown -= dt;
    if (this.love > 0) { this.love -= dt; if (Math.random() < dt * 3) ctx.particles.magic(b.x, b.y + b.h, b.z, 1, [1, 0.3, 0.4]); }
    if (this.baby) { this.growTimer -= dt; if (this.growTimer <= 0) this.setBaby(false); }
    if (this.def.boss) this.updateBoss(dt, ctx, dist, dx, dy, dz);
    else if (this.def.hostile) this.hostileAI(dt, ctx, dist, dx, dz, dy);
    else this.passiveAI(dt, ctx, dist, dx, dz);

    // movement
    const speed = this.def.speed * (this.state === 'chase' || this.state === 'flee' ? 1 : 0.55) * (this.baby ? 1.2 : 1) * (this.phase === 3 ? 1.5 : 1);
    // walkers only move when the AI asks; flyers keep a slow cruise so they never freeze in the air
    const wantMove = this.state !== 'idle' || this.moveDirAmount > 0;
    const cruise = this.moveDirAmount || 1;
    const tx = wantMove ? this.moveDirX * speed * cruise : 0, tz = wantMove ? this.moveDirZ * speed * cruise : 0;
    if (this.def.flying) {
      b.vx += (tx - b.vx) * Math.min(1, 4 * dt); b.vz += (tz - b.vz) * Math.min(1, 4 * dt);
      const ty = (this.targetY - b.y) * 1.5;
      b.vy += (Math.max(-6, Math.min(6, ty)) - b.vy) * Math.min(1, 3 * dt);
    } else {
      const acc = b.onGround ? 10 : 2;
      b.vx += (tx - b.vx) * Math.min(1, acc * dt); b.vz += (tz - b.vz) * Math.min(1, acc * dt);
      if (b.inWater) { b.vy += (1.5 - b.vy) * Math.min(1, 3 * dt); }
      else { b.vy -= 28 * dt; if (b.vy < -50) b.vy = -50; }
      // obstacle: jump
      if (wantMove && b.collidedH && b.onGround && this.jumpCooldown <= 0) { b.vy = 8.4; this.jumpCooldown = 0.5; }
      if (wantMove && b.collidedH) { this.stuckTimer += dt; if (this.stuckTimer > 1.5) { this.turnRandom(); this.stuckTimer = 0; } } else this.stuckTimer = 0;
      // avoid cliffs & lava when wandering
      if (wantMove && this.state !== 'chase' && this.state !== 'flee' && b.onGround) {
        const ax = Math.floor(b.x + this.moveDirX * 1.2), az = Math.floor(b.z + this.moveDirZ * 1.2);
        const fy = Math.floor(b.y);
        let drop = 0;
        while (drop < 4 && ctx.world.getBlock(ax, fy - 1 - drop, az) === B.AIR) drop++;
        const ahead = ctx.world.getBlock(ax, fy, az);
        if (drop >= 4 || ahead === B.LAVA || ctx.world.getBlock(ax, fy - 1, az) === B.LAVA) this.turnRandom();
      }
    }
    if (wantMove && (Math.abs(b.vx) > 0.1 || Math.abs(b.vz) > 0.1)) {
      const targetYaw = Math.atan2(-b.vx, -b.vz);
      let d = targetYaw - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 8);
    }
    const prevY = b.y;
    moveBody(ctx.world, b, dt);
    if (!this.def.flying && !b.onGround && !b.inWater && b.vy < 0) this.fallDistance += prevY - b.y;
    if (b.onGround) { if (this.fallDistance > 4 && !this.def.boss) this.damage(Math.floor(this.fallDistance - 3), b.x, b.z, false, ctx, 0); this.fallDistance = 0; }
    if (b.inWater) this.fallDistance = 0;
    // lava / sun burning
    if (b.inLava) { this.fireTicks = 5; this.fireTimer += dt; if (this.fireTimer > 0.5) { this.fireTimer = 0; this.damage(4, b.x, b.z, false, ctx, 0); } }
    else if (this.def.burnsInSun && !ctx.isNight && ctx.daylight > 0.7 && ctx.dimension === 'overworld') {
      const [sky] = ctx.world.getLight(Math.floor(b.x), Math.floor(b.y + 1), Math.floor(b.z));
      if (sky >= 14 && !b.inWater) this.fireTicks = 2;
    }
    if (this.fireTicks > 0) {
      this.fireTicks -= dt;
      if (b.inWater) this.fireTicks = 0;
      this.fireTimer += dt;
      if (Math.random() < dt * 10) ctx.particles.flame(b.x + (Math.random() - 0.5) * 0.5, b.y + Math.random() * b.h, b.z + (Math.random() - 0.5) * 0.5);
      if (this.fireTimer > 1) { this.fireTimer = 0; this.damage(1, b.x, b.z, false, ctx, 0); }
    }
    // sounds
    this.soundTimer -= dt;
    if (this.soundTimer <= 0) { this.soundTimer = 6 + Math.random() * 14; audio.play(`mob.${this.def.sound}`, { pos: [b.x, b.y + 1, b.z], volume: 0.7 }); }
    // animation
    const hs = Math.hypot(b.vx, b.vz);
    this.legPhase += dt * (this.def.flying ? 12 : hs * 3.5);
    const amp = Math.min(1, hs / 2) * 0.8;
    this.parts.legs.forEach((l, i) => {
      if (this.def.type === 'cave_crawler') { l.rotation.y = Math.sin(this.legPhase + i * 1.3) * 0.3 * Math.min(1, hs); return; }
      l.rotation.x = Math.sin(this.legPhase + (i % 2 ? Math.PI : 0) + (i >= 2 ? Math.PI : 0)) * amp;
    });
    // The Keeper's arms are folded across its chest (a separate box carries them) — swinging two
    // empty sleeves would read as a bug, so it only shuffles its legs.
    const foldedArms = this.def.trader === true;
    this.parts.arms.forEach((a, i) => { a.rotation.x = foldedArms ? 0 : this.state === 'chase' && this.def.type !== 'void_archer' ? -1.4 : Math.sin(this.legPhase + (i % 2 ? 0 : Math.PI)) * amp * 0.7; });
    if (this.parts.head && foldedArms) {
      // idle head bob: traders look around at whatever walks past
      this.parts.head.rotation.y = Math.sin(this.age * 0.7) * 0.5;
    }
    this.parts.wings.forEach((w, i) => { w.rotation.z = (i === 0 ? 1 : -1) * Math.sin(this.legPhase * (this.def.boss ? 0.4 : 1)) * (this.def.boss ? 0.5 : 0.8); });
    if (this.parts.tail) this.parts.tail.forEach((t, i) => { t.position.x = Math.sin(this.age * 3 - i * 0.8) * 0.3 * (i + 1); t.rotation.y = Math.sin(this.age * 3 - i * 0.8) * 0.2; });
    if (this.parts.head) {
      if (dist < 8 && !this.def.flying) {
        const a = Math.atan2(-dx, -dz) - this.yaw;
        let d = a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        this.parts.head.rotation.y += (Math.max(-1.1, Math.min(1.1, d)) - this.parts.head.rotation.y) * Math.min(1, dt * 6);
      } else this.parts.head.rotation.y *= 1 - Math.min(1, dt * 3);
      if (this.state === 'idle' && !this.def.hostile && Math.random() < dt * 0.3) this.parts.head.rotation.x = 0.6; // graze
      if (this.parts.head.rotation.x > 0) this.parts.head.rotation.x = Math.max(0, this.parts.head.rotation.x - dt * 0.4);
    }
    // a resource pack was loaded or cleared: take the new skin
    if (this.packGen !== packGeneration()) this.reskin();
    // hurt flash & lighting
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    this.lightTimer -= dt;
    if (this.lightTimer <= 0 || this.hurtFlash > 0) {
      this.lightTimer = 0.25;
      const [sky, blk] = ctx.world.getLight(Math.floor(b.x), Math.floor(b.y + 0.5), Math.floor(b.z));
      const lum = 0.15 + 0.85 * Math.max(Math.pow(sky / 15, 1.4) * ctx.daylight, Math.pow(blk / 15, 1.2));
      const hurt = this.hurtFlash > 0 ? 0.35 : 1;
      for (const m of this.mats) {
        if (m.emissiveIntensity > 0 && !m.map) continue;
        m.color.setRGB(lum, lum * hurt, lum * hurt);
      }
    }
    // squash-and-stretch when hurt, lunge when attacking
    if (this.squash > 0) this.squash = Math.max(0, this.squash - dt * 4);
    if (this.lunge > 0) this.lunge = Math.max(0, this.lunge - dt * 3);
    const base = this.baby ? 0.5 : 1;
    const sq = Math.sin(this.squash * Math.PI) * 0.18;
    this.obj.scale.set(base * (1 + sq), base * (1 - sq), base * (1 + sq));
    if (this.parts.body && this.def.type !== 'shadow_flyer') this.parts.body.rotation.x = -this.lunge * 0.35;
    if (this.parts.head && this.lunge > 0) this.parts.head.rotation.x = Math.min(this.parts.head.rotation.x, -this.lunge * 0.3);
    this.syncObj();
  }
  fallDistance = 0;

  turnRandom(): void {
    const a = Math.random() * Math.PI * 2;
    this.moveDirX = Math.sin(a); this.moveDirZ = Math.cos(a);
  }

  private passiveAI(dt: number, ctx: EntityContext, dist: number, dx: number, dz: number): void {
    void dt;
    const held = ctx.player.inventory.held;
    const tempted = held && this.def.food?.includes(held.id) && dist < 7;
    if (this.state === 'flee') { if (this.stateTimer <= 0) { this.state = 'idle'; this.stateTimer = 1; } return; }
    if (this.love > 0 || tempted) {
      if (this.love > 0) {
        // seek a mate
        const mate = mobsNear.find((m) => m !== this && m.def.type === this.def.type && m.love > 0 && !m.dead && m.distTo(this.x, this.y, this.z) < 8);
        if (mate) {
          const mx = mate.x - this.x, mz = mate.z - this.z, l = Math.hypot(mx, mz) || 1;
          if (l < 1.2) {
            this.love = 0; mate.love = 0; this.breedCooldown = mate.breedCooldown = 120;
            const baby = ctx.spawnMob(this.def.type, this.x, this.y, this.z);
            if (baby) baby.setBaby(true);
            ctx.spawnXp(this.x, this.y, this.z, 3);
            ctx.particles.magic(this.x, this.y + 1, this.z, 12, [1, 0.3, 0.4]);
            this.state = 'idle';
            return;
          }
          this.state = 'follow'; this.moveDirX = mx / l; this.moveDirZ = mz / l;
          return;
        }
      }
      if (tempted && dist > 1.5) { const l = Math.hypot(dx, dz) || 1; this.state = 'follow'; this.moveDirX = dx / l; this.moveDirZ = dz / l; return; }
      this.state = 'idle';
      return;
    }
    if (this.def.trader) {
      // Keepers stay near home and go idle at night
      if (ctx.isNight && this.state !== 'idle') { this.state = 'idle'; this.stateTimer = 5; }
    }
    if (this.stateTimer <= 0) {
      if (this.state === 'idle') { this.state = 'wander'; this.stateTimer = 1.5 + Math.random() * 3; this.turnRandom(); }
      else { this.state = 'idle'; this.stateTimer = 2 + Math.random() * 5; }
    }
  }

  private hostileAI(dt: number, ctx: EntityContext, dist: number, dx: number, dz: number, dy: number): void {
    const sight = this.def.sightRange ?? 18;
    const p = ctx.player;
    const canSee = dist < sight && p.isSurvival && !p.dead && (this.def.flying || Math.abs(dy) < 8);
    if (ctx.difficulty === 'peaceful') { this.removed = true; return; }
    if (canSee && this.state !== 'chase') {
      // "noticed you": growl + a small dark puff, and a short startle hop so the change of state reads visually
      this.state = 'chase';
      audio.play(`mob.${this.def.sound}`, { pos: [this.body.x, this.body.y + 1, this.body.z], volume: 0.9, pitch: 1.15 });
      ctx.particles.smoke(this.body.x, this.body.y + this.body.h + 0.2, this.body.z, 3, true);
      if (this.body.onGround && !this.def.flying) this.body.vy = Math.max(this.body.vy, 3.5);
      this.soundTimer = 4 + Math.random() * 4;
    }
    if (this.state === 'chase') {
      if (!canSee && dist > sight * 1.5) {
        // lost the player: give up with a quieter call and a random new heading
        this.state = 'wander'; this.stateTimer = 2 + Math.random() * 3; this.turnRandom();
        audio.play(`mob.${this.def.sound}`, { pos: [this.body.x, this.body.y + 1, this.body.z], volume: 0.5, pitch: 0.85 });
        return;
      }
      const l = Math.hypot(dx, dz) || 1;
      const range = this.def.attackRange ?? 1.6;
      if (this.def.ranged) {
        // keep distance and shoot
        const desired = 9;
        if (dist > desired + 2) { this.moveDirX = dx / l; this.moveDirZ = dz / l; }
        else if (dist < desired - 3) { this.moveDirX = -dx / l; this.moveDirZ = -dz / l; }
        else { this.moveDirX = -dz / l * 0.6; this.moveDirZ = dx / l * 0.6; }
        this.yaw = Math.atan2(-dx, -dz);
        if (this.attackCooldown <= 0 && dist < range) {
          this.attackCooldown = 2.2;
          const eye = this.body.y + this.body.h * 0.85;
          const tdx = p.body.x - this.body.x, tdy = p.body.y + 1.2 - eye, tdz = p.body.z - this.body.z;
          const d = Math.hypot(tdx, tdy, tdz) || 1;
          const sp = 22;
          ctx.spawnProjectile(new Projectile('arrow', this.body.x, eye, this.body.z, (tdx / d) * sp, (tdy / d) * sp + d * 0.25, (tdz / d) * sp, false, this.def.damage));
          audio.play('bow', { pos: [this.body.x, eye, this.body.z] });
        }
      } else if (this.def.flying) {
        // swoop
        this.moveDirX = dx / l; this.moveDirZ = dz / l;
        const swoop = Math.sin(this.age * 1.5) > 0.3;
        this.targetY = swoop ? p.body.y + 1 : p.body.y + 7 + Math.sin(this.age) * 2;
        if (dist < range + 0.4 && this.attackCooldown <= 0) { this.attackCooldown = 1.5; this.lunge = 1; ctx.damagePlayer(this.def.damage, 'mob', this.body.x, this.body.z); audio.play('hit', { pos: [p.body.x, p.body.y, p.body.z] }); }
      } else {
        this.moveDirX = dx / l; this.moveDirZ = dz / l;
        if (dist < range + 0.3 && this.attackCooldown <= 0 && Math.abs(dy) < 2) {
          this.attackCooldown = this.def.type === 'stone_guardian' ? 1.8 : 1.1;
          this.lunge = 1;
          // short hop towards the player so the hit reads visually
          if (this.body.onGround) { this.body.vx += (dx / l) * 2.5; this.body.vz += (dz / l) * 2.5; this.body.vy = Math.max(this.body.vy, 2.5); }
          ctx.damagePlayer(this.def.damage, 'mob', this.body.x, this.body.z);
          audio.play('hit', { pos: [p.body.x, p.body.y, p.body.z] });
          this.parts.arms.forEach((a) => (a.rotation.x = -2.2));
        }
      }
      return;
    }
    if (this.def.flying) {
      this.targetY = Math.max(this.targetY, ctx.world.surfaceY(Math.floor(this.x), Math.floor(this.z)) + 5);
      if (Math.random() < dt * 0.2) this.targetY += (Math.random() - 0.5) * 6;
      // A flyer with nothing to chase used to hang dead still in mid-air, which reads as a broken
      // mob. It now cruises: a slow heading that changes every few seconds plus a vertical bob, so
      // anything airborne always looks like it is flying somewhere.
      if (this.state === 'idle' || this.state === 'wander') {
        this.hoverTimer -= dt;
        if (this.hoverTimer <= 0) { this.hoverTimer = 2.2 + Math.random() * 2.6; this.turnRandom(); }
        this.moveDirAmount = this.def.boss ? 0.35 : 0.5;
        this.targetY += Math.sin(this.age * 1.1 + this.bob) * 0.6;
      } else {
        this.moveDirAmount = 0;
      }
    }
    if (this.stateTimer <= 0) {
      if (this.state === 'idle') { this.state = 'wander'; this.stateTimer = 2 + Math.random() * 3; this.turnRandom(); }
      else { this.state = 'idle'; this.stateTimer = 1 + Math.random() * 3; }
    }
  }

  private updateBoss(dt: number, ctx: EntityContext, dist: number, dx: number, dy: number, dz: number): void {
    const p = ctx.player;
    const hpFrac = this.health / this.maxHealth;
    const newPhase = hpFrac < 0.33 ? 3 : hpFrac < 0.66 ? 2 : 1;
    if (newPhase !== this.phase) {
      this.phase = newPhase;
      ctx.message(newPhase === 2 ? 'The Void Wyrm calls its brood!' : 'The Void Wyrm is enraged!');
      audio.play('mob.boss', { volume: 1 });
      ctx.particles.magic(this.x, this.y + 1, this.z, 40, [0.4, 1, 0.9]);
    }
    ctx.onBossUpdate(this);
    const l = Math.hypot(dx, dz) || 1;
    // circle the player, periodically dive
    const t = this.age;
    const cycle = this.phase === 3 ? 6 : 9;
    const diving = (t % cycle) > cycle - 2.5;
    if (diving) {
      this.state = 'chase';
      this.moveDirX = dx / l; this.moveDirZ = dz / l;
      this.targetY = p.body.y + 1.5;
      if (dist < 3 && this.attackCooldown <= 0) { this.attackCooldown = 1.2; ctx.damagePlayer(this.def.damage, 'mob', this.x, this.z); }
    } else {
      this.state = 'circle';
      const ang = t * (this.phase === 3 ? 0.9 : 0.6);
      const r = 14;
      const gx = p.body.x + Math.cos(ang) * r, gz = p.body.z + Math.sin(ang) * r;
      const gdx = gx - this.x, gdz = gz - this.z, gl = Math.hypot(gdx, gdz) || 1;
      this.moveDirX = gdx / gl; this.moveDirZ = gdz / gl;
      this.targetY = p.body.y + 10 + Math.sin(t * 0.7) * 3;
      // fireballs (telegraphed by particles)
      if (this.attackCooldown <= 0 && dist < 40) {
        this.attackCooldown = this.phase === 3 ? 1.6 : this.phase === 2 ? 2.6 : 3.5;
        ctx.particles.magic(this.x, this.y + 1.5, this.z, 20, [0.4, 1, 0.9]);
        audio.play('portal', { pos: [this.x, this.y, this.z], pitch: 2 });
        const eye = this.y + 1.2;
        const tdx = p.body.x - this.x, tdy = p.body.y + 1 - eye, tdz = p.body.z - this.z;
        const d = Math.hypot(tdx, tdy, tdz) || 1;
        setTimeout(() => { if (!this.dead) ctx.spawnProjectile(new Projectile('fireball', this.x, eye, this.z, (tdx / d) * 16, (tdy / d) * 16, (tdz / d) * 16, false, 6)); }, 600);
      }
    }
    if (this.phase >= 2) {
      this.summonTimer -= dt;
      if (this.summonTimer <= 0) {
        this.summonTimer = this.phase === 3 ? 14 : 20;
        for (let i = 0; i < 2; i++) ctx.spawnMob('shadow_flyer', this.x + (Math.random() - 0.5) * 4, this.y + 1, this.z + (Math.random() - 0.5) * 4);
        ctx.message('Shadow Flyers emerge from the void!');
      }
    }
    void dy;
    this.yaw = Math.atan2(-this.body.vx, -this.body.vz);
  }

  serialize(): EntitySave {
    return { type: this.def.type, pos: [this.x, this.y, this.z], yaw: this.yaw, health: this.health, data: { baby: this.baby, persistent: this.persistent } };
  }
}
const mobsNear: Mob[] = [];

// ------------------------------------------------------------ item entity
export class ItemEntity extends Entity {
  pickupDelay = 0.6;
  bob = Math.random() * 6;
  constructor(x: number, y: number, z: number, public stack: ItemStack) {
    super(x, y, z, 0.125, 0.25);
    const def = itemDef(stack.id);
    if (def && def.block !== undefined && BLOCKS[def.block].shape !== 'cross') {
      const b = BLOCKS[def.block];
      const atlas = getAtlas();
      const mats = [4, 5, 0, 1, 2, 3].map((f) => {
        const c = document.createElement('canvas'); c.width = 16; c.height = 16;
        atlas.drawTile(c.getContext('2d')!, b.tiles[f], 0, 0, 16, b.tint ? [0.55, 0.75, 0.35] : undefined);
        const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.5 });
      });
      const h = b.box ? b.box[4] - b.box[1] : 1;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25 * h, 0.25), mats);
      mesh.position.y = 0.125 * h;
      this.obj.add(mesh);
    } else {
      // dropped items are the same voxel-extruded model the hand holds (vanilla's extruded sprite),
      // not a flat billboard: they have real thickness and catch the scene light as they spin
      const mesh = itemModelMesh(stack.id, true);
      mesh.scale.setScalar(0.35);
      mesh.position.set(-0.175, 0.02, 0);
      this.obj.add(mesh);
    }
  }
  update(dt: number, ctx: EntityContext, near: boolean): void {
    this.age += dt;
    if (this.age > 300) { this.removed = true; return; }
    if (!near) return;
    this.pickupDelay -= dt;
    const b = this.body;
    if (b.inWater) b.vy += (1 - b.vy) * dt * 3; else b.vy -= 22 * dt;
    b.vx *= 1 - Math.min(1, dt * (b.onGround ? 8 : 1)); b.vz *= 1 - Math.min(1, dt * (b.onGround ? 8 : 1));
    if (b.inLava) { this.removed = true; return; }
    const p = ctx.player;
    const dx = p.body.x - b.x, dy = p.body.y + 0.8 - b.y, dz = p.body.z - b.z;
    const d = Math.hypot(dx, dy, dz);
    if (this.pickupDelay <= 0 && d < 3.4 && !p.dead && p.mode !== 'spectator') {
      const s = 12 / Math.max(0.5, d);
      b.vx = dx / d * s; b.vy = dy / d * s; b.vz = dz / d * s;
      if (d < 0.9) {
        const left = p.inventory.add({ ...this.stack });
        if (left < this.stack.count) { audio.play('pickup', { volume: 0.5 }); p.inventory.onChange?.(); }
        if (left <= 0) { this.removed = true; return; }
        this.stack.count = left;
        this.pickupDelay = 1;
      }
      moveBody(ctx.world, b, dt, d < 1.5);
    } else moveBody(ctx.world, b, dt);
    this.obj.position.set(b.x, b.y + Math.sin(this.age * 2 + this.bob) * 0.05 + 0.05, b.z);
    this.obj.rotation.y = this.age * 1.5;
  }
}

// ------------------------------------------------------------ xp orb
export class XpOrb extends Entity {
  constructor(x: number, y: number, z: number, public amount: number) {
    super(x, y, z, 0.1, 0.2);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshBasicMaterial({ color: amount > 5 ? 0x60ffa0 : 0xc8ff40 }));
    mesh.position.y = 0.1;
    this.obj.add(mesh);
    this.body.vx = (Math.random() - 0.5) * 3; this.body.vy = 3; this.body.vz = (Math.random() - 0.5) * 3;
  }
  update(dt: number, ctx: EntityContext, near: boolean): void {
    this.age += dt;
    if (this.age > 120) { this.removed = true; return; }
    if (!near) return;
    const b = this.body, p = ctx.player;
    const dx = p.body.x - b.x, dy = p.body.y + 0.8 - b.y, dz = p.body.z - b.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 6 && this.age > 0.5 && !p.dead) {
      const s = 10;
      b.vx += dx / d * s * dt * 3; b.vy += dy / d * s * dt * 3; b.vz += dz / d * s * dt * 3;
      if (d < 0.8) { p.addXp(this.amount); audio.play('orb', { volume: 0.4 }); this.removed = true; return; }
      moveBody(ctx.world, b, dt, true);
    } else {
      b.vy -= 18 * dt; b.vx *= 1 - dt * 3; b.vz *= 1 - dt * 3;
      moveBody(ctx.world, b, dt);
    }
    this.obj.position.set(b.x, b.y + 0.1, b.z);
    this.obj.rotation.y = this.age * 3;
    this.obj.scale.setScalar(1 + Math.sin(this.age * 6) * 0.15);
  }
}

// ------------------------------------------------------------ projectiles
export class Projectile extends Entity {
  stuck = false;
  constructor(public kind: 'arrow' | 'fireball', x: number, y: number, z: number, vx: number, vy: number, vz: number, public fromPlayer: boolean, public damage: number) {
    super(x, y, z, 0.1, 0.1);
    this.body.vx = vx; this.body.vy = vy; this.body.vz = vz;
    if (kind === 'arrow') {
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.6), new THREE.MeshLambertMaterial({ color: 0x8a6a3a }));
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.12), new THREE.MeshLambertMaterial({ color: 0xd0d0d0 })); tip.position.z = -0.3;
      const fl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.15), new THREE.MeshLambertMaterial({ color: 0xf0f0f0 })); fl.position.z = 0.25;
      this.obj.add(shaft, tip, fl);
    } else {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial({ color: 0x60ffe0 }));
      this.obj.add(m);
    }
  }
  update(dt: number, ctx: EntityContext, near: boolean): void {
    this.age += dt;
    if (this.age > (this.stuck ? 30 : 12)) { this.removed = true; return; }
    if (!near) return;
    const b = this.body;
    if (this.stuck) {
      const p = ctx.player;
      if (this.fromPlayer && this.kind === 'arrow' && this.age > 1 && Math.hypot(p.body.x - b.x, p.body.y + 0.9 - b.y, p.body.z - b.z) < 1.4) {
        if (p.inventory.add(makeStack('arrow', 1)) === 0) { audio.play('pickup', { volume: 0.4 }); this.removed = true; }
      }
      return;
    }
    if (this.kind === 'arrow') b.vy -= 16 * dt;
    else if (Math.random() < 0.8) ctx.particles.magic(b.x, b.y, b.z, 1, [0.4, 1, 0.9]);
    const steps = 3;
    for (let s = 0; s < steps; s++) {
      const nx = b.x + b.vx * dt / steps, ny = b.y + b.vy * dt / steps, nz = b.z + b.vz * dt / steps;
      const id = ctx.world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
      if (id !== B.AIR && BLOCKS[id].solid) {
        if (this.kind === 'fireball') { ctx.explode(b.x, b.y, b.z, 2, ctx.dimension === 'void'); this.removed = true; return; }
        this.stuck = true; audio.play('arrowhit', { pos: [b.x, b.y, b.z], volume: 0.6 });
        b.vx = b.vy = b.vz = 0;
        return;
      }
      b.x = nx; b.y = ny; b.z = nz;
      // entity hits
      if (this.fromPlayer) {
        for (const m of mobsNear) {
          if (m.dead) continue;
          if (Math.abs(m.x - b.x) < m.body.w + 0.2 && Math.abs(m.z - b.z) < m.body.w + 0.2 && b.y > m.y - 0.2 && b.y < m.y + m.body.h + 0.2) {
            m.damage(this.damage, b.x - b.vx, b.z - b.vz, true, ctx, 0.6);
            audio.play('arrowhit', { pos: [b.x, b.y, b.z] });
            this.removed = true; return;
          }
        }
      } else {
        const p = ctx.player;
        if (Math.abs(p.body.x - b.x) < 0.45 && Math.abs(p.body.z - b.z) < 0.45 && b.y > p.body.y - 0.1 && b.y < p.body.y + p.body.h + 0.1) {
          if (this.kind === 'fireball') ctx.explode(b.x, b.y, b.z, 2, false);
          else ctx.damagePlayer(this.damage, 'arrow', b.x - b.vx, b.z - b.vz);
          this.removed = true; return;
        }
      }
    }
    if (b.y < 0 || b.y > 128) { this.removed = true; return; }
    this.obj.position.set(b.x, b.y, b.z);
    const h = Math.hypot(b.vx, b.vz);
    this.obj.rotation.set(Math.atan2(b.vy, h), Math.atan2(-b.vx, -b.vz), 0, 'YXZ');
  }
}

// ------------------------------------------------------------ manager
// ------------------------------------------------------------ stuck blade
/**
 * The Ancient Blade, driven into the top of a block.
 *
 * A world object rather than a block: it is far taller than one voxel, it leans on two axes, and
 * it animates on placement — none of which the chunk mesher's box shapes can express. Being an
 * entity means it gets the existing per-entity light sampling, the existing distance culling, and
 * the existing save/load path for free.
 *
 * It is inert: no physics tick, no gravity, no AI. The body exists purely so the player cannot walk
 * through the blade and so the interaction raycast has something to hit.
 */
export class StuckBlade extends Entity {
  /** the block this blade is driven into */
  readonly bx: number; readonly by: number; readonly bz: number;
  /** lean, in radians, away from vertical — matches the diagonal of the reference */
  readonly tilt: number;
  /** which compass direction it leans toward */
  readonly lean: number;
  /** 0..1 insertion animation; 1 = fully seated */
  private seat = 1;
  private mesh: THREE.Mesh;
  private mat: THREE.MeshLambertMaterial;
  private lightTimer = 0;
  private glow = 0;
  /** set while the player is close enough to read the prompt */
  nearPlayer = false;
  /** y of the model during the insertion animation */
  private animY = 0;

  constructor(bx: number, by: number, bz: number, tilt = 0.28, lean = Math.PI * 0.25, animate = false) {
    // centre of the block's top face
    super(bx + 0.5, by + 1, bz + 0.5, 0.5, 1.6);
    this.bx = bx; this.by = by; this.bz = bz;
    this.tilt = tilt; this.lean = lean;
    this.mesh = bladeMesh(true);
    this.mat = this.mesh.material as THREE.MeshLambertMaterial;
    // Seat the grip INTO the block. The model's own origin is the base of the pommel, so shifting
    // it down by most of the grip height buries the handle without swallowing the crossguard.
    //
    // Crucially the mesh is offset INSIDE the rotated group rather than the group being moved:
    // that puts the pivot at the block's top surface, where the blade actually enters the stone.
    // Rotating about the pommel tip instead would swing the whole handle out past the block's
    // edge and leave it hanging in mid-air beside the block.
    this.mesh.position.y = -BLADE_SINK;
    // lean: rotate around Y to pick a direction, then tip over on X
    this.obj.rotation.order = 'YXZ';
    this.obj.rotation.y = lean;
    this.obj.rotation.x = tilt;
    this.obj.add(this.mesh);
    // Start the animation high above the block. `add()` calls syncObj() immediately, and syncObj
    // deliberately leaves y alone while seating, so this initial offset survives to the first frame.
    if (animate) { this.seat = 0; this.animY = by + 1 + 1.4; }
  }

  /** True once the insertion animation has finished. */
  get seated(): boolean { return this.seat >= 1; }

  update(dt: number, ctx: EntityContext, near: boolean): void {
    this.age += dt;
    // ---- insertion animation: drop in fast, overshoot slightly, settle. Deliberately snappy and
    // non-physical — three keyframes, not a simulation.
    if (this.seat < 1) {
      const before = this.seat;
      this.seat = Math.min(1, this.seat + dt * 3.5);
      const e = this.seat;
      // ease-out with a small bounce at the end
      const drop = e < 0.8 ? 1 - Math.pow(e / 0.8, 2) : -0.06 * Math.sin((e - 0.8) / 0.2 * Math.PI);
      this.animY = this.body.y + drop * 1.4;
      this.obj.position.y = this.animY;
      // impact moment: the frame the blade first reaches the block
      if (before < 0.8 && this.seat >= 0.8) {
        audio.play('bladeimpact', { pos: [this.body.x, this.body.y, this.body.z], volume: 0.9 });
        for (let i = 0; i < 14; i++) {
          ctx.particles.hit(
            this.body.x + (Math.random() - 0.5) * 0.7,
            this.body.y + Math.random() * 0.25,
            this.body.z + (Math.random() - 0.5) * 0.7,
          );
        }
        ctx.particles.smoke(this.body.x, this.body.y + 0.1, this.body.z, 5, true);
      }
    } else if (this.obj.position.y !== this.body.y) {
      this.animY = this.body.y;
      this.obj.position.y = this.body.y;
    }
    if (!near) { this.nearPlayer = false; return; }

    // ---- scene light, sampled on the same cadence mobs use so the blade sits in the same
    // lighting family as every other object rather than glowing flat.
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.25;
      const [sky, blk] = ctx.world.getLight(this.bx, this.by + 1, this.bz);
      const lum = 0.15 + 0.85 * Math.max(Math.pow(sky / 15, 1.4) * ctx.daylight, Math.pow(blk / 15, 1.2));
      const g = 1 + this.glow * 0.9;
      this.mat.color.setRGB(Math.min(1, lum * g), Math.min(1, lum * g), Math.min(1, lum * g * 1.04));
    }
    if (this.glow > 0) { this.glow = Math.max(0, this.glow - dt * 1.6); this.lightTimer = 0; }

    // ---- proximity: the prompt shows inside 3 blocks
    const p = ctx.player;
    this.nearPlayer = this.distTo(p.body.x, p.body.y, p.body.z) < 3;

    // a slow, very faint drift of motes so it reads as a landmark, not scenery
    if (Math.random() < dt * 1.2) {
      ctx.particles.magic(
        this.body.x + (Math.random() - 0.5) * 0.5,
        this.body.y + 0.6 + Math.random() * 1.4,
        this.body.z + (Math.random() - 0.5) * 0.5,
        1, [0.55, 0.62, 0.78],
      );
    }
  }

  /** Player pulled the blade free: a restrained flash of motes and a ring. */
  onPull(ctx: EntityContext): void {
    this.glow = 1;
    audio.play('bladepull', { pos: [this.body.x, this.body.y, this.body.z], volume: 0.85 });
    ctx.particles.magic(this.body.x, this.body.y + 0.9, this.body.z, 16, [0.7, 0.78, 0.95]);
    this.removed = true;
  }

  syncObj(): void {
    this.obj.position.set(this.body.x, this.seat >= 1 ? this.body.y : this.animY, this.body.z);
  }

  serialize(): EntitySave {
    return {
      type: 'stuck_blade', pos: [this.x, this.y, this.z], yaw: this.lean, health: 1,
      data: { bx: this.bx, by: this.by, bz: this.bz, tilt: this.tilt, lean: this.lean },
    };
  }
}

// ------------------------------------------------------------ rideable vehicles
/**
 * Shared base for things the player sits in.
 *
 * FABLE had no mount system before this, so the contract is kept deliberately small: a vehicle
 * owns its own body, and while `rider` is set the player's position is slaved to the vehicle each
 * tick and the player's own movement code is skipped. Dismounting hands control straight back.
 * Both the Ore Cart and the Skiff build on this rather than each inventing their own.
 */
export abstract class Vehicle extends Entity {
  /** the player riding, or null */
  rider: Player | null = null;
  /** how high above the vehicle origin the rider sits */
  protected seatY = 0.35;

  /** Seat a player. */
  mount(p: Player): void {
    this.rider = p;
    p.body.vx = 0; p.body.vy = 0; p.body.vz = 0;
  }

  /** Turn the player loose beside the vehicle. */
  dismount(): void {
    const p = this.rider;
    this.rider = null;
    if (!p) return;
    // step out to the side so the player does not immediately re-enter
    p.body.x = this.body.x + 0.8;
    p.body.y = this.body.y + 0.6;
    p.body.z = this.body.z;
    p.body.vx = 0; p.body.vy = 0; p.body.vz = 0;
  }

  /** Keep the rider glued to the seat. Call at the end of update(). */
  protected carryRider(): void {
    const p = this.rider;
    if (!p) return;
    p.body.x = this.body.x;
    p.body.y = this.body.y + this.seatY;
    p.body.z = this.body.z;
    p.body.vx = 0; p.body.vy = 0; p.body.vz = 0;
    p.body.onGround = true;    // riding is not falling: no fall damage on landing
  }
}

/**
 * The Ore Cart: runs along Trackway, following the shape rules in world/Rails.ts.
 *
 * The cart is snapped to the centre line of whatever track tile it is over and moves along the
 * track graph rather than through open space, which is what keeps it on the rails through curves
 * and up slopes without a physics solver. Off the rails it simply stops.
 */
export class OreCart extends Vehicle {
  speed = 0;
  dir: Dir = 'e';
  private mesh: THREE.Group;
  private mat: THREE.MeshLambertMaterial;
  private lightTimer = 0;
  private derailed = false;

  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0.45, 0.55);
    this.seatY = 0.3;
    this.mesh = new THREE.Group();
    this.mat = new THREE.MeshLambertMaterial({ color: 0x8a8a94 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x3a3a42 });
    // an open tub: floor plus four walls, so it reads as a cart and not a crate
    const floor = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.7), this.mat);
    floor.position.y = 0.18;
    this.mesh.add(floor);
    for (const [dx, dz, w, d] of [[0.38, 0, 0.06, 0.7], [-0.38, 0, 0.06, 0.7], [0, 0.33, 0.8, 0.06], [0, -0.33, 0.8, 0.06]] as const) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 0.34, d), this.mat);
      wall.position.set(dx, 0.37, dz);
      this.mesh.add(wall);
    }
    for (const dx of [-0.26, 0.26]) {
      const wheel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.2), dark);
      wheel.position.set(dx, 0.1, 0);
      this.mesh.add(wheel);
    }
    this.obj.add(this.mesh);
  }

  update(dt: number, ctx: EntityContext, near: boolean): void {
    this.age += dt;
    if (!near) return;
    const b = this.body;
    const bx = Math.floor(b.x), by = Math.floor(b.y), bz = Math.floor(b.z);

    // which track am I on? check this level then one below (coming off a ramp)
    let ty = by;
    let shape = trackShapeAt(ctx.world, bx, by, bz);
    if (shape === null) { shape = trackShapeAt(ctx.world, bx, by - 1, bz); if (shape !== null) ty = by - 1; }

    if (shape === null) {
      // off the rails: fall and slow to a stop
      this.derailed = true;
      this.speed *= Math.max(0, 1 - dt * 4);
      b.vy -= 22 * dt;
      b.vx = 0; b.vz = 0;
      moveBody(ctx.world, b, dt);
      this.syncObj();
      this.carryRider();
      return;
    }
    this.derailed = false;

    // rider input: forward/back along the direction of travel
    let push = 0;
    const p = this.rider;
    if (p) {
      const inp = p.input;
      const fwd = (inp.forward ? 1 : 0) - (inp.back ? 1 : 0) + (inp.moveZ ? -inp.moveZ : 0);
      // push along whichever way the cart already faces, relative to where the player looks
      const [dx, dz] = DIRS[this.dir];
      const look = Math.cos(p.yaw) * -dz + Math.sin(p.yaw) * -dx;
      push = Math.max(-1, Math.min(1, fwd * (look >= 0 ? 1 : -1)));
    }

    const asc = ascendDir(shape);
    const slope = asc === null ? 0 : (asc === this.dir ? 1 : -1);
    this.speed = stepCartSpeed(this.speed, slope, push, dt);

    // reversing: flip the travel direction rather than carrying a negative speed around
    if (this.speed < 0) { this.dir = opposite(this.dir); this.speed = -this.speed; }

    // advance along the track graph
    let remaining = this.speed * dt;
    const [cx, cz] = trackCentre(shape);
    let px = bx + cx, pz = bz + cz;
    let guard = 0;
    while (remaining > 0 && guard++ < 8) {
      const [dx, dz] = DIRS[this.dir];
      const nx = bx + dx, nz = bz + dz;
      const nAsc = ascendDir(shape);
      const ny = nAsc === this.dir ? ty + 1 : ty;
      const nextShape = trackShapeAt(ctx.world, nx, ny, nz) ?? trackShapeAt(ctx.world, nx, ny - 1, nz);
      if (nextShape === null) { this.speed = 0; break; }
      const step = Math.min(remaining, 1);
      px += dx * step; pz += dz * step;
      remaining -= step;
      // crossed into the next tile: re-resolve the shape and pick the new heading
      if (Math.floor(px) !== bx || Math.floor(pz) !== bz) {
        const fx = Math.floor(px), fz = Math.floor(pz);
        const sh = trackShapeAt(ctx.world, fx, ny, fz) ?? trackShapeAt(ctx.world, fx, ny - 1, fz);
        if (sh === null) { this.speed = 0; break; }
        const out = exitDir(sh, opposite(this.dir));
        if (out === null) { this.speed = 0; break; }
        this.dir = out;
        break;   // one tile per tick keeps the path readable and the maths stable
      }
    }

    b.x = px; b.z = pz;
    b.y = ty + (ascendDir(shape) ? 0.5 : 0.06);
    b.vx = 0; b.vy = 0; b.vz = 0;

    // face the way it is going
    this.yaw = this.dir === 'n' ? Math.PI : this.dir === 's' ? 0 : this.dir === 'e' ? -Math.PI / 2 : Math.PI / 2;

    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.25;
      const [sky, blk] = ctx.world.getLight(bx, ty + 1, bz);
      const lum = 0.15 + 0.85 * Math.max(Math.pow(sky / 15, 1.4) * ctx.daylight, Math.pow(blk / 15, 1.2));
      this.mat.color.setRGB(lum, lum, lum * 1.02);
    }
    if (Math.abs(this.speed) > 0.5 && Math.random() < dt * 3) {
      audio.play('step.metal', { pos: [b.x, b.y, b.z], volume: 0.12 });
    }
    this.syncObj();
    this.carryRider();
  }

  serialize(): EntitySave {
    return { type: 'ore_cart', pos: [this.x, this.y, this.z], yaw: this.yaw, health: 1, data: { dir: this.dir } };
  }
}

/** Resolve the Trackway shape at a position, or null when there is no track there. */
function trackShapeAt(world: World, x: number, y: number, z: number): TrackShape | null {
  const id = world.getBlock(x, y, z);
  if (id < B.TRACK_NS || id > B.TRACK_ASC_W) return null;
  // the stored id already encodes the solved shape
  const SHAPES: TrackShape[] = ['ns', 'ew', 'ne', 'nw', 'se', 'sw', 'asc_n', 'asc_s', 'asc_e', 'asc_w'];
  return SHAPES[id - B.TRACK_NS] ?? null;
}

/**
 * The Skiff: a small boat that floats and is paddled.
 *
 * Buoyancy and paddling come from world/Boating.ts, which is pure and unit-tested; this class
 * samples the water around the hull and feeds it those numbers.
 */
export class Skiff extends Vehicle {
  private mesh: THREE.Group;
  private mat: THREE.MeshLambertMaterial;
  private lightTimer = 0;

  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0.6, 0.5);
    this.seatY = 0.32;
    this.mesh = new THREE.Group();
    this.mat = new THREE.MeshLambertMaterial({ color: 0xa8763f });
    const dark = new THREE.MeshLambertMaterial({ color: 0x7a5228 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.16, 0.9), this.mat);
    hull.position.y = 0.12;
    this.mesh.add(hull);
    // gunwales fore/aft and port/starboard, so it reads as an open boat
    for (const [dx, dz, w, d] of [[0, 0.42, 1.25, 0.08], [0, -0.42, 1.25, 0.08], [0.6, 0, 0.08, 0.9], [-0.6, 0, 0.08, 0.9]] as const) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), dark);
      rail.position.set(dx, 0.28, dz);
      this.mesh.add(rail);
    }
    const bench = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.7), dark);
    bench.position.y = 0.26;
    this.mesh.add(bench);
    this.obj.add(this.mesh);
  }

  update(dt: number, ctx: EntityContext, near: boolean): void {
    this.age += dt;
    if (!near) return;
    const b = this.body;

    // how deep is the hull? sample the column the boat sits in
    const bx = Math.floor(b.x), bz = Math.floor(b.z);
    let waterTop = -Infinity;
    for (let dy = 1; dy >= -2; dy--) {
      const y = Math.floor(b.y) + dy;
      if (ctx.world.getBlock(bx, y, bz) === B.WATER) { waterTop = y + 1; break; }
    }
    const afloat = waterTop > -Infinity;
    const sub = afloat ? submersionAt(b.y, waterTop) : -1;

    b.vy = stepBuoyancy(b.vy, sub, dt);

    // paddling
    const p = this.rider;
    let forward = 0;
    if (p) {
      const inp = p.input;
      forward = (inp.forward ? 1 : 0) - (inp.back ? 1 : 0) + (inp.moveZ ? -inp.moveZ : 0);
      forward = Math.max(-1, Math.min(1, forward));
      const turn = (inp.right ? 1 : 0) - (inp.left ? 1 : 0) + (inp.moveX ?? 0);
      if (turn !== 0) this.yaw = stepHeading(this.yaw, turn, dt);
      else this.yaw = p.yaw;   // no explicit steer: follow where the rider looks
    }
    const dirX = -Math.sin(this.yaw), dirZ = -Math.cos(this.yaw);
    const pad = stepPaddle(b.vx, b.vz, dirX, dirZ, forward, afloat, dt);
    b.vx = pad.vx; b.vz = pad.vz;

    moveBody(ctx.world, b, dt);

    // a wake when moving on the surface
    if (afloat && Math.hypot(b.vx, b.vz) > 1.2 && Math.random() < dt * 8) {
      ctx.particles.splash(b.x + (Math.random() - 0.5) * 0.8, waterTop, b.z + (Math.random() - 0.5) * 0.8, 1);
    }

    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.25;
      const [sky, blk] = ctx.world.getLight(bx, Math.floor(b.y) + 1, bz);
      const lum = 0.15 + 0.85 * Math.max(Math.pow(sky / 15, 1.4) * ctx.daylight, Math.pow(blk / 15, 1.2));
      this.mat.color.setRGB(lum, lum * 0.95, lum * 0.85);
    }
    this.syncObj();
    this.carryRider();
  }

  serialize(): EntitySave {
    return { type: 'skiff', pos: [this.x, this.y, this.z], yaw: this.yaw, health: 1 };
  }
}

export class EntityManager {
  entities: Entity[] = [];
  group = new THREE.Group();
  spawnTimer = 0;
  /** wildlife restock timer (see naturalPassiveSpawn) */
  passiveTimer = 6;
  boss: Mob | null = null;
  /** Video setting: entities further than this (Chebyshev distance in blocks) are not drawn. */
  renderDistance = 64;
  private mobScratch: Mob[] = [];

  add(e: Entity): void {
    this.entities.push(e);
    this.group.add(e.obj);
    e.syncObj();
  }

  spawnMob(type: string, x: number, y: number, z: number): Mob | null {
    const def = MOBS[type];
    if (!def) return null;
    const m = new Mob(def, x, y, z);
    this.add(m);
    if (def.boss) this.boss = m;
    return m;
  }

  /** Live mobs (reuses one array; do not hold on to the result across frames). */
  mobs(): Mob[] {
    const out = this.mobScratch; out.length = 0;
    for (const e of this.entities) if (e instanceof Mob && !e.dead) out.push(e);
    return out;
  }

  update(dt: number, ctx: EntityContext): void {
    const p = ctx.player;
    mobsNear.length = 0;
    for (const e of this.entities) if (e instanceof Mob && !e.dead && Math.abs(e.x - p.body.x) < 48 && Math.abs(e.z - p.body.z) < 48) mobsNear.push(e);
    const rd = this.renderDistance;
    for (const e of this.entities) {
      const dx = Math.abs(e.x - p.body.x), dz = Math.abs(e.z - p.body.z);
      const d = dx + dz;
      const near = d < 64 && ctx.world.isLoaded(e.x, e.z);
      e.update(Math.min(dt, 0.05), ctx, near);
      e.obj.visible = dx < rd && dz < rd;
      if (e instanceof Mob && e.def.hostile && !e.persistent && d > 90) e.removed = true;
      if (e.y < -10) e.removed = true;
    }
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      if (e.removed) { this.group.remove(e.obj); this.entities.splice(i, 1); if (e === this.boss) { this.boss = null; ctx.onBossUpdate(null); } }
    }
    // natural spawning (hostiles any time it is dark enough; animals restock by day)
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.5;
      this.naturalSpawn(ctx);
    }
    this.passiveTimer -= dt;
    if (this.passiveTimer <= 0) {
      this.passiveTimer = 4;
      this.naturalPassiveSpawn(ctx);
    }
  }

  /**
   * Wildlife restock: killed animals never came back before, so the land around a base went
   * silent and food stopped being renewable. Now, while it is daytime in the overworld, small
   * groups of biome-appropriate animals trickle back in on lit grass far from the player —
   * same placement rules as the chunk-hint spawns (grass underfoot, sky above, no walls).
   */
  private naturalPassiveSpawn(ctx: EntityContext): void {
    if (ctx.dimension !== 'overworld' || ctx.difficulty === 'peaceful' || ctx.isNight || ctx.daylight < 0.6) return;
    if (ctx.player.mode === 'spectator') return;
    const passives = this.entities.filter((e) => e instanceof Mob && !e.dead && !e.def.hostile && !e.def.trader).length;
    if (passives >= 8) return;
    const p = ctx.player;
    for (let attempt = 0; attempt < 4; attempt++) {
      const ang = Math.random() * Math.PI * 2, r = 24 + Math.random() * 24;
      const x = Math.floor(p.body.x + Math.cos(ang) * r), z = Math.floor(p.body.z + Math.sin(ang) * r);
      if (!ctx.world.isLoaded(x, z)) continue;
      const top = ctx.world.surfaceY(x, z);
      const below = ctx.world.getBlock(x, top, z);
      if (below !== B.GRASS && below !== B.SNOW_GRASS) continue;
      if (ctx.world.getBlock(x, top + 1, z) !== B.AIR || ctx.world.getBlock(x, top + 2, z) !== B.AIR) continue;
      const [sky] = ctx.world.getLight(x, top + 1, z);
      if (sky < 9) continue;
      const biome = BIOMES[ctx.world.getBiome(x, z)];
      if (!biome || !biome.animals.length) continue;
      const type = biome.animals[Math.floor(Math.random() * biome.animals.length)];
      if (!MOBS[type] || MOBS[type].hostile) continue;
      const m = this.spawnMob(type, x + 0.5, top + 1, z + 0.5);
      if (m && Math.random() < 0.4) {
        // most spawns are a small group: one companion a couple of blocks away
        const ox = x + (Math.random() < 0.5 ? -2 : 2), oz = z + (Math.random() < 0.5 ? -2 : 2);
        if (ctx.world.isLoaded(ox, oz) && ctx.world.getBlock(ox, ctx.world.surfaceY(ox, oz), oz) === below) {
          this.spawnMob(type, ox + 0.5, ctx.world.surfaceY(ox, oz) + 1, oz + 0.5);
        }
      }
      break;
    }
  }

  private naturalSpawn(ctx: EntityContext): void {
    if (ctx.difficulty === 'peaceful' || ctx.player.mode === 'spectator') return;
    const p = ctx.player;
    const hostiles = this.entities.filter((e) => e instanceof Mob && e.def.hostile && !e.dead).length;
    // storms bring things out of the woodwork: a bolder cap and more surface packs
    const cap = ctx.dimension === 'void' ? 14 : ctx.weatherBad ? 22 : 18;
    if (hostiles >= cap) return;
    for (let attempt = 0; attempt < 6; attempt++) {
      const ang = Math.random() * Math.PI * 2, r = 22 + Math.random() * 26;
      const x = Math.floor(p.body.x + Math.cos(ang) * r), z = Math.floor(p.body.z + Math.sin(ang) * r);
      if (!ctx.world.isLoaded(x, z)) continue;
      const top = ctx.world.surfaceY(x, z);
      let y: number;
      let cave = false;
      if (Math.random() < (ctx.weatherBad ? 0.65 : 0.5) || ctx.dimension === 'void') {
        y = top + 1;
      } else {
        // cave: random y below surface with air and solid below
        y = 5 + Math.floor(Math.random() * Math.max(1, top - 8));
        let ok = false;
        for (let t = 0; t < 6; t++) {
          if (ctx.world.getBlock(x, y, z) === B.AIR && ctx.world.getBlock(x, y + 1, z) === B.AIR && BLOCKS[ctx.world.getBlock(x, y - 1, z)].solid) { ok = true; break; }
          y = 5 + Math.floor(Math.random() * Math.max(1, top - 8));
        }
        if (!ok) continue;
        cave = true;
      }
      if (ctx.world.getBlock(x, y, z) !== B.AIR || ctx.world.getBlock(x, y + 1, z) !== B.AIR) continue;
      const below = ctx.world.getBlock(x, y - 1, z);
      if (!BLOCKS[below].solid || below === B.LAVA) continue;
      const [sky, blk] = ctx.world.getLight(x, y, z);
      const light = Math.max((sky / 15) * ctx.daylight, blk / 15);
      if (ctx.dimension === 'overworld' && light > 0.32) continue;
      if (blk > 7) continue;
      let type: string;
      const rr = Math.random();
      if (ctx.dimension === 'void') type = rr < 0.45 ? 'shadow_flyer' : rr < 0.8 ? 'void_archer' : 'stone_guardian';
      else if (cave) type = rr < 0.5 ? 'cave_crawler' : rr < 0.8 ? 'night_stalker' : rr < 0.95 || y > 30 ? 'void_archer' : 'stone_guardian';
      else type = rr < 0.55 ? 'night_stalker' : rr < 0.75 ? 'void_archer' : rr < 0.9 ? 'cave_crawler' : 'shadow_flyer';
      const m = this.spawnMob(type, x + 0.5, y + (type === 'shadow_flyer' ? 6 : 0), z + 0.5);
      if (m && type === 'shadow_flyer') m.targetY = y + 8;
      break;
    }
  }

  serialize(): EntitySave[] {
    const mobs = this.entities.filter((e): e is Mob => e instanceof Mob && !e.dead && (!e.def.hostile || e.persistent || Math.random() < 0.5)).map((m) => m.serialize());
    // Planted Ancient Blades are landmarks: they always persist, never randomly despawn.
    const blades = this.entities.filter((e): e is StuckBlade => e instanceof StuckBlade && !e.removed).map((b) => b.serialize());
    // Vehicles are player-placed and persist like blades do.
    const carts = this.entities.filter((e): e is OreCart => e instanceof OreCart && !e.removed).map((c) => c.serialize());
    const skiffs = this.entities.filter((e): e is Skiff => e instanceof Skiff && !e.removed).map((k) => k.serialize());
    return [...mobs, ...blades, ...carts, ...skiffs];
  }

  load(saves: EntitySave[]): void {
    for (const s of saves) {
      if (s.type === 'ore_cart') {
        const c = new OreCart(s.pos[0], s.pos[1], s.pos[2]);
        if (s.data?.dir) c.dir = s.data.dir as Dir;
        this.add(c);
        continue;
      }
      if (s.type === 'skiff') {
        const k = new Skiff(s.pos[0], s.pos[1], s.pos[2]);
        k.yaw = s.yaw;
        this.add(k);
        continue;
      }
      if (s.type === 'stuck_blade') {
        const d = s.data ?? {};
        this.add(new StuckBlade(
          Number(d.bx), Number(d.by), Number(d.bz),
          Number(d.tilt ?? 0.28), Number(d.lean ?? 0), false,
        ));
        continue;
      }
      const m = this.spawnMob(s.type, s.pos[0], s.pos[1], s.pos[2]);
      if (m) {
        m.health = s.health; m.yaw = s.yaw;
        if (s.data?.baby) m.setBaby(true);
        if (s.data?.persistent) m.persistent = true;
      }
    }
  }

  clear(): void {
    for (const e of this.entities) this.group.remove(e.obj);
    this.entities = [];
    this.boss = null;
  }
}
