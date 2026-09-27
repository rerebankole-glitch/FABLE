import React, { useEffect, useMemo, useState } from 'react';
import { store, useStore } from './store';
import { evaluateChecklist, checklistProgress } from '../game/crafting/Checklist';
import { Slot, Tooltip, itemName } from './HUD';
import { Btn, TextInput } from './components';
import { itemIcon } from '../game/items/Icons';
import { ITEMS, itemDef, type ItemDef } from '../game/items/Items';
import { slotDragMove, slotDragUpWindow, slotDragEnd, touchDown, touchMove, touchUp, pointerMoved, pointerLeftWindow, recheckHover, abortDragSafe, syncHoverAfterUnlock } from './slotDrag';
import { BLOCKS } from '../game/blocks/Blocks';
import { RECIPES, SMELTING, type Recipe } from '../game/crafting/Recipes';
import { TAGS } from '../game/items/Items';
import type { ItemStack } from '../game/core/types';
import { settings } from '../game/core/Settings';
import type { Container } from '../game/inventory/Inventory';
import { Game } from '../game/core/Game';
import { ENCHANTMENTS, enchantsFor } from '../game/structures/Loot';
import { draughtFor, BREW_SECONDS } from '../game/brewing/Brewing';
import { canFuse, fuse, runesOn, STRIP_COST } from '../game/crafting/Reforging';
import { PROFESSION_NAMES } from '../game/structures/Loot';
import { PlayerPreview } from './PlayerPreview';

type Category = 'all' | 'building' | 'nature' | 'tools' | 'combat' | 'food' | 'misc';
const CREATIVE_TABS: { id: Category; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'building', label: 'Building' }, { id: 'nature', label: 'Nature' }, { id: 'tools', label: 'Tools' },
  { id: 'combat', label: 'Combat' }, { id: 'food', label: 'Food' }, { id: 'misc', label: 'Misc' },
];

function category(d: ItemDef): Category {
  if (d.type === 'food') return 'food';
  if (d.type === 'armor' || d.type === 'bow' || d.tool?.kind === 'sword' || d.id === 'arrow') return 'combat';
  if (d.type === 'tool') return 'tools';
  if (d.block !== undefined) {
    const b = BLOCKS[d.block];
    if (b.shape === 'cross' || b.name.includes('leaves') || b.name.includes('log') || b.name.includes('sapling') || ['dirt', 'grass_block', 'sand', 'gravel', 'clay', 'mud', 'snow_block', 'snowy_grass', 'ice', 'packed_ice', 'red_sand', 'cactus', 'pumpkin', 'melon', 'farmland'].includes(b.name) || b.name.endsWith('_ore')) return 'nature';
    return 'building';
  }
  return 'misc';
}

function useTooltip() {
  const [tip, setTip] = useState<ItemStack | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const onHover = (s: ItemStack | null, e?: React.MouseEvent) => { setTip(s); if (e) setPos({ x: e.clientX, y: e.clientY }); };
  return { tip, pos, onHover };
}

/** Renders a container's slots and wires them to Game.slotClick. */
function Grid({ game, container, cols, size = 44, count, onHover, from = 0 }: { game: Game; container: Container; cols: number; size?: number; count?: number; onHover: (s: ItemStack | null, e?: React.MouseEvent) => void; from?: number }) {
  const n = count ?? container.size - from;
  return (
    <div className="slot-grid" style={{ gridTemplateColumns: `repeat(${cols}, ${size}px)` }}>
      {Array.from({ length: n }, (_, k) => {
        const i = from + k;
        return <Slot key={i} stack={container.get(i)} size={size} onHover={onHover} drag={{ game, c: container, i }}
          onClick={(e) => game.slotClick(container, i, 0, e.shiftKey)} onContext={(e) => game.slotClick(container, i, 2, e.shiftKey)} />;
      })}
    </div>
  );
}

function ingredientSample(ing: string): string {
  if (ing.startsWith('tag:')) return TAGS[ing.slice(4)]?.[0] ?? ing;
  return ing;
}

type RecipeCat = 'all' | 'building' | 'tools' | 'combat' | 'food' | 'misc';
const RECIPE_TABS: { id: RecipeCat; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'building', label: 'Blocks' }, { id: 'tools', label: 'Tools' }, { id: 'combat', label: 'Combat' }, { id: 'food', label: 'Food' }, { id: 'misc', label: 'Misc' },
];
function recipeCategory(d: ItemDef): RecipeCat {
  const c = category(d);
  if (c === 'building' || c === 'nature') return 'building';
  if (c === 'all') return 'misc';
  return c;
}

/** Ingredient requirement for one recipe: what it needs, how many the player has, and how many are missing. */
interface Requirement { ing: string; sample: string; need: number; have: number }

function recipeIngredients(r: Recipe): string[] {
  return r.pattern ? r.pattern.flatMap((row) => row.split('').filter((c) => c !== ' ').map((c) => r.key![c])) : r.ingredients ?? [];
}

