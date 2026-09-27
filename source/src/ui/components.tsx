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
      onClick={(e) => { e.stopPropagation(); if (disabled) return; audio.init(); audio.play('click', { volume: 0.5 }); onClick?.(); }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <span className="mc-btn-inner">{children}</span>
    </button>
  );
}

export function Panel({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <div className={cn('mc-panel', className)}>
      {title && <div className="mc-panel-title">{title}</div>}
      {children}
    </div>
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

export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="mc-tabs">
      {tabs.map((t) => (
        <button key={t.id} className={cn('mc-tab', active === t.id && 'mc-tab-active')} onClick={() => onChange(t.id)}>{t.label}</button>
      ))}
    </div>
  );
}

export function useForceUpdate(): () => void {
  const [, set] = useState(0);
  return () => set((n) => n + 1);
}
