import { SaveManager } from '../src/game/save/SaveManager';
import type { WorldSave } from '../src/game/core/types';

let passed = 0;
function check(value: unknown, label: string) {
  if (!value) throw new Error(label);
  passed++;
}
const save: WorldSave = {
  id: 'crash-recovery-test',
  options: { name: 'Recovery', seed: 42, seedText: '42', mode: 'survival', difficulty: 'normal', worldType: 'default', structures: true, bonusItems: false, keepInventory: false, cheats: false },
  created: 1, lastPlayed: 1, time: 1000, day: 0, weather: { type: 'clear', timer: 600 },
  player: { pos: [0, 70, 0], yaw: 0, pitch: 0, health: 20, hunger: 20, saturation: 5, air: 300, xp: 0, level: 0, inventory: Array(36).fill(null), armor: Array(4).fill(null), spawn: null, flying: false, selected: 0, mode: 'survival' },
  edits: {}, blockEntities: {}, entities: [], visited: [], playTime: 0,
};
check(SaveManager.validate(structuredClone(save))?.id === save.id, 'valid world loads');
const brokenPlayer = structuredClone(save) as unknown as Record<string, unknown>;
brokenPlayer.player = { pos: null, inventory: null };
check(SaveManager.validate(brokenPlayer) === null, 'truncated player is rejected instead of crashing load');
const poisoned = structuredClone(save);
poisoned.edits['0,0'] = [0, 5, 2]; // odd number of edit entries
poisoned.blockEntities['o:1,2,3'] = null;
poisoned.entities = [{ type: 'bovin', pos: [NaN, 1, 2], health: 10, yaw: 0 }];
const repaired = SaveManager.validate(poisoned);
check(repaired && !('0,0' in repaired.edits) && !('o:1,2,3' in repaired.blockEntities) && repaired.entities.length === 0, 'bad optional records are dropped');
await SaveManager.put(structuredClone(save));
await SaveManager.put({ ...structuredClone(save), day: 2 });
// Simulate an interrupted write: primary exists but its player was truncated.
const memory = (SaveManager as unknown as { memory: Map<string, WorldSave> }).memory;
memory.set(save.id, brokenPlayer as unknown as WorldSave);
const recovered = await SaveManager.get(save.id);
check(recovered?.day === 0 && recovered.player?.pos[1] === 70, 'last good backup survives corrupt primary');
console.log(`${passed} save recovery checks passed`);
