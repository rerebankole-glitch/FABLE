import React from 'react';

type Name = 'skin' | 'pack' | 'world' | 'theme' | 'shard' | 'check' | 'search' | 'back' | 'left' | 'right' | 'close';
/** Hand-drawn SVG GUI pictograms. CurrentColor follows the Java-style button palette. */
export function StoreIcon({ name, size = 20 }: { name: Name; size?: number }) {
  const shape: Record<Name, React.ReactNode> = {
    skin: <><path d="M8 2h4v2h2v3h-2v2l5 2 2 6h-5v-3H6v3H1l2-6 5-2V7H6V4h2z" /><path d="M8 6h4M6 11l2 2h4l2-2M3 17h14" /></>,
    pack: <><path d="M2 5l8-3 8 3v11l-8 3-8-3zM2 5l8 4 8-4M10 9v10M6 3l8 4" /></>,
    world: <><circle cx="10" cy="10" r="8"/><path d="M2 10h16M10 2c-3 2-4 5-4 8s1 6 4 8m0-16c3 2 4 5 4 8s-1 6-4 8" /></>,
    theme: <><path d="M10 1l2 6 6 3-6 2-2 7-2-7-6-2 6-3z" /></>,
    shard: <><path d="M7 2h6l5 6-8 11L2 8zM2 8h16M7 2l-2 6 5 11 5-11-2-6" /></>,
    check: <><path d="M2 10l5 5L18 4" /></>,
    search: <><circle cx="8" cy="8" r="6"/><path d="M13 13l6 6" /></>,
    back: <><path d="M12 3L5 10l7 7M5 10h14" /></>,
    left: <><path d="M13 3L6 10l7 7" /></>,
    right: <><path d="M7 3l7 7-7 7" /></>,
    close: <><path d="M3 3l14 14M17 3L3 17" /></>,
  };
  return <svg className="store-icon" width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false">{shape[name]}</svg>;
}
