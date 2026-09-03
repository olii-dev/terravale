// Weather: host-authoritative clear/overcast/rain/snow state machine synced
// like the time of day. Rain and snow render through the shared particle
// look (own Points pool), the sky gets an overcast factor, and thunder
// flashes ride the sky dome's uFlash uniform.

import * as THREE from 'three';
import { B } from './blocks.js';

const RAIN_CAP = 900;
const SNOW_CAP = 350;

const RAIN_VERT = `
  attribute float palpha;
  varying float vAlpha;
  void main() {
    vAlpha = palpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const RAIN_FRAG = `
  precision mediump float;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(0.55, 0.68, 0.85, vAlpha * 0.5);
  }
`;

const SNOW_VERT = `
  attribute float psize;
  attribute float palpha;
  varying float vAlpha;
  void main() {
    vAlpha = palpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = psize * (120.0 / max(1.0, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const SNOW_FRAG = `
  precision mediump float;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = max(abs(c.x), abs(c.y));
    if (d > 0.5) discard;
    gl_FragColor = vec4(0.95, 0.97, 1.0, vAlpha * 0.9);
  }
`;

export class Weather {
  constructor(scene, world, sky) {
    this.scene = scene;
    this.world = world;
    this.sky = sky;
    this.isHost = true;
    this.state = 'clear';        // clear | overcast | rain
    this.timer = 90 + Math.random() * 120;
    this.thunderTimer = 10 + Math.random() * 20;
    this.enabled = true;

    // --- rain pool: short vertical streaks ---
    this.rainPos = new Float32Array(RAIN_CAP * 3 * 2); // 2 verts per streak
    this.rainAlpha = new Float32Array(RAIN_CAP * 2);
    this.rainVel = new Float32Array(RAIN_CAP);
    this.rainLive = new Float32Array(RAIN_CAP); // 0 = dead
    this.rainGeo = new THREE.BufferGeometry();
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rainGeo.setAttribute('palpha', new THREE.BufferAttribute(this.rainAlpha, 1));
    this.rainGeo.setDrawRange(0, RAIN_CAP * 2);
    this.rainMat = new THREE.ShaderMaterial({
      vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false,
    });
    this.rain = new THREE.LineSegments(this.rainGeo, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
    this.rainHead = 0;

    // --- snow pool: drifting flakes ---
    this.snowPos = new Float32Array(SNOW_CAP * 3);
    this.snowSize = new Float32Array(SNOW_CAP);
    this.snowAlpha = new Float32Array(SNOW_CAP);
    this.snowVel = new Float32Array(SNOW_CAP);
    this.snowPhase = new Float32Array(SNOW_CAP);
    this.snowLive = new Float32Array(SNOW_CAP);
    this.snowGeo = new THREE.BufferGeometry();
    this.snowGeo.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3));
    this.snowGeo.setAttribute('psize', new THREE.BufferAttribute(this.snowSize, 1));
    this.snowGeo.setAttribute('palpha', new THREE.BufferAttribute(this.snowAlpha, 1));
    this.snowGeo.setDrawRange(0, SNOW_CAP);
    this.snowMat = new THREE.ShaderMaterial({
      vertexShader: SNOW_VERT, fragmentShader: SNOW_FRAG, transparent: true, depthWrite: false,
    });
    this.snow = new THREE.Points(this.snowGeo, this.snowMat);
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    scene.add(this.snow);
    this.snowHead = 0;
    this.time = 0;
  }

  // host: advance the weather machine
  update(dt, player, camera, onThunder) {
    if (this.isHost) {
      this.timer -= dt;
      if (this.timer <= 0) this.nextState();
      if (this.state === 'rain') {
        this.thunderTimer -= dt;
        if (this.thunderTimer <= 0) {
          this.thunderTimer = 8 + Math.random() * 22;
          this.sky.triggerFlash();
          onThunder?.();
        }
      }
    }
    if (!this.enabled || this.state === 'clear') {
      this.rain.visible = false;
      this.snow.visible = false;
      this.sky.setOvercast(this.isHost ? 0 : this.sky.overcast);
      return;
    }

    const raining = this.state === 'rain';
    this.sky.setOvercast(raining ? 0.8 : 0.55);
    this.time += dt;

    // cold biome check at the player (snow vs rain); TAIGA=4, SNOWY=3
    const biome = this.world.worldgen.biomeAt(Math.floor(player.pos.x), Math.floor(player.pos.z));
    const cold = biome === 3 || biome === 4;
    const wantSnow = cold;

    const R = 22;
    if (raining && !wantSnow) {
      this.rain.visible = true;
      this.snow.visible = false;
      // spawn streaks above the camera
      const spawns = 14;
      for (let s = 0; s < spawns; s++) {
        const i = this.rainHead;
        this.rainHead = (this.rainHead + 1) % RAIN_CAP;
        const x = camera.x + (Math.random() - 0.5) * R * 2;
        const z = camera.z + (Math.random() - 0.5) * R * 2;
        const y = camera.y + 12 + Math.random() * 8;
        this.rainPos[i * 6] = x; this.rainPos[i * 6 + 1] = y; this.rainPos[i * 6 + 2] = z;
        this.rainPos[i * 6 + 3] = x; this.rainPos[i * 6 + 4] = y - 0.6; this.rainPos[i * 6 + 5] = z;
        this.rainLive[i] = 1.6;
        this.rainVel[i] = 26;
      }
    } else if (raining && wantSnow) {
      this.snow.visible = true;
      this.rain.visible = false;
      const spawns = 4;
      for (let s = 0; s < spawns; s++) {
        const i = this.snowHead;
        this.snowHead = (this.snowHead + 1) % SNOW_CAP;
        this.snowPos[i * 3] = camera.x + (Math.random() - 0.5) * R * 2;
        this.snowPos[i * 3 + 1] = camera.y + 10 + Math.random() * 8;
        this.snowPos[i * 3 + 2] = camera.z + (Math.random() - 0.5) * R * 2;
        this.snowLive[i] = 4;
        this.snowVel[i] = 1.6 + Math.random() * 1.2;
        this.snowPhase[i] = Math.random() * Math.PI * 2;
        this.snowSize[i] = 2 + Math.random() * 2;
      }
    } else {
      this.rain.visible = false;
      this.snow.visible = false;
    }

    // integrate rain
    let rainAny = false;
    for (let i = 0; i < RAIN_CAP; i++) {
      if (this.rainLive[i] <= 0) continue;
      rainAny = true;
      this.rainLive[i] -= dt;
      const dy = this.rainVel[i] * dt;
      this.rainPos[i * 6 + 1] -= dy;
      this.rainPos[i * 6 + 4] -= dy;
      this.rainPos[i * 6] += dt * 1.5;
      this.rainPos[i * 6 + 3] += dt * 1.5;
      const a = Math.min(1, this.rainLive[i]);
      this.rainAlpha[i * 2] = a; this.rainAlpha[i * 2 + 1] = a;
      // kill on solid ground
      const bx = Math.floor(this.rainPos[i * 6]), by = Math.floor(this.rainPos[i * 6 + 1]), bz = Math.floor(this.rainPos[i * 6 + 2]);
      const id = this.world.getBlock(bx, by, bz);
      if (id !== B.AIR && id !== B.WATER) this.rainLive[i] = 0;
    }
    if (rainAny) { this.rainGeo.attributes.position.needsUpdate = true; this.rainGeo.attributes.palpha.needsUpdate = true; }

    // integrate snow (gentle sway)
    let snowAny = false;
    for (let i = 0; i < SNOW_CAP; i++) {
      if (this.snowLive[i] <= 0) continue;
      snowAny = true;
      this.snowLive[i] -= dt;
      this.snowPhase[i] += dt * 1.8;
      this.snowPos[i * 3] += Math.sin(this.snowPhase[i]) * dt * 0.8;
      this.snowPos[i * 3 + 1] -= this.snowVel[i] * dt;
      this.snowPos[i * 3 + 2] += Math.cos(this.snowPhase[i] * 0.7) * dt * 0.8;
      this.snowAlpha[i] = Math.min(1, this.snowLive[i]);
      const id = this.world.getBlock(Math.floor(this.snowPos[i * 3]), Math.floor(this.snowPos[i * 3 + 1]), Math.floor(this.snowPos[i * 3 + 2]));
      if (id !== B.AIR && id !== B.WATER) this.snowLive[i] = 0;
    }
    if (snowAny) { this.snowGeo.attributes.position.needsUpdate = true; this.snowGeo.attributes.palpha.needsUpdate = true; this.snowGeo.attributes.psize.needsUpdate = true; }
  }

  nextState() {
    // clear -> overcast -> rain -> clear ...
    this.state = this.state === 'clear' ? 'overcast'
      : this.state === 'overcast' ? 'rain'
      : 'clear';
    this.timer = this.state === 'rain' ? 60 + Math.random() * 90 : 100 + Math.random() * 160;
    return this.state;
  }

  setState(s) { this.state = s; this.timer = 60 + Math.random() * 90; }
  getState() { return this.state; }
}

export const WEATHER_NAMES = ['clear', 'overcast', 'rain'];
