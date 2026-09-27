import { BLOCKS } from '../blocks/Blocks';
import { getAtlas } from '../blocks/TextureAtlas';
import { ITEMS } from './Items';
import { BIOMES, leafTint } from '../world/Biomes';

/**
 * Item icons, 16x16 pixel art rendered at 2x. Every sprite is drawn from a palette-keyed bitmap:
 *   .  transparent
 *   o  outline (dark version of the sprite's main colour, or near-black for tools)
 *   M/m/L  tool head: main / dark / light          H/h  handle: main / dark
 *   A/B/C/D  the item's own colours (A main, B dark, C light, D accent)
 * After the bitmap is placed, `finish()` adds a 1px outline around the silhouette in the darkened
 * main colour and a light rim on the top-left edge, which is what gives the icons their "painted" look.
 */
const ART: Record<string, string[]> = {
  // ---- tools: head at the top right, handle running to the bottom left
  pickaxe: [
    '................',
    '.....MMMMMM.....',
    '...MGGGGMMMMM...',
    '..mmMMMMMMMmmm..',
    '..mm....mm..mm..',
    '..N.....Hh...N..',
    '.......Hh.......',
    '......Hh........',
    '.....Hh.........',
    '....Hh..........',
    '...Hh...........',
    '..Hh............',
    '.Hh.............',
    'Hh..............',
    '................',
    '................',
  ],
  axe: [
    '................',
    '..GMM...........',
    '..GMMMMM........',
    '..GmmMMMMM......',
    '..GmmmmmmmM.....',
    '..GmmmmNNNN.....',
    '..NNNNN...Hh....',
    '.........Hh.....',
    '........Hh......',
    '.......Hh.......',
    '......Hh........',
    '.....Hh.........',
    '....Hh..........',
    '...Hh...........',
    '..Hh............',
    '................',
  ],
  shovel: [
    '........MGMmmN..',
    '........MGMmmN..',
    '........MGMmmN..',
    '........MGMmmN..',
    '.........mmNN...',
    '..........NN....',
    '..........mm....',
    '..........Hh....',
    '.........Hh.....',
    '........Hh......',
    '.......Hh.......',
    '......Hh........',
    '.....Hh.........',
    '....Hh..........',
    '...Hh...........',
    '................',
  ],
  hoe: [
    '................',
    '....GMGGGGGMM...',
    '....MmmmmmmHh...',
    '....Mm....Hh....',
    '....Mm...Hh.....',
    '....NN..Hh......',
    '.......Hh.......',
    '......Hh........',
    '.....Hh.........',
    '....Hh..........',
    '...Hh...........',
    '..Hh............',
    '................',
    '................',
    '................',
    '................',
  ],
  sword: [
    '...............G',
    '.............MGM',
    '............MMN.',
    '...........MMN..',
    '..........MMN...',
    '.........MMN....',
    '........MMN.....',
    '.......MMN......',
    '..Nm..MmN.......',
    '...NmMmN........',
    '....Nm..........',
    '....Hhm.........',
    '...Hh.Nm........',
    '..Hh............',
    '.mN.............',
    '.N..............',
  ],
  bow: [
    '.......ooo......',
    '.....ooAAAo.....',
    '....oAAoooAo....',
    '...oAAo...oBo...',
    '...oAo.....Bo...',
    '..oAo......Bo...',
    '..oAo......Bo...',
    '..oAo......Bo...',
    '..oAo......Bo...',
    '..oAo......Bo...',
    '...oAo.....Bo...',
    '...oAAo...oBo...',
    '....oAAoooAo....',
    '.....ooAAAo.....',
    '.......ooo......',
    '................',
  ],
  // ---- armour
  helmet: [
    '................',
    '.....oooooo.....',
    '....oCCCCCCo....',
    '...oCCAAAAAAo...',
    '..oCAAAAAAAABo..',
    '..oAAAAAAAAABo..',
    '..oAAAAAAAAABo..',
    '..oAAAAAAAAABo..',
    '..oAAoooooooBo..',
    '..oAAo.....oBo..',
    '..oABo.....oBo..',
    '..oBBo.....oBo..',
    '...oo.......o...',
    '................',
    '................',
    '................',
  ],
  chestplate: [
    '................',
    '.ooooo....ooooo.',
    'oCCCCAo..oACCCBo',
    'oCAAAAAooAAAAABo',
    'oCAAAAAAAAAAAABo',
    'oAAAooAAAAooAABo',
    '.oo.oAAAAAABo.o.',
    '....oAAAAAABo...',
    '....oAAAAAABo...',
    '....oAAAAAABo...',
    '....oAAADAABo...',
    '....oAAAAAABo...',
    '....oBBBBBBBo...',
    '.....oooooooo...',
    '................',
    '................',
  ],
  leggings: [
    '................',
    '..oooooooooooo..',
    '.oCCCCCCCCCCCBo.',
    '.oCAAAAAAAAAABo.',
    '.oAAAAAAAAAAABo.',
    '.oAAAAAooAAAABo.',
    '.oAAAAo..oAAABo.',
    '.oAAAAo..oAAABo.',
    '.oAAAAo..oAAABo.',
    '.oAAAAo..oAAABo.',
    '.oAAABo..oAAABo.',
    '.oBBBBo..oBBBBo.',
    '..oooo....oooo..',
    '................',
    '................',
    '................',
  ],
  boots: [
    '................',
    '................',
    '................',
    '................',
    '..oooo....oooo..',
    '.oCCCAo..oCCCAo.',
    '.oAAAAo..oAAAAo.',
    '.oAAAAo..oAAAAo.',
    '.oAAAABo.oAAAABo',
    'oCAAAAABoAAAAAAB',
    'oAAAAAABoAAAAAAB',
    'oBBBBBBBoBBBBBBB',
    '.ooooooo.ooooooo',
    '................',
    '................',
    '................',
  ],
  // ---- materials
  stick: [
    '.............oo.',
    '............oAo.',
    '...........oABo.',
    '..........oABo..',
    '.........oABo...',
    '........oABo....',
    '.......oABo.....',
    '......oABo......',
    '.....oABo.......',
    '....oABo........',
    '...oABo.........',
    '..oABo..........',
    '.oABo...........',
    '.oBo............',
    '.oo.............',
    '................',
  ],
  arrow: [
    '.............ooo',
    '............oCCo',
    '...........oBCo.',
    '..........oBBo..',
    '.........oBoo...',
    '........oAo.....',
    '.......oAo......',
    '......oAo.......',
    '.....oAo........',
    '....oAo.........',
    '.oooAo..........',
    'oBBBo...........',
    'oBBoo...........',
    'oBoBo...........',
    'oooo............',
    '................',
  ],
  feather: [
    '.............oo.',
    '............oCCo',
    '...........oCACo',
    '..........oCAABo',
    '.........oCAABo.',
    '........oCAABo..',
    '.......oCAABo...',
    '......oCAABo....',
    '.....oCAABo.....',
    '....oCABBo......',
    '...oABBo........',
    '..oBBo..........',
    '.oBo............',
    'oBo.............',
    'oo..............',
    '................',
  ],
  string: [
    '....oooo........',
    '...oCAABo.......',
    '...oAoooo.......',
    '...oAo..........',
    '....oAo.........',
    '....oAo.........',
    '.....oAo........',
    '.....oAAo.......',
    '......oAAo......',
    '.......oAAo.....',
    '........oAAo....',
    '.........oABo...',
    '.........oABo...',
    '..........oBo...',
    '...........o....',
    '................',
  ],
  leather: [
    '................',
    '....oooooo......',
    '...oCCCCCCoo....',
    '..oCAAAAAAAAo...',
    '..oAAAoAAAAAAo..',
    '.oAAAAAAAAAAAAo.',
    '.oAAAAAAAAoAABo.',
    '.oAAAAAAAAAAABo.',
    '..oAAAAAAAAABo..',
    '..oAAAAAAAABBo..',
    '...oBBBBBBBBo...',
    '....oooooooo....',
    '................',
    '................',
    '................',
    '................',
  ],
  bone: [
    '............ooo.',
    '...........oCCAo',
    '..........oCAAAo',
    '..........oAAAo.',
    '.........oAAoo..',
    '........oAAo....',
    '.......oAAo.....',
    '......oAAo......',
    '.....oAAo.......',
    '..ooAAAo........',
    '.oCAAAo.........',
    'oCAAAo..........',
    'oAAAo...........',
    '.ooo............',
    '................',
    '................',
  ],
  wheat: [
    '.......o.o......',
    '......oCoCo.....',
    '.....oCAoAo.....',
    '......oCoAoo....',
    '.....oCAoCAo....',
    '......oAoAo.....',
    '.....oCAoCo.....',
    '......oAoAo.....',
    '.......oBo......',
    '.......oBo......',
    '......oABo......',
    '.......oBo......',
    '.......oBo......',
    '......oABo......',
    '.......oo.......',
    '................',
  ],
  seeds: [
    '................',
    '................',
    '....o...........',
    '...oCo....o.....',
    '...oABo..oCo....',
    '....oo...oABo...',
    '..........oo....',
    '......o.........',
    '.....oCo........',
    '.....oABo...o...',
    '......oo...oCo..',
    '....o......oABo.',
    '...oCo......oo..',
    '...oABo.........',
    '....oo..........',
    '................',
  ],
  // ---- food
  // A tapered metal pail with a swing handle. A/B are the pail body (main/shadow), C the rim
  // highlight and D whatever it is carrying, so empty/water/lava share one silhouette.
  // A short run of trackway seen from the side: two rails on sleepers.
  track: [
    '................',
    '................',
    '................',
    '..A..........A..',
    '..A..........A..',
    '..ABBBBBBBBBBA..',
    '..A..........A..',
    '..A..........A..',
    '..ABBBBBBBBBBA..',
    '..A..........A..',
    '..A..........A..',
    '..ABBBBBBBBBBA..',
    '..A..........A..',
    '..A..........A..',
    '................',
    '................',
  ],
  // An ore cart seen from the side: an open iron tub on two wheels.
  cart: [
    '................',
    '................',
    '..o..........o..',
    '..oAo......oAo..',
    '..oAAooooooAAAo.',
    '..oAAAAAAAAAABo.',
    '..oAAAAAAAAAABo.',
    '..oAAAAAAAAAABo.',
    '..oABAAAAAAABBo.',
    '..oABBBBBBBBBBo.',
    '...oBBBBBBBBBo..',
    '...oooooooooo...',
    '...oCCo..oCCo...',
    '..oCDDCooCDDCo..',
    '..oCDDCooCDDCo..',
    '...oCCo..oCCo...',
  ],
  // A small skiff, prow to the right, with a visible gunwale and a bench.
  skiff: [
    '................',
    '................',
    '................',
    '................',
    '.oo..........oo.',
    'oAAoooooooooAAAo',
    'oAAAAAAAAAAAAAAo',
    'oABBBBBBBBBBBBAo',
    'oAB........BBBAo',
    'oAB.CCCC...BBAo.',
    'oABBBBBBBBBBAo..',
    '.oAAAAAAAAAAo...',
    '..oBBBBBBBBo....',
    '...oooooooo.....',
    '................',
    '................',
  ],
  pail: [
    '................',
    '...o........o...',
    '..oCo......oCo..',
    '..oCoooooooCo...',
    '..oCCCCCCCCCo...',
    '...ooooooooo....',
    '..oCCCCCCCCCo...',
    '..oADDDDDDDABo..',
    '..oADDDDDDDABo..',
    '..oADDDDDDDABo..',
    '...oADDDDDABo...',
    '...oADDDDDABo...',
    '....oAAAAABo....',
    '....oABBBBBo....',
    '.....oooooo.....',
    '................',
  ],
  // A round-bellied flask with a corked neck. A/B are the liquid inside (main/shadow), C is the
  // glass rim highlight and D the cork, so every draught can retint the same silhouette.
  flask: [
    '................',
    '......oDDo......',
    '......oDDo......',
    '......oCCo......',
    '......oCCo......',
    '.....oCAACo.....',
    '....oCAAAACo....',
    '...oCAAAAAABo...',
    '..oCAAAAAAAABo..',
    '..oAAAAAAAAABo..',
    '..oAAAAAAAAABo..',
    '..oAAAAAAAABBo..',
    '..oBAAAAAABBBo..',
    '...oBAAAABBBo...',
    '....oBBBBBBo....',
    '.....oooooo.....',
  ],
  apple: [
    '.......oo.......',
    '......oCo.......',
    '.....oCo........',
    '...oooAooo......',
    '..oADAAAAAo.....',
    '.oADAAAAAAAo....',
    '.oDAAAAAAAABo...',
    '.oAAAAAAAAABo...',
    '.oAAAAAAAAABo...',
    '.oAAAAAAAABBo...',
    '..oAAAAAABBo....',
    '..oAAAAABBo.....',
    '...oBBoBBo......',
    '....oo.oo.......',
    '................',
    '................',
  ],
  bread: [
    '................',
    '................',
    '.....oooooo.....',
    '...ooCCCCCCoo...',
    '..oCCAAAAAAACo..',
    '.oCAAoAAAoAAAAo.',
    '.oAAAAAAAAAAAAo.',
    '.oAAAAAoAAAAAAo.',
    '.oAABBBBBBBBABo.',
    '..oBBBBBBBBBBo..',
    '...ooBBBBBBoo...',
    '.....oooooo.....',
    '................',
    '................',
    '................',
    '................',
  ],
  carrot: [
    '...........oo...',
    '..........oCCo..',
    '.........oCCo...',
    '.........oCo....',
    '........oACoo...',
    '.......oCAAo....',
    '......oCABAo....',
    '.....oCAAAo.....',
    '....oCABAo......',
    '...oCAAAo.......',
    '..oCABAo........',
    '.oCAAAo.........',
    '.oABBo..........',
    '.oBoo...........',
    '.oo.............',
    '................',
  ],
  potato: [
    '................',
    '................',
    '.....ooooo......',
    '....oCCCCAo.....',
    '...oCAAAAAAo....',
    '..oCABAAAAAAo...',
    '..oAAAAAAABAo...',
    '..oAAAAAAAAAo...',
    '..oAAABAAAABo...',
    '...oAAAAAABBo...',
    '....oAAABBBo....',
    '.....oBBBBo.....',
    '......oooo......',
    '................',
    '................',
    '................',
  ],
  melon: [
    '..............o.',
    '............ooCo',
    '..........ooCCAo',
    '........ooCCAAAo',
    '......ooCCAAAAo.',
    '....ooCCAAAAAAo.',
    '..ooCCAAAAAAABo.',
    '.oCCAAAAAAAABBo.',
    '.oCAAAAAAAABBo..',
    '.oAAoAAAoAABBo..',
    '.oAAAAAAAABBo...',
    '.oABBBBBBBBo....',
    '.oBBBBBBBBo.....',
    '..oooooooo......',
    '................',
    '................',
  ],
  meat: [
    '................',
    '.....oooooo.....',
    '....oCCCCCAo....',
    '...oCAAAAAAAo...',
    '..oCAACAAAAAAo..',
    '..oAAAAAAAAAABo.',
    '..oAAAAAACAAABo.',
    '...oAAAAAAAAABo.',
    '...oBAAAAAAABBo.',
    '....oBBBAAABBo..',
    '.....ooBBBBBo...',
    '.......oBBBo....',
    '........ooo.....',
    '................',
    '................',
    '................',
  ],
  bowl: [
    '................',
    '................',
    '................',
    '.....oooooo.....',
    '...ooAAAAAAoo...',
    '..oBBCBBBBBCBBo.',
    '..oCBBBBBBBBBCo.',
    '..oAAAAAAAAAAAo.',
    '...oAAAAAAAAAo..',
    '....oAAAAAAAo...',
    '.....oAAAAAo....',
    '......ooooo.....',
    '................',
    '................',
    '................',
    '................',
  ],
  door: [
    '....oooooooo....',
    '...oACCCCCCAo...',
    '...oABBBBBBAo...',
    '...oABCCCCBAo...',
    '...oABCCCCBAo...',
    '...oABBBBBBAo...',
    '...oAAAAAAAAo...',
    '...oABBBBBBAo...',
    '...oABBBBBBAo...',
    '...oABBBBBDAo...',
    '...oABBBBBBAo...',
    '...oABBBBBBAo...',
    '...oABBBBBBAo...',
    '...oAAAAAAAAo...',
    '....oooooooo....',
    '................',
  ],
  shield: [
    '..oooooooooooo..',
    '.oAAAAAABAAAAAo.',
    '.oACCCCCBAAAAAo.',
    '.oACDDDCBAABBAo.',
    '.oACDCDCBAABBAo.',
    '.oACDDDCBAAAAAo.',
    '.oACCCCCBAAAAAo.',
    '.oAAAAAABAAAAAo.',
    '.oBBBBBBBBBBBBo.',
    '..oAAAAABAAAAo..',
    '..oAAAAABAAAAo..',
    '...oAAAABAAAo...',
    '....oAAABAAo....',
    '.....oAABAo.....',
    '......oABo......',
    '.......oo.......',
  ],
  striker: [
    '................',
    '....oooo........',
    '...oBBBBo.......',
    '..oBBooBBo......',
    '..oBo..oBBo.....',
    '..oBo...oBBo....',
    '...oo....oBBoo..',
    '..........oAAo..',
    '.........oAAACo.',
    '........oAAACCo.',
    '........oAACCo..',
    '.........oCCo...',
    '..........oo....',
    '................',
    '................',
    '................',
  ],
  // ---- procedural fallbacks below (lump / ingot / dust / gem / ball) are drawn in code
};

