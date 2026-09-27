/**
 * Resource-pack entity textures.
 *
 * FABLE's mobs are built from flat-coloured boxes (see entities/Entities.ts ModelBuilder), while a
 * Minecraft resource pack ships one skin-style PNG per mob. Rather than try to reproduce vanilla's
 * per-model UV nets (FABLE's mobs are its own creatures, not Minecraft's), each mapped pack texture
 * is reduced to the palette that matters: the dominant colours of the regions a player actually
 * reads — body, head, legs — which are then applied to the corresponding boxes of FABLE's model.
 *
 * That makes entity-only packs (Fresh Animations, mob-recolour packs, ...) visibly change the mobs
 * instead of failing to load, and it degrades gracefully for any mob a pack does not cover.
 */

/** FABLE mob type -> candidate paths under assets/minecraft/textures/entity/ (first found wins). */
export const ENTITY_MAP: Record<string, string[]> = {
  // FABLE's creatures are original, so each is mapped to its closest vanilla analogue
  bovin: ['cow/cow_temperate', 'cow/cow', 'cow/brown_mooshroom'],
  woolly: ['sheep/sheep', 'sheep/sheep_wool'],
  snouter: ['pig/pig_temperate', 'pig/pig'],
  clucker: ['chicken/chicken_temperate', 'chicken/chicken'],
  keeper: ['villager/villager', 'villager/villager2', 'villager/profession/librarian', 'wandering_trader'],
  night_stalker: ['zombie/zombie', 'zombie/husk', 'zombie/drowned'],
  void_archer: ['skeleton/skeleton', 'skeleton/stray', 'skeleton/wither_skeleton', 'horse/horse_skeleton'],
  cave_crawler: ['spider/cave_spider', 'spider/spider'],
  shadow_flyer: ['phantom', 'phantom/phantom', 'bat/bat', 'enderman/enderman'],
  stone_guardian: ['iron_golem/iron_golem', 'iron_golem', 'warden/warden'],
  void_wyrm: ['enderdragon/dragon', 'ender_dragon/dragon', 'wither/wither', 'enderman/enderman'],
};

/** Which horizontal band of the skin each model region is sampled from (fractions of image height). */
const REGIONS: Record<'head' | 'body' | 'legs', [number, number]> = {
  // vanilla mob skins put the head net in the top rows, the body in the middle, limbs at the bottom
  head: [0.0, 0.28],
  body: [0.28, 0.62],
  legs: [0.62, 1.0],
};

export type PartRole = 'head' | 'body' | 'legs' | 'accent';
export interface EntityPalette { head: number; body: number; legs: number }

const palettes = new Map<string, EntityPalette>();

/** Palette for a mob type, or undefined when the loaded pack does not cover it. */
export function entityPalette(type: string): EntityPalette | undefined {
  return palettes.get(type);
}

export function clearEntityPalettes(): void {
  palettes.clear();
  bumpGeneration();
}

/**
 * Bumped every time the palettes change. Live mobs compare it against the generation they were
 * skinned with, so loading or clearing a pack re-skins everything already in the world instead of
 * only affecting mobs spawned afterwards.
 */
let generation = 0;
export function packGeneration(): number { return generation; }
function bumpGeneration(): void { generation++; }

/**
 * Dominant colour of a horizontal band of the image, ignoring transparent pixels and the darkest
 * shading pixels (outlines/shadows), so the result is the colour the mob reads as, not its outline.
 * Colours are bucketed to 5 bits per channel and the heaviest bucket wins; ties go to the brighter
 * colour so a mob never turns muddy.
 */
function dominantColor(data: Uint8ClampedArray, w: number, h: number, band: [number, number]): number | null {
  const y0 = Math.floor(h * band[0]), y1 = Math.max(y0 + 1, Math.floor(h * band[1]));
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (data[i + 3] < 200) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r + g + b < 60) continue; // near-black outline pixels
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const e = buckets.get(key);
    if (e) { e.n++; e.r += r; e.g += g; e.b += b; } else buckets.set(key, { n: 1, r, g, b });
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const e of buckets.values()) if (!best || e.n > best.n) best = e;
  if (!best) return null;
  const r = Math.round(best.r / best.n), g = Math.round(best.g / best.n), b = Math.round(best.b / best.n);
  return (r << 16) | (g << 8) | b;
}

/** Decode a pack PNG and reduce it to a head/body/legs palette. */
export async function paletteFromPng(bytes: Uint8Array): Promise<EntityPalette | null> {
  try {
    const blob = new Blob([bytes.slice() as unknown as BlobPart], { type: 'image/png' });
    const bmp = await createImageBitmap(blob);
    const w = bmp.width, h = bmp.height;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bmp, 0, 0);
    const { data } = ctx.getImageData(0, 0, w, h);
    const body = dominantColor(data, w, h, REGIONS.body);
    if (body === null) return null; // fully transparent / unreadable texture
    const head = dominantColor(data, w, h, REGIONS.head) ?? body;
    const legs = dominantColor(data, w, h, REGIONS.legs) ?? body;
    return { head, body, legs };
  } catch {
    return null;
  }
}

/** Record the palette a pack supplies for one mob type. */
export function setEntityPalette(type: string, p: EntityPalette): void {
  palettes.set(type, p);
  bumpGeneration();
}

/** True when at least one mob type is covered by the loaded pack. */
export function hasEntityPalettes(): boolean { return palettes.size > 0; }

export function entityPaletteCount(): number { return palettes.size; }

/**
 * The colour a model box should be painted, given its region role and the pack palette for the
 * mob. Accents (eyes, beaks, glowing bits) keep FABLE's own colour: they are what makes each
 * creature recognisable, and a pack's averaged skin tone would erase them. With no palette the
 * box keeps its built-in colour, so clearing a pack restores FABLE's art exactly.
 */
export function packedColor(base: number, role: PartRole, p: EntityPalette | undefined): number {
  if (!p || role === 'accent') return base;
  return p[role];
}
