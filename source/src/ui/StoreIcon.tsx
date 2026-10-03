import React from 'react';

type Name =
  | 'skin' | 'pack' | 'world' | 'theme' | 'coin' | 'check' | 'search' | 'back' | 'left' | 'right'
  | 'close' | 'dressing' | 'shader' | 'plus' | 'info' | 'refresh' | 'download' | 'copy'
  | 'mod' | 'gift' | 'pick' | 'shield' | 'palette' | 'crown' | 'user' | 'clock' | 'spark' | 'upload';

/** Clean, consistent 20x20 stroke pictograms for the Marketplace UI. currentColor follows the
 *  surrounding button/card palette; round caps and joins keep them crisp at small sizes. */
export function StoreIcon({ name, size = 20 }: { name: Name; size?: number }) {
  const shape: Record<Name, React.ReactNode> = {
    // person bust: head + shoulders
    skin: <><circle cx="10" cy="6" r="3.2" /><path d="M3.5 17c.8-3.6 3.4-5.4 6.5-5.4s5.7 1.8 6.5 5.4" /></>,
    // coat hanger
    dressing: <><path d="M10 6.5a1.8 1.8 0 1 1 1.8-1.8" /><path d="M10 6.5v1.6L2.8 13.4a1.2 1.2 0 0 0 .8 2.1h12.8a1.2 1.2 0 0 0 .8-2.1L10 8.1" /></>,
    // sun with rays (shader glow)
    shader: <><circle cx="10" cy="10" r="3.4" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" /></>,
    // cube with inner edges
    pack: <><path d="M10 2.6l6.6 3.3v8.2L10 17.4l-6.6-3.3V5.9z" /><path d="M3.4 5.9L10 9.2l6.6-3.3M10 9.2v8.2" /></>,
    // globe
    world: <><circle cx="10" cy="10" r="7.2" /><path d="M2.8 10h14.4M10 2.8c-2.4 2-3.4 4.5-3.4 7.2s1 5.2 3.4 7.2c2.4-2 3.4-4.5 3.4-7.2s-1-5.2-3.4-7.2z" /></>,
    // artist palette
    theme: <><path d="M10 2.8a7.2 7.2 0 1 0 .2 14.4c1.5 0 2-.9 2-1.8 0-1.4-1.2-1.9-1.2-3 0-1.2 1-1.9 2.4-1.9h1.9c1.2 0 1.9-.9 1.9-2A7.4 7.4 0 0 0 10 2.8z" /><circle cx="6.6" cy="7" r="0.4" /><circle cx="10.4" cy="5.6" r="0.4" /><circle cx="13.6" cy="7.6" r="0.4" /><circle cx="6.2" cy="10.8" r="0.4" /></>,
    // coin: rim + shine
    coin: <><circle cx="10" cy="10" r="7.2" /><circle cx="10" cy="10" r="4.4" /><path d="M7.4 6.6a5 5 0 0 0-1.6 2.2" /></>,
    check: <path d="M3.5 10.5l4.2 4.2L16.5 5" />,
    search: <><circle cx="8.6" cy="8.6" r="5.4" /><path d="M12.6 12.6l4.4 4.4" /></>,
    back: <path d="M11.5 4L5.5 10l6 6M5.5 10h9" />,
    left: <path d="M12.8 4L6.8 10l6 6" />,
    right: <path d="M7.2 4l6 6-6 6" />,
    close: <path d="M4.5 4.5l11 11M15.5 4.5l-11 11" />,
    plus: <path d="M10 4.4v11.2M4.4 10h11.2" />,
    info: <><circle cx="10" cy="10" r="7.2" /><path d="M10 9v4.6M10 6.2v.2" /></>,
    refresh: <><path d="M4.4 10a5.6 5.6 0 1 1 1.6 4" /><path d="M4.4 14v-4h4" /></>,
    download: <path d="M10 3.4v9.4M6 9.2l4 4 4-4M4 16.6h12" />,
    upload: <path d="M10 12.8V3.4M6 7l4-4 4 4M4 16.6h12" />,
    copy: <><rect x="7.2" y="7.2" width="9.4" height="9.4" rx="1.6" /><path d="M4.6 12.8H3.4V3.4h9.4v1.2" /></>,
    // slider knobs (client mods / tweaks)
    mod: <><path d="M3 5.6h14M3 10h14M3 14.4h14" /><circle cx="7.4" cy="5.6" r="1.7" /><circle cx="12.6" cy="10" r="1.7" /><circle cx="6.2" cy="14.4" r="1.7" /></>,
    // gift box with ribbon
    gift: <><rect x="3" y="8" width="14" height="9" rx="1" /><path d="M10 8v9M3 11.4h14M10 8s-4 .2-4.8-1.6C4.6 5 5.6 3.4 7 3.6c2 .3 3 4.4 3 4.4s1-4.1 3-4.4c1.4-.2 2.4 1.4 1.8 2.8C14 8.2 10 8 10 8z" /></>,
    // pickaxe
    pick: <><path d="M4 16L13.4 6.6" /><path d="M8.2 3.6c3-1 6.6-.2 8.2 1.4-2.4-.4-4.6 0-6.4 1M16.4 11.8c1-3 .2-6.6-1.4-8.2.4 2.4 0 4.6-1 6.4" /></>,
    shield: <><path d="M10 2.8l6 2.2v5c0 4-2.6 6.4-6 7.2-3.4-.8-6-3.2-6-7.2v-5z" /><path d="M7.4 9.8l2 2 3.4-3.6" /></>,
    palette: <><circle cx="10" cy="10" r="7.2" /><path d="M10 2.8v14.4M2.8 10h14.4" /></>,
    crown: <path d="M3.4 15.4h13.2M3.4 15.4L2.6 6.8l4.2 3L10 4.6l3.2 5.2 4.2-3-.8 8.6" />,
    user: <><circle cx="10" cy="6.4" r="3" /><path d="M4.4 16.6c.7-3.2 3-4.8 5.6-4.8s4.9 1.6 5.6 4.8" /></>,
    clock: <><circle cx="10" cy="10" r="7.2" /><path d="M10 5.8V10l3 2" /></>,
    spark: <path d="M10 2.8l1.8 5.4 5.4 1.8-5.4 1.8L10 17.2 8.2 11.8 2.8 10l5.4-1.8z" />,
  };

  return (
    <svg
      className="store-icon"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      strokeLinejoin="miter"
      style={{ filter: 'drop-shadow(2px 2px 0 rgba(0,0,0,0.5))' }}
      aria-hidden="true"
      focusable="false"
    >
      {shape[name]}
    </svg>
  );
}