/** darken / lighten a css hex colour */
function tone(hexCol: string, f: number): string {
  const n = parseInt(hexCol.replace('#', ''), 16);
  const r0 = (n >> 16) & 255, g0 = (n >> 8) & 255, b0 = n & 255;
  let r: number, g: number, b: number;
  if (f <= 1) {
    // Darken with a slight gamma so shadows separate instead of crowding together.
    const d = Math.pow(f, 1.22);
    r = Math.round(r0 * d); g = Math.round(g0 * d); b = Math.round(b0 * d);
  } else {
    // Brightening by plain multiplication clips: an already-light material (iron at #d8d8d8)
    // drove both the highlight and the rim to pure white, so the lit face, the core and the bevel
    // all collapsed into one flat blob and the tools read as featureless silhouettes.
    // Lightening toward white by a *fraction of the remaining headroom* keeps every step of the
    // ramp distinct no matter how bright the base colour already is.
    const t = Math.min(1, (f - 1) * 0.95);
    r = Math.round(r0 + (255 - r0) * t);
    g = Math.round(g0 + (255 - g0) * t);
    b = Math.round(b0 + (255 - b0) * t);
  }
  return `rgb(${r},${g},${b})`;
}

/**
 * Bitmap sprite renderer. Palette letters map to colours; 'o' resolves to the outline colour which
 * defaults to a strongly darkened main colour so it never looks like a flat black stroke.
 */
