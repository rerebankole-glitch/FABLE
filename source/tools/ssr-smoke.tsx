import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
(globalThis as any).localStorage = dom.window.localStorage;
(globalThis as any).HTMLCanvasElement = dom.window.HTMLCanvasElement;
// node-canvas is not available: getContext returns null; our code paths must tolerate that
import React from 'react';
import { renderToString } from 'react-dom/server';
import { SkinMarketplace } from '../src/ui/SkinMarketplace';
const html = renderToString(React.createElement(SkinMarketplace));
console.log('rendered length:', html.length);
console.log('has Fable Coins:', html.includes('Fable Coins'));
console.log('has Client Mods:', html.includes('Client Mods'));
console.log('has free packs:', html.includes('Mossweave') && html.includes('Gilded Ores') && html.includes('Cloudsoft Pastels'));
console.log('has claims:', html.includes('Welcome Gift') && html.includes('Daily Gift'));
console.log('no Shard text:', !html.includes('Shard'));
console.log('has clean svg icons:', html.includes('store-icon'));