/**
 * Recipe book: category tabs + search, list of results (dimmed when not craftable), and a detail panel for the
 * selected recipe that shows the exact grid layout and per-ingredient have/need counts, so a player always knows
 * what is missing. Clicking "Craft" moves the ingredients into the crafting grid.
 */
function RecipeBook({ game, onHover, size }: { game: Game; onHover: (s: ItemStack | null, e?: React.MouseEvent) => void; size: 2 | 3 }) {
  const [search, setSearch] = useState('');
  const [onlyCraftable, setOnlyCraftable] = useState(false);
  const [cat, setCat] = useState<RecipeCat>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const invVersion = useStore((s) => s.inv);
  const inv = game.player.inventory.main;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const have = useMemo(() => { const m = new Map<string, number>(); for (const s of inv.items) if (s) m.set(s.id, (m.get(s.id) ?? 0) + s.count); return m; }, [inv, invVersion]);
  const matches = (ing: string, id: string) => (ing.startsWith('tag:') ? TAGS[ing.slice(4)]?.includes(id) : ing === id);
  const requirements = (r: Recipe): Requirement[] => {
    const counts = new Map<string, number>();
    for (const ing of recipeIngredients(r)) counts.set(ing, (counts.get(ing) ?? 0) + 1);
    return [...counts.entries()].map(([ing, need]) => {
      let h = 0; for (const [id, n] of have) if (matches(ing, id)) h += n;
      return { ing, sample: ingredientSample(ing), need, have: h };
    });
  };
  const canCraft = (r: Recipe) => {
    const pool = new Map(have);
    for (const ing of recipeIngredients(r)) {
      let found = false;
      for (const [id, n] of pool) if (n > 0 && matches(ing, id)) { pool.set(id, n - 1); found = true; break; }
      if (!found) return false;
    }
    return true;
  };
  const fits = (r: Recipe) => !r.pattern || (r.pattern.length <= size && Math.max(...r.pattern.map((p) => p.length)) <= size);
  const q = search.trim().toLowerCase();
  const list = RECIPES.filter((r) => {
    const d = itemDef(r.result.id);
    return d && fits(r) && (cat === 'all' || recipeCategory(d) === cat) && (!q || d.name.toLowerCase().includes(q)) && (!onlyCraftable || canCraft(r));
  });
  // recipes hidden only because they need the 3x3 table (so the empty state can say so)
  const tooBig = size < 3 ? RECIPES.filter((r) => {
    const d = itemDef(r.result.id);
    return d && !fits(r) && (cat === 'all' || recipeCategory(d) === cat) && (!q || d.name.toLowerCase().includes(q));
  }).length : 0;
  const seen = new Set<string>();
  const unique = list.filter((r) => { if (seen.has(r.result.id)) return false; seen.add(r.result.id); return true; });
  const selected = unique.find((r) => r.id === selectedId) ?? RECIPES.find((r) => r.id === selectedId) ?? null;

  const place = (r: Recipe) => {
    for (let i = 0; i < 9; i++) { const s = game.craftGrid.get(i); if (s) { inv.add(s); game.craftGrid.set(i, null); } }
    const take = (ing: string): ItemStack | null => {
      for (let i = 0; i < inv.size; i++) { const s = inv.get(i); if (s && matches(ing, s.id)) { s.count--; if (s.count <= 0) inv.set(i, null); else inv.set(i, s); return { id: s.id, count: 1 }; } }
      return null;
    };
    if (r.pattern) {
      for (let y = 0; y < r.pattern.length; y++) for (let x = 0; x < r.pattern[y].length; x++) {
        const c = r.pattern[y][x]; if (c === ' ') continue;
        const s = take(r.key![c]); if (s) game.craftGrid.set(y * 3 + x, s);
      }
    } else if (r.ingredients) {
      r.ingredients.forEach((ing, i) => { const s = take(ing); if (s) game.craftGrid.set(Math.floor(i / size) * 3 + (i % size), s); });
    }
    store.bump();
  };

  // pattern preview cells (size x size) for the detail panel
  const cells: (string | null)[] = [];
  if (selected) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (selected.pattern) { const c = selected.pattern[y]?.[x]; cells.push(c && c !== ' ' ? ingredientSample(selected.key![c]) : null); }
      else { const ing = selected.ingredients?.[y * size + x]; cells.push(ing ? ingredientSample(ing) : null); }
    }
  }
  const reqs = selected ? requirements(selected) : [];
  const craftable = selected ? canCraft(selected) : false;
  // Getting-started checklist: derived purely from RECIPES-era item ids the player has held, so it
  // needs no new tracking. Dismissed state lives in settings.
  const [checklistHidden, setChecklistHidden] = useState(settings.value.hideChecklist);
  const checklist = useMemo(() => evaluateChecklist(have, game.player.inventory.seen), [have, game]);
  const doneCount = checklistProgress(checklist);
  const allDone = doneCount === checklist.length;

  return (
    <div className="recipe-book">
      {!checklistHidden && !allDone && (
        <div className="checklist">
          <div className="checklist-head">
            <span>Getting started · {doneCount}/{checklist.length}</span>
            <button className="checklist-x" title="Hide this checklist" onClick={() => { setChecklistHidden(true); settings.set('hideChecklist', true); }}>x</button>
          </div>
          {checklist.map(({ step, done, current }) => (
            <div key={step.id} className={'checklist-row' + (done ? ' done' : '') + (current ? ' current' : '')}>
              <span className="checklist-box">{done ? '\u2713' : ''}</span>
              <span className="checklist-label">{step.label}</span>
              {current && <span className="checklist-hint">{step.hint}</span>}
            </div>
          ))}
        </div>
      )}
      <div className="recipe-tabs">
        {RECIPE_TABS.map((t) => <button key={t.id} className={'recipe-tab' + (cat === t.id ? ' active' : '')} onClick={() => setCat(t.id)}>{t.label}</button>)}
      </div>
      <div className="recipe-head">
        <TextInput value={search} onChange={setSearch} placeholder="Search recipes" />
        <Btn small onClick={() => setOnlyCraftable(!onlyCraftable)}>{onlyCraftable ? 'Craftable' : 'All'}</Btn>
      </div>
      <div className="recipe-list">
        {unique.map((r) => (
          <Slot key={r.id} stack={{ id: r.result.id, count: r.result.count }} size={40} dim={!canCraft(r)} highlight={selected?.id === r.id} onHover={onHover}
            onClick={() => { setSelectedId(r.id); if (canCraft(r)) place(r); }} />
        ))}
        {unique.length === 0 && <div className="menu-text">{tooBig > 0 ? `${tooBig} recipe${tooBig === 1 ? '' : 's'} need a Crafting Table` : onlyCraftable ? 'Nothing craftable with these items' : 'No recipes'}</div>}
      </div>
      {selected ? (
        <div className="recipe-detail">
          <div className="recipe-grid" style={{ gridTemplateColumns: `repeat(${size}, 30px)` }}>
            {cells.map((id, i) => <Slot key={i} stack={id ? { id, count: 1 } : null} size={30} ghost onHover={onHover} />)}
          </div>
          <div className="recipe-arrow" />
          <Slot stack={{ id: selected.result.id, count: selected.result.count }} size={36} onHover={onHover} />
          <div className="recipe-reqs">
            <div className="recipe-name">{itemName(selected.result.id)}</div>
            {reqs.map((r) => (
              <div key={r.ing} className={'recipe-req' + (r.have < r.need ? ' missing' : '')}>
                <span>{itemName(r.sample)}{r.ing.startsWith('tag:') ? ' (any)' : ''}</span><span>{Math.min(r.have, r.need)}/{r.need}</span>
              </div>
            ))}
            <Btn small disabled={!craftable} onClick={() => place(selected)}>{craftable ? 'Craft' : 'Missing items'}</Btn>
          </div>
        </div>
      ) : <div className="recipe-hint">Select a recipe to see its layout and ingredients.</div>}
    </div>
  );
}

