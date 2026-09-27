/// <reference lib="webworker" />
import { Generator, type GenOptions } from './Generator';
import { Region, meshChunk } from './Mesher';
import { CHUNK_SIZE, blockIndex, chunkKey } from '../core/types';

interface StoredChunk { data: Uint8Array; biomes: Uint8Array; heights: Uint8Array }

let gen: Generator | null = null;
let smooth = true;
const chunks = new Map<string, StoredChunk>();
const region = new Region();
const pendingEdits = new Map<string, Map<number, number>>();

const source = { get: (cx: number, cz: number) => chunks.get(chunkKey(cx, cz)) };

self.onmessage = (e: MessageEvent) => {
  const m = e.data;
  switch (m.type) {
    case 'init': {
      gen = new Generator(m.opts as GenOptions);
      smooth = m.smooth;
      break;
    }
    case 'settings': {
      smooth = m.smooth;
      break;
    }
    case 'gen': {
      if (!gen) return;
      const key = chunkKey(m.cx, m.cz);
      let stored = chunks.get(key);
      let spawns: any[] = [], loot: any[] = [];
      if (!stored) {
        const r = gen.generateChunk(m.cx, m.cz);
        stored = { data: r.data, biomes: r.biomes, heights: r.heights };
        spawns = r.spawns; loot = r.loot;
        // apply saved edits
        const ed: number[] = m.edits || [];
        for (let i = 0; i < ed.length; i += 2) stored.data[ed[i]] = ed[i + 1];
        const pe = pendingEdits.get(key);
        if (pe) { for (const [idx, id] of pe) stored.data[idx] = id; pendingEdits.delete(key); }
        chunks.set(key, stored);
      }
      // send copies (chunk data stays in worker for meshing)
      const data = stored.data.slice();
      const biomes = stored.biomes.slice();
      const heights = stored.heights.slice();
      (self as any).postMessage({ type: 'chunk', cx: m.cx, cz: m.cz, data, biomes, heights, spawns, loot }, [data.buffer, biomes.buffer, heights.buffer]);
      break;
    }
    case 'mesh': {
      const key = chunkKey(m.cx, m.cz);
      if (!chunks.has(key)) return;
      region.load(source, m.cx, m.cz);
      region.computeLight();
      const res = meshChunk(region, m.cx, m.cz, smooth);
      const transfer = [
        res.opaque.pos.buffer, res.opaque.uv.buffer, res.opaque.light.buffer, res.opaque.color.buffer, res.opaque.flags.buffer, res.opaque.tile.buffer, res.opaque.index.buffer,
        res.water.pos.buffer, res.water.uv.buffer, res.water.light.buffer, res.water.color.buffer, res.water.flags.buffer, res.water.tile.buffer, res.water.index.buffer,
        res.light.buffer,
      ];
      (self as any).postMessage({ type: 'mesh', cx: m.cx, cz: m.cz, id: m.id, opaque: res.opaque, water: res.water, light: res.light }, transfer);
      break;
    }
    case 'set': {
      const cx = Math.floor(m.x / CHUNK_SIZE), cz = Math.floor(m.z / CHUNK_SIZE);
      const key = chunkKey(cx, cz);
      const c = chunks.get(key);
      const idx = blockIndex(m.x, m.y, m.z); // must match the main thread's layout exactly
      if (c) c.data[idx] = m.id;
      else {
        let pe = pendingEdits.get(key);
        if (!pe) { pe = new Map(); pendingEdits.set(key, pe); }
        pe.set(idx, m.id);
      }
      break;
    }
    case 'unload': {
      chunks.delete(chunkKey(m.cx, m.cz));
      break;
    }
  }
};