function drawArt(ctx: CanvasRenderingContext2D, art: string[], colors: Record<string, string>): void {
  const main = colors.A || colors.M || '#c0c0c0';
  const pal: Record<string, string> = {
    A: colors.A || '#c0c0c0', B: colors.B || tone(main, 0.7), C: colors.C || tone(main, 1.3), D: colors.D || colors.C || tone(main, 1.3),
    M: colors.M || '#c0c0c0', m: colors.m || tone(colors.M || '#c0c0c0', 0.72), L: colors.L || tone(colors.M || '#c0c0c0', 1.35),
    N: colors.N || tone(colors.M || '#c0c0c0', 0.5), G: colors.G || tone(colors.M || '#c0c0c0', 1.8), w: colors.w || tone(colors.H || '#8a6a3a', 1.35),
    H: colors.H || '#8a6a3a', h: colors.h || '#5a4020',
    o: colors.o || tone(colors.M || main, 0.22),
  };
  const off = Math.floor((16 - art.length) / 2);
  // draw into a grid first so a bold 1px outline can be wrapped around the whole silhouette
  // automatically (the texture-pack / reference-sheet look: crisp dark rim, readable at any size)
  const g: string[][] = Array.from({ length: 16 }, () => Array(16).fill(''));
  art.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === 'o') continue; // 'o' pixels become part of the auto outline pass
      g[y + off][x] = ch;
    }
  });
  const snap = g.map((r) => r.slice());
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (snap[y][x]) continue;
    if (snap[y - 1]?.[x] || snap[y + 1]?.[x] || snap[y][x - 1] || snap[y][x + 1]) g[y][x] = 'o';
  }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const ch = g[y][x];
    if (!ch) continue;
    ctx.fillStyle = pal[ch] || '#f0f';
    ctx.fillRect(x, y, 1, 1);
  }
}

