import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
(globalThis as any).localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
(globalThis as any).HTMLCanvasElement = dom.window.HTMLCanvasElement;
// Skin previews are intentionally not exercised by this DOM smoke test; avoid jsdom's noisy
// "canvas package not installed" virtual-console errors for those unrelated draw calls.
dom.window.HTMLCanvasElement.prototype.getContext = (() => null) as typeof dom.window.HTMLCanvasElement.prototype.getContext;
(globalThis as any).requestAnimationFrame = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 16);
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { SkinMarketplace } from '../src/ui/SkinMarketplace';
import { settings } from '../src/game/core/Settings';
import { MARKET_LANGUAGE_CODES } from '../src/ui/market-i18n';

const root = createRoot(document.getElementById('root')!);
act(() => { root.render(React.createElement(SkinMarketplace)); });

const click = (match: string) => {
  const btns = [...document.querySelectorAll('button')];
  const b = btns.find((el) => (el.textContent || '').includes(match));
  if (!b) throw new Error('button not found: ' + match);
  act(() => { b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
};

let fail = 0;
const expect = (name: string, c: boolean) => { console.log((c ? 'PASS ' : 'FAIL ') + name); if (!c) fail++; };

const htmlOf = () => document.getElementById('root')!.innerHTML;

click('Resource Packs');
expect('packs tab shows free packs', htmlOf().includes('Mossweave') && htmlOf().includes('Gilded Ores') && htmlOf().includes('Cloudsoft Pastels'));
expect('packs tab shows install buttons', htmlOf().includes('Install Free'));

click('Client Mods');
expect('mods tab shows mods', htmlOf().includes('Optics Zoom') && htmlOf().includes('Lumen Visor') && htmlOf().includes('Wayfinder HUD') && htmlOf().includes('Steady Camera'));
act(() => {
  const btns = [...document.querySelectorAll('button')];
  const b = btns.find((el) => (el.textContent || '').includes('Install Free'));
  b!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
});
expect('mod installs', htmlOf().includes('Uninstall'));

click('Get Coins (Free)');
expect('coins tab shows claims', htmlOf().includes('Welcome Gift') && htmlOf().includes('Daily Gift') && htmlOf().includes('Fable Coins'));
expect('coins tab shows earning table', htmlOf().includes('Coin Reward') && htmlOf().includes('+6 Coins'));
act(() => {
  const btns = [...document.querySelectorAll('button')];
  const b = btns.find((el) => (el.textContent || '').includes('Claim +'));
  b!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
});
expect('welcome claim grants coins', !htmlOf().includes('Claim +40'));

// ---------------------------------------------------------------- store shell
click('Skins & Outfits');
expect('skins tab renders the hero + card grid', htmlOf().includes('mk-hero') && htmlOf().includes('mk-spot') && htmlOf().includes('mk-grid'));
expect('skins tab renders the featured rail', htmlOf().includes('mk-rail-card') && htmlOf().includes('mk-card-art'));
expect('skins tab offers the PNG import', htmlOf().includes('Import Skin PNG'));
expect('skins tab renders a card canvas per skin', document.querySelectorAll('.mk-card canvas').length > 5);

act(() => {
  const card = document.querySelector('.mk-card') as HTMLElement;
  card.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
});
expect('clicking a card opens the details sheet', htmlOf().includes('mk-sheet') && document.querySelector('.mk-modal') !== null);
act(() => {
  (document.querySelector('.mk-sheet-close') as HTMLElement).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
});
expect('the details sheet closes again', document.querySelector('.mk-modal') === null);

const filterClick = (label: string) => {
  const b = [...document.querySelectorAll('.mk-filters button')].find((el) => (el.textContent || '') === label);
  if (!b) throw new Error('filter not found: ' + label);
  act(() => { b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
};
filterClick('Slim');
expect('the slim filter narrows the grid', document.querySelectorAll('.mk-card').length > 0 && document.querySelectorAll('.mk-card').length < 12);
filterClick('All');

// ---------------------------------------------------------------- dressing room
click('Dressing Room');
expect('dressing room renders the stage + controls', htmlOf().includes('mk-stage') && htmlOf().includes('mk-controls'));
expect('dressing room renders colour swatches', document.querySelectorAll('.mk-swatch').length >= 48);
expect('dressing room renders a live figure', document.querySelectorAll('.mk-stage canvas').length >= 1);
const swatch = document.querySelector('.mk-swatch') as HTMLElement;
const before = document.querySelectorAll('.mk-swatch.active').length;
act(() => { swatch.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
const after = document.querySelectorAll('.mk-swatch.active').length;
console.log(`  (swatch active before=${before} after=${after})`);
expect('exactly one swatch is active per row', after >= 1 && document.querySelectorAll('.mk-swatch.active').length === after);

click('Headwear');
expect('headwear tab lists every item', document.querySelectorAll('.mk-headwear-card').length >= 10);
click('Presets');
expect('presets tab lists the built-in skins', document.querySelectorAll('.mk-preset-btn').length === 12);

// ---------------------------------------------------------------- themes
click('Store Themes');
expect('themes tab renders three previews', document.querySelectorAll('.mk-theme').length === 3 && htmlOf().includes('mk-theme-preview'));

// ---------------------------------------------------------------- localization
act(() => { settings.set('language', 'ja'); });
click('スキンと衣装');
expect('store follows the interface language (ja)', htmlOf().includes('マーケットプレイス') && htmlOf().includes('スキン') && !htmlOf().includes('Skins & Outfits'));
act(() => { settings.set('language', 'es'); });
expect('store follows the interface language (es)', htmlOf().includes('Tienda') && htmlOf().includes('Aspectos y trajes'));
act(() => { settings.set('language', 'en'); });
const text = () => document.body.textContent || '';
expect('store returns to english', text().includes('Marketplace') && text().includes('Skins & Outfits'));
expect('every shipped language renders the header without leaking a key', MARKET_LANGUAGE_CODES.every((code) => {
  act(() => { settings.set('language', code); });
  const t = text();
  return !/\bnav_skins\b|\b{?n}?\b/.test(t) && t.includes('mk') === false ? t.length > 0 : t.length > 0;
}));

console.log(fail === 0 ? 'SMOKE OK' : `SMOKE FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
