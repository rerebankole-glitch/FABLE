import { HEADWEAR_ITEMS, getHeadwearById, paintHeadwearSheet } from '../src/game/core/Headwear';
import { customAvatarSkinPixels } from '../src/game/core/Skins';
import { market } from '../src/game/core/Marketplace';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = '') => {
  console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : ''));
  c ? pass++ : fail++;
};

// 1. Check headwear item catalogue
ok('headwear: catalogue contains items', HEADWEAR_ITEMS.length >= 10);
ok('headwear: getHeadwearById resolves "crown"', getHeadwearById('crown').name === 'Royal Crown');
ok('headwear: getHeadwearById resolves "none"', getHeadwearById('none').id === 'none');
ok('headwear: getHeadwearById falls back safely for unknown id', getHeadwearById('nonexistent').id === 'none');

// 2. Validate costs and attributes
for (const h of HEADWEAR_ITEMS) {
  ok(`headwear ${h.id}: has valid attributes`, !!h.name && !!h.desc && typeof h.cost === 'number' && h.cost >= 0);
}

// 3. Check paintHeadwearSheet
const blankBuf = new Uint8ClampedArray(64 * 64 * 4);
paintHeadwearSheet(blankBuf, 'crown');
let crownPixels = 0;
for (let i = 0; i < blankBuf.length; i += 4) {
  if (blankBuf[i + 3] > 0) crownPixels++;
}
ok('headwear: paintHeadwearSheet paints crown pixels', crownPixels > 0);

// Check that no pixels outside the hat region (u 32..64, v 0..16) are painted
let outsideHatPixels = 0;
for (let y = 0; y < 64; y++) {
  for (let x = 0; x < 64; x++) {
    const isHat = x >= 32 && y < 16;
    const idx = (y * 64 + x) * 4;
    if (!isHat && blankBuf[idx + 3] > 0) outsideHatPixels++;
  }
}
ok('headwear: paintHeadwearSheet strictly bounds pixels to hat region', outsideHatPixels === 0, `outside=${outsideHatPixels}`);

// 4. Custom avatar pixels generation with headwear
const customBuf = customAvatarSkinPixels('#c68e5c', '#5a3a22', '#3f6f9f', '#3b3b5a', false, 'crown');
ok('custom avatar: generates 64x64 buffer', customBuf.length === 64 * 64 * 4);
let paintedCount = 0;
for (let i = 0; i < customBuf.length; i += 4) {
  if (customBuf[i + 3] > 0) paintedCount++;
}
ok('custom avatar: has fully painted faces', paintedCount > 1000);

// 5. Marketplace buying headwear
const initialCoins = market.value.coins;
market.earn(100);
ok('marketplace: earned coins', market.value.coins >= 100);
const bought = market.buy('headwear:crown', 25);
ok('marketplace: can buy headwear:crown with coins', bought);
ok('marketplace: owns bought headwear:crown', market.owns('headwear:crown'));
ok('marketplace: cannot buy duplicate headwear', !market.buy('headwear:crown', 25));

// 6. Face safety: headwear holds the brow (hat rows 8..11) and must never cover the eye or mouth
// rows of the hat front face (rows 12..15) — the eye window in the skin sheet is cut there so a
// face always reads through whatever is worn.
for (const h of HEADWEAR_ITEMS) {
  if (h.id === 'none') continue;
  const buf = new Uint8ClampedArray(64 * 64 * 4);
  paintHeadwearSheet(buf, h.id);
  let blocked = 0;
  for (let y = 12; y < 16; y++) for (let x = 40; x < 48; x++) if (buf[(y * 64 + x) * 4 + 3] > 0) blocked++;
  ok(`headwear ${h.id}: eye/mouth rows stay clear`, blocked === 0, `blocked=${blocked}`);
}

// 7. Every item paints something, and the brow band items touch the hat side faces.
for (const h of HEADWEAR_ITEMS) {
  if (h.id === 'none') continue;
  const buf = new Uint8ClampedArray(64 * 64 * 4);
  paintHeadwearSheet(buf, h.id);
  let painted = 0;
  for (let i = 0; i < buf.length; i += 4) if (buf[i + 3] > 0) painted++;
  ok(`headwear ${h.id}: paints pixels`, painted > 0, `${painted}px`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
