// Materials of the first-person kit. They are ordinary lit materials with a small shader patch (through patchMaterial, never a bare
// onBeforeCompile) that does four things:
//   1. the kit is drawn with its own field of view (so zooming the bow or a wide FOV setting never stretches it) and its depth is
//      squeezed into the nearest tenth of the depth range: it always draws in front of the world and never pokes through a wall or the ground
//   2. metalness, roughness and glow come per vertex (aPbr), with a fine grain per material (brushed steel, leather, cloth, wood)
//   3. a soft fill light fixed to the camera, so the kit is never black in shadow
//   4. a red wash when the hero is hurt
import * as THREE from 'three';
import { patchMaterial } from './shaderhook.js';

export const VM_FOV = 60;   // the vertical field of view (degrees) the kit is drawn with

// uniforms shared by every kit material: written once per frame by the view model
export const VMU = {
  fov: { value: 1 },                              // the camera's projection scale relative to the kit's own
  glow: { value: 1 },                             // brightness of the glowing parts (crystals, orbs)
  tint: { value: new THREE.Vector4(0, 0, 0, 0) },   // rgb + how much of it replaces the colour of glowing parts
  fill: { value: new THREE.Color(0.2, 0.21, 0.24) },
  hurt: { value: 0 },                             // 0..1 red wash
};

// keep the kit's size independent of the camera's field of view (zoom, settings)
export function syncKitFov(camera) {
  const m5 = camera.projectionMatrix.elements[5];
  VMU.fov.value = 1 / (m5 * Math.tan(THREE.MathUtils.degToRad(VM_FOV / 2)));
}

const PROJECT = `#include <project_vertex>
gl_Position.xy *= vmFov;
gl_Position.z = gl_Position.z * 0.1 - gl_Position.w * 0.9;`;

// lit kit material (vertex colours + aPbr / aPat attributes from vmgeo.js)
export function kitMaterial(opts = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, fog: false, roughness: 1, metalness: 0, envMapIntensity: 1.1, ...opts });
  patchMaterial(m, 'vm:kit', (shader) => {
    shader.uniforms.vmFov = VMU.fov;
    shader.uniforms.vmGlow = VMU.glow;
    shader.uniforms.vmTint = VMU.tint;
    shader.uniforms.vmFill = VMU.fill;
    shader.uniforms.vmHurt = VMU.hurt;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aPbr; attribute vec2 aPat; varying vec4 vPbr; varying vec2 vPat; uniform float vmFov;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vPbr = aPbr; vPat = aPat;`)
      .replace('#include <project_vertex>', PROJECT);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec4 vPbr; varying vec2 vPat; uniform float vmGlow; uniform vec4 vmTint; uniform vec3 vmFill; uniform float vmHurt;
float vmH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vmN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(vmH(i), vmH(i + vec2(1.0, 0.0)), f.x), mix(vmH(i + vec2(0.0, 1.0)), vmH(i + vec2(1.0, 1.0)), f.x), f.y); }
// fine surface grain, about -1..1: x runs along the part, y around it (metres)
float vmGrain(float id, vec2 p) {
  if (id < 0.5) return 0.0;
  if (id < 1.5) return (vmN(vec2(p.x * 5.0, p.y * 240.0)) * 0.7 + vmN(vec2(p.x * 40.0, p.y * 600.0)) * 0.3) * 2.0 - 1.0;
  if (id < 2.5) return (vmN(p * 190.0) * 0.6 + vmN(p * 60.0) * 0.4) * 2.0 - 1.0;
  if (id < 3.5) return sin(p.x * 420.0) * sin(p.y * 420.0) * 0.45 + (vmN(p * 45.0) - 0.5) * 0.8;
  if (id < 4.5) return (vmN(vec2(p.x * 7.0, p.y * 90.0)) * 0.7 + vmN(vec2(p.x * 25.0, p.y * 260.0)) * 0.3) * 2.0 - 1.0;
  if (id < 5.5) return (vmN(p * 110.0) - 0.5) * 0.7;
  return (vmN(p * 260.0) - 0.5) * 2.0;
}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
float vmG = vmGrain(vPbr.w, vPat);
metalnessFactor = vPbr.x;
roughnessFactor = clamp(vPbr.y + vmG * 0.09, 0.05, 1.0);
diffuseColor.rgb *= 1.0 + vmG * 0.11;
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.0, 0.42, 0.38), vmHurt * (1.0 - vPbr.x));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += mix(diffuseColor.rgb, vmTint.rgb, vmTint.a) * vPbr.z * vmGlow;`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{
  vec3 vmL = normalize(vec3(-0.35, 0.55, 0.75));
  float vmW = dot(normal, vmL) * 0.5 + 0.5;
  reflectedLight.indirectDiffuse += material.diffuseColor * vmFill * (vmW * vmW);
}`);
  });
  return m;
}

// additive glow (orbs, flashes, weapon trails): plain unlit, drawn in front like the kit
export function glowMaterial(opts = {}) {
  const m = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, ...opts });
  patchMaterial(m, 'vm:glow', (shader) => {
    shader.uniforms.vmFov = VMU.fov;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform float vmFov;`)
      .replace('#include <project_vertex>', PROJECT);
  });
  return m;
}

let dotTex = null;
// a soft round spot (white, fading to nothing) for glows; shared, and safe to reuse after the world is rebuilt
export function glowTexture() {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c);
  dotTex.colorSpace = THREE.SRGBColorSpace;
  return dotTex;
}