function FurnaceUI({ game, onHover }: { game: Game; onHover: (s: ItemStack | null, e?: React.MouseEvent) => void }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 200); return () => clearInterval(id); }, []);
  const c = game.openContainer, be = game.openEntity, out = game.furnaceOutputContainer();
  if (!c || !be || !out) return null;
  const input = be.items[0];
  const recipe = input ? SMELTING[input.id] : undefined;
  const burnPct = be.burnMax ? Math.max(0, Math.min(1, (be.burn ?? 0) / be.burnMax)) : 0;
  const cookPct = recipe ? Math.min(1, (be.cook ?? 0) / recipe.time) : 0;
  return (
    <div className="furnace-ui">
      <div className="furnace-left">
        <Slot stack={c.get(0)} onHover={onHover} drag={{ game, c, i: 0 }} onClick={(e) => game.slotClick(c, 0, 0, e.shiftKey)} onContext={(e) => game.slotClick(c, 0, 2, e.shiftKey)} />
        <div className="furnace-fire"><div className="furnace-fire-fill" style={{ height: `${burnPct * 100}%` }} /></div>
        <Slot stack={c.get(1)} onHover={onHover} drag={{ game, c, i: 1 }} onClick={(e) => game.slotClick(c, 1, 0, e.shiftKey)} onContext={(e) => game.slotClick(c, 1, 2, e.shiftKey)} />
      </div>
      <div className="furnace-arrow"><div className="furnace-arrow-fill" style={{ width: `${cookPct * 100}%` }} /></div>
      <Slot stack={out.get(0)} size={56} className="craft-out" onHover={onHover} drag={{ game, c: out, i: 0 }} onClick={(e) => game.slotClick(out, 0, 0, e.shiftKey)} onContext={(e) => game.slotClick(out, 0, 2, e.shiftKey)} />
    </div>
  );
}

