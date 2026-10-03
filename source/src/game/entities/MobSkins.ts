/**
 * Mob face art for FABLE's creatures (see MobArt.ts for the format).
 *
 * Each sheet is one character per pixel, rows top to bottom. Characters:
 *   .  base colour        1 darkest   2 dark   3 light   4 lightest
 *   k  ink (outlines, pupils, unibrow)    n  near-black   w  eye white
 *   e  accent colour (the skin's `accent`)  t  tan/skin  l  leather  m  metal
 *   y gold  h hay  o orange  r red  g green  b blue  p purple  c cyan  s stone
 */
import { art, type BoxSkin, type FaceArt } from './MobArt';

// ------------------------------------------------------------ shared sheets
/** A stitched cloth panel: two seams, a hem and a few lighter folds. */
export const CLOTH: FaceArt = art(`
  ................
  ................
  ..1........1....
  ..1........1....
  ................
  ...1.........1..
  ................
  ................
`);

// ------------------------------------------------------------ keeper (villager)
/**
 * The Keeper's face: a heavy unibrow with drooping outer tips, deep-set eyes and a mouth line,
 * with the columns beside the nose shaded so the (separately modelled) nose reads as protruding.
 * Rows 4-7 sit behind the nose box; the shading there is its shadow.
 */
export const KEEPER_FACE: FaceArt = art(`
  11111111
  .kkkkkk.
  1wk..kw1
  .2....2.
  .2....2.
  .2....2.
  ..kkkk..
  1......1
`);

/** Same face, weathered: a scar over one brow and a lighter chin. */
export const KEEPER_FACE_SPARE: FaceArt = KEEPER_FACE;

/** Back and top of the head: a close crop of hair. */
export const KEEPER_HAIR_BACK: FaceArt = art(`
  11111111
  22222222
  2.2.2.22
  22222222
  22.2.2.2
  22222222
  22222222
  11111111
`);
export const KEEPER_HAIR_TOP: FaceArt = art(`
  11111111
  2.2.22.2
  22222222
  22.2.2.2
  2.2.2.22
  22222222
  22.2.2.2
  11111111
`);
/** Side of the head: hair at the back edge, an ear, clean skin at the front. */
export const KEEPER_HAIR_SIDE: FaceArt = art(`
  11111111
  22......
  22......
  22..22..
  22......
  22......
  22......
  11111111
`);

/** The nose (a 2 wide x 4 tall x 2 deep box): flat skin with a dark underside. */
export const KEEPER_NOSE: FaceArt = art(`
  ..
  ..
  11
`);
const KEEPER_NOSE_SIDE: FaceArt = art(`
  .
  .
  1
`);

/** Robe front: collar bands, a centre seam, a belt and a hem, with a plain apron to be over-painted. */
const robeFront = (belt: string): FaceArt => art(`
  11111111
  22222222
  3......3
  3......3
  3..11..3
  3..11..3
  3..11..3
  3..11..3
  3..11..3
  3......3
  ${belt.repeat(8)}
  ${belt}${belt}11${belt}${belt}11${belt}${belt}
  ${belt}11${belt}${belt}${belt}${belt}11${belt}
  33333333
  11111111
`);

/** Robe back: shoulder yoke, centre seam, and a hem shadow. */
export const KEEPER_ROBE_BACK: FaceArt = art(`
  11111111
  22222222
  3......3
  3..11..3
  3..11..3
  3..11..3
  3..11..3
  3..11..3
  3..11..3
  3..11..3
  3..11..3
  3..11..3
  3......3
  33333333
  11111111
`);

/** Robe side: a sleeve seam and a pocket. */
export const KEEPER_ROBE_SIDE: FaceArt = art(`
  11111111
  22222222
  3......3
  3......3
  3......3
  3..11..3
  3..11..3
  3..11..3
  3......3
  3......3
  3......3
  3......3
  3......3
  33333333
  11111111
`);

/** Folded arms: two sleeves crossed in front of the chest with a hand at each end. */
export const KEEPER_ARMS: FaceArt = art(`
  ..3333..
  .333333.
  tt2222tt
  ..1111..
`);

/** A sleeve hanging at the side: a padded shoulder cap, an outer seam and a cuff. */
export const KEEPER_SLEEVE: FaceArt = art(`
  33333333
  22222222
  2......2
  2......2
  2......2
  2......2
  2......2
  2......2
  2......2
  22222222
  33333333
  11111111
`);

/** Trouser leg with a boot at the bottom. */
export const KEEPER_LEG: FaceArt = art(`
  11111111
  ........
  ........
  ........
  ........
  ........
  ........
  ........
  ........
  ..1111..
  .111111.
  .111111.
`);

