# Publishing FABLE

Everything needed to put FABLE on the market: what to build, where each artefact goes, the store copy, the
requirements each platform checks, and what is still on you (accounts, signing keys, legal identity).

## 1. Build the release artefacts

```bash
npm install
npm run typecheck && npm run test        # must pass
npm run build:site                       # dist/index.html + dist/assets/ + site-dist/ + zips
npm run publish:pages                    # build and assemble the branch-root GitHub Pages site
node tools/build-desktop.mjs             # desktop/app + icons (for Steam / Microsoft Store / itch desktop)
```

> **Soundtrack:** the game plays the five `music/*.mp3` repository tracks as ambient background music, fetched
> relative to the game page (so `music/` must sit next to the deployed `index.html`). `build:site` copies them
> from `music/` (or `../music`) into `site-dist/game/music` and both portal/site zips automatically. A build
> without the tracks still works — the game falls back to its procedural ambience.

| Artefact | Path | Use it for |
| --- | --- | --- |
| Web game (split build) | `dist/index.html` + `dist/assets/` | Keep the HTML and hashed JS/CSS/images together. This is not a standalone HTML file. Music is optional; without `music/` the game falls back to procedural ambience. |
| Website + game | `site-dist/` (also `dist/fable-site.zip`) | Landing page, `play.html` fullscreen player, PWA, privacy page, hashed game assets and `game/music/*.mp3`. |
| Web-portal zip | `dist/fable-web-portal.zip` | itch.io "HTML" project, Newgrounds, GameJolt, CrazyGames, Poki-style portals (index.html + `assets/` + optional `music/` at zip root). |
| Soundtrack | `music/` | The five repository tracks (`FABLE.mp3`, `FABLE (1..2).mp3`, `Driftwood Valleys*.mp3`), played as the in-game ambient music on the music bus. Keep them with every deployed copy. |
| Desktop installers | `desktop/release/` after `cd desktop && npm install && npm run dist` | Steam depots, Microsoft Store (APPX), itch.io downloads, macOS DMG, Linux AppImage/deb. |
| Store art | `site/assets/` — `logo.svg`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `og.jpg`, `shot-*.webp` | WebP screenshots are optimized for the landing page; re-capture at 1920×1080 on a real GPU for Steam (see §5). |
| Multiplayer server | `npm run server -- --port 8080 --seed 12345` (bundled to `dist/server.mjs`) | Optional official server; any VPS with Node 20. |

## 2. Where to publish (cheapest and fastest first)

1. **Your own website** — deploy `site-dist/` to Netlify (drag-and-drop the folder or `fable-site.zip`), Cloudflare
   Pages, Vercel or any static host. This repository's GitHub Pages is configured to serve the `main` branch root;
   run `npm run publish:pages`, push the generated root files in a PR, then merge to deploy. `_headers` / `vercel.json`
   are included for hosts that support them. Serve over HTTPS for PWA installation, service workers and Pointer Lock.
2. **itch.io** — create an *HTML* project, upload `dist/fable-web-portal.zip`, tick *This file will be played in the
   browser*, set the viewport to 1280×720 with *Fullscreen button* and *Mobile friendly* enabled. Also attach the
   desktop installers as downloadable files. Pricing: free, pay-what-you-want or paid; itch takes 10 % by default.
3. **Web portals** (Newgrounds, GameJolt, CrazyGames, Poki) — same zip. Each has its own submission review; CrazyGames
   and Poki require their SDK for ads/save sync, which is a small separate integration if you want revenue share there.
4. **Steam** — $100 Steam Direct fee per app, refundable after $1,000 revenue. Upload `desktop/release/win-unpacked`,
   `mac`, `linux-unpacked` as depots with SteamPipe; set the launch options to the executables. Fill in the store page
   with the copy in §3 and 1920×1080 screenshots. Steam requires a capsule set (header 460×215, small 231×87, main
   616×353, hero 3840×1240, library 600×900 + logo) — build them from `logo.svg` + the screenshots.
5. **Microsoft Store** — Partner Center developer account ($19 individual, one-time). Put your Identity Name and
   Publisher ID into `desktop/package.json → build.appx`, run `npm run dist:win`, upload the `.appx`. Store handles
   signing.
6. **Google Play / App Store** — the game is a PWA today; the least-effort path is a Trusted Web Activity (Android,
   via [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)) pointing at your deployed `play.html`, and
   Capacitor for iOS. Both need the site live on HTTPS first. Google Play developer account $25 one-time; Apple $99/year.

## 3. Store copy

**Title:** FABLE
**Subtitle / short description (80 chars):** An original voxel adventure that runs entirely in your browser.
**Tagline:** A voxel adventure for the browser.

**Short (itch/portal, ~300 chars):**
> Dig into an endless procedurally generated world. Mine, craft, build, farm, fight what comes out at night and go
> looking for the Void Realm. 20 biomes, caves, villages and dungeons, 90+ blocks, 100+ items, survival and creative
> modes, multiplayer, and an optional shader pack — a free web build with no account or install required.

