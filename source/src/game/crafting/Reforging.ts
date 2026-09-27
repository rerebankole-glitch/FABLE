/**
 * Reforging — the Mending Stone, FABLE's repair station.
 *
 * Original naming per the project convention: the block is a **Mending Stone**, and it fills the
 * role an anvil and a grindstone share. It does two things:
 *
 *   1. **Fuse** two damaged tools of the same kind into one, summing the remaining durability and
 *      capping it at the item's maximum. This is the repair path, and it costs no XP — a player
 *      with two half-dead pickaxes should always be able to make one good one.
 *   2. **Strip** a bound rune from a tool for a small XP cost, returning the tool clean. This is
 *      the grindstone role, and it is how a player undoes a bad enchant.
 *
 * Pure logic: this module takes plain stacks and returns plain results, so every rule below is
 * unit-testable without a world, a container, or a UI. The existing enchant table lives in
 * structures/Loot.ts and is not duplicated here.
 */

import type { ItemStack } from '../core/types';
import { maxDurability } from '../items/Items';

/** XP levels charged to strip a single rune. Deliberately cheap: undoing a mistake is not a tax. */
export const STRIP_COST = 2;

/**
 * Remaining durability on a stack.
 *
 * FABLE stores REMAINING durability in `ItemStack.durability`, not accumulated damage, and an
 * undamaged stack made by makeStack() already carries the full value. A stack with the field
 * missing is treated as pristine.
 */
export function remainingOf(s: ItemStack): number {
  const max = maxDurability(s.id);
  return s.durability === undefined ? max : Math.max(0, Math.min(max, s.durability));
}

/** Maximum durability of the item this stack holds, or 0 when it is not a durable item. */
export function maxDurabilityOf(s: ItemStack): number {
  return maxDurability(s.id);
}

/** How much durability has been worn off a stack. */
export function damageOf(s: ItemStack): number {
  return maxDurabilityOf(s) - remainingOf(s);
}

/** True when two stacks can be fused: same item, both durable, at least one actually damaged. */
export function canFuse(a: ItemStack, b: ItemStack): boolean {
  if (a.id !== b.id) return false;
  const max = maxDurabilityOf(a);
  if (max <= 0) return false;
  if (a.count !== 1 || b.count !== 1) return false;
  return damageOf(a) > 0 || damageOf(b) > 0;
}

/**
 * Fuse two same-kind tools into one.
 *
 * The result carries the summed remaining durability, capped at the item maximum, plus a small
 * bonus so fusing is worth doing rather than strictly conservative. Runes from both inputs are
 * kept, taking the higher rank where both carry the same rune — that mirrors what players expect
 * when combining gear and means a fused tool is never worse than its parts.
 *
 * Returns null when the pair cannot be fused.
 */
export function fuse(a: ItemStack, b: ItemStack): ItemStack | null {
  if (!canFuse(a, b)) return null;
  const max = maxDurabilityOf(a);
  // 5% of max as a fusing bonus, the way an anvil repair rewards combining
  const bonus = Math.floor(max * 0.05);
  const remaining = Math.min(max, remainingOf(a) + remainingOf(b) + bonus);
  const out: ItemStack = { id: a.id, count: 1, durability: remaining };
  const ench: Record<string, number> = { ...(a.ench ?? {}) };
  for (const [k, v] of Object.entries(b.ench ?? {})) {
    ench[k] = Math.max(ench[k] ?? 0, v);
  }
  if (Object.keys(ench).length > 0) out.ench = ench;
  return out;
}

/** The runes currently bound to a stack, in a stable order. */
export function runesOn(s: ItemStack): string[] {
  return Object.keys(s.ench ?? {}).sort();
}

/** True when this rune can be stripped and the player can pay for it. */
export function canStrip(s: ItemStack, rune: string, levels: number): boolean {
  if (!s.ench || !(rune in s.ench)) return false;
  return levels >= STRIP_COST;
}

/**
 * Strip one rune from a stack, paying XP levels.
 *
 * Returns the cleaned stack and the player's remaining levels, or null when the rune is not
 * present or the player cannot afford it. Durability is untouched: stripping is not a repair.
 */
export function strip(s: ItemStack, rune: string, levels: number): { stack: ItemStack; levels: number } | null {
  if (!canStrip(s, rune, levels)) return null;
  const ench = { ...(s.ench ?? {}) };
  delete ench[rune];
  const out: ItemStack = { ...s };
  if (Object.keys(ench).length > 0) out.ench = ench; else delete out.ench;
  return { stack: out, levels: levels - STRIP_COST };
}