/** A wide-brimmed straw hat (farmer): a thin flat brim under a taller woven crown. */
const STRAW_BRIM_TOP: FaceArt = art(`
  22222222
  23333332
  23444432
  23444432
  23444432
  23444432
  23333332
  22222222
`);
const STRAW_BRIM_SIDE: FaceArt = art(`
  ........
  ..3333..
`);
const STRAW_CROWN_TOP: FaceArt = art(`
  ..4444..
  .444444.
  44444444
  44333344
  44333344
  44444444
  .444444.
  ..4444..
`);
const STRAW_CROWN_SIDE: FaceArt = art(`
  ..3333..
  .333333.
  33333333
  22222222
`);

/** A smith's leather cap with a metal band. */
const CAP_TOP: FaceArt = art(`
  ..3333..
  .333333.
  33333333
  33333333
  33333333
  33333333
  .333333.
  ..3333..
`);
const CAP_SIDE: FaceArt = art(`
  ..3333..
  .333333.
  22222222
  11111111
`);
const CAP_BRIM_TOP: FaceArt = art(`
  11111111
  1mmmmmm1
  1m3333m1
  1m3333m1
  1m3333m1
  1m3333m1
  1mmmmmm1
  11111111
`);
const CAP_BRIM_SIDE: FaceArt = art(`
  ........
  .mmmmmm.
`);

/** A mystic's cowl: it sits a pixel behind the face, so the head shows through the opening. */
const HOOD_TOP: FaceArt = art(`
  22222222
  2.2..2.2
  22222222
  22.22.22
  22222222
  2.2..2.2
  22222222
  11111111
`);
const HOOD_SIDE: FaceArt = art(`
  ..2222..
  .222222.
  22222222
  222..c..
  222..c..
  22222222
  22222222
  11111111
`);
const HOOD_BACK: FaceArt = art(`
  ..2222..
  .222222.
  22222222
  22222222
  22ccc222
  22222222
  22222222
  11111111
`);
const HOOD_PEAK: FaceArt = art(`
  ..22..
  .2222.
  222222
  111111
`);

export interface KeeperProfession {
  id: string;
  /** robe, trim/collar, trousers */
  robe: number; trim: number; pants: number;
  /** one character used for the tool belt across the robe front */
  apron: string;
  hat: 'straw' | 'cap' | 'hood';
  hatColor: number;
}

export const KEEPER_PROFESSIONS: KeeperProfession[] = [
  {
    id: 'farmer',
    robe: 0x7a6a44, trim: 0x8f7d50, pants: 0x4a4030,
    apron: 'l',
    hat: 'straw', hatColor: 0xcdae54,
  },
  {
    id: 'smith',
    robe: 0x46485a, trim: 0x5a5d72, pants: 0x2e3040,
    apron: 'm',
    hat: 'cap', hatColor: 0x6b4a2c,
  },
  {
    id: 'mystic',
    robe: 0x4a3a70, trim: 0x6a5aa0, pants: 0x33284e,
    apron: 'c',
    hat: 'hood', hatColor: 0x3a2c5c,
  },
];

/** One skin set per profession, so the Keeper that trades with you looks like its trade. */
export function keeperSkins(p: KeeperProfession): { robe: BoxSkin; hat: BoxSkin; brim: FaceArt; hatTop: FaceArt } {
  const robe: BoxSkin = {
    res: [8, 15],
    front: robeFront(p.apron), back: KEEPER_ROBE_BACK,
    left: KEEPER_ROBE_SIDE, right: KEEPER_ROBE_SIDE,
  };
  if (p.hat === 'straw') {
    return {
      robe,
      hat: { res: [8, 4], all: STRAW_CROWN_SIDE, top: STRAW_CROWN_TOP, bottom: STRAW_CROWN_TOP },
      brim: STRAW_BRIM_SIDE,
      hatTop: STRAW_BRIM_TOP,
    };
  }
  if (p.hat === 'cap') {
    return {
      robe,
      hat: { res: [8, 4], all: CAP_SIDE, top: CAP_TOP, bottom: CAP_TOP },
      brim: CAP_BRIM_SIDE,
      hatTop: CAP_BRIM_TOP,
    };
  }
  return {
    robe,
    hat: { res: [8, 8], all: HOOD_SIDE, back: HOOD_BACK, top: HOOD_TOP, bottom: HOOD_TOP },
    brim: HOOD_PEAK,
    hatTop: HOOD_PEAK,
  };
}

/** The Keeper's head, nose and folded arms (profession independent). */
export const KEEPER_HEAD_SKIN: BoxSkin = {
  res: [8, 8],
  front: KEEPER_FACE, back: KEEPER_HAIR_BACK, top: KEEPER_HAIR_TOP,
  left: KEEPER_HAIR_SIDE, right: KEEPER_HAIR_SIDE,
};
export const KEEPER_NOSE_SKIN: BoxSkin = {
  res: [2, 3],
  front: KEEPER_NOSE, back: KEEPER_NOSE_SIDE, left: KEEPER_NOSE_SIDE, right: KEEPER_NOSE_SIDE,
  top: KEEPER_NOSE_SIDE, bottom: KEEPER_NOSE_SIDE,
};
export const KEEPER_ARMS_SKIN: BoxSkin = { res: [8, 4], all: KEEPER_ARMS };
export const KEEPER_SLEEVE_SKIN: BoxSkin = { res: [8, 12], all: KEEPER_SLEEVE };
export const KEEPER_LEG_SKIN: BoxSkin = { res: [8, 12], all: KEEPER_LEG };

