import React, { useState } from 'react';
import { cn } from '../lib/cn';
import { audio } from '../game/audio/Audio';

export function Btn({ children, onClick, disabled, className, small, danger, title, 'aria-label': ariaLabel }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; className?: string; small?: boolean; danger?: boolean; title?: string; 'aria-label'?: string }) {
  return (
    <button
      className={cn('mc-btn', small && 'mc-btn-small', danger && 'mc-btn-danger', className)}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      // Unlock the audio context on the way down rather than in the click handler: the very first
      // press then plays its click instead of only waking the mixer, and nothing UI-ish runs before
      // the action itself. (Also: do NOT preventDefault a mousedown here - on touch and pen that
      // suppresses the follow-up click, which is what made menu buttons need two taps.)
      onPointerDown={() => { if (!disabled) audio.init(); }}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        try { audio.play('click', { volume: 0.5 }); } catch { /* audio must never swallow the click */ }
        onClick?.();
      }}
    >
      <span className="mc-btn-inner">{children}</span>
    </button>
  );
}


export function Slider({ label, value, min, max, step = 1, onChange, format }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="mc-slider" style={{ ['--pct' as any]: pct + '%' }}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <div className="mc-slider-label">{label}: {format ? format(value) : value}</div>
    </div>
  );
}

export function Toggle({ label, value, onChange, on = 'ON', off = 'OFF' }: { label: string; value: boolean; onChange: (v: boolean) => void; on?: string; off?: string }) {
  return <Btn onClick={() => onChange(!value)}>{label}: {value ? on : off}</Btn>;
}

export function Cycle<T extends string>({ label, value, options, labels, onChange }: { label: string; value: T; options: readonly T[]; labels?: Record<string, string>; onChange: (v: T) => void }) {
  const idx = options.indexOf(value);
  const next = options[(idx + 1) % options.length];
  return <Btn onClick={() => onChange(next)}>{label}: {labels ? labels[value] ?? value : value}</Btn>;
}

export function TextInput({ value, onChange, placeholder, label, maxLength, autoFocus, onEnter }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string; maxLength?: number; autoFocus?: boolean; onEnter?: () => void }) {
  return (
    <label className="mc-input-wrap">
      {label && <span className="mc-input-label">{label}</span>}
      <input
        className="mc-input"
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') onEnter?.(); }}
        onKeyUp={(e) => e.stopPropagation()}
        spellCheck={false}
      />
    </label>
  );
}

export function Confirm({ title, text, onYes, onNo, yes = 'Yes', no = 'No' }: { title: string; text?: string; onYes: () => void; onNo: () => void; yes?: string; no?: string }) {
  return (
    <div className="menu-screen dirt-bg">
      <div className="menu-center">
        <h2 className="menu-title">{title}</h2>
        {text && <p className="menu-text">{text}</p>}
        <div className="menu-row">
          <Btn onClick={onYes} danger>{yes}</Btn>
          <Btn onClick={onNo}>{no}</Btn>
        </div>
      </div>
    </div>
  );
}