function drawProcedural(ctx: CanvasRenderingContext2D, art: string, colors: Record<string, string>): void {
  const A = colors.A || '#fff', B = colors.B || tone(A, 0.7), C = colors.C || tone(A, 1.3);
  const O = tone(A, 0.35);
  const g: string[][] = Array.from({ length: 16 }, () => Array(16).fill(''));
  const put = (x: number, y: number, c: string) => { if (x >= 0 && y >= 0 && x < 16 && y < 16) g[y][x] = c; };
  if (art === 'lump') {
    // three overlapping rounded nuggets
    const blobs = [[7, 8, 4.2, 3.6], [5, 6, 2.6, 2.2], [10, 6, 2.4, 2.0]];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let inside = false, edgeT = false, edgeB = false;
      for (const [cx, cy, rx, ry] of blobs) {
        const d = ((x - cx) ** 2) / (rx * rx) + ((y - cy) ** 2) / (ry * ry);
        if (d <= 1) { inside = true; if (((x - cx + 1) ** 2) / (rx * rx) + ((y - cy + 1) ** 2) / (ry * ry) > 1) edgeT = true; if (((x - cx - 1) ** 2) / (rx * rx) + ((y - cy - 1) ** 2) / (ry * ry) > 1) edgeB = true; }
      }
      if (inside) put(x, y, edgeT ? C : edgeB ? B : (x * 7 + y * 3) % 5 === 0 ? B : A);
    }
    put(5, 5, '#ffffff'); put(6, 5, C);
  } else if (art === 'ingot') {
    // bar in slight perspective: top face light, front face main, right face dark
    for (let y = 4; y <= 11; y++) for (let x = 2; x <= 13; x++) {
      const topFace = y <= 5 && x >= 3 && x <= 12;
      const front = y >= 6 && y <= 11 && x >= 2 && x <= 12;
      const side = y >= 6 && y <= 10 && x === 13;
      if (topFace) put(x, y, y === 4 ? '#ffffff' : C);
      else if (front) put(x, y, y >= 10 ? B : (x + y) % 6 === 0 ? C : A);
      else if (side) put(x, y, B);
    }
    put(2, 5, C); put(13, 5, B);
  } else if (art === 'dust') {
    const pts = [[4, 10], [6, 8], [8, 11], [10, 7], [11, 10], [7, 5], [5, 6], [9, 4], [12, 5], [3, 7], [8, 8], [6, 11]];
    pts.forEach(([x, y], i) => { put(x, y, i % 3 === 0 ? C : A); put(x + 1, y, B); put(x, y + 1, A); put(x + 1, y + 1, B); });
  } else if (art === 'gem') {
    // faceted gem: light crown, main body, dark pavilion
    for (let y = 2; y <= 13; y++) for (let x = 2; x <= 13; x++) {
      const d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
      if (d > 6.5) continue;
      const crown = y <= 5, edge = d > 5.2;
      put(x, y, crown ? (edge ? A : C) : y >= 10 ? (edge ? B : A) : edge ? B : (x - y) % 4 === 0 ? C : A);
    }
    put(6, 4, '#ffffff'); put(7, 3, '#ffffff'); put(5, 5, C);
  } else if (art === 'ball') {
    for (let y = 2; y <= 13; y++) for (let x = 2; x <= 13; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d > 5.6) continue;
      const hl = Math.hypot(x - 5.5, y - 5.5);
      put(x, y, hl < 1.6 ? '#ffffff' : hl < 3 ? C : d > 4.6 && (x > 7 || y > 7) ? B : A);
    }
  }
  // 1px outline around the silhouette (computed from a snapshot so the outline does not grow into itself)
  const snap = g.map((row) => row.slice());
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (snap[y][x]) continue;
    const n = (snap[y - 1]?.[x]) || (snap[y + 1]?.[x]) || snap[y][x - 1] || snap[y][x + 1];
    if (n) g[y][x] = O;
  }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (g[y][x]) { ctx.fillStyle = g[y][x]; ctx.fillRect(x, y, 1, 1); }
}

