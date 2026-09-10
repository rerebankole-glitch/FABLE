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
