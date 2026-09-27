const noop = () => undefined;
const ctx = new Proxy({}, { get(_t,p){
  if (p==='createImageData') return (a,b)=>({data:new Uint8ClampedArray(a*b*4),width:a,height:b});
  if (p==='getImageData') return (_x,_y,w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h});
  if (p==='measureText') return ()=>({width:10});
  if (p==='canvas') return undefined;
  return noop;
}, set(){return true;}});
globalThis.document = { createElement: () => ({ width:0, height:0, style:{}, className:'', getContext: ()=>ctx, toDataURL: ()=>'data:,' }), createElementNS: () => ({style:{}}), documentElement:{style:{setProperty:noop},classList:{toggle:noop}}, addEventListener:noop, removeEventListener:noop };
globalThis.window = { devicePixelRatio:1, innerWidth:1280, innerHeight:720, addEventListener:noop, removeEventListener:noop, matchMedia: ()=>({matches:false,addEventListener:noop,removeEventListener:noop}) };
globalThis.localStorage = { getItem: ()=>null, setItem:noop, removeItem:noop };
globalThis.performance = globalThis.performance ?? { now: ()=>Date.now() };
await import('./dist/heldpose.test.mjs');