const cache = new Map<string, string>();
const pixelCache = new Map<string, ImageData>();
export const ICON_PX = 32;

// Resource-pack hook: when a pack supplies an item texture it replaces the generated icon.
let packIconLookup: ((id: string) => HTMLCanvasElement | undefined) | null = null;
export function setPackIconLookup(fn: (id: string) => HTMLCanvasElement | undefined): void { packIconLookup = fn; }
/** Drop every cached icon (call after loading/clearing a resource pack). */
export function invalidateIcons(): void { cache.clear(); pixelCache.clear(); }

function renderIcon(id: string): HTMLCanvasElement {
  const def = ITEMS.get(id);
  const canvas = document.createElement('canvas');
  canvas.width = ICON_PX; canvas.height = ICON_PX;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const packIcon = packIconLookup?.(id);
  if (packIcon) { ctx.drawImage(packIcon, 0, 0, ICON_PX, ICON_PX); return canvas; }
  if (!def) {
    ctx.fillStyle = '#f0f';
    ctx.fillRect(4, 4, 24, 24);
  } else if ('block' in def.icon) {
    drawBlockIcon(ctx, def.icon.block, ICON_PX);
  } else {
    const art = ART[def.icon.art];
    const colors = def.icon.colors || {};
    ctx.save();
    ctx.scale(2, 2);
    if (art) drawArt(ctx, art, colors);
    else drawProcedural(ctx, def.icon.art, colors);
    ctx.restore();
  }
  return canvas;
}

