// Pixel-art GUI sprites, generated at startup and exposed as CSS custom properties (data-URI PNGs).
// Everything is drawn from tiny palette-indexed bitmaps so the single-file build stays asset-free.

type Palette = Record<string, string>;

function bitmap(rows: string[], palette: Palette, scale = 1): string {
  const h = rows.length, w = rows[0].length;
  const c = document.createElement('canvas');
  c.width = w * scale; c.height = h * scale;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const col = palette[rows[y][x]];
    if (!col) continue;
    ctx.fillStyle = col;
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }
  return `url("${c.toDataURL('image/png')}")`;
}

// 9x9 heart (container / full / half) — classic GUI icon layout
const HEART_BG = [
  '.XX...XX.',
  'XeeX.XeeX',
  'XedX.XedX',
  'XeddddddX',
  '.XeddddX.',
  '..XeddX..',
  '...XdX...',
  '....X....',
  '.........',
];
// Full heart: glossy candy-shell shading — white glint + pale key light on the upper-left lobe,
// saturated body, deep shade down the right, and a warm bounce light off the bottom-left edge.
const HEART_FULL = [
  '.XX...XX.',
  'XhgX.XrsX',
  'XhrX.XrsX',
  'XhrrrrrsX',
  '.XhrrjsX.',
  '..XhrjX..',
  '...XdX...',
  '....X....',
  '.........',
];
// Half heart: the left half keeps the lit shell, the right falls back to the hollow container tones.
const HEART_HALF = [
  '.XX...XX.',
  'XhgX.XeeX',
  'XhrX.XedX',
  'XhrredddX',
  '.XhreddX.',
  '..XhedX..',
  '...XdX...',
  '....X....',
  '.........',
];
// Hardcore hearts: same silhouette as survival but visibly their own thing — a deep ember-red
// heart split by a charcoal crack with white-hot ember glints, so hardcore reads at a glance
// (mirrors Minecraft's hardcore = "no second chances" mood). Empty containers stay ash grey.
const HEART_FULL_HC = [
  '.XX...XX.',
  'XQQX.XBQX',
  'XQRX.XBOX',
  'XQRBBBOBX',
  '.XQRBBBX.',
  '..XQROX..',
  '...XRX...',
  '....X....',
  '.........',
];
const HEART_HALF_HC = [
  '.XX...XX.',
  'XQQX.XeeX',
  'XQRX.XedX',
  'XQRBddddX',
  '.XQRBddX.',
  '..XQRdX..',
  '...XRX...',
  '....X....',
  '.........',
];
// Container shown behind a missing half / empty slot: ashen so the bar reads "gone".
const HEART_BG_HC = [
  '.XX...XX.',
  'XeeX.XeeX',
  'XedX.XedX',
  'XeddddddX',
  '.XeddddX.',
  '..XeddX..',
  '...XdX...',
  '....X....',
  '.........',
];
// 11x11 drumstick (hunger): a proper chicken drumstick — big roasted meat bulb with a highlight,
// then a clean bone running to the bottom-right ending in a two-lobe knob. Bigger than the hearts
// (11px vs 9px) so the hunger row reads at the same glance.
const DRUM_BG = [
  '....XXXXX..',
  '..XXlllllX.',
  '.XllGGllllX',
  '.XlGllllmdX',
  'XllllmmmddX',
  'XlllmmmdddX',
  '.XmmmmdddX.',
  '..XmmddXkX.',
  '...XXdXkX..',
  '....XXkbXX.',
  '.....XXkX..',
];
const DRUM_FULL = [
  '....XXXXX..',
  '..XXllGllX.',
  '.XlGGllllmX',
  '.XlGllllmdX',
  'XllllmmmtdX',
  'XlllmmmtddX',
  '.XmmmmdddX.',
  '..XmmddXkX.',
  '...XXdXbX..',
  '....XXkbXX.',
  '.....XXkX..',
];
// Half = the right side of the same silhouette painted with the empty tones (q/w/e/r/t mirror
// the drumBgPal colours), so a half drum reads as "that half is gone" like the half hearts.
const DRUM_HALF = [
  '....XXXXX..',
  '..XXllGqqX.',
  '.XlGGllqqqX',
  '.XlGllqqweX',
  'XllllmwweeX',
  'XlllmmweeeX',
  '.XmmmmeeeX.',
  '..XmmddXrX.',
  '...XXdXrX..',
  '....XXrtXX.',
  '.....XXrX..',
];
// 9x9 chestplate (armor)
const ARMOR_BG = [
  'XXX...XXX',
  'XddX.XddX',
  'XdddXdddX',
  'XdddddddX',
  '.XdddddX.',
  '.XdddddX.',
  '.XdddddX.',
  '.XXXXXXX.',
  '.........',
];
const ARMOR_FULL = [
  'XXX...XXX',
  'XssX.XssX',
  'XsssXsssX',
  'XsssssssX',
  '.XsssssX.',
  '.XsshssX.',
  '.XsssssX.',
  '.XXXXXXX.',
  '.........',
];
const ARMOR_HALF = [
  'XXX...XXX',
  'XssX.XddX',
  'XsssXdddX',
  'XssssdddX',
  '.XsssddX.',
  '.XsshddX.',
  '.XsssddX.',
  '.XXXXXXX.',
  '.........',
];
// 9x9 air bubble
const BUBBLE = [
  '..XXXXX..',
  '.XwwwwbX.',
  'XwwbbbbbX',
  'XwbbbbbbX',
  'XbbbbbbbX',
  'XbbbbbbbX',
  'XbbbbbbwX',
  '.XbbbbwX.',
  '..XXXXX..',
];
const BUBBLE_POP = [
  '.........',
  '..X...X..',
  '.........',
  '....X....',
  '.X.....X.',
  '....X....',
  '.........',
  '..X...X..',
  '.........',
];
// 22x15 crafting arrow
const ARROW = [
  '..............XX......',
  '..............XaX.....',
  '..............XaaX....',
  '..............XaaaX...',
  'XXXXXXXXXXXXXXXaaaaX..',
  'XaaaaaaaaaaaaaaaaaaaX.',
  'XaaaaaaaaaaaaaaaaaaaaX',
  'XaaaaaaaaaaaaaaaaaaaX.',
  'XXXXXXXXXXXXXXXaaaaX..',
  '..............XaaaX...',
  '..............XaaX....',
  '..............XaX.....',
  '..............XX......',
  '......................',
  '......................',
];
// 14x14 furnace flame
const FIRE = [
  '......X.......',
  '.....XfX......',
  '.....XfX..X...',
  '....XffX.XfX..',
  '....XffXXffX..',
  '...XfffXfffX..',
  '..XfffffffffX.',
  '..XffyyyfffX..',
  '.XffyyyyyffX..',
  '.XfyyywyyyfX..',
  '.XfyywwwyyfX..',
  '..XfyywwyyfX..',
  '..XffyyyyffX..',
  '...XXXXXXXX...',
];
// 16x16 dirt tile for menu backgrounds (4 shades, deterministic noise)
function dirtTile(): string {
  const shades = ['#5b3f27', '#6a4a2e', '#4c3420', '#755433', '#3e2a19'];
  const rows: string[] = [];
  let s = 1337;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let y = 0; y < 16; y++) {
    let r = '';
    for (let x = 0; x < 16; x++) { const v = rnd(); r += v < 0.42 ? 'a' : v < 0.68 ? 'b' : v < 0.86 ? 'c' : v < 0.95 ? 'd' : 'e'; }
    rows.push(r);
  }
  return bitmap(rows, { a: shades[0], b: shades[1], c: shades[2], d: shades[3], e: shades[4] }, 4);
}
// 16x16 grass-block side used as the default world icon
function worldIconTile(): string {
  const rows: string[] = [];
  let s = 4242;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let y = 0; y < 16; y++) {
    let r = '';
    for (let x = 0; x < 16; x++) {
      const v = rnd();
      if (y < 3 || (y === 3 && v < 0.6) || (y === 4 && v < 0.25)) r += v < 0.5 ? 'g' : 'G';
      else r += v < 0.42 ? 'a' : v < 0.68 ? 'b' : v < 0.86 ? 'c' : 'd';
    }
    rows.push(r);
  }
  return bitmap(rows, { g: '#7cbd4a', G: '#5f9a35', a: '#5b3f27', b: '#6a4a2e', c: '#4c3420', d: '#755433' }, 4);
}

