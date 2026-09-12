# FABLE — Playtest Report (session 2026-09-09)

Scope: a full pass over the live game's systems — title/menu, new survival game, movement, first-person
view, block breaking with every tool, item collection, inventory + drag/drop + hover, hotbar, combat,
health & hunger HUD, terrain/caves/ores/structures, day–night, audio, crafting, survival, death/respawn,
settings, and performance — followed by fixes for everything that was clearly broken, then a replay of the
whole loop to confirm nothing regressed.

---

## 0. How this pass was actually run (read this first)

**I could not open a browser in this environment.** The host has no Chromium/Firefox and outbound HTTPS is
blocked, so I could not click through https://rerebankole-glitch.github.io/FABLE/ as a human would. Instead
of guessing, the session drove the game's **real modules** headlessly through `tools/playtest.mts`
(same generator, physics, mining formula, inventory, recipes, survival ticks, mesher, audio map and HUD
data the browser runs — it only stubs `document`/WebGL), and read the rendering code paths for anything
that is purely visual. Two suites back this up: the logic suite and a DOM suite that mounts the real
React inventory/HUD and simulates pointer input.

Everything numeric in this report was **measured by executing that code**, not estimated. Anything I could
not measure is labelled as a code-path inference. Where a claim is about how something *looks*, the report
says so and names the code that decides it.

Verification commands (all run this session, all green):

```
cd .fb-dev
npx tsc --noEmit                      # typecheck
node dist/inventory.test.mjs          # logic suite       60 passed / 0 failed
node tools/build-dom-test.mjs && node run-dom.mjs   # DOM suite 41 passed / 0 failed
node tools/hud-sprite-build.mjs       # HUD art validator (all checks passed)
node tools/pt-build.mjs && node dist/playtest.mjs   # the playtest session itself
```

---

## 1. What the session measured (the "I played it" evidence)

| Area | Measured result |
| --- | --- |
| Walk / sprint / strafe / back / sneak | 4.28 / 5.62 / 4.26 / 4.26 / 1.20 blocks per second |
| Jump height (held) | 1.39 blocks (vanilla 1.25) |
| Terrain walk, 12 s, no jumping | 31.2 blocks (2.60 b/s) over hills, forests and water |
| 1-block step, no jump key | **stops dead after 1.70 blocks — 3 s of holding forward = zero progress** |
| 1-block step, auto-jump (new default) | **climbs it: 11.15 blocks in 3 s**, steps up and keeps walking |
| Mining (hand → tier-1 tool → best tool) | stone 7.50 / 0.56 / 0.28 s · cobble 10.00 / 0.75 / 0.38 s · deep stone 15.00 / 1.13 / 0.56 s · dirt 0.75 / 0.13 s (shovel) · oak log 3.00 s / 0.50 s (iron axe) · glass 0.45 s any · leaves 0.30 s · snow 0.30 / 0.05 s · ice 0.75 / 0.19 / 0.09 s |
| Crack progression | 10 stages across a 0.38 s iron-pick stone break, evenly spaced (~0.04 s each, 9 stages by 0.33 s) |
| Tool durability | 1 per block (stone pick 131 → 121 over ten stone); wood pick breaks after 59 blocks |
| Stone-age progression, using the game's own recipe matcher | 8 logs by hand (24 s) → planks/sticks/table/wood pickaxe → 20 stone (22.5 s) → furnace/stone pickaxe/torches → 6 raw iron; whole chain achievable in ≈57 s of mining |
| Inventory | 71 cobblestone stacks to 64 + 7; click picks up; right-click places one; shift-click merges; grid 36 + hotbar 9 + cursor 1 |
| Combat | sword 4/5/6/4/7 dmg (wood/stone/iron/gold/crystal), iron axe 5; durability 59/131/250/32/1561; Bovin 10 hp; armour 8 turns 10 dmg into 7 |
| Survival | sprint drains hunger 20 → 6 in 135 s; hunger 16 for 60 s = no regen (needs ≥18); hunger 18 idle 90 s = no drain; starvation floors health at 1; eating +6; 45 s submerged → air 0 and drowning; 17 food items |
| Terrain (seed 1337, 13×13 chunks, 1131 ms) | heights 1..127; ores coal 6430 / iron 4682 / copper 3453 / ember 2687 / gold 1561 / crystal 299; 331 830 cave-air blocks; 6059 tree logs; 718 structure tiles; 11 biomes (Ocean 28.3 %, Mushroom Isle 13.5 %, Taiga 13.4 %, Dark Forest 10.9 %, Deep Ocean 10.0 % …) |
| Chunk pipeline | load + light + mesh = 56 ms/chunk average; 12 354 opaque + 174 water triangles per chunk |
| Item art | 28 bitmaps, every one exactly 16×16; 71 block-cube icons, 32 handled tool/weapon icons, 62 procedural icons; **0 icons reference missing art, 0 use a bitmap character the palette cannot resolve, 0 unused art**; pickaxe/axe/shovel/hoe/sword each have 6 tiers with 6 distinct colour sets |
| HUD art | hearts and drumsticks: 9×9 hand-authored sprites, full/half/empty share one silhouette per set, ≥14 pixels differ between states, hardcore variants present |
| Content integrity | 0 block drops, 0 recipes, 0 smelting entries and 0 mob drops reference an item that does not exist (this check is new — see C3) |
| Block→sound map | every one of the 94 blocks resolves to a valid sound group (14 wood, 6 glass, 4 grass, 3 gravel, 3 cloth, 2 liquid, 2 sand, metal/plant/leaves/snow …) |

---

## 2. CRITICAL — gameplay-stopping

### C1. A plain walk stopped dead at every single 1-block step — **FIXED**

* **What happened:** walking forward into a one-block rise brought the player to a complete halt. Measured:
  1.70 blocks travelled and then zero progress for the remaining 2.5 s of holding W. Every hill, every
  terrace, every doorstep required a manual jump. On hilly terrain this made ordinary exploration feel
  broken.
* **Where:** the whole overworld. Root cause in `src/game/core/Settings.ts` — `DEFAULT_SETTINGS.autoJump`
  was `false`, and `Player.ts` only auto-steps when `autoJump` is on.
* **Why it hurts:** it is the single most-touched interaction in a voxel game. It reads as "the game doesn't
  respond to my movement", and it makes the 2.60 b/s hilly-terrain traversal (measured) feel far worse than
  the flat-ground 4.28 b/s the player was promised.
* **What replaces it:** auto-jump is on by default. Measured after the change: the same 3 s walk that used
  to stop at 1.70 blocks now climbs the step and covers **11.15 blocks**. Players who deliberately turned it
  off keep it off — a one-shot migration (`migratedAutoJump`) flips profiles saved under the old default and
  then never touches the setting again.
* **System/code:** `src/game/core/Settings.ts` (default + load migration), consumed by `src/game/player/Player.ts`
  (`canAutoJump`, `autoJumpTimer`). Also visible as "Auto-Jump" in Options → Controls.

### C2. Auto-jump could throw and kill the frame near the build limit — **FIXED**

