export interface Settings {
  renderDistance: number;
  fov: number;
  smoothLighting: boolean;
  particles: number; // 0 none, 1 reduced, 2 all
  viewBobbing: boolean;
  clouds: boolean;
  fog: boolean;
  chunkSpeed: number; // 1..3
  masterVolume: number;
  musicVolume: number;
  envVolume: number;
  weatherVolume: number;
  mobVolume: number;
  blockVolume: number;
  uiVolume: number;
  /** player action cues (swing / hurt / eat / level-up) */
  playerVolume: number;
  sensitivity: number;
  invertMouse: boolean;
  toggleSprint: boolean;
  uiScale: number;
  cameraShake: boolean;
  motionEffects: boolean;
  crosshairSize: number;
  crosshairColor: string;
  language: string;
  keys: Record<string, string>;
  playerName: string;
  flyKey: string;
  /** hop up one-block ledges automatically while walking */
  autoJump: boolean;
  /** one-time mouse-look migration marker: see the note in the store below */
  migratedSensitivity: boolean;
  /** one-time safety migration: the shader pack used to default on and broke rendering on some GPUs */
  migratedShaderDefault: boolean;
  /** internal: set once the auto-jump default migration has been applied to a saved profile */
  migratedAutoJump: boolean;
  /** 0 = unlimited (vsync) */
  maxFps: number;
  /** render scale: multiplier on the native device pixel ratio (0.5 .. 2, applied relative to the
   *  panel's real resolution so 1 = native crispness and 1.5-2 supersamples above it) */
  renderScale: number;
  /** show autosave indicator + coordinates in the HUD */
  showCoordinates: boolean;
  /** rain / snow rendering */
  weather: boolean;
  /** entity / mob render distance in blocks */
  entityDistance: number;
  /** name of the preset the current video settings were derived from ('custom' when hand-tuned) */
  quality: QualityPreset;
  /** text size multiplier for chat / tooltips */
  textScale: number;
  /** flash the screen less when hurt */
  reducedFlashing: boolean;
  /** dismissed getting-started checklist in the recipe book */
  hideChecklist: boolean;
  /** show distinct outline colours for hostile / passive mobs when looked at */
  highContrastOutline: boolean;
  sneakToggle: boolean;
  /** shader pack master switch (individual features below only apply while this is on) */
  shaders: boolean;
  shaderWaving: boolean;
  shaderWater: boolean;
  shaderGrade: boolean;
  shaderSunlight: boolean;
  shaderGodrays: boolean;
  shaderBloom: boolean;
  shaderVignette: boolean;
  /** overall brightness / gamma lift (0 = default, 1 = bright) */
  brightness: number;
  /** cloud height in blocks */
  cloudHeight: number;
  /** hide the first-person hand */
  showHand: boolean;
  /** 'right' | 'left' main hand side */
  mainHand: 'right' | 'left';
  /** crosshair style */
  crosshairStyle: 'cross' | 'dot' | 'circle';
  /** hotbar / HUD opacity 0.3..1 */
  hudOpacity: number;
  /** extra scale for the in-game HUD (hearts / hunger / xp / hotbar), 1 = follow GUI scale */
  hudScale: number;
  /** show a small tooltip with the held item's name when scrolling the hotbar */
  heldItemTooltips: boolean;
  /** hurt screen tint */
  damageTint: boolean;
  /** lens dirt / chromatic touches on bloom (subtle) */
  shaderColorTemp: number; // -1 cool .. 1 warm
  /** name of the loaded resource pack ('' = none); the pack file itself lives in IndexedDB */
  resourcePack: string;
  /** sprint/bow FOV zoom effect */
  sprintFov: boolean;
  /** first-person arm shown gripping held items */
  heldArm: boolean;
  /** day cycle speed multiplier (1 = vanilla 20-minute day) */
  timeSpeed: number;
  /** crosshair opacity 0.2..1 */
  crosshairOpacity: number;
  /** player appearance palette used when no skin texture is uploaded */
  skin: { skin: string; hair: string; shirt: string; pants: string };
  /** uploaded player skin texture (data URL); empty = none */
  skinUrl: string;
  /** slim (3px) arms detected on the uploaded skin */
  skinSlim: boolean;
  /** which built-in skin preset is equipped ('custom' when a file was uploaded) */
  skinPreset: string;
  /** equipped headwear cosmetic ('none' | 'crown' | 'miner' | ...) */
  headwear: string;
}

export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra' | 'custom';

