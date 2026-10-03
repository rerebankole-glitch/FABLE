import { useEffect, useRef } from 'react';
import { builtinSkinCanvas, customAvatarSkinCanvas, type SkinPreset } from '../game/core/Skins';
import { drawFigure, drawHead, FIGURE_ASPECT, FIGURE_BOX, fitScale } from '../game/core/SkinRender';

/**
 * Store-grade skin previews: the 2.5D oblique figure from `SkinRender`, painted straight into a
 * canvas at the device resolution of the card it sits in. One cheap 2D canvas per card, no WebGL
 * context (the marketplace used to mount a 3D renderer per tile, which both blurred the art and
 * risked the browser's context limit). `SkinFigure` is the whole character, `SkinAvatar` an
 * oblique head chip for rows, chips and pills.
 */

interface SheetProps {
  /** 64x64 skin sheet to sample (a built-in preset canvas or a custom avatar canvas) */
  sheet: CanvasImageSource | null;
  /** identity of the art in `sheet`: a new key forces a repaint */
  cacheKey: string;
}

function useSkinCanvas(
  { sheet, cacheKey }: SheetProps,
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D, sheet: CanvasImageSource) => void,
): React.RefObject<HTMLCanvasElement | null> {
  const ref = useRef<HTMLCanvasElement | null>(null);
  // the painter is recreated on every render; keep it in a ref so the effect below only runs when
  // the art, the layout or the device pixel ratio actually changes
  const painter = useRef(paint);
  painter.current = paint;
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !sheet || width <= 0 || height <= 0) return;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const dw = Math.max(1, Math.round(width * dpr));
    const dh = Math.max(1, Math.round(height * dpr));
    if (cv.width !== dw) cv.width = dw;
    if (cv.height !== dh) cv.height = dh;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    painter.current(ctx, sheet);
  }, [sheet, cacheKey, width, height]);
  return ref;
}

export interface SkinFigureProps extends SheetProps {
  /** CSS height of the figure box; the width follows the model's proportions */
  height: number;
  slim?: boolean;
  /** dark contact shadow under the feet */
  shadow?: boolean;
  className?: string;
  label?: string;
}

export function SkinFigure({ sheet, cacheKey, height, slim, shadow = true, className, label }: SkinFigureProps) {
  const width = Math.max(1, Math.round(height * FIGURE_ASPECT));
  const ref = useSkinCanvas({ sheet, cacheKey }, width, height, (ctx, src) => {
    const dw = ctx.canvas.width, dh = ctx.canvas.height;
    drawFigure(ctx, src, !!slim, { width: dw, height: dh, scale: fitScale(FIGURE_BOX, dw, dh), view: FIGURE_BOX, shadow });
  });
  return (
    <canvas
      ref={ref}
      className={'skin-figure-canvas' + (className ? ' ' + className : '')}
      style={{ width, height, display: 'block' }}
      aria-label={label ?? 'Skin preview'}
      role="img"
    />
  );
}

export interface SkinAvatarProps extends SheetProps {
  /** CSS width of the (square) head chip */
  size: number;
  className?: string;
  label?: string;
}

export function SkinAvatar({ sheet, cacheKey, size, className, label }: SkinAvatarProps) {
  const ref = useSkinCanvas({ sheet, cacheKey }, size, size, (ctx, src) => {
    drawHead(ctx, src, { size: ctx.canvas.width });
  });
  return (
    <canvas
      ref={ref}
      className={'skin-avatar-canvas' + (className ? ' ' + className : '')}
      style={{ width: size, height: size, display: 'block' }}
      aria-label={label ?? 'Skin head preview'}
      role="img"
    />
  );
}

/** A built-in preset's figure, straight from the preset (the sheet canvas is cached in Skins.ts). */
export function PresetFigure({ preset, height, className, label }: { preset: SkinPreset; height: number; className?: string; label?: string }) {
  const sheet = builtinSkinCanvas(preset);
  return <SkinFigure sheet={sheet} cacheKey={preset.id} slim={!!preset.slim} height={height} className={className} label={label ?? `${preset.name} skin preview`} />;
}

/** A built-in preset's head chip. */
export function PresetAvatar({ preset, size, className }: { preset: SkinPreset; size: number; className?: string }) {
  const sheet = builtinSkinCanvas(preset);
  return <SkinAvatar sheet={sheet} cacheKey={preset.id} size={size} className={className} label={`${preset.name} head preview`} />;
}

/** The dressing-room figure: recoloured palette avatar plus the equipped headwear layer. */
export function AvatarFigure({
  colors, slim, headwear, height, className,
}: { colors: { skin: string; hair: string; shirt: string; pants: string }; slim: boolean; headwear: string; height: number; className?: string }) {
  const sheet = customAvatarSkinCanvas(colors.skin, colors.hair, colors.shirt, colors.pants, slim, headwear);
  const key = `${colors.skin}|${colors.hair}|${colors.shirt}|${colors.pants}|${slim ? 'slim' : 'classic'}|${headwear}`;
  return <SkinFigure sheet={sheet} cacheKey={key} slim={slim} height={height} className={className} label="Avatar preview" />;
}
