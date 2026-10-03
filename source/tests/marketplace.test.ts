import { market, DAILY_COINS, STARTER_COINS, DAILY_COOLDOWN_MS } from '../src/game/core/Marketplace';
import { CLIENT_MODS, mods, modOn, getModById } from '../src/game/core/ClientMods';
import { FREE_PACKS, getFreePack } from '../src/game/core/FreePacks';
import { builtinSkinPixels, SKIN_PRESETS, SKIN_SHEET } from '../src/game/core/Skins';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = '') => {
  console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : ''));
  c ? pass++ : fail++;
};

// ---------------------------------------------------------------- Fable Coins
const before = market.value.coins;
market.earn(10);
ok('coins: earn credits the profile', market.value.coins === before + 10);

// welcome gift: exactly once
const got1 = market.claimStarter();
const got2 = market.claimStarter();
ok('coins: welcome gift grants once', got1 === STARTER_COINS && got2 === 0 && market.value.starter === true);

// daily gift with an injected clock
const t0 = 1_700_000_000_000;
const d1 = market.claimDaily(t0);
const d2 = market.claimDaily(t0 + 1000);
const d3 = market.claimDaily(t0 + DAILY_COOLDOWN_MS + 1);
ok('coins: daily gift grants then cools down', d1 === DAILY_COINS && d2 === 0 && d3 === DAILY_COINS);
const t3 = t0 + DAILY_COOLDOWN_MS + 1; // the moment of the second successful claim
ok('coins: dailyWait reports cooldown then readiness', market.dailyWait(t3) === DAILY_COOLDOWN_MS && market.dailyWait(t3 + DAILY_COOLDOWN_MS) === 0);

// ---------------------------------------------------------------- Steve's eyes
const px = (buf: Uint8ClampedArray, x: number, y: number) => {
  const i = (y * SKIN_SHEET + x) * 4;
  return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
};
const steve = SKIN_PRESETS.find((p) => p.id === 'steve')!;
const sheet = builtinSkinPixels(steve);
// the head FRONT face lives at sheet (8..15, 8..15): local eye cols 1,2,5,6 row 4 => sheet rows 12
const E = (lx: number, ly: number) => px(sheet, 8 + lx, 8 + ly);
const SKIN: [number, number, number] = [0xc6, 0x8e, 0x5c];
const isWhite = (c: number[]) => c[0] === 255 && c[1] === 255 && c[2] === 255;
// The finished skin sheet intentionally receives deterministic ±6% texture grain, so don't
// require exact byte equality when checking the bare skin row around the eyes.
const isSkin = (c: number[]) => c[3] === 255 && Math.abs(c[0] - SKIN[0]) + Math.abs(c[1] - SKIN[1]) + Math.abs(c[2] - SKIN[2]) <= 32;
ok('eyes: whites sit on the OUTER columns of one row', isWhite(E(1, 4)) && isWhite(E(6, 4)));
ok('eyes: irises sit on the INNER columns of the same row', !isWhite(E(2, 4)) && !isSkin(E(2, 4)) && !isWhite(E(5, 4)) && !isSkin(E(5, 4)));
ok('eyes: row above the eyes is skin (no dark bar)', isSkin(E(1, 3)) && isSkin(E(2, 3)) && isSkin(E(5, 3)) && isSkin(E(6, 3)));
ok('eyes: no stacked second eye row', isSkin(E(1, 5)) && isSkin(E(2, 5)) && isSkin(E(5, 5)) && isSkin(E(6, 5)));
for (const p of SKIN_PRESETS) {
  const s = builtinSkinPixels(p);
  const q = (lx: number, ly: number) => px(s, 8 + lx, 8 + ly);
  ok(`eyes ${p.id}: horizontal whites+iris present`, isWhite(q(1, 4)) && isWhite(q(6, 4)) && !isWhite(q(2, 4)) && !isWhite(q(5, 4)));
}

// ---------------------------------------------------------------- sleeve overlays
// every painted sleeve pixel is fully opaque (solid cutout, never semi-transparent),
// and everything outside the sleeve net stays transparent.
const sleeveSolid = (() => {
  for (let y = 36; y < 48; y++) for (let x = 40; x < 56; x++) if (px(sheet, x, y)[3] !== 255) return false;
  return true;
})();
ok('sleeves: right sleeve overlay fully opaque where painted', sleeveSolid);
ok('sleeves: outside the net stays transparent', px(sheet, 57, 40)[3] === 0 && px(sheet, 39, 40)[3] === 0);
// the hat layer never covers the eye row (window cut for every preset)
let eyeWindowOk = true;
for (const p of SKIN_PRESETS) {
  const s = builtinSkinPixels(p);
  for (const [ex, ey] of [[41, 12], [42, 12], [45, 12], [46, 12]] as const) if (px(s, ex, ey)[3] !== 0) eyeWindowOk = false;
}
ok('sleeves/hat: hat overlay eye window cut on every preset', eyeWindowOk);

// ---------------------------------------------------------------- client mods
ok('mods: catalogue ships free client mods', CLIENT_MODS.length >= 3 && CLIENT_MODS.every((m) => !!getModById(m.id)));
const first = CLIENT_MODS[0];
const on = mods.toggle(first.id);
ok('mods: toggle installs', on && modOn(first.id) && mods.isOn(first.id));
ok('mods: toggle uninstalls', mods.toggle(first.id) === false && !modOn(first.id));
ok('mods: unknown id refused', mods.toggle('not_a_mod') === false);

// ---------------------------------------------------------------- free packs
ok('packs: free pack catalogue present', FREE_PACKS.length >= 3);
ok('packs: packs carry real texture lists', FREE_PACKS.every((p) => p.textures.length >= 5 && p.textures.every((t) => t.path.startsWith('block/') || t.path.startsWith('item/'))));
ok('packs: getFreePack resolves', getFreePack(FREE_PACKS[0].id)?.name === FREE_PACKS[0].name);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
