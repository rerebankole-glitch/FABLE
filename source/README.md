# FABLE 5.1

An original voxel sandbox adventure that runs entirely in the browser. TypeScript + three.js + React, with procedural
terrain, block textures, item icons and sound effects. The original soundtrack and font are bundled project assets;
there is no third-party game content. (It is not affiliated with any other voxel game or its publisher.)

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/index.html + dist/assets/ (keep the split build together when hosting)
```

## Controls

| Action | Key |
| --- | --- |
| Move / jump / sprint / sneak | WASD / Space / Shift / Ctrl |
| Mine / attack · use / place | Left mouse · Right mouse |
| Inventory · drop · chat & commands | E · Q · T (or `/`) |
| Fly (creative) | F or double-tap Space |
| Screenshot (full display resolution) | F2 |
| Debug overlay · pause | F3 · Esc |

Touch devices get a joystick, look-pad (tap = use, hold = mine) and on-screen buttons automatically.
All keys can be rebound in *Settings → Controls*.

## Commands (cheats enabled or creative)

`/help /seed /time set <day|night|noon|n> /gamemode <survival|creative|spectator> /give <item> [n] /tp x y z`
`/weather <clear|rain|storm> /kill /heal /xp n /summon <mob> /difficulty <d> /spawn /setblock x y z <block>`

## Project layout

```
src/game/core        types, settings + i18n, Game (main loop, input, interaction, saving)
src/game/blocks      block registry, procedural texture atlas
src/game/items       item registry, procedural icons
src/game/world       noise, biomes, terrain/structure generator, world streaming, mesher + lighting (web worker)
src/game/player      player state & survival mechanics, AABB physics + raycast
src/game/entities    mobs, AI, item entities, projectiles, xp orbs
                     MobArt = per-face pixel-art skins (text sheets) + MobSkins = the art itself
src/game/renderer    chunk/sky shaders, environment (sky, sun/moon, clouds, weather)
src/game/particles   particle system
src/game/crafting    recipes and smelting
src/game/inventory   containers, slot click semantics
src/game/structures  loot tables, enchantments, Keeper trades
src/game/save        IndexedDB save manager (localStorage / memory fallback)
src/game/audio       procedural sound engine & music
src/game/network     multiplayer transport + JSON protocol
server/              bundled multiplayer server (Node + ws)
src/ui               React UI: store, menus, HUD, inventory screens, settings, touch controls
src/ui/SkinMarketplace.tsx  the Marketplace (skins, dressing room, packs, mods, shaders, themes, coins)
src/ui/market-i18n.ts       interface dictionary — 23 languages, English fallback per key
src/game/core/Skins.ts      built-in skin art (64x64 vanilla nets) + the dressing-room palettes
src/game/core/SkinRender.ts flat 2.5D skin renderer used by every store card and preview
```

## Mob art

Every creature is built from boxes, and each box can carry **per-face pixel art**: `MobArt.ts` packs
the six faces of a box into one 3x2 texture and remaps the box's UVs onto it, so eyes, a nose, robe
folds or hooves cost **no extra draw calls**. Art is written as text sheets (one character per
pixel) in `MobSkins.ts`, so it is readable, reviewable and easy to change:

```
.k..k.   k = ink (pupil / outline)   . = base colour
......   1 darkest .. 4 lightest     e = accent colour
.1..1.   plus named colours: w white, y gold, o orange, r red, g green, b blue, c cyan, ...
```

Colours follow one rule everywhere: **art is drawn in tones of the box's own colour**, so a loaded
resource pack still recolours the whole mob. `npm run art:preview` renders a contact sheet of every
model and profession offline (no browser, no WebGL), and `npm run test:mobart` checks the sheets, the
3x2 atlas and the UV remap: every face of every box must be painted, and the sheet labelled *front*
must land on -Z, the direction mobs walk.

### The Keeper

The Keeper is FABLE's trader and is built like a villager rather than a recoloured humanoid: unibrow
and deep-set eyes, a nose that pushes two pixels out of the face, a long robe with a collar yoke,
hem and belt, arms folded across the chest, a stocky ~1.9-block silhouette — and a profession hat
(farmer's straw, smith's cap, mystic's cowl) driven by the same number its trade list is built from,
so the Keeper that sells you seeds looks like the one that sells you iron.

## Marketplace

The in-game store is cosmetics only and never touches real money. Fable Coins are earned by mining ores in
Survival or claimed as free gifts; they buy skins, headwear, store themes and nothing else.

* Skins are drawn with a flat 2.5D renderer (`SkinRender`) at device resolution, so card art stays crisp
  without a WebGL context per tile; the details sheet opens the real 3D model.
* The dressing room recolours the avatar, changes arm proportions and equips headwear, then saves straight
  into the in-game player, the first-person arm and every preview.
* Everything is local: unlocks live in this browser profile.

### Languages

`src/game/core/Settings.ts` holds the full menu dictionaries (English, Spanish, German, French, Italian,
Portuguese, Russian, Japanese, Chinese). `src/ui/market-i18n.ts` adds the wider interface set — Dutch, Polish,
Ukrainian, Turkish, Swedish, Danish, Czech, Romanian, Greek, Hindi, Indonesian, Vietnamese, Korean and
Traditional Chinese — and reuses the same language codes, so a new language is one dictionary entry with
English fallback for any key it has not translated yet.

## Multiplayer

A small authoritative server is bundled in `server/`. It shares the seed with clients (terrain is generated
locally from it, exactly as in singleplayer) and owns block edits, day time, chat and the player list.
Edits are persisted to `server/worlds/<name>.json`.

```bash
npm run server                                         # ws://localhost:8080, random seed
npm run server -- --port 9000 --seed hello --mode creative --name "My Server"
```

Then in the game: **Multiplayer → `ws://localhost:8080` → Direct Connect**. Options: `--port`, `--seed`,
`--name`, `--mode survival|creative`, `--difficulty`, `--world-type default|flat|amplified|islands`,
`--max-players`. Server chat commands: `/help /list /seed /spawn /save` (`/time` on creative servers).

