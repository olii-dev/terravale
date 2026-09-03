// Chunk manager v2: streams chunk meshes in/out around the player with a
// per-frame time budget, initializes lighting per chunk, and owns the three
// terrain materials. A dedicated ShaderMaterial combines skylight (× day
// factor) and blocklight per vertex — no onBeforeCompile patching, which
// silently no-ops on some three.js builds.

import * as THREE from 'three';
import { CHUNK } from './worldgen.js';
import { buildChunkGeometry } from './mesher.js';
import { buildAtlas } from './textures.js';

export const TERRAIN_UNIFORMS = {
  uDay: { value: 1.0 },
  uDayColor: { value: new THREE.Color(1, 1, 1) },
  uGamma: { value: 0.3 },
  uTime: { value: 0.0 },
  uFogColor: { value: new THREE.Color(0x78b5e8) },
  uFogNear: { value: 40 },
  uFogFar: { value: 200 },
};

const TERRAIN_VERT = `
  attribute float skylight;
  attribute vec3 blocklight;
  attribute vec3 color;
  uniform float uTime;
  uniform float uSwayAmp;
  uniform float uWaterAmp;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vSkyL;
  varying vec3 vBlockL;
  varying float vFogDepth;
  void main() {
    vUv = uv;
    vColor = color;
    vSkyL = skylight;
    vBlockL = blocklight;
    vec3 transformed = position;
    #ifdef SWAY
      // foliage sway: tile-v (0 bottom, 1 top) weights the offset
      float swayW = fract(uv.y * 8.0);
      float ph = position.x * 0.6 + position.z * 0.45;
      transformed.x += sin(uTime * 1.9 + ph) * 0.05 * swayW * uSwayAmp;
      transformed.z += cos(uTime * 1.4 + ph * 1.3) * 0.04 * swayW * uSwayAmp;
    #endif
    #ifdef WATER
      transformed.y += sin(uTime * 1.7 + position.x * 0.7 + position.z * 0.8) * 0.055 * uWaterAmp - 0.025 * uWaterAmp;
    #endif
    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    vFogDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const TERRAIN_FRAG = `
  uniform sampler2D map;
  uniform float uDay;
  uniform vec3 uDayColor;
  uniform float uGamma;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uWaterAmp;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vSkyL;
  varying vec3 vBlockL;
  varying float vFogDepth;
  void main() {
    vec2 texUv = vUv;
    #ifdef WATER
      texUv += vec2(sin(uTime * 0.6), cos(uTime * 0.45)) * 0.0015 * uWaterAmp;
    #endif
    vec4 texel = texture2D(map, texUv) * vec4(vColor, 1.0);
    #ifdef CUTOUT
      if (texel.a < 0.5) discard;
    #endif
    // colored light: warm torches / red lava / golden glowstone vs the
    // (tinted) sky — per channel max, gently desaturated
    vec3 light = max(vBlockL, vSkyL * uDayColor);
    float maxL = max(light.r, max(light.g, light.b));
    light = mix(light, vec3(maxL), 0.35);
    light = clamp(mix(light, vec3(1.0), uGamma * (1.0 - maxL)), 0.04, 1.0);
    texel.rgb *= light;
    texel.a *= uOpacity;
    float fogF = smoothstep(uFogNear, uFogFar, vFogDepth);
    texel.rgb = mix(texel.rgb, uFogColor, fogF);
    gl_FragColor = texel;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function makeTerrainMaterial(opts = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...TERRAIN_UNIFORMS,
      map: { value: null },
      uOpacity: { value: opts.opacity ?? 1.0 },
      uSwayAmp: { value: opts.swayAmp ?? 0 },
      uWaterAmp: { value: opts.waterAmp ?? 0 },
    },
    vertexShader: TERRAIN_VERT,
    fragmentShader: TERRAIN_FRAG,
    transparent: opts.transparent ?? false,
    depthWrite: opts.depthWrite ?? true,
    side: opts.side ?? THREE.FrontSide,
    defines: opts.defines ?? {},
  });
  return m;
}

// keep every material's uniform objects shared so global updates reach all
function wireUniforms(mat) {
  mat.uniforms.uDay = TERRAIN_UNIFORMS.uDay;
  mat.uniforms.uDayColor = TERRAIN_UNIFORMS.uDayColor;
  mat.uniforms.uGamma = TERRAIN_UNIFORMS.uGamma;
  mat.uniforms.uTime = TERRAIN_UNIFORMS.uTime;
  mat.uniforms.uFogColor = TERRAIN_UNIFORMS.uFogColor;
  mat.uniforms.uFogNear = TERRAIN_UNIFORMS.uFogNear;
  mat.uniforms.uFogFar = TERRAIN_UNIFORMS.uFogFar;
  return mat;
}

export class ChunkManager {
  constructor(world, scene, lighting) {
    this.world = world;
    this.scene = scene;
    this.lighting = lighting;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.radius = 4;
    this.entries = new Map(); // key -> { meshes, cx, cz }
    this.queue = [];
    this.lastCenter = null;

    const atlas = buildAtlas();
    const mapUniform = { value: atlas };
    const mk = (opts) => {
      const m = wireUniforms(makeTerrainMaterial(opts));
      m.uniforms.map = mapUniform;
      return m;
    };
    this.materials = {
      opaque: mk({}),
      cutout: mk({ defines: { CUTOUT: '' }, side: THREE.DoubleSide }),
      flora: mk({ defines: { CUTOUT: '', SWAY: '' }, side: THREE.DoubleSide, swayAmp: 1 }),
      water: mk({ transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.8, defines: { WATER: '' }, waterAmp: 1 }),
    };
  }