/** The collar band shared by every profession. */
export const KEEPER_COLLAR: FaceArt = art(`
  ........
  ........
  44444444
  11111111
`);

// ------------------------------------------------------------ livestock
/**
 * A cow face: pale muzzle with two nostrils, wide-set eyes, and a light blaze down the forehead.
 * Drawn on the head's front face; the muzzle box is a separate, lighter piece.
 */
export const BOVIN_FACE: FaceArt = art(`
  .333333.
  3......3
  3.k..k.3
  3......3
  3.w..w.3
  .333333.
  .n....n.
  .333333.
`);
/** Cow hide: dark patches over the plain base tone, so the body is not flat. */
export const BOVIN_HIDE: FaceArt = art(`
  ................
  ...1111111......
  ..111111111.....
  ..11111111......
  ...111111...111.
  .......1...1111.
  ...........1111.
  ................
`);
/** A cow's nose: two nostrils on a pale muzzle. */
export const BOVIN_MUZZLE: FaceArt = art(`
  ......
  .n..n.
  ......
`);

/** Pig face: a snout with two nostrils, small eyes and floppy ears drawn as the top row. */
export const SNOUTER_FACE: FaceArt = art(`
  .333333.
  3......3
  3.k..k.3
  3......3
  3..33..3
  .3.3.3..
  3......3
  33333333
`);
export const SNOUTER_SNOUT: FaceArt = art(`
  ....
  .n.n
  ....
  ....
`);
export const SNOUTER_HIDE: FaceArt = art(`
  ................
  ...11.....11....
  ..1111...1111...
  ...11.....11....
  ................
  .......11.......
  ......1111......
  .......11.......
`);

/** Sheep: a woolly crown with the face showing through, and a wool body of little curls. */
export const WOOLLY_FACE: FaceArt = art(`
  wwwwwwww
  wwwwwwww
  w.k..k.w
  ........
  ...nn...
  ...nn...
  ........
  ........
`);
export const WOOLLY_WOOL: FaceArt = art(`
  .3.33.3.
  3.3..3.3
  .3.33.3.
  3.3..3.3
  .3.33.3.
  3.3..3.3
  .3.33.3.
  3.3..3.3
`);

/** Chicken head: a small eye, an orange beak and a red wattle. */
export const CLUCKER_FACE: FaceArt = art(`
  ...333..
  ..33333.
  ..k.333.
  ..33333.
  .o33333.
  ..rr33..
  ...333..
  ...33...
`);
export const CLUCKER_WING: FaceArt = art(`
  ................
  ....3333........
  ...333333.......
  ..33333333......
  ..3333333.......
  ...33333........
  ....333.........
  ................
`);

// ------------------------------------------------------------ hostiles
/** Night Stalker: sunken eye sockets and a slack jaw. */
export const STALKER_FACE: FaceArt = art(`
  ........
  .111111.
  1k....k1
  1kk..kk1
  1......1
  1.kkkk.1
  1.1111.1
  1......1
`);
/** Void Archer: a bare skull — hollow sockets, a nasal gap, a teeth line. */
export const ARCHER_FACE: FaceArt = art(`
  ........
  .111111.
  1k....k1
  1kk..kk1
  1..nn..1
  1.kkkk.1
  1k1k1k1.1
  1kkkkkk1
`);
/** Stone Guardian: cracks running down a grim face, with the glow coming from the eye boxes. */
export const GUARDIAN_FACE: FaceArt = art(`
  11111111
  1.1....1
  1.1..1.1
  1..1.1.1
  1.1..1.1
  1.1....1
  1...11.1
  11111111
`);
export const GUARDIAN_HIDE: FaceArt = art(`
  ...1.....
  .1.1...1.
  1...1.1..
  .....1...
  ..1....1.
  .1.1..1..
  1....1...
  ..1.1...1
`);
/** Dragon head: heavy brow, narrow lit eye slots (the eye boxes glow beneath), a horned crest. */
export const WYRM_FACE: FaceArt = art(`
  11111111
  1......1
  1.k..k.1
  1......1
  1.1111.1
  1k1..1k1
  1.1111.1
  1......1
`);
export const WYRM_SCALES: FaceArt = art(`
  ..1..1..
  .2222222
  .2..2..2
  .2222222
  ..1..1..
  .2222222
  .2..2..2
  .2222222
`);
export const WYRM_BELLY: FaceArt = art(`
  33333333
  3.3..3.3
  33333333
  3.3..3.3
  33333333
  3.3..3.3
  33333333
  3.3..3.3
`);

/** Shared: four hooves / paws along the bottom edge of a leg. */
export const HOOF: FaceArt = art(`
  ........
  ........
  ........
  ........
  ........
  ........
  ....nn..
  ....nn..
`);