function HearthUI({ game, onHover }: { game: Game; onHover: (s: ItemStack | null, e?: React.MouseEvent) => void }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 200); return () => clearInterval(id); }, []);
  const c = game.openContainer, be = game.openEntity, out = game.furnaceOutputContainer();
  if (!c || !be || !out) return null;
  const reagent = be.items[1];
  const recipe = reagent ? draughtFor(reagent.id) : undefined;
  const brewPct = recipe ? Math.min(1, (be.cook ?? 0) / BREW_SECONDS) : 0;
  return (
    <div className="furnace-ui hearth-ui">
      <div className="furnace-left">
        <div className="enchant-slot-wrap">
          <Slot stack={c.get(0)} onHover={onHover} drag={{ game, c, i: 0 }} onClick={(e) => game.slotClick(c, 0, 0, e.shiftKey)} onContext={(e) => game.slotClick(c, 0, 2, e.shiftKey)} />
          <span>Flask</span>
        </div>
        <div className="hearth-steep" />
        <div className="enchant-slot-wrap">
          <Slot stack={c.get(1)} onHover={onHover} drag={{ game, c, i: 1 }} onClick={(e) => game.slotClick(c, 1, 0, e.shiftKey)} onContext={(e) => game.slotClick(c, 1, 2, e.shiftKey)} />
          <span>Reagent</span>
        </div>
      </div>
      <div className="furnace-arrow"><div className="furnace-arrow-fill" style={{ width: `${brewPct * 100}%` }} /></div>
      <Slot stack={out.get(0)} size={56} className="craft-out" onHover={onHover} drag={{ game, c: out, i: 0 }} onClick={(e) => game.slotClick(out, 0, 0, e.shiftKey)} onContext={(e) => game.slotClick(out, 0, 2, e.shiftKey)} />
      {!recipe && <div className="menu-text hearth-hint">Add a flask and a reagent to steep a draught.</div>}
    </div>
  );
}

function MendingUI({ game, onHover }: { game: Game; onHover: (s: ItemStack | null, e?: React.MouseEvent) => void }) {
  useStore((st) => st.inv);
  const c = game.mendingContainer;
  const a = c.get(0), b = c.get(1);
  const level = game.player.level;
  const creative = game.player.mode === 'creative';
  const fusable = a && b ? canFuse(a, b) : false;
  const preview = fusable ? fuse(a!, b!) : null;
  const runes = a ? runesOn(a) : [];
  return (
    <div className="mending-ui">
      <div className="enchant-slots">
        <div className="enchant-slot-wrap">
          <Slot stack={a} size={52} onHover={onHover} drag={{ game, c, i: 0 }} onClick={(e) => game.slotClick(c, 0, 0, e.shiftKey)} onContext={(e) => game.slotClick(c, 0, 2, e.shiftKey)} />
          <span>Tool</span>
        </div>
        <div className="enchant-slot-wrap">
          <Slot stack={b} size={52} onHover={onHover} drag={{ game, c, i: 1 }} onClick={(e) => game.slotClick(c, 1, 0, e.shiftKey)} onContext={(e) => game.slotClick(c, 1, 2, e.shiftKey)} />
          <span>Second</span>
        </div>
      </div>
      <div className="enchant-options">
        {!a && <div className="menu-text">Place a worn tool or armour piece.</div>}
        {a && !b && runes.length === 0 && <div className="menu-text">Add a second of the same kind to fuse them, or place a runed tool to grind a rune off.</div>}
        {a && b && !fusable && <div className="menu-text">These two cannot be fused: they must be the same kind, and at least one must be worn.</div>}
        {fusable && preview && (
          <button className="enchant-opt" onClick={() => game.fuseTools()}>
            <span className="enchant-name">Fuse into one</span>
            <span className="enchant-cost">{preview.durability} durability</span>
          </button>
        )}
        {a && !b && runes.map((r) => {
          const afford = creative || level >= STRIP_COST;
          return (
            <button key={r} className={'enchant-opt' + (afford ? '' : ' enchant-locked')} disabled={!afford} onClick={() => game.stripRune(r)}>
              <span className="enchant-name">Grind off {ENCHANTMENTS[r]?.name ?? r}</span>
              <span className="enchant-cost">{STRIP_COST} lvl</span>
            </button>
          );
        })}
      </div>
      <div className="menu-text">Your level: {level}</div>
    </div>
  );
}