/** 32x32 icon as a PNG data URL (cached per item id). */
export function itemIcon(id: string): string {
  const cached = cache.get(id);
  if (cached) return cached;
  const url = renderIcon(id).toDataURL();
  cache.set(id, url);
  return url;
}

/** Raw 32x32 RGBA pixels of the icon (cached) — used to extrude the held item in first person. */
export function itemPixels(id: string): ImageData {
  const cached = pixelCache.get(id);
  if (cached) return cached;
  const img = renderIcon(id).getContext('2d')!.getImageData(0, 0, ICON_PX, ICON_PX);
  pixelCache.set(id, img);
  return img;
}

/**
 * Native art resolution of an item icon: the hand-drawn sprites are 16x16 painted at 2x into the
 * 32x32 icon, so the 3D item model must be extruded at 16 — otherwise every art pixel becomes a
 * 2x2 clump of voxels, which is what made held items look chunky and soft-edged. A resource pack
 * can supply a higher-resolution icon, in which case the model follows the icon.
 */
export function itemArtSize(id: string): number {
  return packIconLookup?.(id) ? ICON_PX : ICON_PX / 2;
}

/** True for arts whose handle sits in the bottom-left corner of the icon (tools / weapons). */
export function isHandledArt(art: string): boolean {
  return art === 'pickaxe' || art === 'axe' || art === 'shovel' || art === 'hoe' || art === 'sword' || art === 'bow' || art === 'striker';
}

