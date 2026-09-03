// Sky v3: a shader dome (gradient + blocky sun/moon + twinkling stars +
// sunset scattering + thunder flash) plus instanced 3D blocky clouds that
// drift and wrap around the camera. Overcast factor darkens everything for
// rain. The terrain gets its fog color from here as before.

import * as THREE from 'three';
import { mulberry32 } from './noise.js';

const DAY_LENGTH = 600;
const DOME_RADIUS = 620;

const DOME_VERT = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_Position.z = gl_Position.w; // always at the far plane
  }
`;

const DOME_FRAG = `
  precision highp float;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSunsetColor;
  uniform float uSunsetW;
  uniform vec3 uSunDir;
  uniform float uDayFactor;
  uniform float uTime;
  uniform float uFlash;
  uniform vec3 uOvercastColor;
  uniform float uOvercast;
  varying vec3 vDir;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));

    // sunrise/sunset scattering band near the horizon
    float band = exp(-pow(dir.y / 0.22, 2.0)) * uSunsetW;
    float sunSide = 0.5 + 0.5 * dot(normalize(dir.xz + vec2(1e-5)), normalize(uSunDir.xz + vec2(1e-5)));
    col = mix(col, uSunsetColor, band * (0.35 + 0.65 * sunSide));

    // stars: hashed cells that twinkle, faded by daylight
    if (uDayFactor < 0.5 && dir.y > 0.02) {
      vec2 sp = dir.xz / (dir.y + 0.35) * 22.0;
      vec2 cell = floor(sp);
      float rnd = hash(cell);
      if (rnd > 0.978) {
        vec2 local = fract(sp) - 0.5;
        float d = max(abs(local.x), abs(local.y));
        float star = smoothstep(0.32, 0.05, d);
        float twinkle = 0.6 + 0.4 * sin(uTime * (1.5 + rnd * 4.0) + rnd * 40.0);
        col += vec3(star * twinkle) * (1.0 - uDayFactor * 2.0) * 0.9;
      }
    }

    // blocky sun with warm glow
    float sunAngle = acos(clamp(dot(dir, uSunDir), -1.0, 1.0));
    float sunGlow = smoothstep(0.30, 0.02, sunAngle);
    float sunDisc = smoothstep(0.048, 0.040, sunAngle);
    col += vec3(1.0, 0.86, 0.55) * sunGlow * 0.30 * (0.3 + 0.7 * uDayFactor);
    col += vec3(1.0, 0.96, 0.82) * sunDisc * (0.4 + 0.6 * uDayFactor);

    // pale blocky moon opposite the sun
    float moonAngle = acos(clamp(dot(dir, -uSunDir), -1.0, 1.0));
    float moonDisc = smoothstep(0.034, 0.028, moonAngle);
    col += vec3(0.86, 0.90, 0.98) * moonDisc * (1.0 - uDayFactor) * 0.9;

    // overcast gray
    col = mix(col, uOvercastColor, uOvercast * 0.75);

    // thunder flash
    col += vec3(uFlash);

    // uniforms carry sRGB-authored colors; encode linear math back to sRGB
    col = pow(clamp(col, 0.0, 1.0), vec3(0.4545));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const CLOUD_REGION = 420;
const CLOUD_COUNT = 130;

export class Sky {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.time = 0.32;
    this.dayFactor = 1;
    this.overcast = 0;      // 0..1 set by weather
    this.flash = 0;

    this.zenith = new THREE.Color('#4a86c8');
    this.horizon = new THREE.Color('#9ec8ee');
    this.sunsetColor = new THREE.Color('#e8823c');
    this.overcastColor = new THREE.Color('#5a6570');
    this.skyColor = new THREE.Color('#78b5e8'); // fog driver