function AltarUI({ game, onHover }: { game: Game; onHover: (s: ItemStack | null, e?: React.MouseEvent) => void }) {
  const c = game.altarContainer;
  const item = c.get(0), dust = c.get(1);
  const options = item ? enchantsFor(item.id) : [];
  const level = game.player.level;
  const creative = game.player.mode === 'creative';
  return (
    <div className="altar-ui">
      <div className="enchant-slots">
        <div className="enchant-slot-wrap"><Slot stack={item} size={52} onHover={onHover} drag={{ game, c, i: 0 }} onClick={(e) => game.slotClick(c, 0, 0, e.shiftKey)} onContext={(e) => game.slotClick(c, 0, 2, e.shiftKey)} /><span>Item</span></div>
        <div className="enchant-slot-wrap"><Slot stack={dust} size={52} onHover={onHover} drag={{ game, c, i: 1 }} onClick={(e) => game.slotClick(c, 1, 0, e.shiftKey)} onContext={(e) => game.slotClick(c, 1, 2, e.shiftKey)} /><span>Ember Dust</span></div>
      </div>
      <div className="enchant-options">
        {!item && <div className="menu-text">Place a tool, weapon, bow or armor piece.</div>}
        {item && options.length === 0 && <div className="menu-text">This item cannot be enchanted.</div>}
        {item && options.map((name) => {
          const def = ENCHANTMENTS[name];
          const cur = item.ench?.[name] ?? 0;
          const next = cur + 1;
          if (next > def.max) return <div key={name} className="enchant-opt enchant-done"><span className="enchant-name">{def.name} {['I', 'II', 'III'][cur - 1]}</span><span className="enchant-cost">MAX</span></div>;
          const cost = next * 3 + (next - 1) * 2;
          const ok = creative || (level >= cost && dust?.id === 'ember_dust' && dust.count >= next);
          return (
            <button key={name} className={'enchant-opt' + (ok ? '' : ' enchant-locked')} disabled={!ok} onClick={() => game.enchant(name, next)} title={def.desc}>
              <span className="enchant-name">{def.name} {['I', 'II', 'III'][next - 1]}</span>
              <span className="enchant-cost">{cost} lvl · {next} dust</span>
            </button>
          );
        })}
      </div>
      <div className="menu-text">Your level: {level}</div>
    </div>
  );
}

function TradeUI({ game, onHover }: { game: Game; onHover: (s: ItemStack | null, e?: React.MouseEvent) => void }) {
  useStore((s) => s.inv);
  const inv = game.player.inventory.main;
  const prof = (game.tradeMob as any)?.tradeData?.profession ?? 0;
  return (
    <div className="trade-ui">
      <div className="trade-title">Keeper - {PROFESSION_NAMES[prof % PROFESSION_NAMES.length]}</div>
      <div className="trade-list">
        {game.trades.map((tr, i) => {
          const soldOut = tr.uses >= tr.maxUses;
          const afford = inv.count(tr.cost.id) >= tr.cost.count && (!tr.cost2 || inv.count(tr.cost2.id) >= tr.cost2.count);
          return (
            <div key={i} className={'trade-row' + (soldOut ? ' sold-out' : '') + (!afford && !soldOut ? ' trade-poor' : '')} onMouseDown={(e) => { e.preventDefault(); if (!soldOut && afford) game.doTrade(i); }}>
              <Slot stack={tr.cost} size={40} onHover={onHover} dim={inv.count(tr.cost.id) < tr.cost.count} />
              {tr.cost2 && <Slot stack={tr.cost2} size={40} onHover={onHover} dim={inv.count(tr.cost2.id) < tr.cost2.count} />}
              <div className="trade-arrow" />
              <Slot stack={tr.result} size={40} onHover={onHover} />
              <div className="trade-uses">{soldOut ? 'Sold out' : `${tr.maxUses - tr.uses} left`}</div>
            </div>
          );
        })}
        {game.trades.length === 0 && <div className="menu-text">The Keeper has nothing to offer.</div>}
      </div>
    </div>
  );
}

/** Tab strip icons for the creative catalogue: each tab shows a representative item. */
const CREATIVE_TAB_ICON: Record<Category, string> = { all: 'chest', building: 'stone_bricks', nature: 'oak_sapling', tools: 'iron_pickaxe', combat: 'crystal_sword', food: 'apple', misc: 'string' };

const HELP_LINES = [
  'Left click: take or place a whole stack.  Right click: take half / place one.',
  'Shift + click: move a stack between the hotbar, the inventory and open containers.',
  'Creative tabs: click an item to pick up one, right click for one more. Click outside the panel to drop the cursor stack.',
  'Number keys 1-9 select hotbar slots; the wheel scrolls through them. Q drops the held item.',
  'Armour goes in the four slots beside the player; a shield in the off-hand slot blocks while sneaking.',
  '2x2 crafting is always available here; a Crafting Table opens the 3x3 grid and the full recipe book.',
];