The server is built with esbuild into `dist/server.mjs` (only runtime dependency: `ws`), so it runs on any
Node ≥ 18. To expose it on the internet put it behind a TLS-terminating proxy and connect with `wss://`.
The protocol is documented in `src/game/network/Network.ts`; any server that speaks it will work.

## Scripts

```bash
npm run dev          # Vite dev server on :5173
npm run build        # type-check + production build -> dist/index.html and dist/assets/
npm run server       # bundle + start the multiplayer server
npm run typecheck    # tsc for the client and the server
npm run art:preview  # render every Keeper profession, creature and ore tile to a review sheet
npm run test         # logic, physics, inventory, UI and content regression suites
npm run playtest      # headless gameplay probes and progression measurements
npm run build:site   # game + website -> site-dist/ (gitignored), dist/fable-site.zip, dist/fable-web-portal.zip
npm run publish:pages # build + copy current static site into this repo's root Pages source
npm run preview:site # serve site-dist/ on :8080
npm run desktop      # run the Electron desktop shell (after node tools/build-desktop.mjs)
```

## Website, fullscreen player and publishing

`site/` is the public website (landing page, `play.html` fullscreen player, PWA manifest + offline service worker,
privacy page). `npm run build:site` assembles `site-dist/` plus `dist/fable-web-portal.zip` for itch.io-style uploads.
The GitHub Pages source for this repository is the branch root; run `npm run publish:pages` to update the root
output before opening a PR. The PWA build precaches the hashed game assets so an installed/cached copy works offline. `desktop/` wraps the same build in Electron for Steam / Microsoft Store / DMG /
AppImage (`node tools/build-desktop.mjs`, then `cd desktop && npm install && npm run dist`).
See **PUBLISHING.md** for the store copy, ratings answers, requirements and the launch checklist.

In the game itself, F11, the corner button on the title screen and Options → Video → Fullscreen all toggle
fullscreen (driven on the host page when embedded).

## UI & font

The interface is a flat pixel-art style: bevelled stone buttons, tiled dark backgrounds, drop-shadowed pixel text and
sprite-based hearts/hunger/armor. The font is **Fable Pixel**, an original proportional 8-px pixel font generated from a
glyph table by `tools/build-font.py` (`src/ui/assets/FablePixel.ttf`, SIL Open Font License 1.1,
`src/ui/assets/FablePixel-LICENSE.txt`). Add glyphs to the table and re-run the script to regenerate it (needs
`pip install fonttools brotli`). All HUD sprites, block/item icons and the **FABLE** title logo are drawn in code at
startup (`src/ui/sprites.ts`, `src/ui/Logo.tsx`).

Why not the Minecraft font? Mojang's typeface is proprietary and is not licensed for redistribution, so it cannot be
bundled with an open project. Fable Pixel follows the same conventions (5x7 capitals on an 8-px grid, proportional
widths, one pixel of side bearing, 2x drop shadow) without copying any glyph data. If you would rather use a
Minecraft-style font that *is* freely licensed, drop the OFL-licensed Monocraft TTF into `src/ui/assets/`, point the
`@font-face` in `src/ui/assets/font.css` at it and change `--font` in `src/index.css`.

## Saves

Worlds live in IndexedDB (falling back to localStorage, then memory). Every write first copies the previous good record to
`<id>.bak`, and loading validates the record and falls back to the backup if the primary is unreadable. The game autosaves
every 90 s, on pause, when the tab is hidden and on page hide; the HUD shows an "Autosaving" / "World saved" indicator.
Worlds can be renamed, deleted (with confirmation), exported and imported as JSON from the world list.
