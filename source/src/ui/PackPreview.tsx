import React, { useEffect, useRef } from 'react';
import { paintPackTile } from '../game/blocks/packArt';
import type { FreePack } from '../game/core/FreePacks';

const NATIVE = 16; // px per tile in the generated textures

/**
 * Storefront preview for a free resource pack: a strip of the pack's *actual* generated tiles,
 * painted at their real 16x16 resolution. Nothing here is a mock-up — this is the same painter the
 * installed world uses, so a card cannot lie about the art.
 *
 * The canvas is sized to an integer multiple of the native tile size, measured from the card's own
 * width, so the pixels stay square and crisp instead of being resampled by the layout.
 */
export function PackPreview({
  pack, cols = 8, from = 0, radius = 8,
}: { pack: FreePack; cols?: number; from?: number; radius?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const tiles = pack.preview.slice(from, from + cols);
    const nativeW = Math.max(1, tiles.length) * NATIVE;

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // integer scale that fits the card (fall back to 2 when layout is not measurable)
      const avail = canvas.parentElement?.clientWidth || canvas.clientWidth || nativeW * 2;
      const scale = Math.max(1, Math.min(6, Math.floor(avail / nativeW)));
      const w = nativeW * scale, h = NATIVE * scale;
      canvas.width = w; canvas.height = h;
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;

      const src = document.createElement('canvas');
      src.width = nativeW; src.height = NATIVE;
      const sctx = src.getContext('2d');
      if (!sctx) return;
      const img = sctx.createImageData(nativeW, NATIVE);
      tiles.forEach((tile, ti) => {
        const px = paintPackTile(pack.id, tile, pack.seed);
        for (let y = 0; y < NATIVE; y++) for (let x = 0; x < NATIVE; x++) {
          const di = (y * nativeW + ti * NATIVE + x) * 4;
          if (!px) { // no art for this tile: show the checkerboard through
            const check = ((x >> 1) + (y >> 1)) % 2 ? 44 : 34;
            img.data[di] = check; img.data[di + 1] = check + 4; img.data[di + 2] = check + 12; img.data[di + 3] = 255;
            continue;
          }
          const si = (y * NATIVE + x) * 4;
          img.data[di] = px[si]; img.data[di + 1] = px[si + 1]; img.data[di + 2] = px[si + 2];
          img.data[di + 3] = px[si + 3] === 0 ? 0 : 255;
        }
      });
      sctx.putImageData(img, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // dark plate behind the strip so transparent plant tiles stay readable
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(0, 0, w, h, radius);
      else ctx.rect(0, 0, w, h);
      ctx.fill();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(src, 0, 0, w, h);
    };

    draw();
    // re-render when the card is resized (responsive layout / sidebar collapse)
    const parent = canvas.parentElement;
    if (!parent || typeof ResizeObserver === 'undefined') return;
    let last = parent.clientWidth;
    const ro = new ResizeObserver(() => {
      if (Math.abs(parent.clientWidth - last) < 12) return;
      last = parent.clientWidth;
      draw();
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, [pack, cols, from, radius]);

  return (
    <span className="mk-pack-strip">
      <canvas ref={ref} className="mk-pack-preview" aria-label={`${pack.name} block preview`} />
    </span>
  );
}