export function InventoryScreen({ game }: { game: Game }) {
  const overlay = useStore((s) => s.overlay);
  useStore((s) => s.inv);
  const [tab, setTab] = useState<Category>('all');
  const [search, setSearch] = useState('');
  const [help, setHelp] = useState(false);
  const [book, setBook] = useState(false);
  const { tip, pos, onHover } = useTooltip();
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const inv = game.player.inventory;
  const cursor = inv.cursor;
  const kind = overlay?.kind ?? 'inventory';
  const creative = game.player.mode === 'creative' && kind === 'inventory';
  const [creativeView, setCreativeView] = useState<'items' | 'inventory'>('items');
  // Minecraft-style drags + position-driven hover: window-level tracking of press-drag-release
  // across slots, for mouse AND touch. Every window mousemove feeds the CURRENT pointer position
  // into the slotDrag hover manager, which hit-tests the exact slot under the cursor (so the
  // highlight updates at every pointer position, at any speed - never gated on enter/leave or on
  // large movements). Touch taps act once on release and finger drags drop on the slot under the
  // finger (spread via right-drag stays mouse-only).
  useEffect(() => {
    const mv = (e: MouseEvent) => { pointerMoved(e.clientX, e.clientY); slotDragMove(e.clientX, e.clientY); };
    const up = (e: MouseEvent) => slotDragUpWindow(e);
    const leftWin = () => { pointerLeftWindow(); abortDragSafe(); };
    const pd = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && touchDown(e.clientX, e.clientY, e.shiftKey)) e.preventDefault();
    };
    const pm = (e: PointerEvent) => { if (e.pointerType === 'touch') touchMove(e.clientX, e.clientY); };
    const pu = (e: PointerEvent) => { if (e.pointerType === 'touch') touchUp(e.clientX, e.clientY); };
    // Pointer lock releases asynchronously after an overlay opens. Until it does, mouse events
    // still carry frozen locked-mode coordinates, so hover is held back (see pointerMoved) and
    // reset here the moment the lock actually clears.
    const plc = () => { if (!document.pointerLockElement) syncHoverAfterUnlock(); };
    document.addEventListener('pointerlockchange', plc);
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
    window.addEventListener('blur', leftWin);
    document.addEventListener('mouseleave', leftWin);
    window.addEventListener('pointerdown', pd, { passive: false });
    window.addEventListener('pointermove', pm);
    window.addEventListener('pointerup', pu);
    return () => {
      document.removeEventListener('pointerlockchange', plc);
      window.removeEventListener('mousemove', mv);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('blur', leftWin);
      document.removeEventListener('mouseleave', leftWin);
      window.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu);
      slotDragEnd();
      pointerLeftWindow();
    };
  }, []);
  // After every re-render, re-hit-test the last known pointer position (a re-render can replace
  // the DOM node under a resting cursor; without this the highlight could go stale until the next
  // pointer move). Done on the next animation frame so it never fights the render.
  useEffect(() => {
    const id = requestAnimationFrame(() => recheckHover());
    return () => cancelAnimationFrame(id);
  });

  const creativeItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Search matches the display name, the internal id, the category, and aliases derived from the
    // item's own data (tool kind, armour slot, food, fuel, placeability). So "pick", "diamond",
    // "tools", "iron_pickaxe", "weapon" and "fuel" all find sensible results.
    const aliases = (d: ItemDef): string => {
      const a: string[] = [category(d)];
      if (d.tool) { a.push(d.tool.kind, 'tool'); if (d.tool.kind === 'sword') a.push('weapon'); }
      if (d.armor) a.push('armor', 'armour', ['helmet', 'chestplate', 'leggings', 'boots'][d.armor.slot] ?? '');
      if (d.food) a.push('food', 'eat');
      if (d.fuel) a.push('fuel');
      if (d.block !== undefined && d.block > 0) a.push('block');
      if (d.type) a.push(d.type);
      return a.join(' ').toLowerCase();
    };
    const list = Array.from(ITEMS.values()).filter((d) => {
      if (tab !== 'all' && category(d) !== tab) return false;
      if (!q) return true;
      return d.name.toLowerCase().includes(q) || d.id.includes(q) || aliases(d).includes(q);
    });
    // exact/prefix name matches first so typing "iron" surfaces Iron Ingot before Iron Ore Block
    if (q) {
      const rank = (d: ItemDef): number => {
        const n = d.name.toLowerCase();
        return n === q ? 0 : n.startsWith(q) ? 1 : d.id.startsWith(q) ? 2 : n.includes(q) ? 3 : 4;
      };
      list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    }
    return list;
  }, [tab, search]);
  const tabLabel = CREATIVE_TABS.find((t) => t.id === tab)?.label ?? 'Items';

  const title = kind === 'chest' ? (game.openEntity?.type === 'barrel' ? 'Barrel' : 'Chest') : kind === 'furnace' ? 'Furnace' : kind === 'crafting' ? 'Crafting' : kind === 'mending' ? 'Mending Stone' : kind === 'hearth' ? 'Brewing Hearth' : kind === 'altar' ? 'Rune Altar' : kind === 'trade' ? 'Trading' : creative ? 'Creative' : 'Inventory';
  const close = (e: React.MouseEvent) => { e.preventDefault(); game.closeOverlay(); };

  const armorSlot = (i: number, size = 44) => (
    <Slot key={i} stack={inv.armor.get(i)} size={size} className={'armor-slot armor-' + i} onHover={onHover} drag={{ game, c: inv.armor, i }} onClick={(e) => game.slotClick(inv.armor, i, 0, e.shiftKey)} onContext={(e) => game.slotClick(inv.armor, i, 2, e.shiftKey)} />
  );
  const offhandSlot = (size = 44) => (
    <Slot stack={inv.offhand.get(0)} size={size} className="offhand-slot" onHover={onHover} drag={{ game, c: inv.offhand, i: 0 }} onClick={(e) => game.slotClick(inv.offhand, 0, 0, e.shiftKey)} onContext={(e) => game.slotClick(inv.offhand, 0, 2, e.shiftKey)} />
  );

  // armour column + player panel + 2x2 crafting; shared by the survival inventory and the creative "Survival inventory" tab
  const survivalTop = (opts: { extra?: React.ReactNode } = {}) => (
    <div className="inv-top inv-top-survival">
      <div className="armor-col">{[0, 1, 2, 3].map((i) => armorSlot(i))}</div>
      <div className="player-preview">
        <PlayerPreview game={game} />
      </div>
      <div className="craft-area">
        <div className="craft-row">
          <div className="slot-grid" style={{ gridTemplateColumns: 'repeat(2, 44px)' }}>
            {[0, 1, 3, 4].map((i) => <Slot key={i} stack={game.craftGrid.get(i)} onHover={onHover} drag={{ game, c: game.craftGrid, i }} onClick={(e) => game.slotClick(game.craftGrid, i, 0, e.shiftKey)} onContext={(e) => game.slotClick(game.craftGrid, i, 2, e.shiftKey)} />)}
          </div>
          <div className="craft-arrow" />
          <Slot stack={game.craftOutput.get(0)} className="craft-out" onHover={onHover} drag={{ game, c: game.craftOutput, i: 0 }} onClick={(e) => game.slotClick(game.craftOutput, 0, 0, e.shiftKey)} onContext={(e) => game.slotClick(game.craftOutput, 0, 2, e.shiftKey)} />
        </div>
        <div className="craft-under">
          {offhandSlot()}
          <button className={'book-btn' + (book ? ' active' : '')} title="Recipe book" aria-label="Recipe book" onMouseDown={(e) => { e.preventDefault(); setBook(!book); }} />
          {opts.extra}
        </div>
      </div>
    </div>
  );

  const helpPanel = help && (
    <div className="inv-help" onMouseDown={(e) => e.stopPropagation()}>
      <div className="inv-help-title">How the inventory works<button className="inv-close" onMouseDown={(e) => { e.preventDefault(); setHelp(false); }}>x</button></div>
      {HELP_LINES.map((l, i) => <div key={i} className="inv-help-line">{l}</div>)}
    </div>
  );

  // -------------------------------------------------------------- creative: tabbed catalogue
  if (creative) {
    return (
      <div className="inv-screen menu-dim" onMouseMove={(e) => setMouse({ x: e.clientX, y: e.clientY })} onMouseDown={(e) => { if (e.target === e.currentTarget && e.button === 0) game.dropCursor(); }} onContextMenu={(e) => e.preventDefault()}>
        <div className="creative-wrap">
          <div className="creative-tabbar">
            <div className="creative-tabs">
              {CREATIVE_TABS.map((t) => (
                <button key={t.id} className={'creative-tab' + (creativeView === 'items' && tab === t.id ? ' active' : '')} title={t.label} aria-label={t.label}
                  onMouseDown={(e) => { e.preventDefault(); setTab(t.id); setCreativeView('items'); }}>
                  <img src={itemIcon(CREATIVE_TAB_ICON[t.id])} alt="" draggable={false} />
                </button>
              ))}
            </div>
            <div className="creative-tabs creative-tabs-right">
              <button className={'creative-tab' + (creativeView === 'inventory' ? ' active' : '')} title="Survival inventory" aria-label="Survival inventory" onMouseDown={(e) => { e.preventDefault(); setCreativeView('inventory'); }}>
                <img src={itemIcon('chest')} alt="" draggable={false} />
              </button>
              <button className={'creative-tab creative-tab-text' + (help ? ' active' : '')} title="Help" aria-label="Help" onMouseDown={(e) => { e.preventDefault(); setHelp(!help); }}>?</button>
              <button className="creative-tab creative-tab-text" title="Close" aria-label="Close" onMouseDown={close}>x</button>
            </div>
          </div>
          <div className="inv-panel inv-creative">
            {creativeView === 'items' ? (
              <>
                <div className="creative-head">
                  <TextInput value={search} onChange={setSearch} placeholder="Search items" />
                  <span className="creative-cat">{search.trim() ? 'Search' : tabLabel}</span>
                </div>
                <div className="creative-list">
                  {creativeItems.map((d) => (
                    <Slot key={d.id} stack={{ id: d.id, count: 1 }} size={44} onHover={onHover} onClick={() => game.creativeTake(d.id, 0)} onContext={() => game.creativeTake(d.id, 2)} />
                  ))}
                  {creativeItems.length === 0 && <div className="menu-text creative-empty">No items match "{search}".</div>}
                </div>
              </>
            ) : (
              survivalTop({ extra: <Btn small danger className="clear-inv-btn" onClick={() => { for (let i = 0; i < inv.main.size; i++) inv.main.set(i, null); inv.armor.clear(); inv.offhand.clear(); for (let i = 0; i < 9; i++) game.craftGrid.set(i, null); store.bump(); }}>Clear inventory</Btn> })
            )}
            {creativeView === 'inventory' && (
              <div className="inv-main creative-main">
                <Grid game={game} container={inv.main} cols={9} from={9} count={27} onHover={onHover} />
              </div>
            )}
          </div>
          <div className="inv-panel inv-hotbar-panel">
            <Grid game={game} container={inv.main} cols={9} from={0} count={9} onHover={onHover} />
          </div>
          {helpPanel}
        </div>
        {creativeView === 'inventory' && book && <div className="inv-side"><RecipeBook game={game} onHover={onHover} size={2} /></div>}
        {cursor && (
          <div className="cursor-stack" style={{ left: mouse.x - 20, top: mouse.y - 20 }}>
            <Slot stack={cursor} size={40} className="slot-cursor" />
          </div>
        )}
        {!cursor && <Tooltip stack={tip} x={pos.x} y={pos.y} />}
      </div>
    );
  }

  // -------------------------------------------------------------- survival / containers
  return (
    <div className="inv-screen menu-dim" onMouseMove={(e) => setMouse({ x: e.clientX, y: e.clientY })} onMouseDown={(e) => { if (e.target === e.currentTarget && e.button === 0) game.dropCursor(); }} onContextMenu={(e) => e.preventDefault()}>
      <div className={'inv-panel inv-' + kind}>
        {kind !== 'inventory' && <div className="inv-title"><span className="inv-title-name">{title}</span><button className="inv-close" onMouseDown={close}>x</button></div>}
        {kind === 'inventory' && <div className="inv-title"><span className="inv-title-name">Inventory</span><button className="inv-close" onMouseDown={close} aria-label="Close">x</button></div>}

        {kind === 'inventory' && survivalTop()}

        {kind === 'crafting' && (
          <div className="inv-top center">
            <div className="craft-area big">
              <div className="craft-row">
                <Grid game={game} container={game.craftGrid} cols={3} onHover={onHover} />
                <div className="craft-arrow" />
                <Slot stack={game.craftOutput.get(0)} size={56} className="craft-out" onHover={onHover} drag={{ game, c: game.craftOutput, i: 0 }} onClick={(e) => game.slotClick(game.craftOutput, 0, 0, e.shiftKey)} onContext={(e) => game.slotClick(game.craftOutput, 0, 2, e.shiftKey)} />
              </div>
            </div>
            <RecipeBook game={game} onHover={onHover} size={3} />
          </div>
        )}

        {kind === 'chest' && game.openContainer && (
          <div className="inv-top center">
            <Grid game={game} container={game.openContainer} cols={9} onHover={onHover} />
          </div>
        )}

        {kind === 'furnace' && <div className="inv-top center"><FurnaceUI game={game} onHover={onHover} /></div>}
        {kind === 'altar' && <div className="inv-top center"><AltarUI game={game} onHover={onHover} /></div>}
        {kind === 'hearth' && <div className="inv-top center"><HearthUI game={game} onHover={onHover} /></div>}
        {kind === 'mending' && <div className="inv-top center"><MendingUI game={game} onHover={onHover} /></div>}
        {kind === 'trade' && <div className="inv-top center"><TradeUI game={game} onHover={onHover} /></div>}

        <div className="inv-main">
          <Grid game={game} container={inv.main} cols={9} from={9} count={27} onHover={onHover} />
        </div>
        <div className="inv-hotbar">
          <Grid game={game} container={inv.main} cols={9} from={0} count={9} onHover={onHover} />
        </div>
      </div>
      {kind === 'inventory' && book && <div className="inv-side"><RecipeBook game={game} onHover={onHover} size={2} /></div>}
      {cursor && (
        <div className="cursor-stack" style={{ left: mouse.x - 20, top: mouse.y - 20 }}>
          <Slot stack={cursor} size={40} className="slot-cursor" />
        </div>
      )}
      {!cursor && <Tooltip stack={tip} x={pos.x} y={pos.y} />}
    </div>
  );
}

export { itemDef };
