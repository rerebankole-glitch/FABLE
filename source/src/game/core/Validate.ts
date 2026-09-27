/**
 * Registry validation (development safety net).
 *
 * Every block, item, recipe, drop and tool requirement in FABLE is data. This walks all of that
 * data and reports anything structurally broken — a recipe pointing at an item that does not
 * exist, a block that drops a phantom item, a tool with no durability, a duplicate id, an item
 * with no icon art — so a typo surfaces as a clear console warning instead of a mystery crash or
 * an invisible hole in progression.
 *
 * It runs automatically in dev builds (see the bottom of this file) and is exposed as
 * `window.fableValidate()` so it can be run on demand in any build.
 */
import { BLOCKS, B, type BlockDef } from '../blocks/Blocks';
import { TILE_NAMES } from '../blocks/Tiles';
import { ITEMS, itemDef } from '../items/Items';
import { RECIPES, SMELTING } from '../crafting/Recipes';
import { isHandledArt } from '../items/Icons';

export interface Issue { level: 'error' | 'warn'; area: string; message: string }

export interface ValidationReport {
  issues: Issue[];
  errors: number;
  warns: number;
  counts: { blocks: number; items: number; recipes: number; smelting: number };
}

/** Run every registry check and return a structured report (does not log). */
export function validateRegistries(): ValidationReport {
  const issues: Issue[] = [];
  const err = (area: string, message: string): void => { issues.push({ level: 'error', area, message }); };
  const warn = (area: string, message: string): void => { issues.push({ level: 'warn', area, message }); };

  const tileCount = TILE_NAMES.length;
  const blocks = BLOCKS.filter((b): b is BlockDef => !!b);

  // ---------------------------------------------------------------- blocks
  const blockNames = new Set<string>();
  for (const b of blocks) {
    if (blockNames.has(b.name)) err('blocks', `duplicate block name '${b.name}' (id ${b.id})`);
    blockNames.add(b.name);
    if (!b.label) warn('blocks', `block '${b.name}' has no display label`);
    // every block must have six real tiles pointing inside the atlas
    if (!Array.isArray(b.tiles) || b.tiles.length !== 6) {
      err('blocks', `block '${b.name}' has ${b.tiles?.length ?? 0} tiles, expected 6`);
    } else {
      for (const t of b.tiles) {
        if (!Number.isInteger(t) || t < 0 || t >= tileCount) err('blocks', `block '${b.name}' references tile ${t}, outside the atlas (0..${tileCount - 1})`);
      }
    }
    if (b.id !== B.AIR) {
      if (b.hardness < 0 && b.drops && b.drops.length) warn('blocks', `block '${b.name}' is unbreakable but declares drops`);
      if (b.tier > 0 && b.tool === 'none') err('blocks', `block '${b.name}' needs tool tier ${b.tier} but no tool kind — it can never be harvested`);
      if (b.light < 0 || b.light > 15) err('blocks', `block '${b.name}' has light level ${b.light}, must be 0..15`);
      if (b.shape === 'box' && !b.box) err('blocks', `block '${b.name}' has shape 'box' but no box bounds`);
      if (b.box && b.box.length !== 6) err('blocks', `block '${b.name}' box must have 6 numbers, got ${b.box.length}`);
    }
    // drops must reference real items
    for (const d of b.drops ?? []) {
      if (!ITEMS.has(d.item)) err('drops', `block '${b.name}' drops unknown item '${d.item}'`);
      if (d.min > d.max) err('drops', `block '${b.name}' drop '${d.item}' has min ${d.min} > max ${d.max}`);
      if (d.chance <= 0 || d.chance > 1) err('drops', `block '${b.name}' drop '${d.item}' has chance ${d.chance}, must be in (0,1]`);
    }
    // a placeable block needs an inventory item to place it with
    if (b.hasItem && b.id !== B.AIR) {
      const item = ITEMS.get(b.name);
      if (!item) err('block-items', `block '${b.name}' is obtainable but has no matching item`);
      else if (item.block !== b.id) err('block-items', `item '${b.name}' points at block ${item.block}, expected ${b.id}`);
    }
  }

  // ---------------------------------------------------------------- items
  for (const [id, it] of ITEMS) {
    if (id !== it.id) err('items', `item registered under '${id}' but its id is '${it.id}'`);
    if (!/^[a-z0-9_]+$/.test(it.id)) err('items', `item id '${it.id}' should be lower_snake_case`);
    if (!it.name) warn('items', `item '${it.id}' has no display name`);
    if (!it.icon) err('icons', `item '${it.id}' has no icon`);
    else if ('block' in it.icon) {
      if (!BLOCKS[it.icon.block]) err('icons', `item '${it.id}' icon references missing block ${it.icon.block}`);
    } else if (!it.icon.art) {
      err('icons', `item '${it.id}' has an empty icon art name`);
    }
    if (!Number.isInteger(it.maxStack) || it.maxStack < 1 || it.maxStack > 64) {
      err('stacking', `item '${it.id}' has invalid maxStack ${it.maxStack}`);
    }
    if (it.block !== undefined && !BLOCKS[it.block]) err('items', `item '${it.id}' places missing block ${it.block}`);
    // tools / weapons
    if (it.tool) {
      if (it.tool.durability <= 0) err('tools', `tool '${it.id}' has no durability`);
      if (it.tool.speed <= 0) err('tools', `tool '${it.id}' has mining speed ${it.tool.speed}`);
      if (it.tool.tier < 0) err('tools', `tool '${it.id}' has negative tier`);
      if (it.maxStack !== 1) err('stacking', `tool '${it.id}' must not stack (maxStack ${it.maxStack})`);
    }
    if (it.armor) {
      if (it.armor.durability <= 0) err('armor', `armor '${it.id}' has no durability`);
      if (it.armor.slot < 0 || it.armor.slot > 3) err('armor', `armor '${it.id}' has invalid slot ${it.armor.slot}`);
      if (it.maxStack !== 1) err('stacking', `armor '${it.id}' must not stack`);
    }
    if (it.food) {
      if (it.food.hunger <= 0) warn('food', `food '${it.id}' restores no hunger`);
      if (it.food.saturation < 0) err('food', `food '${it.id}' has negative saturation`);
    }
    if (it.fuel !== undefined && it.fuel <= 0) err('fuel', `item '${it.id}' has non-positive fuel value ${it.fuel}`);
    // tool art convention: handled arts are drawn handle-to-lower-left, which the held-item grip
    // point assumes (see Game.HELD_GRIP)
    if (it.tool && 'art' in it.icon && !isHandledArt(it.icon.art) && it.tool.kind !== 'none') {
      warn('icons', `tool '${it.id}' uses art '${it.icon.art}', which is not a handled (handle-in-corner) art — it may be gripped oddly in first person`);
    }
  }

  // ---------------------------------------------------------------- recipes
  const seenRecipeIds = new Set<string>();
  const resolvable = (ref: string): boolean => (ref.startsWith('tag:') ? true : ITEMS.has(ref));
  for (const r of RECIPES) {
    if (seenRecipeIds.has(r.id)) err('recipes', `duplicate recipe id '${r.id}'`);
    seenRecipeIds.add(r.id);
    if (!ITEMS.has(r.result.id)) err('recipes', `recipe '${r.id}' produces unknown item '${r.result.id}'`);
    const out = ITEMS.get(r.result.id);
    if (out && r.result.count > out.maxStack) {
      err('recipes', `recipe '${r.id}' yields ${r.result.count} of '${r.result.id}' but it stacks to ${out.maxStack}`);
    }
    if (r.result.count < 1) err('recipes', `recipe '${r.id}' yields ${r.result.count}`);
    if (r.pattern) {
      if (r.pattern.length > 3) err('recipes', `recipe '${r.id}' pattern is ${r.pattern.length} rows, max 3`);
      for (const row of r.pattern) if (row.length > 3) err('recipes', `recipe '${r.id}' pattern row '${row}' is wider than 3`);
      const used = new Set<string>();
      for (const row of r.pattern) for (const ch of row) if (ch !== ' ') used.add(ch);
      for (const ch of used) {
        const ref = r.key?.[ch];
        if (!ref) err('recipes', `recipe '${r.id}' uses '${ch}' with no key entry`);
        else if (!resolvable(ref)) err('recipes', `recipe '${r.id}' key '${ch}' references unknown item '${ref}'`);
      }
      for (const ch of Object.keys(r.key ?? {})) if (!used.has(ch)) warn('recipes', `recipe '${r.id}' defines unused key '${ch}'`);
    } else if (r.ingredients) {
      if (!r.ingredients.length) err('recipes', `recipe '${r.id}' has no ingredients`);
      for (const ing of r.ingredients) if (!resolvable(ing)) err('recipes', `recipe '${r.id}' uses unknown ingredient '${ing}'`);
    } else {
      err('recipes', `recipe '${r.id}' has neither a pattern nor ingredients`);
    }
  }

  // ---------------------------------------------------------------- smelting
  for (const [input, out] of Object.entries(SMELTING)) {
    if (!ITEMS.has(input)) err('smelting', `smelting input '${input}' is not a registered item`);
    if (!ITEMS.has(out.result)) err('smelting', `smelting '${input}' produces unknown item '${out.result}'`);
    if (out.time <= 0) err('smelting', `smelting '${input}' has non-positive time ${out.time}`);
    if (out.xp < 0) err('smelting', `smelting '${input}' has negative xp`);
  }

  // ---------------------------------------------------------------- progression reachability
  // Every tool tier a block demands must be satisfiable by some craftable tool of that kind.
  const bestTier = new Map<string, number>();
  for (const it of ITEMS.values()) {
    if (!it.tool) continue;
    bestTier.set(it.tool.kind, Math.max(bestTier.get(it.tool.kind) ?? 0, it.tool.tier));
  }
  for (const b of blocks) {
    if (b.tier <= 0 || b.tool === 'none') continue;
    const best = bestTier.get(b.tool) ?? -1;
    if (best < b.tier) err('progression', `block '${b.name}' needs ${b.tool} tier ${b.tier} but the best ${b.tool} is tier ${best} — it is unobtainable`);
  }

  const errors = issues.filter((i) => i.level === 'error').length;
  return {
    issues,
    errors,
    warns: issues.length - errors,
    counts: { blocks: blocks.length, items: ITEMS.size, recipes: RECIPES.length, smelting: Object.keys(SMELTING).length },
  };
}

