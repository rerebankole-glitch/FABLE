/**
 * Alchemy — the Brewing Hearth and the draughts steeped in it.
 *
 * This is the potion half of FABLE's consumable progression. The gear half already exists: the
 * Rune Altar (B.RUNE_ALTAR) enchants tools and armor and already charges XP levels plus ember
 * dust, with its table in game/structures/Loot.ts. Nothing here duplicates that.
 *
 * The **Brewing Hearth** steeps draughts from ingredients that already exist in the item table, so
 * no new drop or mob is required, and draught effects reuse the `effects` map the player already
 * ticks rather than inventing parallel machinery.
 */

/** A brewable draught. Effects map onto the player's existing `effects` record. */
export interface DraughtDef {
  id: string;
  name: string;
  /** Ingredient item id consumed alongside the base flask. Must exist in the item table. */
  ingredient: string;
  /** Effect key written to `Player.effects`, and how many seconds it lasts. */
  effect: string;
  seconds: number;
  /** Instant health restored instead of a timed effect, when set. */
  heal?: number;
  desc: string;
}

/** The flask every draught is brewed from. */
export const BREW_BASE = 'glass_flask';

// Every ingredient below is an item that already exists and is already obtainable in-world; the
// content-integrity suite enforces that, so a typo here fails the build rather than shipping a
// recipe nobody can brew.
export const DRAUGHTS: DraughtDef[] = [
  { id: 'draught_mending',   name: 'Mending Draught',   ingredient: 'honey_apple',  effect: 'regen',           seconds: 12, heal: 4, desc: 'Knits wounds closed on the spot.' },
  { id: 'draught_swift',     name: 'Swift Draught',     ingredient: 'sky_crystal',  effect: 'speed',           seconds: 90,  desc: 'Quickens the stride.' },
  { id: 'draught_stonehide', name: 'Stonehide Draught', ingredient: 'iron_ingot',   effect: 'resistance',      seconds: 90,  desc: 'Hardens the skin against blows.' },
  { id: 'draught_owlsight',  name: 'Owlsight Draught',  ingredient: 'lumen_shard',  effect: 'night_vision',    seconds: 180, desc: 'Draws light out of the dark.' },
  { id: 'draught_emberskin', name: 'Emberskin Draught', ingredient: 'ember_dust',   effect: 'fire_resistance', seconds: 120, desc: 'Lets flame wash over you.' },
  { id: 'draught_tidelung',  name: 'Tidelung Draught',  ingredient: 'void_essence', effect: 'water_breathing', seconds: 120, desc: 'Turns water to air in the lungs.' },
];

export const DRAUGHT_BY_ID = new Map(DRAUGHTS.map((d) => [d.id, d]));

/** Find the draught a given ingredient produces, if any. */
export function draughtFor(ingredient: string): DraughtDef | undefined {
  return DRAUGHTS.find((d) => d.ingredient === ingredient);
}

/** Seconds a Brewing Hearth takes to finish one draught. */
export const BREW_SECONDS = 8;