* **What happened:** driving the real `canAutoJump` probe produced
  `TypeError: Cannot read properties of undefined (reading 'solid')` from a probe at y = 128 — above the
  world ceiling a block getter is allowed to report an unknown id, and `BLOCKS[id].solid` threw. In the
  browser this is an uncaught exception inside the frame loop while walking with auto-jump, i.e. the game
  would freeze/stutter exactly when the player is near the build limit.
* **Where:** `src/game/player/Physics.ts`, `canAutoJump` (front-block, landing-space and head-room probes).
* **Why it hurts:** a crash *inside input handling* is unrecoverable for the player — the camera keeps
  rendering while movement dies.
* **What replaces it:** the three probes now read `BLOCKS[id]?.solid`, so an out-of-world id reads as "clear"
  instead of throwing. Verified: the exception is gone and the auto-jump tests pass.
* **System/code:** `src/game/player/Physics.ts` (protects every caller, not just the player).

### C3. The recipe book advertised an item that could never be crafted — **FIXED**

* **What happened:** the content audit found `mossy_cobblestone ← fern …` while ferns dropped nothing at
  all. A player who laid out the recipe exactly as the book showed got nothing, forever.
* **Where:** `src/game/crafting/Recipes.ts` (recipe) + `src/game/blocks/Blocks.ts` (fern drop table).
* **Why it hurts:** a broken entry in the progression UI is worse than a missing feature — it teaches the
  player that the crafting system lies to them.
* **What replaces it:** ferns now drop themselves and wheat seeds at 12.5 %, so the recipe is real, and the
  audit that found it is now a permanent test (`content: every recipe ingredient is a real, obtainable item`,
  plus drops/smelting/mob-drop equivalents). The logic suite grew from 54 to 60 checks.
* **System/code:** `src/game/blocks/Blocks.ts`, `tests/inventory.test.ts`.

---

## 3. HIGH — weak feedback, weak HUD, missing progression

### H1. Health and hunger icons were the weakest art in the game — **FIXED**

* **What happened:** hearts were coarse blobs with no outline/shading discipline and the hunger pips were
  near-indistinguishable from their empty state (measured character diff between full and empty was a single
  edge pixel); both were then upscaled by a fixed ×2, so on any device-pixel-ratio above 1 they were
  resampled rather than drawn at panel resolution.
* **Where:** `src/ui/sprites.ts` (art + `installSprites`) rendered into the fixed 18 px `.heart` / `.drum`
  boxes in `src/index.css`, drawn by `src/ui/HUD.tsx`.
* **Why it hurts:** health and hunger are the two numbers a survival player checks constantly; if a half
  heart or an empty pip is ambiguous, the HUD stops being information.
* **What replaces it:** nine hand-authored 9×9 sprites per state — outline, hollow rim, body, shadow and a
  glint pixel on hearts; meat/bone shading with a glint on drumsticks; hardcore hearts get a pale empty state
  and cracked full/half states — plus a dedicated dark "empty" palette so an empty drumstick keeps the
  drumstick silhouette and the row stays aligned. Full/half/empty now differ by 14–31 pixels per icon
  (validator output), the sprites are installed at a device-pixel-derived scale
  (`round(clamp(devicePixelRatio, 1, 3))`) instead of a fixed ×2, and a validator
  (`tools/check-hud-sprites.mts`) fails the build if any row is the wrong width, a palette key is undefined,
  or a state stops being distinguishable.
* **System/code:** `src/ui/sprites.ts`, `src/ui/HUD.tsx` (markup unchanged), `src/index.css` (18 px boxes).

### H2. The first-person arm ignored jumping, falling and landing — **FIXED**

* **What happened:** the viewmodel tracked walking (bob), turning (sway) and striking (300 ms swing / 150 ms
  mining chop) but had **no vertical term at all** — jumping, falling and landing moved the camera while the
  arm stayed pinned to the same screen position in every frame.
* **Where:** `src/game/core/Game.ts` `updateHand` (~line 830-940) for the held item, and the empty-arm branch.
* **Why it hurts:** the hand is the player's body. A rigid hand while the world lurches makes every jump feel
  like the camera detaching from the character.
* **What replaces it:** a small lag term (`-vy * 0.012`, clamped ±0.09 blocks) so the model trails the body
  while rising/falling, plus a landing impulse fed by the existing `land` event (`min(0.16, 0.02 + fall*0.016)`)
  that dips the model and springs back with `exp(-dt*6.5)`. Applied to both the bare-arm and held-item paths,
  kept deliberately small so it reads as weight, not as a roller-coaster.
* **System/code:** `src/game/core/Game.ts` (`updateHand`, `handVert`, `handLand`, `land` event handler).

### H3. Block-damage cracks ignored the block's actual shape — **FIXED**

* **What happened:** the crack overlay was always a full 1×1×1 cube scaled onto the target block, while the
  selection outline already followed the block's own box. On slabs, plants, torches and other non-cube blocks
  the damage texture therefore floated in empty space next to the geometry being mined.
* **Where:** `src/game/core/Game.ts`, the mining tick that positions `crackMesh`.
* **Why it hurts:** the crack overlay is the *only* continuous progress feedback during mining, and the user's
  brief explicitly asks for "cracks attached to the correct face" and "reset on target change". Floating
  cracks read as a rendering glitch at exactly the moment the player is watching hardest.
* **What replaces it:** the overlay now uses the block definition's own `box` (with the cross-plant box as a
  fallback) for both its position **and** its scale, so half-mined slabs, crops and torches show damage over
  their visible faces. It still hides on target change, out-of-reach and stage reset, as before.
* **System/code:** `src/game/core/Game.ts` (`crackMesh`, `crackTextures`, `mineProgress`).

### H4. Nothing tells a new player what to do — **OPEN (recommendation)**

* **What happened:** the recipe book shows every recipe from the first second, and the measured stone-age
  chain (logs → planks → table → pickaxe → stone → furnace → iron, ≈57 s of mining) is genuinely quick, but
  there is no ordered nudge toward it. There is no first-run quest/checklist, no "you can't mine stone by
  hand efficiently — craft a pickaxe" hint, and the hunger bar gives no guidance either.
* **Where:** `src/game/crafting/Recipes.ts` (recipe data is complete but flat) and
  `src/ui/InventoryScreen.tsx` (recipe book lists everything at once).
* **Why it hurts:** the user's own priority list puts "crafting progression / exploration rewards /
  retention" in HIGH. All the content exists; the *order* of discovery is what is missing.
* **What should replace it:** a short, dismissible "Getting Started" checklist (punch wood → craft a table →
  stone pickaxe → furnace → torches → find iron) driven off the **existing** recipe matcher and inventory
  contents, shown in the recipe book panel. No new systems: it can be derived from `RECIPES` +
  `inventory.has()`.
* **System/code:** `src/game/crafting/Recipes.ts` + `src/ui/InventoryScreen.tsx` recipe book.

### H5. Survival difficulty is flat after the first ten minutes — **OPEN (recommendation)**

