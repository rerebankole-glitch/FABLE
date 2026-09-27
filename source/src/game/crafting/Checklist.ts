/**
 * Getting-started checklist.
 *
 * Pure data + a pure evaluator: each step is satisfied by looking at what the player has held or
 * currently holds, so nothing new has to be tracked by the game loop. `evaluateChecklist` takes the
 * same `have` map the recipe book already builds (id -> count) plus the set of ids the player has
 * ever picked up, and returns the steps with their done state.
 *
 * Steps are ordered and gated: a step only becomes "current" once every step before it is done, so
 * the player is always shown exactly one next action.
 */

export interface ChecklistStep {
  id: string;
  label: string;
  hint: string;
  /** Any of these item ids satisfies the step. */
  any: string[];
}

export const CHECKLIST: ChecklistStep[] = [
  { id: 'wood', label: 'Punch a tree', hint: 'Hold left click on a log to gather wood.', any: ['oak_log', 'birch_log', 'spruce_log', 'dark_log'] },
  { id: 'planks', label: 'Make planks', hint: 'Craft logs into planks in your 2x2 grid.', any: ['oak_planks', 'birch_planks', 'spruce_planks', 'dark_planks'] },
  { id: 'table', label: 'Craft a crafting table', hint: 'Four planks in the 2x2 grid.', any: ['crafting_table'] },
  { id: 'pickaxe', label: 'Craft a stone pickaxe', hint: 'Mine cobblestone, then combine it with sticks at a table.', any: ['stone_pickaxe'] },
  { id: 'furnace', label: 'Build a furnace', hint: 'Eight cobblestone around the edge of a 3x3 grid.', any: ['furnace'] },
  { id: 'torch', label: 'Make torches', hint: 'Coal above a stick. Light keeps monsters away.', any: ['torch'] },
  { id: 'iron', label: 'Find iron', hint: 'Iron ore appears deeper underground. Mine it with a stone pickaxe.', any: ['iron_ore', 'raw_iron', 'iron_ingot'] },
];

export interface ChecklistState {
  step: ChecklistStep;
  done: boolean;
  /** the first not-yet-done step, i.e. what the player should do next */
  current: boolean;
}

/**
 * Evaluate every step against what the player has. `seen` is the set of item ids the player has
 * ever obtained, so consuming a crafting table (or burning the coal) does not un-tick a step.
 */
export function evaluateChecklist(have: ReadonlyMap<string, number>, seen: ReadonlySet<string>): ChecklistState[] {
  const out: ChecklistState[] = [];
  let foundCurrent = false;
  for (const step of CHECKLIST) {
    const done = step.any.some((id) => seen.has(id) || (have.get(id) ?? 0) > 0);
    const current = !done && !foundCurrent;
    if (current) foundCurrent = true;
    out.push({ step, done, current });
  }
  return out;
}

/** How many steps are complete. */
export function checklistProgress(states: ChecklistState[]): number {
  return states.filter((s) => s.done).length;
}