**Long (Steam "About this game"):**
> FABLE is an open-world voxel sandbox built from scratch for the browser. Every seed generates a new world: simplex-noise
> continents with rivers and lakes, twenty biomes from snowy peaks to mushroom fields, deep cave systems full of ore,
> and structures to find — villages, temples, towers, shipwrecks and dungeons with loot.
>
> Punch a tree, craft tools, build a shelter before dark. Survival mode tracks health, hunger and armour; a shield in
> your off-hand blocks while you sneak. Eleven creatures roam the world: peaceful herds by day, stalkers, archers,
> crawlers and flyers by night, guardians underground, and the Void Wyrm waiting at the end. Creative mode gives you
> the whole catalogue, flight and a flat-world option; spectator mode lets you fly through anything.
>
> The sky is alive: sun, moon and stars, weather with storms, sunsets that colour the fog, and lighting that reaches
> into caves. Turn on the shader pack for waving leaves, water reflections, god rays, bloom and colour grading —
> every effect can be toggled on its own, and quality presets scale from integrated graphics to high-end GPUs.
>
> Worlds save automatically and can be exported as files. Host a server with one command and play with friends.
> Textures, sound effects and world terrain are generated in code; the original soundtrack is bundled in `music/`
> (procedural ambience covers you if it is missing), and a Hardcore mode is waiting for one-life runs.

**Feature bullets:**
- Endless procedural worlds: 20 biomes, rivers, caves, ores, villages, temples, towers, shipwrecks, dungeons
- 90+ blocks and 100+ items; tool tiers, hardness, 2×2 and 3×3 crafting, furnaces, recipe book, chests
- Survival with hunger, armour, shield blocking, 11 creatures and a boss; Creative, Spectator and one-life Hardcore modes (charred hearts, death deletes the world)
- Day/night cycle, weather and storms, lighting that reaches into caves; optional shader pack with per-effect toggles
- Multiplayer with an authoritative server you can host yourself
- Full keyboard rebinding, GUI/text scale, colour-blind-safe outlines, reduced flashing, touch controls
- Installable PWA; the game engine and website assets are precached for offline play. No account, no ads, no tracking.

**Tags / genres:** Sandbox, Survival, Open World, Crafting, Building, Voxel, Procedural Generation, Multiplayer,
Singleplayer, Pixel Graphics, Relaxing, Exploration, Free to Play, Browser.

**Content rating:** PEGI 7 / ESRB E10+ equivalent — mild fantasy violence against blocky creatures, no blood, no
language, no purchases. Online chat exists only on servers players connect to deliberately (declare "Users Interact"
on Steam/Play/App Store).

**Age rating questionnaire answers:** violence: cartoon/fantasy, mild; blood: none; sexual content: none; language:
none; controlled substances: none; gambling: none; user-generated content: worlds are local, chat is server-only;
in-app purchases: none; ads: none; data collection: none (see `site/privacy.html`).

## 4. Requirements

**Minimum:** any browser with WebGL 2 (Chrome/Edge 80+, Firefox 75+, Safari 15+), 2 GB RAM, integrated graphics
(Low/Medium preset). **Recommended:** dedicated GPU, 4 GB RAM, High/Ultra with shaders. Desktop build: Windows 10+
x64, macOS 11+, Ubuntu 20.04+. Storage varies by browser cache, optional soundtrack and saved worlds.

## 5. Pre-launch checklist

- [ ] Pick a legal publisher name and put it in: `desktop/package.json` (`copyright`, `appx.publisherDisplayName`),
      `site/privacy.html` (contact), store accounts. Add a LICENSE file to the repo (MIT/GPL for code is your call).
- [ ] Register a domain, deploy `site-dist/` (or run `npm run publish:pages` for this repo), confirm `play.html`
      installs as a PWA, its game assets are available offline after caching, and F11 / fullscreen work.
- [ ] Re-capture screenshots on a real GPU at 1920×1080 with High preset and shaders on (the ones in `site/assets`
      were rendered in a software-GL container at 960×540 and look softer than the game does on hardware).
      For clean shots set Options → Interface → *HUD Opacity* to its minimum and use F5 for third-person views.
- [ ] Record a 30–60 s trailer (OBS at 1080p60): punch tree → craft → build → night attack → sunset with shaders →
      creative flight over a village. Steam requires at least one video.
- [ ] Trademark search for "FABLE" in the video-game class in your target markets. The word is common and there is an
      existing well-known RPG franchise with that name; a distinctive combined mark (logo + word) is safer than the
      word alone, and some stores will ask you to confirm you hold the rights. Renaming (e.g. "FABLE Voxel",
      "Fableblock") before launch is far cheaper than after. **This is the one item that can block a listing.**
- [ ] Steam: Steamworks account, tax/bank interview, store page review (2–5 business days), build review, then a
      "Coming Soon" period of at least two weeks before release.
- [ ] Microsoft Store: reserve the name in Partner Center first (name reservations expire after 3 months).
- [ ] Code-sign the Windows installer (EV or standard certificate) to avoid SmartScreen warnings; notarise the macOS
      DMG (Apple Developer ID). Unsigned builds still run but scare users.
- [ ] Update `GAME_VERSION` in `src/game/core/brand.ts` for a named release; the build generates the service-worker cache version from the precached output.
- [ ] Keep `Multiplayer` servers behind TLS (`wss://`) if you run public ones; the server rate-limits but is not a
      DDoS shield — put it behind Cloudflare or similar.

## 6. Monetisation options that fit the game as built

- Free web + paid desktop ("supporter edition") on Steam/itch — the standard model for browser-first games.
- Pay-what-you-want on itch with the web-portal ZIP as the download.
- Portal revenue share (CrazyGames/Poki) — requires their SDK; add an ad break only on the title screen, never in-game.
- No in-game purchases exist and adding them would need an account system; the privacy page currently promises none.