/** Video values applied by each quality preset (everything else is left as the player set it). */
export const QUALITY_PRESETS: Record<Exclude<QualityPreset, 'custom'>, Partial<Settings>> = {
  low: { renderDistance: 4, smoothLighting: false, particles: 0, clouds: false, fog: true, weather: false, renderScale: 0.75, entityDistance: 48, chunkSpeed: 1, shaders: false },
  medium: { renderDistance: 6, smoothLighting: true, particles: 1, clouds: true, fog: true, weather: true, renderScale: 1, entityDistance: 64, chunkSpeed: 2, shaders: true },
  high: { renderDistance: 8, smoothLighting: true, particles: 2, clouds: true, fog: true, weather: true, renderScale: 1.5, entityDistance: 96, chunkSpeed: 2, shaders: true },
  ultra: { renderDistance: 12, smoothLighting: true, particles: 2, clouds: true, fog: true, weather: true, renderScale: 2, entityDistance: 128, chunkSpeed: 3, shaders: true },
};

export const DEFAULT_KEYS: Record<string, string> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sprint: 'ControlLeft', sneak: 'ShiftLeft',
  inventory: 'KeyE', drop: 'KeyQ', chat: 'KeyT', fly: 'KeyF', debug: 'F3', perspective: 'F5', pause: 'Escape',
  slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3', slot4: 'Digit4', slot5: 'Digit5', slot6: 'Digit6', slot7: 'Digit7', slot8: 'Digit8', slot9: 'Digit9',
};

export const KEY_LABELS: Record<string, string> = {
  forward: 'Walk Forward', back: 'Walk Backward', left: 'Strafe Left', right: 'Strafe Right', jump: 'Jump', sprint: 'Sprint', sneak: 'Sneak',
  inventory: 'Inventory', drop: 'Drop Item', chat: 'Chat / Commands', fly: 'Toggle Flight', debug: 'Debug Overlay', perspective: 'Perspective', pause: 'Pause',
  slot1: 'Hotbar 1', slot2: 'Hotbar 2', slot3: 'Hotbar 3', slot4: 'Hotbar 4', slot5: 'Hotbar 5', slot6: 'Hotbar 6', slot7: 'Hotbar 7', slot8: 'Hotbar 8', slot9: 'Hotbar 9',
};

export const DEFAULT_SETTINGS: Settings = {
  renderDistance: 6, fov: 75, smoothLighting: true, particles: 2, viewBobbing: true, clouds: true, fog: true, chunkSpeed: 2,
  masterVolume: 0.8, musicVolume: 0.5, envVolume: 0.8, weatherVolume: 0.8, mobVolume: 0.9, blockVolume: 0.9, uiVolume: 0.8, playerVolume: 1,
  sensitivity: 0.3, invertMouse: false, toggleSprint: false, uiScale: 1, cameraShake: true, motionEffects: true,
  crosshairSize: 1, crosshairColor: '#ffffff', language: 'en', keys: { ...DEFAULT_KEYS }, playerName: 'Player', flyKey: 'KeyF',
  autoJump: true, migratedAutoJump: true, migratedShaderDefault: true, migratedSensitivity: true, maxFps: 60, renderScale: 1.5, showCoordinates: false, weather: true, entityDistance: 64, quality: 'medium', textScale: 1,
  reducedFlashing: false, highContrastOutline: false, sneakToggle: false, hideChecklist: false,
  shaders: false, shaderWaving: true, shaderWater: true, shaderGrade: true, shaderSunlight: true, shaderGodrays: true, shaderBloom: true, shaderVignette: true,
  brightness: 0, cloudHeight: 150, showHand: true, mainHand: 'right', crosshairStyle: 'cross', hudOpacity: 1, hudScale: 1, heldItemTooltips: true, damageTint: true, shaderColorTemp: 0,
  resourcePack: '', sprintFov: true, heldArm: true, timeSpeed: 1, crosshairOpacity: 1,
  skin: { skin: '#d8a878', hair: '#5a3a22', shirt: '#3f6f9f', pants: '#3b3b5a' }, skinUrl: '', skinSlim: false, skinPreset: 'steve', headwear: 'none',
};

// Settings key history: 'mwe-settings-v1' (previous builds) is migrated on first launch.
const KEY = 'fable-settings-v1';
const LEGACY_KEYS = ['mwe-settings-v1'];

/**
 * Applies every one-time migration to a stored settings payload. Pure and exported so the headless
 * playtest can prove that an untouched old profile moves over while a deliberately tuned one does
 * not - this runs against real saved profiles, so it is worth being able to test it directly.
 */
