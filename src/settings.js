// Player settings, remembered in this browser.
const KEY = 'cw-settings';

export const DEFAULTS = { master: 100, music: 60, sfx: 70, sens: 35, fov: 75 };
export const settings = { ...DEFAULTS };

try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  for (const k of Object.keys(DEFAULTS)) if (typeof saved[k] === 'number' && isFinite(saved[k])) settings[k] = saved[k];
} catch (e) { /* storage unavailable: defaults */ }

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
}

export const sensitivityOf = (v) => 0.0008 + (v / 100) * 0.004;