* **What happened (measured):** hunger 18 held for 90 idle seconds drains nothing; hunger 16 held for 60 s
  regenerates nothing (correct — vanilla needs ≥18); starvation floors health at 1 and **cannot kill**.
  Sprinting is the only meaningful food sink (20 → 6 in 135 s). Once a player has cooked food, there is no
  pressure left, and difficulty never escalates.
* **Where:** the survival tick in `src/game/player/Player.ts` (drain, regen, starvation) and the difficulty
  setting in `src/game/core/Settings.ts` / `Game.ts` (`player.difficulty`).
* **Why it hurts:** food, farming (both fully implemented — 17 foods, three crops with growth stages) and the
  hardcore hearts all lose their point if hunger can never actually threaten the player.
* **What should replace it:** scale starvation with difficulty — Peaceful: no starving; Normal: floors at 1 hp
  (today's behaviour); Hard/Hardcore: starvation damage can kill, and add a slow passive drain (~1 point per
  2-3 minutes) so food is a standing cost rather than a one-off. Farming then becomes a real loop instead of
  an ornament.
* **System/code:** `src/game/player/Player.ts` survival tick (respecting `difficulty`).

---

## 4. MEDIUM — polish, audio, models, UI

| # | Problem (what / where / why) | What should replace it | System to change | Status |
| --- | --- | --- | --- | --- |
| M1 | HUD sprites were installed at a fixed ×2 scale, so on a 2-3× device-pixel-ratio panel they were resampled instead of drawn at panel pixels. | Install at a device-pixel-derived scale (1-3×), clamped. | `src/ui/sprites.ts` `installSprites` | **FIXED** |
| M2 | Chunk meshes are heavy: 12 354 opaque triangles per chunk, ×(2·6+1)² chunks at the default render distance of 6 — roughly 1.4 M triangles submitted per frame with no face merging. Integrated GPUs will feel this the moment the player turns the camera. | Merge coplanar faces per chunk (greedy meshing) in the opaque pass, and keep the existing per-chunk frustum culling; the water pass is already cheap (174 tris). | `src/game/world/Mesher.ts`, `worker.ts` | OPEN |
| M3 | Sprinting costs 0.05 exhaustion per step: hunger 20 → 6 in 135 s of continuous sprint. Vanilla-lean, but harsh for a browser game where sprint-travel is the default mode of movement. | 0.03 per step, or tier it by difficulty. | `src/game/player/Player.ts` | OPEN |
| M4 | Crystal tier is a 1561-durability outlier (iron 250, gold 32). Endgame tools essentially never break, which removes the last item sink. | ~900-1000 durability, still clearly the best tier. | `src/game/items/Items.ts` | OPEN |
| M5 | Item icons are rendered once at 32×32 and upscaled by CSS into slots that are 40-48 px on a large UI scale or a high-DPR screen. | Size the icon bitmap from the slot's device pixel size (`ICON_PX` × clamped device ratio) so tool art stays crisp on 4K/retina. | `src/game/items/Icons.ts` (`ICON_PX`, `renderIcon`), `src/index.css` slot sizes | OPEN |
| M6 | Non-cube blocks are still outlined/damaged with box approximations for a few odd shapes (beds, doors, ladders), so the selection box can look slightly larger than the visible model. | Extend the per-block `box` data to those shapes as well; the crack and outline code now already reads it. | `src/game/blocks/Blocks.ts` (`box` fields), `Game.ts` outline/crack | OPEN |
| M7 | Starvation, drowning and fall damage all use the same hurt flash and sound; death causes are visible in chat but there is no distinct feedback. | Cheap win: reuse the existing `damageTint`/`reducedFlashing` settings to tint by cause (green for poison/starve, blue for drown). | `src/game/player/Player.ts` + `src/ui/HUD.tsx` | OPEN |

---

## 5. LOW — small details

1. **Hardcore heart crack is 2 pixels wide.** Intentional, but at the 18 px HUD box it is subtle; a third
   crack pixel would read better. (`src/ui/sprites.ts`)
2. **Fern seeds (12.5 %) are the only renewable seed source besides grass.** Worth a look when farming is
   expanded, not a bug. (`Blocks.ts`)
3. **The playtest harness itself had two bugs** that made earlier terrain numbers nonsense (it indexed chunk
   data y-first while the game indexes x-first, and it read up to y = 255 in a 128-tall array). Both are fixed;
   the real terrain numbers in this report come from the corrected harness. Not player-visible, but it is the
   reason the report above is worth re-measuring rather than trusting old notes. (`tools/playtest.mts`)
4. **Auto-jump emits the normal jump sound and a 0.35 s cooldown** — correct, but if auto-jump ever feels
   spammy on staircases, the cooldown is the single knob. (`Player.ts`)

---

## 6. What shipped in this pass (v5.8)

| File | Change |
| --- | --- |
| `src/game/core/Settings.ts` | `autoJump` default on, plus a one-shot `migratedAutoJump` migration for saved profiles |
| `src/game/player/Physics.ts` | `canAutoJump` no longer throws on out-of-world block ids |
| `src/game/blocks/Blocks.ts` | ferns drop themselves + wheat seeds (revives the mossy-cobblestone recipe) |
| `src/ui/sprites.ts` | hearts + drumsticks redrawn (full/half/empty, hardcore variants, dark empty palette), installed at a device-pixel-derived scale |
| `src/game/core/Game.ts` | viewmodel vertical motion (jump lag, landing dip) + damage cracks follow the block's own box |
| `tests/inventory.test.ts` | 6 new content-integrity checks (drops, recipes, smelting, mob drops, tool recipes, block items) — suite now 60 |
| `tools/playtest.mts` | corrected block indexing, real 1-block-step stub, auto-jump coverage, icon-art integrity section |
| `tools/check-hud-sprites.mts` (+ builder) | permanent HUD-art validator |

**Regression status after the changes:** typecheck clean · logic 60/0 · DOM 41/0 · HUD art validator all
green · full playtest harness exit 0 · all previously verified movement, mining, crafting, inventory, combat,
survival, terrain and audio-map numbers unchanged.

## 7. Replay of the important loop (post-fix)

Movement (walk/sprint/strafe/sneak, 1-block steps), collision and terrain traversal, block breaking with
every tool tier, crack staging, item collection and stacking, inventory click/right-click/shift-click,
cursor drag, slot hover (position-driven hit-test on every pointer event for mouse **and** touch, re-tested
after each re-render), hotbar selection, tool equip and swing, combat damage and armour, health/hunger HUD
updates, eating, drowning, day–night and lighting, chunk streaming, and the audio event map were all
re-exercised after the fixes; every check is green and no new exception was raised anywhere in the harness run.

---

## 8. Release & verification (v5.8)

