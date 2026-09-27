// Entry: installs jsdom globals, then runs the bundled DOM suite (dist/inventory.dom.test.mjs).
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:8123/',
  pretendToBeVisual: true,
});

const keys = [
  'window', 'document', 'navigator', 'Node', 'Text', 'Comment', 'DocumentFragment', 'Element', 'HTMLElement',
  'HTMLDivElement', 'HTMLImageElement', 'HTMLSpanElement', 'Event', 'MouseEvent', 'CustomEvent', 'KeyboardEvent',
  'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'MutationObserver', 'SVGElement', 'Blob',
  'URL', 'FileReader', 'Image', 'localStorage', 'history', 'location',
];
const w = dom.window;
for (const k of keys) {
  if (w[k] === undefined) continue;
  try { globalThis[k] = w[k]; }
  catch {
    Object.defineProperty(globalThis, k, { value: w[k], configurable: true, writable: true });
  }
}
if (!w.matchMedia) {
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } });
}
// jsdom has no canvas implementation; item icons draw on 2D contexts. Provide a tolerant stub.
w.HTMLCanvasElement.prototype.getContext = function () {
  const noop = () => undefined;
  return new Proxy({}, {
    get(_t, p) {
      if (p === 'createImageData') return (a, b) => ({ data: new Uint8ClampedArray(a * b * 4), width: a, height: b });
      if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'canvas') return undefined;
      return noop;
    },
    set() { return true; },
  });
};
w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { run } = await import('./dist/inventory.dom.test.mjs');
run(w.document);