export function migrateStoredSettings(base: Settings, parsed: Partial<Settings>): Settings {
  let value: Settings = { ...base, ...parsed, keys: { ...base.keys, ...(parsed.keys || {}) } };
  value.renderDistance = Math.max(2, Math.min(16, value.renderDistance | 0));
  // Minecraft control scheme (Sneak = Shift, Sprint = Ctrl): players who never rebound keep
  // the old defaults (Sprint = Shift / Sneak = Ctrl) and are switched over automatically.
  if (value.keys.sprint === 'ShiftLeft' && value.keys.sneak === 'ControlLeft') {
    value = { ...value, keys: { ...value.keys, sprint: 'ControlLeft', sneak: 'ShiftLeft' } };
  }
  // Auto-jump became the default: a profile saved before that change has autoJump:false only
  // because it was the old default, so it is switched over once. Anyone who turns the option
  // off after this sticks, because the flag is stored with their settings.
  if (parsed.autoJump === false && !parsed.migratedAutoJump) value = { ...value, autoJump: true, migratedAutoJump: true };
  // Mouse look was too fast out of the box: the old default (0.5) turned about 0.115 deg per pixel,
  // roughly 50% quicker than the reference scheme, which reads as twitchy. New profiles use 0.3
  // (~0.086 deg/px); a profile still on the untouched old default moves over once, and anyone who
  // has since tuned the slider keeps their number.
  if (!parsed.migratedSensitivity) {
    value = { ...value, migratedSensitivity: true, ...(parsed.sensitivity === 0.5 ? { sensitivity: 0.3 } : {}) };
  }
  // One-time safety migration (external playtesting found the shader pack rendering broken
  // magenta/washed-out on software renderers and mobile GPUs): profiles saved before this
  // point had shaders ON because it used to be the default, so it is switched OFF once and
  // "Unlimited" max framerate (the old default, a battery drain) is capped at 60. Anyone who
  // changes either setting afterwards keeps their choice - the flag is stored with settings.
  if (!parsed.migratedShaderDefault) {
    value = { ...value, shaders: false, migratedShaderDefault: true, ...(parsed.maxFps === 0 ? { maxFps: 60 } : {}) };
  }
  return value;
}

