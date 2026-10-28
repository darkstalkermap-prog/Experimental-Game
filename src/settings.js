// Player settings, remembered in this browser.
const KEY = 'cw-settings';

// alerts, tips: 1 = on, 0 = off (see alerts.js); dynres: the renderer may lower its resolution to hold the frame rate (see gfx.js)
export const DEFAULTS = { master: 100, music: 60, sfx: 70, sens: 35, fov: 75, alerts: 1, tips: 1, dynres: 1 };
export const settings = { ...DEFAULTS };

try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  for (const k of Object.keys(DEFAULTS)) if (typeof saved[k] === 'number' && isFinite(saved[k])) settings[k] = saved[k];
} catch (e) { /* storage unavailable: defaults */ }

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
}

export const sensitivityOf = (v) => 0.0008 + (v / 100) * 0.004;
