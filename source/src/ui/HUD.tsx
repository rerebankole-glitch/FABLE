import React, { useEffect, useRef, useState } from 'react';
import { store, useStore } from './store';
import { itemIcon } from '../game/items/Icons';
import { itemDef, maxDurability } from '../game/items/Items';
import type { ItemStack } from '../game/core/types';
import { Btn } from './components';
import { settings, t } from '../game/core/Settings';
import { Game } from '../game/core/Game';
import { deleteWorldAndQuit } from './session';
import { ENCHANTMENTS } from '../game/structures/Loot';
import { slotDragDown, slotDragHover, slotDragLeave, slotDragUp, registerSlot, unregisterSlot, cursorCanDrop, pointerMoved } from './slotDrag';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

export function itemName(id: string): string {
  return itemDef(id)?.name ?? id.replace(/_/g, ' ');
}

export function Slot({ stack, selected, onClick, onContext, size = 44, dim, highlight, className, onHover, ghost, drag }: {
  stack: ItemStack | null; selected?: boolean; onClick?: (e: React.MouseEvent) => void; onContext?: (e: React.MouseEvent) => void;
  size?: number; dim?: boolean; highlight?: boolean; className?: string; onHover?: (s: ItemStack | null, e?: React.MouseEvent) => void; ghost?: boolean;
  /** Enables Minecraft-style press-drag-release for this slot (carried stacks drop on release). */
  drag?: { game: import('../game/core/Game').Game; c: import('../game/inventory/Inventory').Container; i: number };
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  // Hover highlight: the slot under the mouse is ALWAYS lit while an inventory is open (like the
  // Java container slot cursor). The visual state is driven by the slotDrag hover manager, which
  // hit-tests the CURRENT pointer position on every window mousemove (registerSlot's onHover
  // callback) - never by mouseenter/mouseleave alone, which browsers can miss. While the cursor
  // carries a stack, the stronger "drop-ok" cue additionally shows when a click there would
  // place/merge/swap it (see cursorCanDrop).
  const [hov, setHov] = React.useState(false);
  React.useEffect(() => {
    if (!drag || !ref.current) return;
    const el = ref.current;
    registerSlot(el, drag.game, drag.c, drag.i, setHov);
    return () => unregisterSlot(el);
  }, [drag]);
  const url = stack ? itemIcon(stack.id) : null;
  const max = stack ? maxDurability(stack.id) : 0;
  const dur = stack && max > 0 && stack.durability !== undefined && stack.durability < max ? stack.durability / max : null;
  const ench = !!(stack?.ench && Object.keys(stack.ench).length > 0);
  const hovered = hov && !!drag;
  const dropOk = hovered && !!drag?.game.player.inventory.cursor && cursorCanDrop(drag.game, drag.c, drag.i);
  return (
    <div
      ref={ref}
      className={'slot' + (selected ? ' slot-selected' : '') + (dim ? ' slot-dim' : '') + (highlight ? ' slot-highlight' : '') + (hovered ? ' slot-hover' : '') + (dropOk ? ' slot-drop-ok' : '') + (className ? ' ' + className : '')}
      style={{ width: size, height: size }}
      onMouseDown={(e) => {
        if (e.button === 0) {
          e.preventDefault();
          // NOTE: never run the click action here. A real browser fires a native "click" right
          // after mouseup, so acting on mousedown made every left click act TWICE (pick up then
          // instantly put back) and the inventory felt dead. Drag-enabled slots act exactly once
          // in slotDragUp; plain slots act on the native click below.
          if (drag) slotDragDown(drag.game, drag.c, drag.i, 0, e.clientX, e.clientY, e.shiftKey);
        } else if (e.button === 2 && drag) {
          slotDragDown(drag.game, drag.c, drag.i, 2, e.clientX, e.clientY, e.shiftKey);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        // Drag-enabled slots act the right click on mouseup (so a right-drag does not split first);
        // plain slots act on the context-menu press.
        if (!drag) onContext?.(e);
      }}
      onClick={(e) => {
        // Plain (non-drag) slots act on the native click - exactly once per physical click.
        if (!drag) onClick?.(e);
      }}
      onMouseUp={(e) => {
        if (drag && (e.button === 0 || e.button === 2)) slotDragUp(drag.game, drag.c, drag.i, e.button as 0 | 2, e.shiftKey);
      }}
      onMouseEnter={(e) => { onHover?.(stack, e); if (drag) { pointerMoved(e.clientX, e.clientY); slotDragHover(drag.game, drag.c, drag.i); } }}
      onMouseMove={(e) => { onHover?.(stack, e); if (drag) { pointerMoved(e.clientX, e.clientY); slotDragHover(drag.game, drag.c, drag.i); } }}
      onMouseLeave={() => { onHover?.(null); if (drag) slotDragLeave(drag.c, drag.i); }}
    >
      {url && <img src={url} draggable={false} alt="" className={'slot-icon' + (ench ? ' slot-ench' : '') + (ghost ? ' slot-ghost' : '')} style={{ width: size * 0.72, height: size * 0.72 }} />}
      {stack && stack.count > 1 && <span className="slot-count">{stack.count}</span>}
      {dur !== null && (
        <div className="slot-dur"><div className="slot-dur-fill" style={{ width: `${Math.max(0, dur) * 100}%`, background: dur > 0.5 ? '#4c4' : dur > 0.25 ? '#cc4' : '#c44' }} /></div>
      )}
    </div>
  );
}

export interface TooltipLine { text: string; kind?: 'ench' | 'stat' | 'desc' | 'muted' }

const TIER_NAMES = ['', 'Wood', 'Stone', 'Iron', 'Crystal'];

/** Builds the structured tooltip for an item stack: title + typed lines (used by the inventory and the hotbar). */
/** Human-readable category shown under the item name. */
function itemCategory(def: ReturnType<typeof itemDef>): string {
  if (!def) return 'Item';
  if (def.tool) return def.tool.kind === 'sword' ? 'Weapon' : 'Tool';
  if (def.armor) return 'Armor';
  if (def.food) return 'Food';
  if (def.type === 'block') return 'Block';
  if (def.type === 'bow') return 'Weapon';
  if (def.type === 'shield') return 'Armor';
  if (def.type === 'material') return 'Material';
  return 'Item';
}

/**
 * One short "what is this for" line. Derived from the item's own data (tool kind, food, armour
 * slot, fuel, placeability) rather than a hand-written table, so every current and future item
 * gets a sensible use line automatically.
 */
function itemUse(def: ReturnType<typeof itemDef>): string | null {
  if (!def) return null;
  if (def.desc) return def.desc;
  if (def.tool) {
    switch (def.tool.kind) {
      case 'pickaxe': return 'Mines stone, ores and other hard blocks.';
      case 'axe': return 'Chops wood quickly. Also a solid weapon.';
      case 'shovel': return 'Digs dirt, sand, gravel and snow.';
      case 'hoe': return 'Tills ground into farmland for crops.';
      case 'sword': return 'A weapon. Deals heavy damage in melee.';
      default: return null;
    }
  }
  if (def.armor) return ['Worn on the head.', 'Worn on the body.', 'Worn on the legs.', 'Worn on the feet.'][def.armor.slot] ?? 'Wearable armour.';
  if (def.food) return 'Eat to restore hunger.';
  if (def.type === 'bow') return 'Hold to draw, release to fire an arrow.';
  if (def.type === 'shield') return 'Sneak to raise and block incoming damage.';
  if (def.block !== undefined && def.block > 0) return 'Place in the world.';
  if (def.fuel) return 'Burns as furnace fuel.';
  return null;
}

export function tooltipLines(stack: ItemStack): { title: string; lines: TooltipLine[] } {
  const def = itemDef(stack.id);
  const lines: TooltipLine[] = [];
  lines.push({ text: itemCategory(def), kind: 'muted' });
  if (stack.ench) for (const k in stack.ench) lines.push({ text: `${ENCHANTMENTS[k]?.name ?? k.replace(/_/g, ' ')} ${ROMAN[stack.ench[k] - 1] ?? stack.ench[k]}`, kind: 'ench' });
  if (def?.tool) {
    const digs = def.tool.kind !== 'sword' && def.tool.kind !== 'none';
    if (def.tool.damage > 1) lines.push({ text: `Damage: ${def.tool.damage}`, kind: 'stat' });
    if (digs) lines.push({ text: `Mining speed: ${def.tool.speed}x`, kind: 'stat' });
    if (digs && def.tool.tier > 0) lines.push({ text: `Tier: ${TIER_NAMES[def.tool.tier] ?? def.tool.tier}`, kind: 'stat' });
  }
  if (def?.armor) lines.push({ text: `Armor: +${def.armor.defense}`, kind: 'stat' });
  if (def?.food) lines.push({ text: `Hunger: +${def.food.hunger}`, kind: 'stat' });
  const max = maxDurability(stack.id);
  if (max > 0) lines.push({ text: `Durability: ${stack.durability ?? max} / ${max}`, kind: 'stat' });
  if (def && def.maxStack > 1) lines.push({ text: `Stacks to ${def.maxStack}`, kind: 'muted' });
  const use = itemUse(def);
  if (use) lines.push({ text: use, kind: 'desc' });
  if (stack.count > 1) lines.push({ text: `x${stack.count}`, kind: 'muted' });
  return { title: def?.name ?? stack.id, lines };
}

export function Tooltip({ stack, x, y }: { stack: ItemStack | null; x: number; y: number }) {
  if (!stack) return null;
  const { title, lines } = tooltipLines(stack);
  const left = Math.min(x + 14, window.innerWidth - 230);
  return (
    <div className="tooltip" style={{ left, top: Math.min(y + 14, window.innerHeight - 60 - lines.length * 16) }}>
      <div className={'tooltip-title' + (stack.ench ? ' tooltip-ench' : '')}>{title}</div>
      {lines.map((l, i) => <div key={i} className={'tooltip-line' + (l.kind ? ' tooltip-' + l.kind : '')}>{l.text}</div>)}
    </div>
  );
}

/** Nameplate + health bar for the mob under the crosshair. */
function TargetPlate({ target }: { target: { name: string; hp: number; hostile: boolean } | null }) {
  if (!target) return null;
  return (
    <div className={'target-plate' + (target.hostile ? ' hostile' : '')}>
      <div className="target-name">{target.name}</div>
      <div className="target-track"><div className="target-fill" style={{ width: `${Math.round(target.hp * 100)}%` }} /></div>
    </div>
  );
}

function SaveIndicator({ saving, savedAt, now }: { saving: boolean; savedAt: number; now: number }) {
  if (saving) return <div className="save-indicator">Saving...</div>;
  if (savedAt && now - savedAt < 2500) return <div className="save-indicator saved">World saved</div>;
  return null;
}

interface PipFx { idx: number; kind: 'dmg' | 'heal' | 'loss' | 'gain'; at: number }

/** Which pip indices changed value between two readings (drives the flash/pop animations). */
function changedPips(before: number, after: number, count: number, rightToLeft = false): number[] {
  const state = (v: number, i: number) => { const x = v - i * 2; return x >= 2 ? 2 : x >= 1 ? 1 : 0; };
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = rightToLeft ? state(before, count - 1 - i) : state(before, i);
    const b = rightToLeft ? state(after, count - 1 - i) : state(after, i);
    if (a !== b) out.push(i);
  }
  return out;
}

function Hearts({ health, max, hurt, hardcore, motion }: { health: number; max: number; hurt: number; hardcore: boolean; motion: boolean }) {
  const n = Math.ceil(max / 2);
  const [fx, setFx] = useState<PipFx[]>([]);
  const prev = useRef(health);
  useEffect(() => {
    if (health === prev.current) return;
    const kind = health < prev.current ? 'dmg' : 'heal';
    const idxs = motion ? changedPips(prev.current, health, n) : [];
    prev.current = health;
    if (!idxs.length) return;
    const at = performance.now();
    setFx(idxs.map((idx) => ({ idx, kind, at })));
    const t = setTimeout(() => setFx([]), 480);
    return () => clearTimeout(t);
  }, [health, n, motion]);
  const critical = health <= 4 && health > 0;
  return (
    <div className={'hud-row hearts' + (hardcore ? ' hardcore-hearts' : '') + (hurt > 0 ? ' shake' : '') + (critical ? ' critical' : '')}>
      {Array.from({ length: n }, (_, i) => {
        const v = health - i * 2;
        const cls = v >= 2 ? 'full' : v >= 1 ? 'half' : 'empty';
        const f = fx.find((x) => x.idx === i);
        // the timestamp in the key remounts the pip so the CSS animation restarts on every change
        return <span key={i + ':' + (f ? f.at : 0)} className={'heart ' + cls + (critical ? ' low' : '') + (f ? ' anim-' + f.kind : '')} />;
      })}
    </div>
  );
}

function Hunger({ hunger, motion }: { hunger: number; motion: boolean }) {
  const [fx, setFx] = useState<PipFx[]>([]);
  const prev = useRef(hunger);
  useEffect(() => {
    if (hunger === prev.current) return;
    const kind = hunger < prev.current ? 'loss' : 'gain';
    const idxs = motion ? changedPips(prev.current, hunger, 10, true) : [];
    prev.current = hunger;
    if (!idxs.length) return;
    const at = performance.now();
    setFx(idxs.map((idx) => ({ idx, kind, at })));
    const t = setTimeout(() => setFx([]), 480);
    return () => clearTimeout(t);
  }, [hunger, motion]);
  const critical = hunger <= 2;
  return (
    <div className={'hud-row hunger' + (critical ? ' critical' : '')}>
      {Array.from({ length: 10 }, (_, i) => {
        const v = hunger - (9 - i) * 2;
        const cls = v >= 2 ? 'full' : v >= 1 ? 'half' : 'empty';
        const f = fx.find((x) => x.idx === i);
        return <span key={i + ':' + (f ? f.at : 0)} className={'drum ' + cls + (f ? ' anim-' + f.kind : '')} />;
      })}
    </div>
  );
}

/**
 * XP bar with a smooth fill: the displayed fraction eases towards the real one over a few frames
 * (rAF writes the width directly, so there is no re-render storm). Crossing a level boundary plays
 * the other direction: the bar races to full, flashes, the level number pops, and the leftover XP
 * carries into the new level as a fresh fill from zero. `motion=false` snaps everything instantly.
 */
function XpBar({ xp, level, motion }: { xp: number; level: number; motion: boolean }) {
  const fillRef = useRef<HTMLDivElement>(null);
  const shown = useRef({ level, frac: xp });
  const [dispLevel, setDispLevel] = useState(level);
  const [fxAt, setFxAt] = useState(0);
  useEffect(() => {
    const target = { level, frac: Math.min(1, xp) };
    if (!motion) {
      shown.current = { ...target };
      setDispLevel(target.level);
      if (fillRef.current) fillRef.current.style.width = `${target.frac * 100}%`;
      return;
    }
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const cur = shown.current;
      if (target.level > cur.level) {
        // finish the current level first: race to full at a speed that lands quickly on any gain size
        cur.frac = Math.min(1, cur.frac + dt * Math.max(1.6, (1 - cur.frac) * 4));
        if (cur.frac >= 1) {
          // restart the CSS flash without a remount (see the note on the return block)
          const bar = fillRef.current?.parentElement;
          if (bar) { bar.classList.remove('xp-flash'); void bar.offsetWidth; bar.classList.add('xp-flash'); }
          setFxAt(now);
          cur.level += 1;
          cur.frac = 0;
          setDispLevel(cur.level);
        }
      } else {
        if (target.level < cur.level) { cur.level = target.level; cur.frac = 0; setDispLevel(cur.level); }
        // exponential catch-up with a speed floor: small gains feel smooth, huge gains still arrive fast
        const speed = Math.max(0.45, Math.abs(target.frac - cur.frac) * 6);
        const dir = Math.sign(target.frac - cur.frac);
        if (dir !== 0) cur.frac = Math.max(0, Math.min(1, cur.frac + dir * speed * dt));
        if (Math.abs(target.frac - cur.frac) < 0.004) cur.frac = target.frac;
      }
      if (fillRef.current) fillRef.current.style.width = `${cur.frac * 100}%`;
      if (cur.frac !== target.frac || cur.level !== target.level) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [xp, level, motion]);
  // NOTE: the level-up flash must NOT be keyed on the bar itself. `key` on this element made
  // setFxAt() (called from inside the rAF loop) unmount and remount the whole bar mid-animation,
  // which swapped fillRef.current for a fresh node -- the still-running rAF then wrote its width
  // to a detached element, so the fill visibly froze part-way through every level-up. The flash
  // class is re-triggered by restarting the CSS animation on the inner element instead, which
  // leaves the ref-carrying node mounted for the whole animation.
  return (
    <div className={'xp-bar' + (fxAt ? ' xp-flash' : '')}>
      <div className="xp-track" />
      <div className="xp-fill" ref={fillRef} style={{ width: `${Math.min(1, xp) * 100}%` }} />
      {dispLevel > 0 && <div className={'xp-level' + (fxAt ? ' xp-level-pop' : '')} key={'lv' + fxAt}>{dispLevel}</div>}
    </div>
  );
}

function Armor({ armor }: { armor: number }) {
  if (armor <= 0) return null;
  return (
    <div className="hud-row armor">
      {Array.from({ length: 10 }, (_, i) => {
        const v = armor - i * 2;
        const cls = v >= 2 ? 'full' : v >= 1 ? 'half' : 'empty';
        return <span key={i} className={'armor-icon ' + cls} />;
      })}
    </div>
  );
}

function Air({ air }: { air: number }) {
  if (air >= 300) return null;
  const bubbles = Math.ceil((air / 300) * 10);
  return (
    <div className="hud-row air">
      {Array.from({ length: 10 }, (_, i) => <span key={i} className={'bubble ' + (i < 10 - bubbles ? 'pop' : 'full')} />)}
    </div>
  );
}

/** Hotbar reads the live inventory from the game (re-rendered on every inventory bump). */
function Hotbar({ game, selected }: { game: Game; selected: number }) {
  useStore((s) => s.inv);
  const main = game.player.inventory.main;
  return (
    <div className="hotbar">
      {Array.from({ length: 9 }, (_, i) => <Slot key={i} stack={main.get(i)} selected={i === selected} size={40} onClick={() => game.selectSlot(i)} />)}
    </div>
  );
}

function useClock(interval: number): number {
  const [, force] = useState(0);
  useEffect(() => { const id = setInterval(() => force((n) => n + 1), interval); return () => clearInterval(id); }, [interval]);
  return performance.now();
}

export function HUD({ game }: { game: Game }) {
  const hud = useStore((s) => s.hud);
  const debug = useStore((s) => s.debug);
  const overlay = useStore((s) => s.overlay);
  const chatOpen = useStore((s) => s.chatOpen);
  const chat = useStore((s) => s.chat);
  const messages = useStore((s) => s.messages);
  const paused = useStore((s) => s.paused);
  const mobile = useStore((s) => s.mobile);
  const inv = useStore((s) => s.inv);
  const popups = useStore((s) => s.popups);
  const [chatText, setChatText] = useState('');
  const chatRef = useRef<HTMLInputElement>(null);
  const now = useClock(500);
  const survival = hud.mode === 'survival' || hud.mode === 'hardcore';
  const [heldName, setHeldName] = useState<{ text: string; at: number }>({ text: '', at: 0 });

  useEffect(() => { if (chatOpen) setTimeout(() => chatRef.current?.focus(), 10); }, [chatOpen]);
  const heldId = game.player.inventory.main.get(hud.selected)?.id ?? '';
  useEffect(() => { setHeldName({ text: heldId ? itemName(heldId) : '', at: performance.now() }); }, [heldId, hud.selected, inv]);

  const lastMsgId = messages.length ? messages[messages.length - 1].id : -1;
  // action messages (yellow, centred) are also kept in the chat log for history, but while one is on screen do not show it twice
  const recentChat = (chatOpen ? chat.slice(-12) : chat.filter((m) => now - m.time < 10000).slice(-6)).filter((m) => chatOpen || m.id !== lastMsgId || now - m.time >= 3000);
  const msg = messages.length ? messages[messages.length - 1] : null;
  const showMsg = msg && now - msg.time < 3000;
  const showHeld = !showMsg && settings.value.heldItemTooltips && heldName.text && now - heldName.at < 2500;

  return (
    <div className="hud">
      {hud.underwater && <div className="overlay-water" />}
      {hud.effects.includes('burning') && <div className="overlay-fire" />}
      {hud.hurt > 0 && settings.value.damageTint && <div className={`overlay-hurt cause-${hud.hurtCause}`} style={{ opacity: Math.min(0.6, hud.hurt) }} />}
      {hud.portal > 0 && <div className="overlay-portal" style={{ opacity: hud.portal * 0.85 }} />}
      {hud.sleeping > 0 && <div className="overlay-sleep" style={{ opacity: hud.sleeping }} />}
      {hud.bladePrompt && !overlay && !chatOpen && !paused && (
        <div className="blade-prompt">{mobile ? 'Tap Use' : 'Right click'} to pull the Ancient Blade free</div>
      )}
      {!overlay && !chatOpen && !paused && !mobile && <div className={'crosshair crosshair-' + settings.value.crosshairStyle} style={{ ['--ch-size' as any]: settings.value.crosshairSize, ['--ch-color' as any]: settings.value.crosshairColor, opacity: settings.value.crosshairOpacity }} />}
      {hud.bossName && (
        <div className="boss-bar">
          <div className="boss-name">{hud.bossName}</div>
          <div className="boss-track"><div className="boss-fill" style={{ width: `${hud.bossHp * 100}%` }} /></div>
        </div>
      )}
      {debug && <div className="debug">{debug.split('\n').map((l, i) => <div key={i}>{l}</div>)}</div>}
      {!debug && hud.coords && <div className="coords">{hud.coords}</div>}
      <SaveIndicator saving={hud.saving} savedAt={hud.savedAt} now={now} />
      {!overlay && !paused && <TargetPlate target={hud.target} />}
      {popups.map((p, i) => <div key={i} className={'dmg-popup' + (p.text.startsWith('*') ? ' crit' : '')} style={{ left: p.x, top: p.y, opacity: p.a }}>{p.text.replace('*', '')}</div>)}
      {hud.effects.length > 0 && (
        <div className="effects">
          {hud.effects.map((e) => <div key={e} className={'effect effect-' + e}>{e}</div>)}
        </div>
      )}
      <div className={'chat-box' + (chatOpen ? ' chat-open' : '')}>
        {recentChat.map((m) => <div key={m.id} className="chat-line" style={{ opacity: chatOpen ? 1 : Math.min(1, (10000 - (now - m.time)) / 1500) }}>{m.text}</div>)}
      </div>
      {chatOpen && (
        <form className="chat-input-wrap" onSubmit={(e) => { e.preventDefault(); const text = chatText; setChatText(''); game.chat(text); }}>
          <input ref={chatRef} className="chat-input" value={chatText} onChange={(e) => setChatText(e.target.value)} autoComplete="off" spellCheck={false}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') { setChatText(''); game.chat(''); } }} onKeyUp={(e) => e.stopPropagation()} placeholder="Type a message or /command" />
        </form>
      )}
      <div className="hud-bottom" style={{ opacity: settings.value.hudOpacity, ['--hud-scale' as any]: settings.value.hudScale }}>
        {showMsg && <div className="action-text">{msg!.text}</div>}
        {showHeld && <div className="held-name">{heldName.text}</div>}
        {survival && (
          <div className="status-bars">
            <div className="status-left">
              <Armor armor={hud.armor} />
              <Hearts health={hud.health} max={hud.maxHealth} hurt={hud.hurt} hardcore={hud.hardcore} motion={settings.value.motionEffects && !settings.value.reducedFlashing} />
            </div>
            <div className="status-right">
              <Air air={hud.air} />
              <Hunger hunger={hud.hunger} motion={settings.value.motionEffects && !settings.value.reducedFlashing} />
            </div>
          </div>
        )}
        {survival && <XpBar xp={hud.xp} level={hud.level} motion={settings.value.motionEffects && !settings.value.reducedFlashing} />}
        <Hotbar game={game} selected={hud.selected} />
      </div>
    </div>
  );
}

export function PauseMenu({ game, onQuit }: { game: Game; onQuit: () => void }) {
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [saved, setSaved] = useState(false);
  const online = game.transport.connected;
  const quitLabel = online ? t('disconnect') : t('exit_menu');
  return (
    <div className="menu-screen menu-dim pause-menu">
      <div className="menu-center">
        <h2 className="menu-title">{t('game_menu')}</h2>
        <div className="menu-list">
          {game.fatalError && <p role="alert" className="menu-text menu-text-red">The game paused after an error. Return to the title screen; your world will be saved if possible.</p>}
          <Btn disabled={game.fatalError} onClick={() => game.resume()}>{t('resume')}</Btn>
          {game.fatalError && <Btn onClick={onQuit}>{quitLabel}</Btn>}
          <div className="menu-row">
            <Btn onClick={() => store.goto('settings')}>{t('options')}</Btn>
            {!online
              ? <Btn onClick={() => { game.saveWorld().then(() => { setSaved(true); setTimeout(() => setSaved(false), 1500); }); }}>{saved ? t('saved') : t('save')}</Btn>
              : <Btn disabled>{`${game.remotePlayers.size + 1} online`}</Btn>}
          </div>
          {!game.fatalError && !confirmQuit && <Btn onClick={() => setConfirmQuit(true)}>{quitLabel}</Btn>}
          {confirmQuit && <div className="menu-row"><Btn danger onClick={onQuit}>{quitLabel}</Btn><Btn onClick={() => setConfirmQuit(false)}>{t('cancel')}</Btn></div>}
        </div>
        <div className="menu-footer">
          <span>{online ? `Connected to ${game.options.name}` : `Seed: ${game.options.seed}`}</span>
          <span>Day {game.day + 1}</span>
        </div>
      </div>
    </div>
  );
}

export function DeathScreen({ game, onQuit }: { game: Game; onQuit: () => void }) {
  const deathMessage = useStore((s) => s.deathMessage);
  const hud = useStore((s) => s.hud);
  const hardcore = hud.hardcore || game.options.mode === 'hardcore';
  return (
    <div className="menu-screen death-screen">
      <div className="menu-center">
        <h1 className="menu-title death-title">{hardcore ? t('game_over') : t('you_died')}</h1>
        <p className="menu-text">{deathMessage}</p>
        <p className="menu-text">Score: {hud.level * 10}</p>
        {hardcore && <p className="menu-text menu-text-red">{t('hardcore_hint')}</p>}
        <div className="menu-list">
          {!hardcore && <Btn onClick={() => game.respawn()}>{t('respawn')}</Btn>}
          {!hardcore && <Btn onClick={onQuit}>{t('main_menu')}</Btn>}
          {hardcore && <Btn danger onClick={() => { void deleteWorldAndQuit(); }}>{t('delete_world')}</Btn>}
        </div>
      </div>
    </div>
  );
}

const TIPS = [
  'Torches keep hostile creatures from spawning nearby.',
  'Hold Ctrl (or double-tap W) to sprint; Shift sneaks.',
  'Keepers in villages trade for emeralds and food.',
  'Cave crawlers climb: light your tunnels.',
  'Crops grow faster next to water.',
  'Press F3 for coordinates, biome and performance.',
  'Falling sand and gravel can be dug out from below.',
  'Beds set your spawn point and skip the night.',
  'Stone Guardians drop sky crystals: the key to the Void portal.',
  'A crafting table unlocks the full 3x3 recipe grid.',
];

export function LoadingScreen() {
  const loading = useStore((s) => s.loading);
  const worldName = useStore((s) => s.worldName);
  const now = useClock(400);
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  return (
    <div className="menu-screen dirt-bg loading-screen">
      <div className="menu-center">
        <h2 className="menu-title">{worldName || t('loading')}</h2>
        <p className="menu-text">{(loading.stage || t('loading')).replace(/\.{3}$/, '')}{'.'.repeat(1 + (Math.floor(now / 400) % 3))}</p>
        <div className="progress"><div className="progress-fill" style={{ width: `${Math.round(Math.min(1, loading.progress) * 100)}%` }} /></div>
        <p className="menu-text small muted">{loading.detail || `${Math.round(Math.min(1, loading.progress) * 100)}%`}</p>
        <p className="loading-tip">{tip}</p>
      </div>
    </div>
  );
}