class SettingsStore {
  value: Settings;
  private listeners = new Set<() => void>();
  constructor() {
    this.value = { ...DEFAULT_SETTINGS, keys: { ...DEFAULT_KEYS } };
    try {
      let raw = localStorage.getItem(KEY);
      if (!raw) for (const k of LEGACY_KEYS) { raw = localStorage.getItem(k); if (raw) break; }
      if (raw) this.value = migrateStoredSettings(this.value, JSON.parse(raw) as Partial<Settings>);
    } catch { /* ignore */ }
  }
  /** Apply a quality preset; the individual values can still be tweaked afterwards (preset then reads 'custom'). */
  applyPreset(preset: QualityPreset): void {
    if (preset === 'custom') { this.set('quality', 'custom'); return; }
    this.value = { ...this.value, ...QUALITY_PRESETS[preset], quality: preset };
    this.save();
  }
  /** Returns the preset that matches the current video values, or 'custom'. */
  detectPreset(): QualityPreset {
    for (const [name, vals] of Object.entries(QUALITY_PRESETS) as [Exclude<QualityPreset, 'custom'>, Partial<Settings>][]) {
      let same = true;
      for (const k of Object.keys(vals) as (keyof Settings)[]) if (this.value[k] !== vals[k]) { same = false; break; }
      if (same) return name;
    }
    return 'custom';
  }
  set<K extends keyof Settings>(k: K, v: Settings[K]): void {
    this.value = { ...this.value, [k]: v };
    if (k !== 'quality' && k in QUALITY_PRESETS.medium) this.value.quality = this.detectPreset();
    this.save();
  }
  setKey(action: string, code: string): void {
    this.value = { ...this.value, keys: { ...this.value.keys, [action]: code } };
    this.save();
  }
  reset(): void {
    this.value = { ...DEFAULT_SETTINGS, keys: { ...DEFAULT_KEYS } };
    this.save();
  }
  save(): void {
    try { localStorage.setItem(KEY, JSON.stringify(this.value)); } catch { /* ignore */ }
    this.listeners.forEach((l) => l());
  }
  subscribe(l: () => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

export const settings = new SettingsStore();

/**
 * The chunk-shader feature set implied by the current settings (all off when the pack is disabled).
 *
 * `linearOut` is set when the PostFX composite pass is active: the world materials then write
 * LINEAR colour and PostFX performs the single sRGB encode. It mirrors exactly the condition
 * Game.ts uses to enable postFx, so the two can never disagree.
 */
export function shaderFeatures(s: Settings = settings.value): { waving: boolean; water: boolean; grade: boolean; sunlight: boolean; godrays: boolean; linearOut: boolean } {
  const linearOut = postFxActive(s);
  if (!s.shaders) return { waving: false, water: false, grade: false, sunlight: false, godrays: false, linearOut };
  return { waving: s.shaderWaving, water: s.shaderWater, grade: s.shaderGrade, sunlight: s.shaderSunlight, godrays: s.shaderGodrays, linearOut };
}

/** True when the PostFX composite pass runs this frame (single source of truth for both callers). */
export function postFxActive(s: Settings = settings.value): boolean {
  return s.shaders && (s.shaderBloom || s.shaderVignette || Math.abs(s.shaderColorTemp) > 0.01);
}

export function keyName(code: string): string {
  if (!code) return 'None';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = { Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', Escape: 'Esc', Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB' };
  return map[code] || code;
}

// ---------------- i18n ----------------
type Dict = Record<string, string>;
const en: Dict = {
  options: 'Options...', quit: 'Quit Game', game_menu: 'Game Menu', play_selected: 'Play Selected World', more_options: 'More World Options...', disconnect: 'Disconnect', video: 'Video Settings...', music_sounds: 'Music & Sounds...', controls_btn: 'Controls...', language_btn: 'Language...', accessibility_btn: 'Accessibility Settings...', fov: 'FOV', difficulty_label: 'Difficulty', saving: 'Saving world', saved: 'Saved!',
  play: 'Play', singleplayer: 'Singleplayer', multiplayer: 'Multiplayer', settings: 'Settings', language: 'Language', credits: 'Credits',
  back: 'Back', done: 'Done', cancel: 'Cancel', create_world: 'Create New World', world_name: 'World Name', seed: 'Seed',
  game_mode: 'Game Mode', difficulty: 'Difficulty', world_type: 'World Type', structures: 'Generate Structures', bonus_items: 'Bonus Starting Items',
  keep_inventory: 'Keep Inventory', cheats: 'Allow Cheats', generate: 'Generate World', select_world: 'Select World', delete: 'Delete', rename: 'Rename',
  resume: 'Back to Game', save: 'Save World', exit_menu: 'Save & Quit to Title', you_died: 'You Died!', respawn: 'Respawn', main_menu: 'Title Screen', game_over: 'Game Over!', hardcore_hint: 'Hardcore: death deletes this world!', delete_world: 'Delete World',
  survival: 'Survival', creative: 'Creative', spectator: 'Spectator', hardcore: 'Hardcore', peaceful: 'Peaceful', easy: 'Easy', normal: 'Normal', hard: 'Hard',
  loading: 'Loading world...', on: 'ON', off: 'OFF', graphics: 'Graphics', audio: 'Audio', controls: 'Controls', accessibility: 'Accessibility',
  connect: 'Connect', server_address: 'Server Address', no_worlds: 'No worlds yet. Create one to start playing.', last_played: 'Last played',
  new_world: 'New World', random: 'Random', direct_connect: 'Direct Connect', reset: 'Reset to Defaults',
};
const es: Dict = {
  options: 'Opciones...', quit: 'Salir del juego', game_menu: 'Menú del juego', play_selected: 'Jugar mundo seleccionado', more_options: 'Más opciones de mundo...', disconnect: 'Desconectar', video: 'Ajustes de vídeo...', music_sounds: 'Música y sonidos...', controls_btn: 'Controles...', language_btn: 'Idioma...', accessibility_btn: 'Accesibilidad...', fov: 'Campo de visión', difficulty_label: 'Dificultad', saving: 'Guardando mundo', saved: '¡Guardado!',
  play: 'Jugar', singleplayer: 'Un jugador', multiplayer: 'Multijugador', settings: 'Ajustes', language: 'Idioma', credits: 'Créditos',
  back: 'Atrás', done: 'Hecho', cancel: 'Cancelar', create_world: 'Crear mundo', world_name: 'Nombre del mundo', seed: 'Semilla',
  game_mode: 'Modo de juego', difficulty: 'Dificultad', world_type: 'Tipo de mundo', structures: 'Generar estructuras', bonus_items: 'Objetos iniciales',
  keep_inventory: 'Conservar inventario', cheats: 'Permitir trucos', generate: 'Generar mundo', select_world: 'Seleccionar mundo', delete: 'Borrar', rename: 'Renombrar',
  resume: 'Volver al juego', save: 'Guardar mundo', exit_menu: 'Guardar y salir', you_died: '¡Has muerto!', respawn: 'Reaparecer', main_menu: 'Menú principal', game_over: '¡Fin del juego!', hardcore_hint: 'Extremo: ¡la muerte borra este mundo!', delete_world: 'Borrar mundo',
  survival: 'Supervivencia', creative: 'Creativo', spectator: 'Espectador', hardcore: 'Extremo', peaceful: 'Pacífico', easy: 'Fácil', normal: 'Normal', hard: 'Difícil',
  loading: 'Cargando mundo...', on: 'SÍ', off: 'NO', graphics: 'Gráficos', audio: 'Sonido', controls: 'Controles', accessibility: 'Accesibilidad',
  connect: 'Conectar', server_address: 'Dirección del servidor', no_worlds: 'Aún no hay mundos. Crea uno para empezar.', last_played: 'Última partida',
  new_world: 'Nuevo mundo', random: 'Aleatoria', direct_connect: 'Conexión directa', reset: 'Restablecer',
};
const de: Dict = {
  options: 'Optionen...', quit: 'Spiel beenden', game_menu: 'Spielmenü', play_selected: 'Ausgewählte Welt spielen', more_options: 'Weitere Weltoptionen...', disconnect: 'Verbindung trennen', video: 'Grafikeinstellungen...', music_sounds: 'Musik & Geräusche...', controls_btn: 'Steuerung...', language_btn: 'Sprache...', accessibility_btn: 'Barrierefreiheit...', fov: 'Sichtfeld', difficulty_label: 'Schwierigkeit', saving: 'Welt wird gespeichert', saved: 'Gespeichert!',
  play: 'Spielen', singleplayer: 'Einzelspieler', multiplayer: 'Mehrspieler', settings: 'Einstellungen', language: 'Sprache', credits: 'Mitwirkende',
  back: 'Zurück', done: 'Fertig', cancel: 'Abbrechen', create_world: 'Neue Welt', world_name: 'Weltname', seed: 'Startwert',
  game_mode: 'Spielmodus', difficulty: 'Schwierigkeit', world_type: 'Welttyp', structures: 'Bauwerke generieren', bonus_items: 'Startgegenstände',
  keep_inventory: 'Inventar behalten', cheats: 'Cheats erlauben', generate: 'Welt erstellen', select_world: 'Welt auswählen', delete: 'Löschen', rename: 'Umbenennen',
  resume: 'Zurück zum Spiel', save: 'Welt speichern', exit_menu: 'Speichern und beenden', you_died: 'Du bist gestorben!', respawn: 'Wiederbeleben', main_menu: 'Hauptmenü', game_over: 'Spiel vorbei!', hardcore_hint: 'Hardcore: Tod löscht diese Welt!', delete_world: 'Welt löschen',
  survival: 'Überleben', creative: 'Kreativ', spectator: 'Zuschauer', hardcore: 'Hardcore', peaceful: 'Friedlich', easy: 'Einfach', normal: 'Normal', hard: 'Schwer',
  loading: 'Welt wird geladen...', on: 'AN', off: 'AUS', graphics: 'Grafik', audio: 'Ton', controls: 'Steuerung', accessibility: 'Barrierefreiheit',
  connect: 'Verbinden', server_address: 'Serveradresse', no_worlds: 'Noch keine Welten. Erstelle eine, um zu spielen.', last_played: 'Zuletzt gespielt',
  new_world: 'Neue Welt', random: 'Zufällig', direct_connect: 'Direktverbindung', reset: 'Zurücksetzen',
};
const fr: Dict = {
  options: 'Options...', quit: 'Quitter le jeu', game_menu: 'Menu du jeu', play_selected: 'Jouer au monde sélectionné', more_options: "Plus d'options de monde...", disconnect: 'Se déconnecter', video: 'Options graphiques...', music_sounds: 'Musique et sons...', controls_btn: 'Commandes...', language_btn: 'Langue...', accessibility_btn: 'Accessibilité...', fov: 'Champ de vision', difficulty_label: 'Difficulté', saving: 'Sauvegarde du monde', saved: 'Sauvegardé !',
  play: 'Jouer', singleplayer: 'Solo', multiplayer: 'Multijoueur', settings: 'Options', language: 'Langue', credits: 'Crédits',
  back: 'Retour', done: 'Terminé', cancel: 'Annuler', create_world: 'Créer un monde', world_name: 'Nom du monde', seed: 'Graine',
  game_mode: 'Mode de jeu', difficulty: 'Difficulté', world_type: 'Type de monde', structures: 'Générer les structures', bonus_items: 'Objets de départ',
  keep_inventory: "Garder l'inventaire", cheats: 'Autoriser les triches', generate: 'Générer le monde', select_world: 'Choisir un monde', delete: 'Supprimer', rename: 'Renommer',
  resume: 'Retour au jeu', save: 'Sauvegarder', exit_menu: 'Sauvegarder et quitter', you_died: 'Vous êtes mort !', respawn: 'Réapparaître', main_menu: 'Menu principal', game_over: 'Partie terminée !', hardcore_hint: 'Hardcore : la mort supprime ce monde !', delete_world: 'Supprimer le monde',
  survival: 'Survie', creative: 'Créatif', spectator: 'Spectateur', hardcore: 'Hardcore', peaceful: 'Paisible', easy: 'Facile', normal: 'Normal', hard: 'Difficile',
  loading: 'Chargement du monde...', on: 'OUI', off: 'NON', graphics: 'Graphismes', audio: 'Audio', controls: 'Commandes', accessibility: 'Accessibilité',
  connect: 'Se connecter', server_address: 'Adresse du serveur', no_worlds: 'Aucun monde. Créez-en un pour jouer.', last_played: 'Dernière partie',
  new_world: 'Nouveau monde', random: 'Aléatoire', direct_connect: 'Connexion directe', reset: 'Réinitialiser',
};
const it: Dict = {
  options: 'Opzioni...', quit: 'Esci dal gioco', game_menu: 'Menu di gioco', play_selected: 'Gioca al mondo selezionato', more_options: 'Altre opzioni del mondo...', disconnect: 'Disconnetti', video: 'Impostazioni video...', music_sounds: 'Musica e suoni...', controls_btn: 'Controlli...', language_btn: 'Lingua...', accessibility_btn: 'Accessibilità...', fov: 'Campo visivo', difficulty_label: 'Difficoltà', saving: 'Salvataggio mondo', saved: 'Salvato!',
  play: 'Gioca', singleplayer: 'Giocatore singolo', multiplayer: 'Multigiocatore', settings: 'Impostazioni', language: 'Lingua', credits: 'Crediti',
  back: 'Indietro', done: 'Fatto', cancel: 'Annulla', create_world: 'Crea nuovo mondo', world_name: 'Nome del mondo', seed: 'Seed',
  game_mode: 'Modalità di gioco', difficulty: 'Difficoltà', world_type: 'Tipo di mondo', structures: 'Genera strutture', bonus_items: 'Oggetti iniziali',
  keep_inventory: 'Mantieni inventario', cheats: 'Consenti trucchi', generate: 'Genera mondo', select_world: 'Seleziona mondo', delete: 'Elimina', rename: 'Rinomina',
  resume: 'Torna al gioco', save: 'Salva mondo', exit_menu: 'Salva ed esci', you_died: 'Sei morto!', respawn: 'Rinasci', main_menu: 'Menu principale', game_over: 'Game over!', hardcore_hint: 'Hardcore: la morte elimina questo mondo!', delete_world: 'Elimina mondo',
  survival: 'Sopravvivenza', creative: 'Creativa', spectator: 'Spettatore', hardcore: 'Hardcore', peaceful: 'Pacifica', easy: 'Facile', normal: 'Normale', hard: 'Difficile',
  loading: 'Caricamento mondo...', on: 'SÌ', off: 'NO', graphics: 'Grafica', audio: 'Audio', controls: 'Comandi', accessibility: 'Accessibilità',
  connect: 'Connetti', server_address: 'Indirizzo server', no_worlds: 'Nessun mondo. Creane uno per iniziare.', last_played: 'Ultima partita',
  new_world: 'Nuovo mondo', random: 'Casuale', direct_connect: 'Connessione diretta', reset: 'Ripristina',
};
const pt: Dict = {
  options: 'Opções...', quit: 'Sair do jogo', game_menu: 'Menu do jogo', play_selected: 'Jogar mundo selecionado', more_options: 'Mais opções do mundo...', disconnect: 'Desconectar', video: 'Configurações de vídeo...', music_sounds: 'Música e sons...', controls_btn: 'Controles...', language_btn: 'Idioma...', accessibility_btn: 'Acessibilidade...', fov: 'Campo de visão', difficulty_label: 'Dificuldade', saving: 'Salvando mundo', saved: 'Salvo!',
  play: 'Jogar', singleplayer: 'Um jogador', multiplayer: 'Multijogador', settings: 'Configurações', language: 'Idioma', credits: 'Créditos',
  back: 'Voltar', done: 'Concluído', cancel: 'Cancelar', create_world: 'Criar novo mundo', world_name: 'Nome do mundo', seed: 'Seed',
  game_mode: 'Modo de jogo', difficulty: 'Dificuldade', world_type: 'Tipo de mundo', structures: 'Gerar estruturas', bonus_items: 'Itens iniciais',
  keep_inventory: 'Manter inventário', cheats: 'Permitir truques', generate: 'Gerar mundo', select_world: 'Selecionar mundo', delete: 'Excluir', rename: 'Renomear',
  resume: 'Voltar ao jogo', save: 'Salvar mundo', exit_menu: 'Salvar e sair', you_died: 'Você morreu!', respawn: 'Renascer', main_menu: 'Menu principal', game_over: 'Fim de jogo!', hardcore_hint: 'Hardcore: a morte exclui este mundo!', delete_world: 'Excluir mundo',
  survival: 'Sobrevivência', creative: 'Criativo', spectator: 'Espectador', hardcore: 'Hardcore', peaceful: 'Pacífico', easy: 'Fácil', normal: 'Normal', hard: 'Difícil',
  loading: 'Carregando mundo...', on: 'SIM', off: 'NÃO', graphics: 'Gráficos', audio: 'Áudio', controls: 'Controles', accessibility: 'Acessibilidade',
  connect: 'Conectar', server_address: 'Endereço do servidor', no_worlds: 'Nenhum mundo ainda. Crie um para começar.', last_played: 'Última partida',
  new_world: 'Novo mundo', random: 'Aleatório', direct_connect: 'Conexão direta', reset: 'Redefinir',
};
const ru: Dict = {
  options: 'Настройки...', quit: 'Выйти из игры', game_menu: 'Меню игры', play_selected: 'Играть выбранный мир', more_options: 'Доп. настройки мира...', disconnect: 'Отключиться', video: 'Настройки графики...', music_sounds: 'Музыка и звуки...', controls_btn: 'Управление...', language_btn: 'Язык...', accessibility_btn: 'Спец. возможности...', fov: 'Поле зрения', difficulty_label: 'Сложность', saving: 'Сохранение мира', saved: 'Сохранено!',
  play: 'Играть', singleplayer: 'Одиночная игра', multiplayer: 'Сетевая игра', settings: 'Настройки', language: 'Язык', credits: 'Авторы',
  back: 'Назад', done: 'Готово', cancel: 'Отмена', create_world: 'Создать новый мир', world_name: 'Название мира', seed: 'Зерно',
  game_mode: 'Игровой режим', difficulty: 'Сложность', world_type: 'Тип мира', structures: 'Генерировать строения', bonus_items: 'Стартовые предметы',
  keep_inventory: 'Сохранять инвентарь', cheats: 'Разрешить читы', generate: 'Создать мир', select_world: 'Выбрать мир', delete: 'Удалить', rename: 'Переименовать',
  resume: 'Вернуться в игру', save: 'Сохранить мир', exit_menu: 'Сохранить и выйти', you_died: 'Вы погибли!', respawn: 'Возродиться', main_menu: 'Главное меню', game_over: 'Игра окончена!', hardcore_hint: 'Хардкор: смерть удаляет мир!', delete_world: 'Удалить мир',
  survival: 'Выживание', creative: 'Творческий', spectator: 'Наблюдатель', hardcore: 'Хардкор', peaceful: 'Мирный', easy: 'Легко', normal: 'Норма', hard: 'Сложно',
  loading: 'Загрузка мира...', on: 'ВКЛ', off: 'ВЫКЛ', graphics: 'Графика', audio: 'Звук', controls: 'Управление', accessibility: 'Доступность',
  connect: 'Подключиться', server_address: 'Адрес сервера', no_worlds: 'Миров пока нет. Создайте один, чтобы начать.', last_played: 'Последняя игра',
  new_world: 'Новый мир', random: 'Случайно', direct_connect: 'Прямое подключение', reset: 'Сбросить',
};
const ja: Dict = {
  options: '設定...', quit: 'ゲームを終了', game_menu: 'ゲームメニュー', play_selected: '選択したワールドで遊ぶ', more_options: 'ワールドの詳細設定...', disconnect: '切断', video: '映像設定...', music_sounds: '音楽とサウンド...', controls_btn: '操作設定...', language_btn: '言語...', accessibility_btn: 'アクセシビリティ...', fov: '視野角', difficulty_label: '難易度', saving: 'ワールド保存中', saved: '保存しました！',
  play: 'プレイ', singleplayer: 'シングルプレイ', multiplayer: 'マルチプレイ', settings: '設定', language: '言語', credits: 'クレジット',
  back: '戻る', done: '完了', cancel: 'キャンセル', create_world: '新しいワールドを作成', world_name: 'ワールド名', seed: 'シード',
  game_mode: 'ゲームモード', difficulty: '難易度', world_type: 'ワールドタイプ', structures: '構造物を生成', bonus_items: '初期アイテム',
  keep_inventory: 'インベントリを保持', cheats: 'チートを許可', generate: 'ワールド生成', select_world: 'ワールド選択', delete: '削除', rename: '名前変更',
  resume: 'ゲームに戻る', save: 'ワールドを保存', exit_menu: '保存して終了', you_died: '死亡しました！', respawn: 'リスポーン', main_menu: 'タイトルへ', game_over: 'ゲームオーバー！', hardcore_hint: 'ハードコア：死亡するとワールドが削除されます！', delete_world: 'ワールドを削除',
  survival: 'サバイバル', creative: 'クリエイティブ', spectator: 'スペクテイター', hardcore: 'ハードコア', peaceful: 'ピースフル', easy: 'イージー', normal: 'ノーマル', hard: 'ハード',
  loading: 'ワールドを読み込み中...', on: 'オン', off: 'オフ', graphics: 'グラフィック', audio: 'オーディオ', controls: '操作', accessibility: 'アクセシビリティ',
  connect: '接続', server_address: 'サーバーアドレス', no_worlds: 'ワールドがありません。作成して始めましょう。', last_played: '最終プレイ',
  new_world: '新しいワールド', random: 'ランダム', direct_connect: '直接接続', reset: 'リセット',
};
const zh: Dict = {
  options: '选项...', quit: '退出游戏', game_menu: '游戏菜单', play_selected: '进入选中的世界', more_options: '更多世界选项...', disconnect: '断开连接', video: '视频设置...', music_sounds: '音乐和声音...', controls_btn: '控制...', language_btn: '语言...', accessibility_btn: '辅助功能...', fov: '视场角', difficulty_label: '难度', saving: '正在保存世界', saved: '已保存！',
  play: '开始游戏', singleplayer: '单人游戏', multiplayer: '多人游戏', settings: '设置', language: '语言', credits: '制作人员',
  back: '返回', done: '完成', cancel: '取消', create_world: '创建新的世界', world_name: '世界名称', seed: '种子',
  game_mode: '游戏模式', difficulty: '难度', world_type: '世界类型', structures: '生成建筑', bonus_items: '初始物品',
  keep_inventory: '保留物品栏', cheats: '允许作弊', generate: '生成世界', select_world: '选择世界', delete: '删除', rename: '重命名',
  resume: '回到游戏', save: '保存世界', exit_menu: '保存并退出', you_died: '你死了！', respawn: '重生', main_menu: '标题界面', game_over: '游戏结束！', hardcore_hint: '极限模式：死亡将删除此世界！', delete_world: '删除世界',
  survival: '生存', creative: '创造', spectator: '旁观', hardcore: '极限', peaceful: '和平', easy: '简单', normal: '普通', hard: '困难',
  loading: '正在加载世界...', on: '开', off: '关', graphics: '图形', audio: '音频', controls: '控制', accessibility: '辅助功能',
  connect: '连接', server_address: '服务器地址', no_worlds: '还没有世界。创建一个开始游戏。', last_played: '上次游玩',
  new_world: '新的世界', random: '随机', direct_connect: '直接连接', reset: '重置',
};
export const LANGUAGES: Record<string, { name: string; dict: Dict }> = {
  en: { name: 'English', dict: en }, es: { name: 'Español', dict: es }, de: { name: 'Deutsch', dict: de }, fr: { name: 'Français', dict: fr },
  it: { name: 'Italiano', dict: it }, pt: { name: 'Português (BR)', dict: pt }, ru: { name: 'Русский', dict: ru }, ja: { name: '日本語', dict: ja }, zh: { name: '简体中文', dict: zh },
};
export function t(key: string): string {
  const lang = LANGUAGES[settings.value.language] || LANGUAGES.en;
  return lang.dict[key] ?? en[key] ?? key;
}
