import React, { useMemo } from 'react';

// The FABLE title mark: chunky 6x9 pixel letters extruded into a 3D block, rendered as inline SVG so
// the menu needs no image assets. Face = weathered sandstone with a moss line, sides = dark stone.

const GLYPHS: Record<string, string[]> = {
  F: ['XXXXXX', 'XXXXXX', 'XX....', 'XX....', 'XXXXX.', 'XXXXX.', 'XX....', 'XX....', 'XX....'],
  A: ['.XXXX.', 'XXXXXX', 'XX..XX', 'XX..XX', 'XXXXXX', 'XXXXXX', 'XX..XX', 'XX..XX', 'XX..XX'],
  B: ['XXXXX.', 'XXXXXX', 'XX..XX', 'XXXXX.', 'XXXXX.', 'XX..XX', 'XX..XX', 'XXXXXX', 'XXXXX.'],
  L: ['XX....', 'XX....', 'XX....', 'XX....', 'XX....', 'XX....', 'XX....', 'XXXXXX', 'XXXXXX'],
  E: ['XXXXXX', 'XXXXXX', 'XX....', 'XXXXX.', 'XXXXX.', 'XX....', 'XX....', 'XXXXXX', 'XXXXXX'],
  ' ': ['......', '......', '......', '......', '......', '......', '......', '......', '......'],
};
// fallback 5x7 set so <Logo text="..."> works for any capital letters (used by the credits / tests)
const SMALL: Record<string, string[]> = {
  C: ['.XXXX', 'X....', 'X....', 'X....', 'X....', 'X....', '.XXXX'], D: ['XXXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'XXXX.'],
  G: ['.XXXX', 'X....', 'X....', 'X..XX', 'X...X', 'X...X', '.XXXX'], H: ['X...X', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
  I: ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', 'XXXXX'], K: ['X...X', 'X..X.', 'X.X..', 'XX...', 'X.X..', 'X..X.', 'X...X'],
  M: ['X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X', 'X...X', 'X...X'], N: ['X...X', 'XX..X', 'X.X.X', 'X..XX', 'X...X', 'X...X', 'X...X'],
  O: ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'], P: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X....', 'X....', 'X....'],
  R: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X.X..', 'X..X.', 'X...X'], S: ['.XXXX', 'X....', 'X....', '.XXX.', '....X', '....X', 'XXXX.'],
  T: ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', '..X..'], U: ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
  V: ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.X.X.', '..X..'], W: ['X...X', 'X...X', 'X...X', 'X.X.X', 'X.X.X', 'XX.XX', 'X...X'],
  Y: ['X...X', 'X...X', '.X.X.', '..X..', '..X..', '..X..', '..X..'],
};

function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Build the face/side/detail layers for a word; returns SVG markup plus the pixel grid size. */
function buildLogo(text: string): { svg: string; shadow: string; glow: string; W: number; H: number } {
  {
    const P = 4;          // svg units per pixel
    const depth = 3;      // extrusion depth in pixels
    const gap = 1;        // pixels between letters
    const letters = text.toUpperCase().split('');
    const big = letters.every((ch) => GLYPHS[ch]);
    const glyphOf = (ch: string) => (big ? GLYPHS[ch] : (GLYPHS[ch] ?? SMALL[ch] ?? SMALL.O));
    const cellW = big ? 6 : 5, hPx = big ? 9 : 7;
    const filled = new Set<string>();
    let cursor = 0;
    for (const ch of letters) {
      const gl = glyphOf(ch);
      const w = gl[0].length;
      for (let y = 0; y < gl.length && y < hPx; y++) for (let x = 0; x < w; x++) if (gl[y][x] === 'X') filled.add(`${cursor + x},${y}`);
      cursor += (big ? w : cellW) + gap;
    }
    const wPx = cursor - gap;
    const W = (wPx + depth) * P, H = (hPx + depth) * P + 2;
    const side: string[] = [], face: string[] = [], detail: string[] = [];
    const has = (x: number, y: number) => filled.has(`${x},${y}`);
    for (const key of filled) {
      const [x, y] = key.split(',').map(Number);
      // extrusion: darker stone stepping down-right
      for (let d = 1; d <= depth; d++) {
        const tone = d === depth ? '#2a2118' : d === 2 ? '#3a2d20' : '#4a3a2a';
        side.push(`<rect x="${(x + d) * P}" y="${(y + d) * P}" width="${P}" height="${P}" fill="${tone}"/>`);
      }
      // face: warm sandstone, mottled in 3 tones, darker towards the bottom rows
      const v = hash(x, y, 7);
      const rowShade = y >= hPx - 2 ? 0.86 : y >= hPx - 4 ? 0.94 : 1;
      const base = v < 0.2 ? [232, 206, 140] : v < 0.6 ? [216, 186, 118] : v < 0.9 ? [198, 166, 100] : [176, 144, 84];
      const rgb = `rgb(${Math.round(base[0] * rowShade)},${Math.round(base[1] * rowShade)},${Math.round(base[2] * rowShade)})`;
      face.push(`<rect x="${x * P}" y="${y * P}" width="${P}" height="${P}" fill="${rgb}"/>`);
      // bevel: light top/left, dark bottom/right
      if (!has(x, y - 1)) face.push(`<rect x="${x * P}" y="${y * P}" width="${P}" height="1" fill="#f6e6b4"/>`);
      if (!has(x - 1, y)) face.push(`<rect x="${x * P}" y="${y * P}" width="1" height="${P}" fill="#f6e6b4"/>`);
      if (!has(x, y + 1)) face.push(`<rect x="${x * P}" y="${(y + 1) * P - 1}" width="${P}" height="1" fill="#8a6a3a"/>`);
      if (!has(x + 1, y)) face.push(`<rect x="${(x + 1) * P - 1}" y="${y * P}" width="1" height="${P}" fill="#8a6a3a"/>`);
      // moss creeping over the top edge of each letter + a few cracks
      if (!has(x, y - 1) && hash(x, y, 11) < 0.55) detail.push(`<rect x="${x * P}" y="${y * P}" width="${P}" height="${hash(x, y, 13) < 0.4 ? 2 : 1}" fill="#5f9a3a"/>`);
      if (hash(x, y, 3) < 0.1) detail.push(`<rect x="${x * P + 1}" y="${y * P + 2}" width="2" height="1" fill="#8a6a3a"/>`);
      if (hash(x, y, 5) < 0.07) detail.push(`<rect x="${x * P + 2}" y="${y * P + 1}" width="1" height="2" fill="#8a6a3a"/>`);
    }
    const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">`;
    const svg = head + `<g>${side.join('')}</g><g>${face.join('')}</g><g>${detail.join('')}</g></svg>`;
    // drop shadow: the letter silhouette (face + extrusion) in flat black, used as a separate animated layer
    const sil: string[] = [];
    for (const key of filled) {
      const [x, y] = key.split(',').map(Number);
      for (let d = 0; d <= depth; d++) sil.push(`<rect x="${(x + d) * P}" y="${(y + d) * P}" width="${P}" height="${P}"/>`);
    }
    const shadow = head + `<g fill="#000">${sil.join('')}</g></svg>`;
    // glow: only the letter faces, white — masked by CSS into a moving light sweep
    const faces: string[] = [];
    for (const key of filled) {
      const [x, y] = key.split(',').map(Number);
      faces.push(`<rect x="${x * P}" y="${y * P}" width="${P}" height="${P}"/>`);
    }
    const glow = head + `<g fill="#fff">${faces.join('')}</g></svg>`;
    return { svg, shadow, glow, W, H };
  }
}

/** Static SVG markup for the title mark (used by the website/store-asset exporter). */
export function logoSvg(text = 'FABLE'): { svg: string; W: number; H: number } { const b = buildLogo(text); return { svg: b.svg, W: b.W, H: b.H }; }

const url = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

/**
 * Title mark. `animated` adds the living presentation used on the main menu: a ground shadow that breathes
 * and drifts with a slow "sun", a light sweep gliding across the letter faces, a soft ambient bloom and a few
 * floating dust motes — all CSS-driven, so it costs nothing when the menu is not on screen.
 */
export function Logo({ text = 'FABLE', className, animated = false }: { text?: string; className?: string; animated?: boolean }) {
  const built = useMemo(() => buildLogo(text), [text]);
  const img = <img className={className} alt={text} draggable={false} src={url(built.svg)} />;
  if (!animated) return img;
  const motes = useMemo(() => Array.from({ length: 9 }, (_, i) => ({
    left: 6 + hash(i, 1, 21) * 88, top: 10 + hash(i, 2, 23) * 70, size: 2 + Math.round(hash(i, 3, 29) * 2),
    delay: -hash(i, 4, 31) * 9, dur: 7 + hash(i, 5, 37) * 6,
  })), []);
  return (
    <div className="logo-live" style={{ aspectRatio: `${built.W} / ${built.H}` }}>
      <div className="logo-bloom" style={{ WebkitMaskImage: `url("${url(built.shadow)}")`, maskImage: `url("${url(built.shadow)}")` }} />
      <img className="logo-shadow logo-shadow-far" alt="" draggable={false} src={url(built.shadow)} />
      <img className="logo-shadow logo-shadow-near" alt="" draggable={false} src={url(built.shadow)} />
      {img}
      <div className="logo-sweep" style={{ WebkitMaskImage: `url("${url(built.glow)}")`, maskImage: `url("${url(built.glow)}")` }} />
      {motes.map((m, i) => (
        <span key={i} className="logo-mote" style={{ left: `${m.left}%`, top: `${m.top}%`, width: m.size, height: m.size, animationDelay: `${m.delay}s`, animationDuration: `${m.dur}s` }} />
      ))}
    </div>
  );
}
