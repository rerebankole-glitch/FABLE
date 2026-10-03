// Contact sheet of every procedurally drawn item icon, for art review:
//   node tools/items-preview-build.mjs && node dist/items-preview.mjs   (needs @napi-rs/canvas)
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { ALL_ITEM_IDS } from '../src/game/items/Items';
import { itemIcon, ICON_PX } from '../src/game/items/Icons';
import { loadImage } from '@napi-rs/canvas';

// Icons are drawn through document.createElement('canvas'); give node a canvas factory.
(globalThis as { document?: unknown }).document = {
  createElement: (tag: string) => (tag === 'canvas' ? createCanvas(32, 32) : {}),
};

const SIZE = 32, PAD = 6, COLS = 12;
const ids = ALL_ITEM_IDS().sort();
void ICON_PX;
const rows = Math.ceil(ids.length / COLS);
const sheet = createCanvas(COLS * (SIZE + PAD) + PAD, rows * (SIZE + PAD + 12) + PAD);
const g = sheet.getContext('2d');
g.imageSmoothingEnabled = false;
g.fillStyle = '#181a24';
g.fillRect(0, 0, sheet.width, sheet.height);

for (const [i, id] of ids.entries()) {
  const cx = PAD + (i % COLS) * (SIZE + PAD);
  const cy = PAD + Math.floor(i / COLS) * (SIZE + PAD + 12);
  try {
    const url = itemIcon(id);            // a data: URL of the drawn ICON_PX icon
    if (url) {
      const c = createCanvas(SIZE, SIZE);
      const ig = c.getContext('2d');
      ig.fillStyle = '#181a24'; ig.fillRect(0, 0, SIZE, SIZE);
      // itemIcon returns a DOM Image element; the URL is what we can decode offline
      const png = (url as unknown as { src?: string })?.src ?? (url as unknown as string);
      if (typeof png === 'string' && png.startsWith('data:')) {
        const img = await loadImage(png);
        ig.drawImage(img, 0, 0, SIZE, SIZE);
        g.drawImage(c, cx, cy);
      }
    }
  } catch (e) { if (process.env.ITEMS_DEBUG) console.log(id, (e as Error).message); }
  g.fillStyle = '#7c8497';
  g.font = '8px sans-serif';
  g.fillText(id.length > 14 ? id.slice(0, 13) + '…' : id, cx, cy + SIZE + 8);
}
writeFileSync(process.env.ITEMS_PNG || '/tmp/items.png', sheet.toBuffer('image/png'));
console.log('wrote', process.env.ITEMS_PNG || '/tmp/items.png', ids.length, 'items');
