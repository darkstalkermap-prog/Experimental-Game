// Anisotropic filtering: the ground and the castle walls are nearly always seen at a grazing angle, where every texture read turns into
// several taps, and in a shader that reads a dozen textures per pixel that is a fifth of the frame. The level follows Q.aniso
// (quality.js); a texture asks for the most it can use (`max`: smooth noise needs none) and is kept in step when the quality changes.
// A texture that asks for 8 or more (every sharp surface: the ground's detail, stone, wood) takes whatever the level allows, up to Q.aniso 16 at
// High and Ultra, which three.js trims to the most the GPU offers: the ground a few metres ahead is where blur shows first.
import { Q, onQuality } from './quality.js';

const kept = new Set();   // (weak references: a texture that is let go of must not be kept alive by this list)

const level = (t) => { const m = t.userData.anisoMax || 1; return Math.max(1, Math.min(m >= 8 ? 16 : m, Q.aniso || 1)); };

export function aniso(tex, max = 8) {
  tex.userData.anisoMax = max;
  tex.anisotropy = level(tex);
  kept.add(new WeakRef(tex));
  return tex;
}

onQuality(() => {
  for (const ref of kept) {
    const t = ref.deref();
    if (!t) { kept.delete(ref); continue; }
    const a = level(t);
    if (t.anisotropy !== a) { t.anisotropy = a; t.needsUpdate = true; }
  }
});