| Artefact | Value |
| --- | --- |
| Commit | `1fffb7c` on `arena/01a07c07-fable` |
| `index.html` (repo root) | md5 `b6ecefd3e8b49b47b073c0cbb3dc0ebb`, 1 264 473 bytes |
| `site-dist/game/index.html` | md5 `b6ecefd3e8b49b47b073c0cbb3dc0ebb` (identical build) |
| Preview (this sandbox, port 8123) | `http://localhost:8123/index.html` → HTTP 200, served bytes md5 match |
| GitHub Pages | build for commit `1fffb7c` = **built**; site source branch `arena/01a07c07-fable`, path `/` |
| Version chip in game | `5.8` |

Note: HTTPS is blocked from this sandbox, so the public URL itself could not be fetched to re-hash its
bytes; the deploy is confirmed through the Pages build record for the exact commit above plus the identical
md5 served by the local preview. On the live site the version chip in the inventory screen should read **5.8**.

---

## 9. v5.9 — art & animation pass (this release)

User requests, all done and verified (no real browser in the sandbox — every visual was rendered to PNG
from the shipped bitmaps/palettes and inspected, plus the automated suites below):

1. **Version chip removed from the inventory screen.** The `v5.8`/`v5.9` label in every container title bar
   is gone (`InventoryScreen.tsx` no longer imports `GAME_VERSION`; `.inv-ver` CSS deleted). The version
   still appears on the main-menu footer and in the F3 debug line, where it belongs.
