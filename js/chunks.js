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
  uGamma: { value: 0.3 },
  uFogColor: { value: new THREE.Color(0x78b5e8) },
  uFogNear: { value: 40 },
  uFogFar: { value: 200 },
};

const TERRAIN_VERT = `
  attribute float skylight;
  attribute float blocklight;
  attribute vec3 color;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vSkyL;
  varying float vBlockL;
  varying float vFogDepth;
  void main() {
    vUv = uv;
    vColor = color;
    vSkyL = skylight;
    vBlockL = blocklight;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vFogDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const TERRAIN_FRAG = `
  uniform sampler2D map;
  uniform float uDay;
  uniform float uGamma;
  uniform float uOpacity;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vSkyL;
  varying float vBlockL;
  varying float vFogDepth;
  void main() {
    vec4 texel = texture2D(map, vUv) * vec4(vColor, 1.0);
    #ifdef CUTOUT
      if (texel.a < 0.5) discard;
    #endif
    float lightLevel = max(vBlockL, vSkyL * uDay);
    lightLevel = clamp(mix(lightLevel, 1.0, uGamma * (1.0 - lightLevel)), 0.04, 1.0);
    texel.rgb *= lightLevel;
    texel.a *= uOpacity;
    float fogF = smoothstep(uFogNear, uFogFar, vFogDepth);
    texel.rgb = mix(texel.rgb, uFogColor, fogF);
    gl_FragColor = texel;
  }
`;

function makeTerrainMaterial(opts = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...TERRAIN_UNIFORMS,
      map: { value: null },
      uOpacity: { value: opts.opacity ?? 1.0 },
    },
    vertexShader: TERRAIN_VERT,
    fragmentShader: TERRAIN_FRAG,
    transparent: opts.transparent ?? false,
    depthWrite: opts.depthWrite ?? true,
    side: opts.side ?? THREE.FrontSide,
    defines: opts.cutout ? { CUTOUT: '' } : {},
  });
  return m;
}

// keep every material's uniform objects shared so global updates reach all
function wireUniforms(mat) {
  mat.uniforms.uDay = TERRAIN_UNIFORMS.uDay;
  mat.uniforms.uGamma = TERRAIN_UNIFORMS.uGamma;
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
      cutout: mk({ cutout: true, side: THREE.DoubleSide }),
      water: mk({ transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.8 }),
    };
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