// 16x16 empty-slot silhouettes (armour pieces, shield, off-hand) drawn as a slightly darker grey on the slot
const SIL_HELMET = [
  '................',
  '................',
  '.....XXXXXX.....',
  '....XXXXXXXX....',
  '...XXXXXXXXXX...',
  '...XXXXXXXXXX...',
  '...XXXXXXXXXX...',
  '...XXXXXXXXXX...',
  '...XXX....XXX...',
  '...XXX....XXX...',
  '...XXX....XXX...',
  '...XXXX..XXXX...',
  '................',
  '................',
  '................',
  '................',
];
const SIL_CHEST = [
  '................',
  '..XXXX....XXXX..',
  '..XXXXX..XXXXX..',
  '..XXXXXXXXXXXX..',
  '..XX.XXXXXX.XX..',
  '..XX.XXXXXX.XX..',
  '.....XXXXXX.....',
  '.....XXXXXX.....',
  '.....XXXXXX.....',
  '.....XXXXXX.....',
  '.....XXXXXX.....',
  '.....XXXXXX.....',
  '.....XXXXXX.....',
  '................',
  '................',
  '................',
];
const SIL_LEGS = [
  '................',
  '...XXXXXXXXXX...',
  '...XXXXXXXXXX...',
  '...XXXXXXXXXX...',
  '...XXXX..XXXX...',
  '...XXXX..XXXX...',
  '...XXXX..XXXX...',
  '...XXXX..XXXX...',
  '...XXXX..XXXX...',
  '...XXXX..XXXX...',
  '...XXXX..XXXX...',
  '...XXXX..XXXX...',
  '...XXXX..XXXX...',
  '...XXXX..XXXX...',
  '................',
  '................',
];
const SIL_BOOTS = [
  '................',
  '................',
  '................',
  '................',
  '...XXX....XXX...',
  '...XXX....XXX...',
  '...XXX....XXX...',
  '...XXX....XXX...',
  '...XXX....XXX...',
  '..XXXX....XXXX..',
  '.XXXXX....XXXXX.',
  '.XXXXX....XXXXX.',
  '.XXXXX....XXXXX.',
  '................',
  '................',
  '................',
];
const SIL_SHIELD = [
  '................',
  '...XXXXXXXXXX...',
  '...X........X...',
  '...X........X...',
  '...X........X...',
  '...X........X...',
  '...X........X...',
  '...X........X...',
  '...X........X...',
  '....X......X....',
  '.....X....X.....',
  '......X..X......',
  '.......XX.......',
  '................',
  '................',
  '................',
];

