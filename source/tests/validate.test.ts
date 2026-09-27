// Registry validation: runs the REAL block/item/recipe/drop/progression checks over the shipped
// registries. Any structural break (missing item, bad recipe reference, unobtainable block,
// duplicate id, tool with no durability) fails the build instead of shipping quietly.
{
  const g = globalThis as unknown as Record<string, unknown>;
  const noop = () => undefined;
  const ctx = new Proxy({}, {
    get(_t, p) {
      if (p === 'createImageData') return (a: number, b: number) => ({ data: new Uint8ClampedArray(a * b * 4), width: a, height: b });
      if (p === 'getImageData') return (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'canvas') return undefined;
      return noop;
    },
    set() { return true; },
  });
  g.document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx, toDataURL: () => 'data:,' }), createElementNS: () => ({ style: {} }) };
  g.window = undefined;
}

const { runValidation, validateRegistries } = await import('../src/game/core/Validate');
const report = runValidation();

if (report.errors > 0) {
  console.error(`\nFAILED: ${report.errors} registry error(s)`);
  process.exit(1);
}
console.log(`\nregistry validation passed (${report.warns} warning(s))`);

// ---- negative tests: the validator must actually detect faults, not just always pass.
// Each case breaks one registry entry, re-runs the checks, then restores it.
let neg = 0, negFail = 0;
const expectError = (label: string, area: string, mutate: () => () => void): void => {
  const undo = mutate();
  const r = validateRegistries();
  const hit = r.issues.some((i) => i.level === 'error' && i.area === area);
  undo();
  if (hit) neg++; else { negFail++; console.error(`FAIL: validator missed injected fault: ${label}`); }
  const after = validateRegistries();
  if (after.errors !== 0) { negFail++; console.error(`FAIL: registry not restored after '${label}' (${after.errors} errors linger)`); }
};

const { ITEMS } = await import('../src/game/items/Items');
const { BLOCKS } = await import('../src/game/blocks/Blocks');
const { RECIPES } = await import('../src/game/crafting/Recipes');

expectError('recipe -> missing item', 'recipes', () => {
  const r = RECIPES[0]; const old = r.result.id; r.result.id = 'definitely_not_an_item';
  return () => { r.result.id = old; };
});
expectError('block drops a phantom item', 'drops', () => {
  const b = BLOCKS.find((x) => x && x.drops && x.drops.length)!;
  const old = b.drops![0].item; b.drops![0].item = 'ghost_item';
  return () => { b.drops![0].item = old; };
});
expectError('tool with no durability', 'tools', () => {
  const t = [...ITEMS.values()].find((i) => i.tool)!;
  const old = t.tool!.durability; t.tool!.durability = 0;
  return () => { t.tool!.durability = old; };
});
expectError('block needing an impossible tool tier', 'progression', () => {
  const b = BLOCKS.find((x) => x && x.tool === 'pickaxe' && x.tier > 0)!;
  const old = b.tier; b.tier = 99;
  return () => { b.tier = old; };
});
expectError('tile index outside the atlas', 'blocks', () => {
  const b = BLOCKS.find((x) => x && x.name === 'stone')!;
  const old = b.tiles[0]; b.tiles[0] = 99999;
  return () => { b.tiles[0] = old; };
});
expectError('stackable tool', 'stacking', () => {
  const t = [...ITEMS.values()].find((i) => i.tool)!;
  const old = t.maxStack; t.maxStack = 64;
  return () => { t.maxStack = old; };
});

console.log(`negative tests: ${neg} detected, ${negFail} missed`);
if (negFail > 0) process.exit(1);