2. **Hunger icon redrawn as a real drumstick.** New 11×11 sprite (displayed 22px vs the hearts' 18px):
   roasted meat bulb with glint + shaded belly, clean white bone with a two-lobe knob, half state = right
   half eaten away (mirrors half hearts), empty = dark silhouette. Validator updated to the 11px grid
   (`tools/check-hud-sprites.mts`), all checks pass; full/half/empty share one outline and differ by
   20/49 pixels respectively.
3. **Hardcore hearts are now visibly different at a glance.** Same heart silhouette, but ember-themed:
   deep crimson body, charcoal crack splitting the lobes, white-hot ember glints (bright survival red vs
   dark ember + black crack — obvious even on a small screen). Half/empty hardcore states updated to
   match. The HUD already selects them via `.hardcore-hearts` (hardcore flag in the store from game options).
4. **All tool/item icons redrawn** (`src/game/items/Icons.ts`): sword (3-tone blade with a real tip,
   cross-guard, wrapped grip, pommel), pickaxe (arched head with pale/dark shading and drooping tips),
   axe (broad head, pale cutting edge, dark back), shovel (pointed diagonal spade), hoe (slab blade with
   pale top edge and neck). All six material tiers stay colour-distinct (playtest: 6/6 distinct sets per
   tool kind); bow/armor/materials/food art untouched.
5. **First-person animation upgraded per tool** (`src/game/core/Game.ts`): each tool now has its own swing
   character on top of the exact Java 1.8 base chain — sword = flat slash with thrust, pickaxe = overhead
   chop, axe = heavy diagonal, shovel = scoop, hoe = side sweep (mining re-chops stay short at 55%
   amplitude). Plus: equip settle now eases out (smoothstep) with a tilt-up + tiny scale pop, and melee
   hits add a short viewmodel impact kick (also on the bare fist). Eating/bow/block animations unchanged.

### Gates (all run in `.fb-dev`)

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| Logic suite (`inventory.test.ts`) | 60 passed, 0 failed |
| Physics suite | all checks passed |
| DOM suite (`build-dom-test.mjs` + `run-dom.mjs`) | 41 passed, 0 failed |
| HUD sprite validator (`tools/hud-sprite-build.mjs`) | all checks passed |
| Playtest harness (`tools/pt-build.mjs` + `dist/playtest.mjs`) | exit 0; icon art clean (0 unknown arts, 0 magenta chars, 0 unused bitmaps, 6/6 tier colour sets per tool) |
| `npm run -s build` | OK, 1 265 424 bytes |

`tools/pt-build.mjs` no longer depends on a `/tmp` stub: the playtest worker stub now lives at
`tools/worker-stub.mjs` so the harness builds on a fresh checkout.

### Release & verification (v5.9)

| Artefact | Value |
| --- | --- |
| `index.html` (repo root) | md5 `0a3de61f97ac850a2039086859ba079e`, 1 265 424 bytes |
| `site-dist/game/index.html` | md5 `0a3de61f97ac850a2039086859ba079e` (identical build) |
| `fable-source.zip` | refreshed (167 files; no node_modules/dist/music) |
| Menu footer version | `FABLE 5.9` (inventory title bars intentionally show no version) |

---

## 10. v6.0 — the Explorer's update (discovery + living world)

**Audit first, extend second.** The brief's 19 points were checked against the real code before anything
was written. Already implemented and verified working (left untouched): full mob system (4 passive
animals with breeding/babies/graze/idle sounds, Keeper trader, Night Stalker, ranged Void Archer with
kiting AI, Cave Crawler, swooping Shadow Flyer, Stone Guardian, 3-phase Void Wyrm boss; telegraphed
aggro, hit reactions, death animations, light/time/dimension spawn rules, anti-stuck, cliff/lava
avoidance), 20+ biomes from continuous climate fields, caves (tunnels/cheese pockets/chambers/shafts/
ravines/underground lakes/lava), tiered ores, 7 structure types with loot + guards, hunger/saturation,
farming with growth stages, furnace UI + 22 smelting recipes, 4-slot armor with HUD + sprites, XP/levels
with orbs and level-up chime, per-weapon attack cooldowns/crits/knockback/damage popups, day/night with
smooth transitions, weather (rain/storm/snow/fog + audio), IndexedDB saves with backups + rename/delete,
ambient audio, footsteps per material. Item 18 (nothing broken) re-verified by re-running every suite.

**What was genuinely missing, now added:**

1. **Discovery journal (`src/game/core/Discovery.ts`)** — exploration finally pays. Firsts are celebrated
   exactly once per world with a toast, a chime ('discover', new synthesized sound) and XP:
   - first entry into each of the 20+ biomes (+5 XP, green sparkle at the player);
   - first loot opened from each structure type — village home, Desert Temple, Ruined Tower, Ancient
     Ruins, Shipwreck, Buried Dungeon, Void Vault (+10 XP);
   - first strike of Gold/Ember/Crystal ore (+3/+3/+4 XP);
   - defeating the Void Wyrm (+50 XP, big chime).
   The journal persists inside the world save (dimension-stamped keys next to the chunk-visit data) and
   restores silently — reloading a world never replays toasts or re-pays XP.
2. **Wildlife restock (`EntityManager.naturalPassiveSpawn`)** — animals previously spawned only from
   chunk-generation hints, so the land around a base went permanently silent and food stopped being
   renewable. Now by daytime, biome-appropriate animals (from each biome's own animal list) trickle back
   on lit grass 24–48 blocks away, usually in pairs, capped at 8 nearby passives.
3. **Weather now feeds the spawn system** — `EntityContext.weatherBad` lets storms raise the hostile cap
   (18 → 22) and bias spawns to the surface (65%), so rain genuinely feels more dangerous.

### Gates (all run in `.fb-dev`)

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| Logic suite | 60 passed, 0 failed |
| Physics suite | all checks passed |
| DOM suite | 41 passed, 0 failed |
| HUD sprite validator | all checks passed |
| Playtest harness (incl. new DISCOVERY + LIVING WORLD section: dedupe, XP totals, silent save/load round-trip, biome-animal validity, spawner/weather/journal wiring) | exit 0, every check true |
| `npm run -s build` | OK, 1 268 889 bytes |

### Release & verification (v6.0)

| Artefact | Value |
| --- | --- |
| Commit | on `arena/01a07c07-fable` |
| `index.html` (repo root) | md5 `dbbc38e3e228710a944148a20dbd8571`, 1 268 889 bytes |
| `site-dist/game/index.html` | md5 `dbbc38e3e228710a944148a20dbd8571` (identical build) |
| `fable-source.zip` | refreshed (168 files) |
| Menu footer version | `FABLE 6.0` |

## 11. v6.1 — external QA pass

External playtesting against v6.0 reported five findings; all are fixed in this release.

| # | Finding | Fix |
| --- | --- | --- |
| 1 | **Critical** — Shader Pack shipped ON and renders corrupted (magenta/purple patches, washed-out terrain) on software renderers and some mobile GPUs | Shader Pack now ships **off by default**; a one-time migration (`migratedShaderDefault`) switches every profile saved before v6.1 back to off and caps the old "Unlimited" framerate default at 60 once. At boot the renderer string is probed (`WEBGL_debug_renderer_info`): SwiftShader/llvmpipe/software rasterisers keep the pack off even if re-enabled. `renderer.debug.onShaderError` falls back at runtime: a failed shader compile switches the pack off (persisted), rebuilds the world plain and shows "Shader Pack disabled: your GPU could not compile it." |
| 2 | **Critical** — ~240 `THREE.Material: parameter 'map' has value of undefined` console warnings per session | Glowing mob parts built their material with a `map: undefined` ternary; the options object now only includes `map` when a texture is actually passed. Verified: zero such warnings possible (no other `map:` site passes a conditional). |
| 3 | **Medium** — Video settings clipped at 1280×577: Shader Pack button hidden behind Done; grid does not reflow | Settings grid columns reflow (`repeat(auto-fit, minmax(min(200px,100%),305px))` — single column on narrow screens), the scroll pane gained `overscroll-behavior: contain`, thin scrollbar and touch scrolling, header/footer strips no longer shrink, and ≤560 px-tall viewports (phone landscape) get tighter header/footer padding so the scroll area keeps the room. |
| 4 | **Medium** — 1.26 MB single-file HTML re-downloaded on every deploy | Build is now a real split: `index.html` (1.1 KB) + `assets/index-*.js` (1.15 MB) + `assets/style-*.css` (84 KB) with a relative `./assets/` base. Browsers cache the JS/CSS between releases; only the 1 KB shell re-downloads. `fable-web-portal.zip` (itch/Newgrounds), `fable-site.zip`, the desktop Electron build (`tools/build-desktop.mjs` copies `dist/assets/`) and the site deploy all carry the assets folder; `file://` keeps working because the base is relative and the worker stays IIFE. Service-worker cache version bumped to `fable-6.1.0`. |
| 5 | **Medium** — "Play Selected World" disabled until a world is clicked | The world list pre-selects the most recent world on load (list is sorted newest-first). |

Minor fixes also in v6.1: the title splash no longer clips off-screen on narrow portrait phones (≤700 px media query); Max Framerate defaults to 60 instead of Unlimited; the title screen notes that multiplayer is self-hosted (no matchmaking); the F3 debug overlay (already present since v5.9 — fps/position/biome/time) remains the QA-asked-for performance readout.

### Gates (v6.1)

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| Logic suite | 60 passed, 0 failed |
| Physics suite | all checks passed |
| DOM suite | 41 passed, 0 failed |
| HUD sprite validator | all checks passed |
| Playtest harness | exit 0, every check true |
| `npm run -s build` | OK — split: 1 112 B html + 1.15 MB js + 84 KB css |

### Release & verification (v6.1)

| Artefact | Value |
| --- | --- |
| Commit | on `arena/01a07c07-fable` |
| `index.html` (repo root) | md5 `17ebdc55aab65edd2ec78e6dd34cf9df`, 1 112 bytes |
| `assets/` (repo root) | `index-BQ0gaWJU.js` (1 182 611 B), `style-b67xHtI-.css` (86 296 B) |
| `site-dist/game/index.html` | md5 `17ebdc55aab65edd2ec78e6dd34cf9df` (identical shell) + `game/assets/` |
| Menu footer version | `FABLE 6.1` |

## 12. v7.0 — visual & UI quality overhaul

A presentation-layer overhaul on top of the untouched v6.1 gameplay systems. Nothing was rebuilt or removed: the same engine, saves, world generation and controls all behave exactly as before — every suite passed unchanged (logic 60/0, DOM 41/0, physics, HUD validator, playtest exit 0).

### Survival HUD (hearts / hunger / XP)

- **Heart & drumstick art redesigned** in `ui/sprites.ts` (still palette-indexed bitmaps, still enforced by the sprite validator): hearts gain a glossy candy-shell read — white glint, pale key light on the upper-left lobe, saturated body, deep right shade and a warm bounce light; empty containers are now neutral steel grey so "gone" reads instantly; the drumstick gained a crown glint, toasted flecks and a shaded bone knob. Hardcore variants unchanged in silhouette.
- **Change animations**: the pip that takes damage flashes white and squashes (stepped, pixel-crisp); healing pips pop from small; hunger pips pop on gain and blink-drop on loss. Critically low health (≤ 2 hearts) jiggles faster with a hot red glow; starvation (≤ 1 shank) gives a subtle side-shake. Everything is plain CSS keyframes with `steps()` so it stays on the pixel grid, and the whole layer is disabled by Reduced Flashing / Motion Effects (accessibility).
- **XP bar rebuilt**: crisp pixel frame (no rounded corners), notched track, band-shaded green fill with pixel sheen. The fill is now animated: a rAF loop eases the shown fraction toward the real one (exponential catch-up with a speed floor — small gains feel smooth, huge gains still land fast). **Level-up sequence**: the bar races to 100 %, flashes white, the level number pops with a scale-bounce, and the leftover XP carries into the new level filling from zero — the existing `levelup` chime already fires from the player event bus. Death (level drop) snaps honestly instead of animating a lie.
- **Unified HUD spacing**: `.hud-bottom` is now `min(364px, 97vw)` so tiny landscape phones never clip the hotbar, and a dedicated **HUD Scale** setting multiplies GUI scale for the survival HUD alone.

### Items

- Tool art rebuilt for pickaxe, axe, shovel, hoe and sword in `items/Icons.ts`: curved pick head with a glint and deep-shadow tip, proper axe blade bevel, tapered sword with a bright fuller edge, crossguard and pommel, and every handle now has a top-light edge — the new `N`/`G`/`w` palette keys derive automatically from each tier's material colour, so wood/stone/iron/crystal tiers stay instantly recognisable. Because first-person held items are voxel extrusions of these same 16×16 arts, the in-hand models improved identically (the vanilla-style hand chain — swing curves, equip easing, bob — is untouched).

### Blocks & sky

- Torch tile repainted: brighter two-pixel core, wider flame fringe, ember flecks, wood-grain stick.
- Sky shader: a cold **moon halo** around the moon disc (strongest at deep night), plus a night mix that keeps a whisper of blue in the horizon band so terrain reads against the stars. No derivative functions added — stays safe on software renderers; the halo scales with the shader-pack switch.

### Settings (all real, all persisted)

- **Audio**: new `Player` bus (swing/hurt/eat/level-up/pickup/etc.) and `Weather` bus (rain + wind loops, multiplied by Ambient), each with its own volume slider; Ambient/Weather split replaces the old combined label.
- **Interface**: new **HUD Scale** slider (0.6–1.6×) scaling hearts/hunger/XP/hotbar independently of GUI scale.
- Existing systems verified complete: quality presets (Low/Medium/High/Ultra + custom), render distance, framerate cap, render scale, entity distance, chunk-load speed, particles, smooth lighting (per-vertex AO in the mesher), clouds + cloud height, weather, fog, brightness, shader pack with per-effect toggles, rebinding controls, full accessibility page (crosshair size/colour, motion, shake, reduced flashing, GUI/text scale), fullscreen (standard + WebKit API with orientation lock, already wired into the video page and F11), and localStorage persistence of the whole profile including skins.

### Gates (v7.0)

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| Logic suite | 60 passed, 0 failed |
| Physics suite | all checks passed |
| DOM suite | 41 passed, 0 failed |
| HUD sprite validator | all checks passed (new art) |
| Playtest harness | exit 0, every check true |
| `npm run -s build` | OK — split: 1 112 B shell + 1.16 MB js + 88 KB css |

### Release & verification (v7.0)

| Artefact | Value |
| --- | --- |
| Commit | on `arena/01a07c07-fable` |
| `index.html` (repo root) | md5 `7716eee1d4c2d881b1dbc51b93d8a5d7`, 1 112 bytes |
| `assets/` (repo root) | `index-CiOmdC6d.js`, `style-DKLiojKK.css` |
| `site-dist/game/` | identical shell + `assets/` + music; sw cache `fable-7.0.0` |
| Menu footer version | `FABLE 7.0` |

## 13. v7.1 — survival systems audit (12-point brief)

The brief asked for twelve survival systems. Each was audited against the real code first; **eleven were found already implemented** across v4–v7.0, verified line-by-line this pass. Only genuine gaps were filled; no working system was touched.

| # | Brief point | Audit result |
| --- | --- | --- |
| 1 | Mobs | **Already complete**: 11 mob types (4 passive + trading Keeper + Night Stalker, ranged Void Archer, Cave Crawler, flying Shadow Flyer, Stone Guardian mini-boss, 3-phase Void Wyrm boss) with per-leg walk cycles, arm/wing/tail animation, head tracking + grazing, state-machine AI (idle/wander/chase/lunge/ranged/boss phases), health, damage, directional knockback, loot drops, XP orbs, spatial sounds, sun-burning, hurt squash-and-stretch, 0.8 s death animation, day/night spawn rules + storm caps + wildlife restock. |
| 2 | Caves | **Already complete**: tube tunnels (two noise fields), cheese pockets, large chambers, vertical shafts, ravines, underground lakes (and lava at depth), ore veins for 6 ores, dungeon rooms with chests, darkness + block-light atmosphere. |
| 3 | Biomes | **Already complete**: 19 biomes including all seven requested (Forest, Plains, Desert, Snow×3, Mountains, Swamp, Stony/Mountain rock), each with own vegetation, trees, flowers, animals, fog and village eligibility; rivers, beaches, mushroom isles. |
| 4 | Crafting progression | **Already complete**: wood → stone → copper/iron/gold → crystal tool tiers, leather/iron/gold/crystal armor, voidstone/rune altar endgame recipes. |
| 5 | Furnace | **Already complete**: fuel values per item, smelt time + xp per recipe, input/fuel/output slots with accept filters, burn/cook tick, lit block state with animated texture, smoke particles, furnace sounds, furnace contents persist in the save. |
| 6 | Food + farming | **Already complete** (+1 fix below): 3 crops with growth-stage blocks and stage-specific drops, seed→farmland planting, cooking/smelting, 10+ foods with distinct hunger/saturation. *Gap fixed: growth now actually honours the "grows faster near water" loading tip (light ≥ 8 required; hydrated farmland 0.35 vs dry 0.15 vs off-farmland 0.05 per random tick).* |
| 7 | Armor | **Already complete** (+1 addition below): 4 slots with slot validation, defense absorption, per-piece durability that breaks when spent, HUD armor row. *Gap filled: armor now **shows on the player** — an equipped chestplate renders as a vanilla-style armour layer on the first-person arm, tinted per tier (leather/iron/gold/crystal), updating live on equip/unequip (there is no third-person view in FABLE; the first-person arm is the player body the camera sees).* |
| 8 | Combat | **Already complete**: per-weapon damage, attack cooldowns, directional knockback both ways, hurt squash reactions + red flash, critical hits (bonus damage + crit sound + distinct popup), vanilla-grade swing/equip/mining viewmodel, damage popups + hurt tint + shield block. |
| 9 | Structures | **Already complete**: villages (with farms and chests), desert temples, ruined towers, surface ruins, shipwrecks, underground dungeons, void vaults — seven loot tables. |
| 10 | XP purpose | **Already complete** (+1 addition below): mining XP orbs from every ore, combat XP orbs from mobs, exploration/discovery XP (biomes/loot/rare ores/wyrm), levels persisted. *Gap filled: **level-up reward** — every level now restores one heart, shown by the HUD's heal-pop animation.* |
| 11 | Saving | **Already complete**: world edits per dimension, block entities (incl. furnace contents), entities, player position/yaw/pitch/health/hunger/saturation/air/XP/level/inventory/armor/offhand/spawn/mode, time/weather/day, playtime, discovery journal, preview image; autosave + `.bak` backups + manual export. Refresh-reload verified by the earlier external QA pass. |
| 12 | World generation | **Already complete**: continent/hills/detail noise stacking, rivers with banks, oceans/beaches, mushroom isles, cave suite (see #2), biome-blended transitions, surface + underground landmarks. |

### New in v7.1

1. **Crop growth fidelity** — growth random-ticks now require light ≥ 8 and grow 2.3× faster on water-hydrated farmland (0.35/tick vs 0.15 dry, 0.05 off farmland), making the loading-screen tip true and hydration worth building for.
2. **Armor on the player** — an equipped chestplate adds a tier-tinted armour layer over the first-person forearm (leather #a8623a / iron / gold / crystal), rebuilt live when armor changes.
3. **Level-up reward** — levelling restores one heart (on top of the level-up chime).

### Gates (v7.1)

tsc clean · logic 60/0 · physics all-pass · DOM 41/0 · HUD validator green · playtest exit 0 · split build: 1 112 B shell (`0f5632249f4ede56d3c83df7f21be53c`) + `index-BkI8-0OM.js` + `style-DKLiojKK.css`; sw cache `fable-7.1.0`; menu footer `FABLE 7.1`.

## 14. v7.2 — item sprite quality pass ("why doesn't the pickaxe look like Minecraft's?")

The critique was correct, and the cause was specific: FABLE's tool sprites used chunky filled silhouettes with heavy near-black borders, while Minecraft's tool grammar is thin 2–3 px strokes, tone-ramp shading, and **no outline at all** (edges are just the sprite's darkest ramp). Minecraft's actual textures are Mojang's copyrighted art and are not copied; instead this pass adopts the *style rules* that make them read well, with original pixel placement.

### Changes

- **All five tools redrawn** (pickaxe, axe, shovel, hoe, sword) in `items/Icons.ts`:
  - classic layouts — diagonal 3 px stick handle (light top edge `w`, main `H`, dark underside `h`), arc-shaped pick head, up-left axe blade wedge, top-right spade, horizontal hoe blade with droop, 2 px sword blade with light edge and glint tip plus a perpendicular crossguard row;
  - heads use a 4-step metal ramp (`L/M/m/N`) + specular glint (`G`), all derived per tier from the material colour, so wood/stone/copper/iron/gold/crystal stay distinct;
  - removed the old structural artefacts (the previous pickaxe rendered the head's left spine and the handle as two parallel sticks merging at the bottom);
  - sword guard uses the item's own dark tone instead of an undefined palette key.
- **Outline softening**: the default `'o'` outline on the remaining arts (bow, armour, food, materials) lightened from 32 % to 42 % of the main tone, so items edge with a dark material tone instead of a black stroke — much closer to the vanilla look while keeping the icons readable on dark slots.
- Because held first-person items are voxel extrusions of these same sprites, the in-hand tools improved identically.

### Gates (v7.2)

tsc clean · logic 60/0 · physics all-pass · DOM 41/0 · playtest exit 0 · split build shell md5 `9c2cbb1ade577311…` + `index-CyQvSHSq.js` + `style-DKLiojKK.css`; sw cache `fable-7.2.0`; menu footer `FABLE 7.2`.

Note: block/world textures were audited in the same pass and already follow the vanilla rules (per-tile painters with 5–7 shade ramps, quantised noise, bevelled features, top-left light, guaranteed tile coverage — no magenta placeholders possible), which is why this release targets item sprites only.

## 15. v7.3 — the wooden pickaxe, properly

The user's follow-up critique ("why is the wooden pickaxe so bad?") traced to two specific faults, both fixed at the root:

1. **Head composition.** Even after v7.2 the pickaxe head was a quarter-arc whose left arm ran parallel above the handle — at game size the sprite read as *two sticks*. Redrawn as the classic composition: a wide arch spanning the top of the sprite with **both tips drooping down** (left tip to the left edge, right tip down the right side), a 3 px apex band with the light ramp on the top-left edge and the deep-shadow ramp on the underside, and a single 45° stick handle that plugs into the arch's underside right-of-center. Verified by re-dumping the applied art from the real source.
2. **Wood-on-wood value mush.** The wooden head (`#9c7a4a`) and its handle (`#8a6a3a`) were nearly the same brown, so nothing separated them. The wooden tier head is now a lighter tan (`#b08a50` with a `#eeba6c`-family highlight ramp), and the shared handle override (used by every tool tier, as handles are always wood) darkened to `#6e5230`/`#453320` — the head now pops off the stick at any size, for all six tiers.

Original art throughout — the vanilla *structure and shading rules* (thin strokes, tone ramps, top-left light, no borders), not Mojang's pixels.

### Gates (v7.3)

tsc clean · logic 60/0 · physics all-pass · DOM 41/0 · playtest exit 0 · build shell md5 `1a40c3c574af36…` + `index-CjLP33ex.js`; sw cache `fable-7.3.0`; menu footer `FABLE 7.3`.

## 16. v7.4 — sprite defects seen with real eyes, then fixed; mining pacing measured

Two user complaints investigated to ground truth this pass:

### "Why do I mine so fast?" — measured: it doesn't

Built a probe (`tools/probe-build.mjs` + esbuild harness) that calls the **real shipped `mineTime()`** with real item/block definitions. All eight canonical cases match Minecraft exactly: dirt+hand 0.750 s, log+hand 3.000 s, log+wooden axe 1.500 s, stone+hand 7.500 s (and no drop), stone+wooden pickaxe 1.125 s, stone+iron pickaxe 0.375 s, iron ore+stone pickaxe 1.125 s, leaves+hand 0.300 s. The frame loop was also audited (both the unlimited and FPS-capped paths advance simulated time exactly once per rendered frame, delta clamped at 0.1 s — no double-stepping). Survival mining pacing **is** vanilla; creative worlds break instantly by design. The quickness players notice at wooden-tier tools (1.1 s stone) is Minecraft's own number.

### "Make the wooden pickaxe actually look like one" — the render loop

This pass added what previous sprite passes lacked: **actual images**. The item arts are now rendered with their real palette math to a PNG sheet (`/home/user/tool-sprites.png`) and inspected visually, iterating until correct. Seeing them exposed defects ASCII previews had hidden:

- **Pickaxe**: the handle did not touch the head at all — a visible gap made it literally two separate sticks. Now the handle plugs into the arch's right tip; arch, drooping tips and handle are one connected shape.
- **Axe**: was a symmetric mallet blob. Now the classic asymmetric head — blade fanning out to the lower-left, poll to the right of the handle, handle's light top edge visible entering the head.
- **Hoe**: was a centred block (a hammer). Now a thin blade plate with the handle entering at its right end — the bent-neck hoe silhouette.
- Shovel and sword confirmed good by the same inspection.

A hard rule is now enforced during design: **every art row must 4-connect to the row above** (validated programmatically), so no sprite can ship with floating/detached parts again. Original art throughout — vanilla grammar (thin strokes, 4-step ramps, top-left light), not Mojang's pixels.

### Gates (v7.4)

tsc clean · logic 60/0 · physics all-pass · DOM 41/0 · playtest exit 0 · build shell md5 `835e655fec2539…` + `index-CROVMnQF.js`; sw cache `fable-7.4.0`; menu footer `FABLE 7.4`.

## 17. v7.5–v7.7 — hands that hold, pack support, languages, settings

The first-person pass had one bug players could see every second: **held items were see-through**. The viewmodel was drawn with `depthTest: false` into the same pass as the world, so an item's own back faces overpainted its front faces — a pickaxe became wireframe ghost-art at certain angles. The hand is now rendered as a proper second pass: world first, then the depth buffer is cleared and the hand scene (camera included) is drawn on top. Internal occlusion resolves normally; the hand always sits over the world. Verified by code path — no more render-order hacks anywhere in the file.

Second, items are now **gripped by the player's arm**, matched to the "Hold in hands" reference. v7.5's first arm attempt had a unit bug — the skin-arm mesh is built in 12-model-px units but was scaled as if ~1 plate unit, throwing the fist far off screen (items looked like they floated with no arm). The shipped version fits the pose in screen space against the reference (fixed-70° hand projection, 16:9): flat items render at 0.7× the vanilla plate scale, rotated 28° about an interior pivot so the sprite stands near-vertical — handle at ~78% right / ~88% down, tip ~13% from the top, blade ≈ 0.76 screen heights (reference: big diagonal tool from the bottom-right). The skin/palette arm (chestplate bracer included) is scaled 0.0465 plate-units per model-px, rotated −1.6 rad and planted fist-on-handle, forearm exiting through the bottom-right corner like the reference's blocky arm. Every held flat item gets the arm (tools, weapons, food, materials); **Arm Holds Items** toggles it.

Third, the v7.2–7.4 icon work gets its final coat: `drawArt` now paints an **automatic 1-px dark rim** around every item sprite (4-neighbour outline, tone 0.30), the classic inventory look from the reference sheet. Rendered to PNG and inspected — bold outlines on all five tools, matches the ref.

Plus:
- **Resource packs** (Settings → Resource Packs): load any Minecraft pack `.zip`/`.mcpack` (e.g. Faithful — user-supplied, nothing bundled). ~70 block tiles and ~60 items map to their vanilla texture paths, grayscale sources are tinted (grass/leaves), animated strips use frame 0, HD packs downsample to 16². Textures swap live in world + icons + hand, persist in IndexedDB, re-apply on boot, and Clear Pack restores the built-in art. Mapping integrity is test-enforced (498 checks: every tile/item key must exist in the game).
- **Icon rims darkened** to tone 0.22 (from 0.30) after re-inspecting the reference sheet — the heavy near-black outline is the sheet's signature. Re-rendered and eyeballed: bold rims on all five tools.
- **Languages 4 → 9**: Italian, Portuguese, Russian, Japanese, Chinese join EN/ES/DE/FR; the language screen picks them up automatically.
- **New settings**: FOV Effects (sprint/bow kick), Day Cycle Speed (½/1×/2×/4×), Arm Holds Items, Crosshair Opacity, plus the pack manager; all persist in the settings store.
- **Self-hosted note** moved to where it belongs: the Multiplayer menu now leads with "Self-hosted only — no matchmaking or public server list… (npm run server)"; title screen hint removed.

### Gates (v7.6 — shipped pose, dark rims, `index-DL_OBTri.js`; sw `fable-7.6.0`)

tsc clean · logic 60/0 · physics all-pass · DOM 41/0 · playtest exit 0 · HUD validator pass · pack mappings 498/0. (v7.5 interim build: `index-B8Y1bnpZ.js`, published 12:22Z, superseded within the hour by the grip fix.)

### §17.3 v7.8 — measured-reference pose (fat arm, natural orientation, +7° lean)

Playtesting v7.7 against pixel measurements of the reference (1568x882) showed the remaining gaps: the arm rendered ~3x too thin (0.11 vs the ref's 0.33 screen-heights), the mirror made the item lean the wrong way (ref's head is top-RIGHT of the fist), and the ref's arm punches in at ~37 degrees below horizontal rather than hanging down. v7.8, fitted by direct arithmetic against the measured pixels (fist 0.79/0.82, tip 0.91/0.13, arm width 0.33, arm angle 37.6 deg):

- **Un-mirrored** the held item (ref orientation is the art's natural one: handle lower-left into the fist, head top-right); back to scale (2,2,2), DoubleSide kept only where needed.
- **HELD_POS (0.65, -0.517), THETA +7 deg** (err 0.014 on the two-anchor solve): fist (0.790, 0.820), head tip (0.911, 0.117), plate near-upright like the ref.
- **HELD_ARM_S 0.058** -> arm 0.33 screen-heights wide (the ref's measured forearm); **HELD_ARM_PHI 0.35** -> exits at 36.4 deg (ref 37.6). Also found and fixed a units bug in the fit scripts (translation solve had the projection factor upside down) — v7.7's shipped numbers were hand-derived and unaffected, but this explains earlier proof/game mismatches.
- Gates: tsc, logic 60/0, physics, DOM 41/0, playtest, HUD, pack 498/0. Build `index-BkKWOA-Y.js`, sw `fable-7.8.0`.

### §17.2 v7.7 — the actual reference read (billboard + mirrored + chunky art)

Playtesting v7.6 against the reference showed three real gaps: the vanilla flat-item pose tilts the sprite ~45° and shrinks it ("small and on an angle"), the un-mirrored art points the handle the wrong way, and the tool arts themselves were too dainty next to the sheet. v7.7:

- **Billboard pose, hand-derived:** the flat-item branch of the Java chain is replaced at rest by a screen-parallel plate at z −1.0 (`HELD_POS {0.007,−0.24}`, `HELD_PZ −1.5` since the plate lives at group z 0.5, θ −24°, scale 1.0) — zero perspective shear by construction, fist anchor (0.92,0.06) lands at (0.850, 0.899), head top 2% from the top of frame, tool ≈ 0.88 screen heights. Swing/eat/equip/bow still compose through the chain before this branch.
- **Mirrored grip:** the item mesh carries scale (−2,2,2) with x-position 1.0 (maps the plate to [0,1] flipped — the v7.6 mirror at x 0.5 was a half-plate bug that shoved the sprite to [−0.5,0.5]) + DoubleSide for the flipped winding; tools now read right-handed exactly like the reference (head up-left, handle down-right into the arm at φ +0.374).
- **Chunky sheet art:** pickaxe/axe/shovel/hoe rebuilt with 2-px handles and solid fat heads (the sheet's build); sword kept (v7.4-verified). Pickaxe handle re-rooted in the arc's centre after the first redraw sprouted it from a prong. Render-verified on the sprite sheet PNG.
- Arm math unchanged (12 px mesh, 0.0465 units/px, fist planted on the mirrored handle pixels).

Pose proof re-rendered with the exact shipped constants (`held-pose-check.png`): mirrored pickaxe near-vertical, arm box at the handle's foot exiting bottom-right — the reference composition.

### §17.1 pose verification (post-release)

The shipped v7.6 constants were re-projected through the exact hand-pass math (fixed-70°, 16:9) in a standalone script and rendered to `/home/user/held-pose-check.png`: plate near-vertical on the right side, blade arc upper half, fist lands at (0.79, 0.88) with the arm box exiting the bottom-right corner — matching the reference composition line-for-line. Anchor error ≤ 0.02 screen fractions. The plate's right corner crosses the right screen edge (mirroring the reference, where the arm is cropped by the frame); diagonal-tool art pixels stay fully on screen. Local preview re-verified serving v7.6 (shell md5 `2a63f1ed…`, `index-DL_OBTri.js` 200). Live github.io could not be byte-probed from the sandbox this session (TLS egress flake); Pages API reports `built` for `0b588cf` (v7.6).