/** Run the checks and print a readable developer report. Returns the report. */
export function runValidation(log: (...a: unknown[]) => void = console.log): ValidationReport {
  const r = validateRegistries();
  const { blocks, items, recipes, smelting } = r.counts;
  log(`[FABLE] registry check: ${blocks} blocks, ${items} items, ${recipes} recipes, ${smelting} smelting recipes`);
  if (!r.issues.length) { log('[FABLE] registry check: all good'); return r; }
  const byArea = new Map<string, Issue[]>();
  for (const i of r.issues) {
    const list = byArea.get(i.area) ?? [];
    list.push(i);
    byArea.set(i.area, list);
  }
  for (const [area, list] of byArea) {
    for (const i of list) {
      const line = `[FABLE] ${i.level === 'error' ? 'ERROR' : 'warn '} (${area}) ${i.message}`;
      if (i.level === 'error') console.error(line); else console.warn(line);
    }
  }
  log(`[FABLE] registry check: ${r.errors} error(s), ${r.warns} warning(s)`);
  return r;
}

// Expose for manual runs in any build: `fableValidate()` in the browser console.
if (typeof window !== 'undefined') {
  (window as unknown as { fableValidate: () => ValidationReport }).fableValidate = () => runValidation();
}

// keep itemDef referenced for consumers importing it via this module's side effects
void itemDef;
