// Alchemy content integrity, plus a guard on the existing enchant table.
//
// The point of this suite is that content is data: if a draught ever references an item that does
// not exist, or an effect the player never reads, the build fails here instead of shipping a
// recipe the player cannot complete. The enchant table (Rune Altar, already shipped) gets the same
// treatment so its `applies` predicates cannot silently stop matching any real item.
import { ITEMS } from '../src/game/items/Items';
import { DRAUGHTS, DRAUGHT_BY_ID, BREW_BASE, BREW_SECONDS, draughtFor } from '../src/game/brewing/Brewing';
import { ENCHANTMENTS, enchantsFor } from '../src/game/structures/Loot';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string): void => { if (c) pass++; else { fail++; console.error('FAIL: ' + m); } };

// ---- every draught references a real, obtainable item ----------------------------------------
ok(ITEMS.has(BREW_BASE), `brew base '${BREW_BASE}' must exist in the item table`);
for (const d of DRAUGHTS) {
  ok(ITEMS.has(d.ingredient), `draught '${d.id}' ingredient '${d.ingredient}' must be a real item`);
  ok(ITEMS.has(d.id), `draught '${d.id}' must itself exist as an item`);
  ok(d.seconds > 0, `draught '${d.id}' must last a positive time`);
  ok(d.name.length > 0 && d.desc.length > 0, `draught '${d.id}' needs a name and description`);
}
console.log(`  ${DRAUGHTS.length} draughts, all ingredients resolve to real items`);

// ---- draught effects are effects the player actually reads -------------------------------------
// These are the keys Player.ts consults via hasEffect().
const KNOWN_EFFECTS = new Set(['regen', 'speed', 'resistance', 'night_vision', 'fire_resistance', 'water_breathing', 'strength', 'jump']);
for (const d of DRAUGHTS) ok(KNOWN_EFFECTS.has(d.effect), `draught '${d.id}' effect '${d.effect}' must be one the player reads`);

// ---- ids and ingredients are unique -------------------------------------------------------------
ok(new Set(DRAUGHTS.map((d) => d.id)).size === DRAUGHTS.length, 'draught ids are unique');
ok(new Set(DRAUGHTS.map((d) => d.ingredient)).size === DRAUGHTS.length, 'each ingredient maps to exactly one draught');
for (const d of DRAUGHTS) ok(DRAUGHT_BY_ID.get(d.id) === d, `lookup table resolves '${d.id}'`);
ok(draughtFor(DRAUGHTS[0].ingredient)?.id === DRAUGHTS[0].id, 'ingredient -> draught lookup works');
ok(draughtFor('not_a_real_item') === undefined, 'unknown ingredient brews nothing');
ok(BREW_SECONDS > 0, 'brewing takes measurable time');

// ---- the existing enchant table stays coherent -------------------------------------------------
// The Rune Altar already ships; these guard it rather than re-implement it.
{
  const allIds = [...ITEMS.keys()];
  for (const [key, def] of Object.entries(ENCHANTMENTS)) {
    ok(def.max >= 1, `enchant '${key}' must allow at least one level`);
    ok(def.name.length > 0 && def.desc.length > 0, `enchant '${key}' needs a name and description`);
    // every enchant must actually be reachable on at least one real item
    const matches = allIds.filter((id) => def.applies(id));
    ok(matches.length > 0, `enchant '${key}' matches no real item -- it would never be offered`);
  }
  console.log(`  ${Object.keys(ENCHANTMENTS).length} enchants, every one reachable on a real item`);

  // enchantsFor only ever returns real keys, and only for enchantable items
  for (const id of allIds) {
    for (const k of enchantsFor(id)) ok(k in ENCHANTMENTS, `enchantsFor('${id}') returned unknown key '${k}'`);
  }
  ok(enchantsFor('iron_pickaxe').includes('swiftness'), 'a pickaxe can take Swiftness');
  ok(enchantsFor('iron_pickaxe').includes('fortune'), 'a pickaxe can take Fortune');
  ok(enchantsFor('iron_sword').includes('sharpness'), 'a sword can take Sharpness');
  ok(!enchantsFor('iron_sword').includes('fortune'), 'a sword cannot take Fortune');
  ok(enchantsFor('iron_chestplate').includes('protection'), 'armor can take Protection');
  ok(enchantsFor('oak_planks').length === 0, 'a plain block takes no enchants');
  ok(enchantsFor('bow').includes('power'), 'a bow can take Power');
  // 'protection' is the key Player.ts sums off armor stacks -- it must not be renamed
  ok('protection' in ENCHANTMENTS, "the 'protection' key must survive: Player.ts reads it off armor");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
