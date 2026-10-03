// Renders mob face-art atlases (MobArt.boxTexture output) to a PNG so the pixel art can be
// Run: node tools/skin-dump-build.mjs && node tools/skin-dump.mjs   (needs @napi-rs/canvas)
// reviewed directly:  node tools/skin-dump.mjs
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';

globalThis.document = { createElement: (t) => (t === 'canvas' ? createCanvas(8, 8) : {}) };
const { boxTexture } = await import('../dist/skin-dump-src.mjs');
const mod = await import('../dist/skin-dump-src.mjs');

const SCALE = 10;
const entries = mod.SKINS; // [{ label, skin, color }]
const cellW = Math.max(...entries.map((e) => (e.skin.res ?? [8, 8])[0] * 3)) * SCALE + 24;
const cellH = Math.max(...entries.map((e) => (e.skin.res ?? [8, 8])[1] * 2)) * SCALE + 34;
const cols = Math.min(4, entries.length);
const rows = Math.ceil(entries.length / cols);
const sheet = createCanvas(cols * cellW, rows * cellH);
const g = sheet.getContext('2d');
g.imageSmoothingEnabled = false;
g.fillStyle = '#14161f';
g.fillRect(0, 0, sheet.width, sheet.height);

entries.forEach((e, i) => {
  const t = boxTexture(e.skin, e.color);
  const img = t.image;
  const [rw, rh] = e.skin.res ?? [8, 8];
  const cx = (i % cols) * cellW, cy = Math.floor(i / cols) * cellH;
  g.fillStyle = '#eef0f7';
  g.font = '14px sans-serif';
  g.fillText(`${e.label}  (${rw}x${rh} per face)`, cx + 12, cy + 20);
  g.fillStyle = '#2a2f3d';
  g.fillRect(cx + 10, cy + 28, rw * 3 * SCALE, rh * 2 * SCALE);
  g.drawImage(img, 0, 0, rw * 3, rh * 2, cx + 10, cy + 28, rw * 3 * SCALE, rh * 2 * SCALE);
  // cell grid: right/left/top on the first row, bottom/back/front on the second
  g.strokeStyle = 'rgba(255,255,255,.25)';
  g.lineWidth = 1;
  for (let c = 1; c < 3; c++) {
    g.beginPath(); g.moveTo(cx + 10 + c * rw * SCALE, cy + 28); g.lineTo(cx + 10 + c * rw * SCALE, cy + 28 + rh * 2 * SCALE); g.stroke();
  }
  g.beginPath(); g.moveTo(cx + 10, cy + 28 + rh * SCALE); g.lineTo(cx + 10 + rw * 3 * SCALE, cy + 28 + rh * SCALE); g.stroke();
  g.fillStyle = '#6d758c';
  g.font = '11px sans-serif';
  ['right', 'left', 'top', '', 'bottom', 'back', 'front'].forEach((lbl, k) => {
    if (!lbl) return;
    g.fillText(lbl, cx + 12 + k * rw * SCALE + 2, cy + 42);
  });
});

writeFileSync(process.env.SKIN_PNG || '/tmp/skins.png', sheet.toBuffer('image/png'));
console.log('wrote', process.env.SKIN_PNG || '/tmp/skins.png', entries.length, 'skins');
