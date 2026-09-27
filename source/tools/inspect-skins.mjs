import { builtinSkinPixels, SKIN_PRESETS } from '../src/game/core/Skins';

function regionAlpha(buf, x0, y0, x1, y1) {
  const rows = [];
  for (let y = y0; y < y1; y++) {
    let s = '';
    for (let x = x0; x < x1; x++) {
      const a = buf[(y * 64 + x) * 4 + 3];
      s += a === 0 ? '.' : a === 255 ? '#' : '~';
    }
    rows.push(s);
  }
  return rows.join('\n');
}

for (const p of SKIN_PRESETS) {
  if (process.argv.length > 2 && !process.argv.slice(2).includes(p.id)) continue;
  const buf = builtinSkinPixels(p);
  console.log('=== ' + p.id + ' (slim=' + !!p.slim + ')');
  console.log('HAT overlay front (40-47, 8-15):');
  console.log(regionAlpha(buf, 40, 8, 48, 16));
  console.log('R-SLEEVE overlay (40-55, 32-47):');
  console.log(regionAlpha(buf, 40, 32, 56, 48));
  console.log('L-SLEEVE overlay (32-47 / 48-63, 48-63):');
  console.log(regionAlpha(buf, 32, 48, 48, 64));
  console.log(regionAlpha(buf, 48, 48, 64, 64));
  console.log('');
}

const p2 = SKIN_PRESETS.find(p => p.id === (process.argv[2] || 'steve'));
const b2 = builtinSkinPixels(p2);
console.log('=== ' + p2.id + ' R-ARM BASE (40-55,16-31) alpha:');
for (let y = 16; y < 32; y++) {
  let s = '';
  for (let x = 40; x < 56; x++) s += b2[(y * 64 + x) * 4 + 3] === 0 ? '.' : '#';
  console.log(s);
}
console.log('=== HEAD front face RGB rows 0-7 (8-15, 8-15):');
const rgbAt = (x, y) => { const i = (y * 64 + x) * 4; return [b2[i], b2[i+1], b2[i+2]]; };
for (let y = 8; y < 16; y++) {
  let s = '';
  for (let x = 8; x < 16; x++) { const [r, g, b] = rgbAt(x, y); s += `(${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')})`; }
  console.log(s);
}