    // dome
    this.domeUniforms = {
      uZenith: { value: this.zenith },
      uHorizon: { value: this.horizon },
      uSunsetColor: { value: this.sunsetColor },
      uSunsetW: { value: 0 },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uDayFactor: { value: 1 },
      uTime: { value: 0 },
      uFlash: { value: 0 },
      uOvercastColor: { value: this.overcastColor },
      uOvercast: { value: 0 },
    };
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(DOME_RADIUS, 24, 12),
      new THREE.ShaderMaterial({
        uniforms: this.domeUniforms,
        vertexShader: DOME_VERT,
        fragmentShader: DOME_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
      })
    );
    this.dome.renderOrder = -100;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // 3D blocky clouds
    this.cloudMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, fog: false,
    });
    this.clouds = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.cloudMat, CLOUD_COUNT);
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = -90;
    const rand = mulberry32(20260903);
    this.cloudData = [];
    for (let i = 0; i < CLOUD_COUNT; i++) {
      this.cloudData.push({
        x: rand() * CLOUD_REGION,
        y: 148 + rand() * 16,
        z: rand() * CLOUD_REGION,
        w: 14 + rand() * 30,
        d: 12 + rand() * 26,
        h: 4 + rand() * 5,
      });
    }
    this.cloudDrift = 0;
    scene.add(this.clouds);
    this._m = new THREE.Matrix4();

    scene.fog = new THREE.Fog(0x78b5e8, 40, 200);
    this.fogFar = 200;
  }

  setTime(t) { this.time = ((t % 1) + 1) % 1; }
  getTime() { return this.time; }
  getDayFactor() { return this.dayFactor; }
  setOvercast(f) { this.overcast = Math.max(0, Math.min(1, f)); }
  triggerFlash() { this.flash = 0.85; }

  setRenderDistance(blocks) {
    this.fogFar = blocks * 16 - 6;
    this.scene.fog.near = this.fogFar * 0.55;
    this.scene.fog.far = this.fogFar;
  }

  setCloudsVisible(v) { this.clouds.visible = v; }

  update(dt, cameraPos, headInWater) {
    this.time = (this.time + dt / DAY_LENGTH) % 1;
    const angle = this.time * Math.PI * 2;
    const elev = Math.sin(angle);

    const dayF = smoothstep(-0.14, 0.22, elev);
    this.dayFactor = dayF;

    // palettes (kept vivid; ACES tone mapping in the renderer shapes them)
    this.zenith.setHex(0x0a1020).lerp(new THREE.Color(0x4a86c8), dayF);
    this.horizon.setHex(0x141c30).lerp(new THREE.Color(0x9ec8ee), dayF);
    const sunsetW = Math.exp(-Math.pow(elev / 0.16, 2)) * 0.75;

    // overcast desaturation + darkening
    if (this.overcast > 0) {
      const gray = new THREE.Color(0x5a6570).multiplyScalar(0.35 + 0.65 * dayF);
      this.zenith.lerp(gray, this.overcast * 0.7);
      this.horizon.lerp(gray.clone().multiplyScalar(1.12), this.overcast * 0.7);
    }

    this.skyColor.copy(this.horizon);

    // sun direction matches the terrain day factor
    this.sunDir = this.sunDir || new THREE.Vector3();
    this.sunDir.set(Math.cos(angle), Math.sin(angle), 0.18).normalize();

    this.flash = Math.max(0, this.flash - dt * 3.2);

    // dome uniforms + position
    const u = this.domeUniforms;
    u.uSunsetW.value = sunsetW;
    u.uSunDir.value.copy(this.sunDir);
    u.uDayFactor.value = dayF;
    u.uTime.value += dt;
    u.uFlash.value = this.flash;
    u.uOvercast.value = this.overcast;
    this.dome.position.copy(cameraPos);
    this.dome.visible = !headInWater;

    // fog color follows the horizon (or underwater blue)
    if (headInWater) {
      this.scene.fog.color.set(0x1d4291);
      this.scene.fog.near = 1;
      this.scene.fog.far = 22;
      this.scene.background = this.scene.background || new THREE.Color();
      this.scene.background.set(0x1d4291);
    } else {
      this.scene.background = null;
      this.scene.fog.color.copy(this.skyColor);
      this.scene.fog.near = this.fogFar * (0.55 - this.overcast * 0.25);
      this.scene.fog.far = this.fogFar * (1 - this.overcast * 0.3);
    }

    // clouds drift and wrap around the camera
    this.cloudDrift += dt * 1.6;
    const half = CLOUD_REGION / 2;
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const c = this.cloudData[i];
      let wx = c.x + this.cloudDrift;
      wx = mod(wx - (cameraPos.x - half), CLOUD_REGION) + cameraPos.x - half;
      const wz = mod(c.z - (cameraPos.z - half), CLOUD_REGION) + cameraPos.z - half;
      this._m.makeScale(c.w, c.h, c.d);
      this._m.setPosition(wx, c.y, wz);
      this.clouds.setMatrixAt(i, this._m);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
    const cloudLight = 0.4 + 0.6 * dayF;
    this.cloudMat.color.setRGB(cloudLight, cloudLight, cloudLight * 1.02);
    this.cloudMat.opacity = 0.5 + this.overcast * 0.35;
  }
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function mod(v, m) { return ((v % m) + m) % m; }
