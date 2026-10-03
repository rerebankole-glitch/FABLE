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

console.log(fail === 0 ? 'SMOKE OK' : `SMOKE FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