// 16x16 recipe book (red cover, pale pages, dark spine, gold ribbon)
const BOOK = [
  '................',
  '.oooooooooooooo.',
  '.oGgggPooPgggGo.',
  '.ogpppPooPpppGo.',
  '.ogPPPPooPPPPGo.',
  '.ogpppPooPpppGo.',
  '.ogPPPPooPPPPGo.',
  '.ogpppPooPpppGo.',
  '.ogPPPPooPPPPGo.',
  '.ogpppPooPpppGo.',
  '.ogPPPPooPPPPGo.',
  '.oGGGGPooPGGGGo.',
  '.oooooorroooooo.',
  '..ooooorrooooo..',
  '.......rr.......',
  '................',
];

let installed = false;
/** Generate all sprites once and install them as CSS variables on :root. */
export function installSprites(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const root = document.documentElement.style;
  const X = '#000000';
  // Hearts: outline, hollow rim, hollow body, highlight, body, shadow, glint.
  const heartPal = { X, e: '#5a5a62', d: '#26262c', h: '#ff8f8f', r: '#e8281e', s: '#8f0d12', g: '#ffffff', j: '#ff7d5a', b: '#c9b890' };
  // Hunger: a proper drumstick - meat (light/main/dark + glint) over a bone (light/main).
  // q/w/e/r/t are the "eaten away" tones (mirroring drumBgPal) used by the half sprite.
  const drumPal = { X, l: '#f0b070', m: '#c8703a', d: '#8a4a22', G: '#ffe9c0', k: '#f8eed8', b: '#cbb994', q: '#4a3a2a', w: '#382b20', e: '#2a2018', r: '#6a5a48', t: '#a85a28' };
  // Empty hunger pips keep the drumstick silhouette so the row lines up, painted dark.
  const drumBgPal = { X, l: '#4a3a2a', m: '#382b20', d: '#2a2018', G: '#4a3a2a', k: '#6a5a48', b: '#524434', x: '#3a3028' };
  const armorPal = { X, d: '#4d4d4d', s: '#c8c8c8', h: '#ffffff' };
  const bubblePal = { X: '#1f3f6f', w: '#ffffff', b: '#4f8ff0' };
  const set = (k: string, v: string) => root.setProperty(k, v);
  // HUD icons are displayed at 18 CSS px; render them at (at least) the panel's device pixel
  // ratio so a 1080p screen shows exact pixels instead of a resampled blur.
  const dpr = Math.max(1, Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 3));
  const hud = Math.max(1, Math.round(dpr));
  set('--spr-heart-bg', bitmap(HEART_BG, heartPal, hud));
  set('--spr-heart-full', bitmap(HEART_FULL, heartPal, hud));
  set('--spr-heart-half', bitmap(HEART_HALF, heartPal, hud));
  const hcPal = { X, e: '#5a5a62', d: '#33333a', Q: '#5a0f14', R: '#9e1420', B: '#170406', O: '#ff7a2a' };
  set('--spr-heart-hc-bg', bitmap(HEART_BG_HC, hcPal, hud));
  set('--spr-heart-hc-full', bitmap(HEART_FULL_HC, hcPal, hud));
  set('--spr-heart-hc-half', bitmap(HEART_HALF_HC, hcPal, hud));
  set('--spr-drum-bg', bitmap(DRUM_BG, drumBgPal, hud));
  set('--spr-drum-full', bitmap(DRUM_FULL, drumPal, hud));
  set('--spr-drum-half', bitmap(DRUM_HALF, drumPal, hud));
  set('--spr-armor-bg', bitmap(ARMOR_BG, armorPal, hud));
  set('--spr-armor-full', bitmap(ARMOR_FULL, armorPal, hud));
  set('--spr-armor-half', bitmap(ARMOR_HALF, armorPal, hud));
  set('--spr-bubble', bitmap(BUBBLE, bubblePal, hud));
  set('--spr-bubble-pop', bitmap(BUBBLE_POP, { X: '#9fd0ff' }, hud));
  set('--spr-arrow', bitmap(ARROW, { X: '#000000', a: '#8b8b8b' }, 1));
  set('--spr-arrow-big-off', bitmap(ARROW, { X: '#3f3f3f', a: '#8b8b8b' }, 2));
  set('--spr-arrow-big-on', bitmap(ARROW, { X: '#3f3f3f', a: '#ffffff' }, 2));
  set('--spr-fire-off', bitmap(FIRE, { X: '#3f3f3f', f: '#6f6f6f', y: '#8b8b8b', w: '#a0a0a0' }, 2));
  set('--spr-fire-on', bitmap(FIRE, { X: '#3f3f3f', f: '#ff6a00', y: '#ffb300', w: '#ffee80' }, 2));
  set('--spr-book', bitmap(BOOK, { o: '#330b0b', G: '#a02020', g: '#c93939', p: '#f5e9cf', P: '#d9c49c', r: '#e8b23a' }, 2));
  const silPal = { X: '#5f5f5f' };
  set('--sil-helmet', bitmap(SIL_HELMET, silPal, 2));
  set('--sil-chest', bitmap(SIL_CHEST, silPal, 2));
  set('--sil-legs', bitmap(SIL_LEGS, silPal, 2));
  set('--sil-boots', bitmap(SIL_BOOTS, silPal, 2));
  set('--sil-shield', bitmap(SIL_SHIELD, silPal, 2));
  set('--dirt-tile', dirtTile());
  set('--world-icon-tile', worldIconTile());
}