/**
 * Isometric block icon: top face full brightness, left face 0.8, right face 0.62, plus a one-pixel dark
 * outline around the silhouette and a light edge along the top rim so the cube reads on any background.
 */
export function drawBlockIcon(ctx: CanvasRenderingContext2D, blockId: number, size: number): void {
  const atlas = getAtlas();
  const b = BLOCKS[blockId];
  if (!b) return;
  const tint: [number, number, number] | undefined = b.tint ? (b.name.endsWith('leaves') ? leafTint(b.name, BIOMES[4].foliage) : BIOMES[3].grass) : undefined;
  const flat = b.shape === 'cross' || b.shape === 'liquid' || (b.shape === 'box' && b.box && (b.box[3] - b.box[0] < 0.5 || b.box[5] - b.box[2] < 0.5));
  if (flat) {
    atlas.drawTile(ctx, b.tiles[2], size * 0.1, size * 0.1, size * 0.8, tint);
    return;
  }
  let hf = 1;
  if (b.shape === 'box' && b.box) hf = b.box[4] - b.box[1];
  const hw = size * 0.42;
  const cx = size / 2;
  const cy0 = size * 0.08 + hw * (1 - hf);
  const k = hw / 16;
  // draw the cube into a scratch canvas so the outline can be computed from its silhouette
  const tmp = document.createElement('canvas');
  tmp.width = size; tmp.height = size;
  const t = tmp.getContext('2d')!;
  t.imageSmoothingEnabled = false;
  t.save();
  t.setTransform(k, k / 2, -k, k / 2, cx, cy0);
  atlas.drawTile(t, b.tiles[0], 0, 0, 16, tint, 1);
  t.setTransform(k, k / 2, 0, k * hf, cx - hw, cy0 + hw / 2);
  atlas.drawTile(t, b.tiles[5], 0, 0, 16, tint, 0.8);
  t.setTransform(k, -k / 2, 0, k * hf, cx, cy0 + hw);
  atlas.drawTile(t, b.tiles[2], 0, 0, 16, tint, 0.62);
  t.restore();
  t.setTransform(1, 0, 0, 1, 0, 0);
  // outline: any transparent pixel next to a filled one
  const img = t.getImageData(0, 0, size, size);
  const d = img.data;
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && d[(y * size + x) * 4 + 3] > 40;
  const out = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    if (filled(x, y)) { out.data[i] = d[i]; out.data[i + 1] = d[i + 1]; out.data[i + 2] = d[i + 2]; out.data[i + 3] = 255; continue; }
    if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) { out.data[i] = 20; out.data[i + 1] = 18; out.data[i + 2] = 16; out.data[i + 3] = 200; }
  }
  ctx.putImageData(out, 0, 0);
}
