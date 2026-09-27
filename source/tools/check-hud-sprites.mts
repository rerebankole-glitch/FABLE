// Validate the regenerated HUD sprite art: every row the same width, every key defined in the
// palette, full/half/empty visibly different, and the silhouettes aligned across states.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/ui/sprites.ts', import.meta.url).pathname, 'utf8');
function art(name: string): string[] {
  const m = new RegExp('const ' + name + ' = \\[(.*?)\\];', 's').exec(src);
  if (!m) throw new Error('missing ' + name);
  return m[1].split('\n').map((l) => l.trim()).filter((l) => l.startsWith("'")).map((l) => l.slice(1, l.lastIndexOf("'")));
}
const PALS: Record<string, string> = {
  heartPal: 'X e d h r s g',
  hcPal: 'X e d Q R B O',
  drumPal: 'X l m d G k b q w e r t',
  drumBgPal: 'X l m d G k b x',
  armorPal: 'X d s h',
  bubblePal: 'X w b',
};
function palMap(pal: string): Map<string, string> {
  const body = new RegExp('const ' + pal + ' = \\\{([^}]*)\\\}', 's').exec(src)![1];
  const m = new Map<string, string>();
  for (const part of body.split(',')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    m.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  if (!m.has('X')) m.set('X', '#000000');
  return m;
}
function palKeys(pal: string): Set<string> {
  return new Set(['.', ...palMap(pal).keys()]);
}
let fail = 0;
const ok = (n: string, c: boolean, extra = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' ' + extra : '')); if (!c) fail++; };
const ARTS: [string, string][] = [
  ['HEART_BG', 'heartPal'], ['HEART_FULL', 'heartPal'], ['HEART_HALF', 'heartPal'],
  ['HEART_FULL_HC', 'hcPal'], ['HEART_HALF_HC', 'hcPal'],
  ['DRUM_BG', 'drumBgPal'], ['DRUM_FULL', 'drumPal'], ['DRUM_HALF', 'drumPal'],
];
// hearts are classic 9x9 GUI icons; the drumstick is drawn at 11x11 (displayed 22px vs 18px)
const SIZE: Record<string, number> = { DRUM_BG: 11, DRUM_FULL: 11, DRUM_HALF: 11 };
const grids: Record<string, string[]> = {};
for (const [name, pal] of ARTS) {
  const rows = art(name);
  const n = SIZE[name] ?? 9;
  grids[name] = rows;
  ok(`${name}: ${n} rows`, rows.length === n, `(${rows.length})`);
  ok(`${name}: all rows ${n} wide`, rows.every((r) => r.length === n), rows.map((r) => r.length).filter((l) => l !== n).join(','));
  const keys = palKeys(pal);
  const unknown = [...new Set(rows.join('').split('').filter((c) => !keys.has(c)))];
  ok(`${name}: every pixel key exists in ${pal}`, unknown.length === 0, unknown.join(''));
}
// the silhouette (outline pixel positions) must be identical across full/half/empty so the HUD row lines up
const shape = (rows: string[]) => rows.map((r) => r.split('').map((c) => (c === 'X' ? 'X' : c === '.' ? '.' : 'B')).join('')).join('|');
ok('hearts: full/half/empty share one silhouette', shape(grids.HEART_FULL) === shape(grids.HEART_BG) && shape(grids.HEART_HALF) === shape(grids.HEART_BG));
ok('hunger: full/half/empty share the outline', shape(grids.DRUM_FULL) === shape(grids.DRUM_BG));
const palOf: Record<string, string> = { HEART_BG: 'heartPal', HEART_FULL: 'heartPal', HEART_HALF: 'heartPal', HEART_FULL_HC: 'hcPal', HEART_HALF_HC: 'hcPal', DRUM_BG: 'drumBgPal', DRUM_FULL: 'drumPal', DRUM_HALF: 'drumPal' };
for (const [a, b] of [['HEART_FULL', 'HEART_HALF'], ['HEART_FULL', 'HEART_BG'], ['DRUM_FULL', 'DRUM_HALF'], ['DRUM_FULL', 'DRUM_BG']]) {
  const pa = palMap(palOf[a]), pb = palMap(palOf[b]);
  const dim = grids[a].length;
  let d = 0;
  for (let y = 0; y < dim; y++) for (let x = 0; x < dim; x++) {
    const ca = grids[a][y][x] === '.' ? 'none' : pa.get(grids[a][y][x]) ?? 'missing';
    const cb = grids[b][y][x] === '.' ? 'none' : pb.get(grids[b][y][x]) ?? 'missing';
    if (ca !== cb) d++;
  }
  ok(`${a} vs ${b}: ${d} visibly different pixels`, d >= 8);
}
console.log(`\nHUD sprite art: ${fail ? fail + ' FAILURES' : 'all checks passed'}`);
console.log('\n8x art previews (X=outline, letters = shading):');
for (const [name] of ARTS) { if (!name.startsWith('HEART_FULL_HC') && !name.startsWith('HEART_HALF_HC')) { console.log(' ' + name); for (const r of grids[name]) console.log('   |' + r + '|'); } }
process.exit(fail ? 1 : 0);
