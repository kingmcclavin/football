export interface Settings {
  sound: boolean;
  music: boolean;
  volume: number; // 0..1
  quarterMinutes: number;
  gameSpeed: number; // 0.8..1.25
  aimStyle: 'pull' | 'point';
  defenseMode: 'call' | 'auto';
  defenseView: 'watch' | 'fast' | 'skip';
  randomEvents: boolean;
  showRoutes: boolean;
  haptics: boolean;
  tutorialSeen: boolean;
  leftHanded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  music: true,
  volume: 0.7,
  quarterMinutes: 6,
  gameSpeed: 1,
  aimStyle: 'pull',
  defenseMode: 'call',
  defenseView: 'fast',
  randomEvents: true,
  showRoutes: true,
  haptics: true,
  tutorialSeen: false,
  leftHanded: false,
};

const KEY = 'gl-settings';

export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULT_SETTINGS, ...s };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage may be unavailable in private mode */
  }
}