  // live fancy-graphics toggle (sway + water animation amplitude)
  setFancy(on) {
    for (const key of ['flora', 'water']) {
      const m = this.materials[key];
      m.uniforms.uSwayAmp.value = on ? 1 : 0;
      m.uniforms.uWaterAmp.value = on ? 1 : 0;
    }
  }

  setRadius(r) { this.radius = r; }

  key(cx, cz) { return cx + ',' + cz; }

  update(px, pz, budgetMs = 6) {
    const ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK);
    const r = this.radius;

    if (this.lastCenter === null || this.lastCenter[0] !== ccx || this.lastCenter[1] !== ccz) {
      this.lastCenter = [ccx, ccz];
      this.rebuildQueue(ccx, ccz, r);
      this.unloadFar(ccx, ccz, r + 2);
    }

    // remesh dirty chunks right away (block edits / light changes)
    if (this.world.dirtyChunks.size) {
      for (const k of [...this.world.dirtyChunks]) {
        this.world.dirtyChunks.delete(k);
        if (this.entries.has(k)) this.buildChunk(...k.split(',').map(Number));
      }
    }

    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const { cx, cz } = this.queue.shift();
      const k = this.key(cx, cz);
      if (this.entries.has(k)) continue;
      if (Math.max(Math.abs(cx - ccx), Math.abs(cz - ccz)) > r) continue;
      this.buildChunk(cx, cz);
    }
  }

  rebuildQueue(ccx, ccz, r) {
    const list = [];
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      const cx = ccx + dx, cz = ccz + dz;
      if (!this.entries.has(this.key(cx, cz))) list.push({ cx, cz, d: dx * dx + dz * dz });
    }
    list.sort((a, b) => a.d - b.d);
    this.queue = list;
  }

  buildChunk(cx, cz) {
    const k = this.key(cx, cz);
    this.disposeEntry(k);

    // data for this chunk + its four neighbors (borders mesh correctly)
    this.world.ensureChunk(cx, cz);
    this.world.ensureChunk(cx + 1, cz);
    this.world.ensureChunk(cx - 1, cz);
    this.world.ensureChunk(cx, cz + 1);
    this.world.ensureChunk(cx, cz - 1);

    // fresh light for this chunk if it doesn't have any yet
    if (this.lighting && !this.lighting.hasMaps(cx, cz)) this.lighting.initChunk(cx, cz);

    const geos = buildChunkGeometry(this.world, this.lighting, cx, cz);
    const meshes = [];
    const add = (geo, mat, order) => {
      if (!geo) return;
      const m = new THREE.Mesh(geo, mat);
      m.position.set(cx * CHUNK, 0, cz * CHUNK);
      m.renderOrder = order;
      this.group.add(m);
      meshes.push(m);
    };
    add(geos.opaque, this.materials.opaque, 0);
    add(geos.cutout, this.materials.cutout, 1);
    add(geos.flora, this.materials.flora, 1);
    add(geos.water, this.materials.water, 2);

    this.entries.set(k, { meshes, cx, cz });
  }

  disposeEntry(k) {
    const e = this.entries.get(k);
    if (!e) return;
    for (const m of e.meshes) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.entries.delete(k);
  }

  unloadFar(ccx, ccz, maxR) {
    for (const [k, e] of this.entries) {
      if (Math.max(Math.abs(e.cx - ccx), Math.abs(e.cz - ccz)) > maxR) {
        this.disposeEntry(k);
      }
    }
    for (const k of this.world.chunks.keys()) {
      const [cx, cz] = k.split(',').map(Number);
      if (Math.max(Math.abs(cx - ccx), Math.abs(cz - ccz)) > maxR + 2) {
        this.world.chunks.delete(k);
        this.lighting.dropChunk(cx, cz);
      }
    }
  }

  pending() { return this.queue.length; }

  setDaylight(day, gamma, fog = null) {
    TERRAIN_UNIFORMS.uDay.value = day;
    TERRAIN_UNIFORMS.uGamma.value = gamma;
    // sky-light tint: moonlit blue at night, warm amber at dawn/dusk, white at noon
    const c = TERRAIN_UNIFORMS.uDayColor.value;
    if (day < 0.25) {
      c.setRGB(0.3, 0.36, 0.55);
    } else if (day < 0.65) {
      // warm band between night and full day
      const t = (day - 0.25) / 0.4;
      const warm = Math.sin(t * Math.PI); // peaks mid-transition
      c.setRGB(
        0.3 + (1.0 - 0.3) * t + 0.35 * warm * (1 - t),
        0.36 + (1.0 - 0.36) * t + 0.1 * warm * (1 - t),
        0.55 + (1.0 - 0.55) * t
      );
    } else {
      c.setRGB(1, 1, 1);
    }
    if (fog) {
      TERRAIN_UNIFORMS.uFogColor.value.copy(fog.color);
      TERRAIN_UNIFORMS.uFogNear.value = fog.near;
      TERRAIN_UNIFORMS.uFogFar.value = fog.far;
    }
  }

  dispose() {
    for (const k of [...this.entries.keys()]) this.disposeEntry(k);
    this.scene.remove(this.group);
  }
}
