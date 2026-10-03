import React, { useEffect, useRef, useState } from 'react';
import { store, useStore } from './store';
import { Game } from '../game/core/Game';

/**
 * Touch controls: left joystick to move, drag on the right to look,
 * tap to use / place, hold to mine, plus jump / sneak / sprint buttons.
 */
export function MobileControls({ game }: { game: Game }) {
  const overlay = useStore((s) => s.overlay);
  const paused = useStore((s) => s.paused);
  const dead = useStore((s) => s.dead);
  const chatOpen = useStore((s) => s.chatOpen);
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false });
  const [mining, setMining] = useState(false);
  const lookId = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });
  const joyId = useRef<number | null>(null);
  const joyOrigin = useRef({ x: 0, y: 0 });
  const holdTimer = useRef<number | null>(null);
  const tapStart = useRef(0);
  const moved = useRef(false);
  const lookRef = useRef<HTMLDivElement>(null);
  const hidden = !!overlay || paused || dead || chatOpen;

  useEffect(() => {
    const el = lookRef.current;
    if (!el || hidden) return;
    const down = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (lookId.current === null) {
          lookId.current = t.identifier;
          lookLast.current = { x: t.clientX, y: t.clientY };
          tapStart.current = performance.now();
          moved.current = false;
          holdTimer.current = window.setTimeout(() => { if (!moved.current) { game.mobileAction('mine', true); setMining(true); } }, 200);
        }
      }
      e.preventDefault();
    };
    const move = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === lookId.current) {
          const dx = t.clientX - lookLast.current.x, dy = t.clientY - lookLast.current.y;
          if (Math.abs(dx) + Math.abs(dy) > 8 && !mining) moved.current = true;
          lookLast.current = { x: t.clientX, y: t.clientY };
          game.look(dx * 2.2, dy * 2.2);
        }
      }
      e.preventDefault();
    };
    const up = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === lookId.current) {
          lookId.current = null;
          if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
          const dt = performance.now() - tapStart.current;
          if (!moved.current && dt < 200) { game.mobileAction('use', true); setTimeout(() => game.mobileAction('use', false), 50); }
          game.mobileAction('mine', false);
          setMining(false);
        }
      }
    };
    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', up);
    el.addEventListener('touchcancel', up);
    return () => {
      el.removeEventListener('touchstart', down); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', up); el.removeEventListener('touchcancel', up);
      game.mobileAction('mine', false);
    };
  }, [game, hidden, mining]);

  useEffect(() => () => { game.setMobileMove(0, 0); }, [game]);

  if (hidden) return null;

  const joyStart = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    joyId.current = t.identifier;
    joyOrigin.current = { x: t.clientX, y: t.clientY };
    setKnob({ x: 0, y: 0, active: true });
  };
  const joyMove = (e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== joyId.current) continue;
      let dx = t.clientX - joyOrigin.current.x, dy = t.clientY - joyOrigin.current.y;
      const len = Math.hypot(dx, dy);
      const max = 50;
      if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
      setKnob({ x: dx, y: dy, active: true });
      // moveZ negative = forward; sprint when pushed all the way forward
      game.setMobileMove(dx / max, dy / max);
      game.mobileAction('sprint', dy < -max * 0.92);
    }
  };
  const joyEnd = () => { joyId.current = null; setKnob({ x: 0, y: 0, active: false }); game.setMobileMove(0, 0); game.mobileAction('sprint', false); };

  // React registers touch handlers as passive listeners, so no preventDefault here; `touch-action: none` on <body> stops scrolling/zooming instead.
  const btn = (label: string, down: () => void, up?: () => void, cls = '') => (
    <button className={'touch-btn ' + cls} onTouchStart={down} onTouchEnd={() => up?.()} onTouchCancel={() => up?.()} onContextMenu={(e) => e.preventDefault()}>{label}</button>
  );

  return (
    <div className="mobile-controls">
      <div ref={lookRef} className={'touch-look' + (mining ? ' touch-mining' : '')} />
      <div className="joystick" onTouchStart={joyStart} onTouchMove={joyMove} onTouchEnd={joyEnd} onTouchCancel={joyEnd}>
        <div className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)`, opacity: knob.active ? 1 : 0.6 }} />
      </div>
      <div className="touch-right">
        {btn('▲', () => game.mobileAction('jump', true), () => game.mobileAction('jump', false), 'touch-jump')}
        {btn('▼', () => game.mobileAction('sneak', true), () => game.mobileAction('sneak', false), 'touch-sneak')}
        {btn('MINE', () => game.mobileAction('mine', true), () => game.mobileAction('mine', false), 'touch-mine')}
      </div>
      <div className="touch-top">
        {btn('||', () => game.pause(), undefined, 'touch-pause')}
        {btn('INV', () => game.openOverlay({ kind: 'inventory' }), undefined, 'touch-inv')}
        {btn('CHAT', () => store.set({ chatOpen: true }), undefined, 'touch-chat')}
      </div>
    </div>
  );
}
