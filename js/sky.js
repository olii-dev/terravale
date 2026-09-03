// Sky: day/night cycle with sun & moon, stars, drifting clouds, fog that
// tracks the horizon color. dayFactor (0..1) drives hostile spawning and
// the terrain shader's sky-light multiplier.

import * as THREE from 'three';
import { mulberry32 } from './noise.js';

const DAY_LENGTH = 600; // seconds per full cycle
const DAY_COLOR = new THREE.Color('#78b5e8');
const NIGHT_COLOR = new THREE.Color('#070b18');
const SUNSET_COLOR = new THREE.Color('#e8823c');

function sunTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,244,200,1)');
  g.addColorStop(0.35, 'rgba(255,220,120,0.95)');
  g.addColorStop(0.6, 'rgba(255,190,80,0.35)');
  g.addColorStop(1, 'rgba(255,190,80,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#fff7d9';
  ctx.fillRect(24, 24, 16, 16);
  return new THREE.CanvasTexture(c);
}

function moonTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(226,232,240,0.9)');
  g.addColorStop(0.7, 'rgba(200,210,225,0.25)');
  g.addColorStop(1, 'rgba(200,210,225,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#dfe6ee';
  ctx.fillRect(25, 25, 14, 14);
  ctx.fillStyle = '#b9c2cf';
  ctx.fillRect(28, 28, 4, 4); ctx.fillRect(33, 31, 3, 3);
  return new THREE.CanvasTexture(c);
}

function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const rand = mulberry32(20260903);
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 42; i++) {
    const x = Math.floor(rand() * 256), y = Math.floor(rand() * 256);
    const w = 18 + Math.floor(rand() * 46), h = 10 + Math.floor(rand() * 22);
    for (let j = 0; j < 5; j++) {
      const ox = Math.floor((rand() - 0.5) * w), oy = Math.floor((rand() - 0.5) * h);
      ctx.fillRect(
        (x + ox + 256) % 256, (y + oy + 256) % 256,
        Math.floor(w * (0.5 + rand() * 0.5)), Math.floor(h * (0.5 + rand() * 0.5))
      );
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}

export class Sky {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.time = 0.32;
    this.dayFactor = 1;

    this.skyColor = new THREE.Color();
    scene.background = this.skyColor;
    scene.fog = new THREE.Fog(0x78b5e8, 40, 200);
    this.fogFar = 200;
    this.underwaterOverride = false;

    this.pivot = new THREE.Object3D();
    scene.add(this.pivot);

    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTexture(), fog: false, depthWrite: false }));
    this.sun.scale.setScalar(74);
    this.sun.position.set(340, 0, 0);
    this.pivot.add(this.sun);

    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture(), fog: false, depthWrite: false }));
    this.moon.scale.setScalar(48);
    this.moon.position.set(-340, 0, 0);
    this.pivot.add(this.moon);

    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    const rand = mulberry32(991203);
    for (let i = 0; i < 420; i++) {
      const u = rand() * 2 - 1, th = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      starPos.push(380 * r * Math.cos(th), 380 * u, 380 * r * Math.sin(th));
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(starPos), 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xffffff, size: 1.6, sizeAttenuation: false,
      transparent: true, opacity: 0, fog: false, depthWrite: false,
    });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.pivot.add(this.stars);

    this.cloudTex = cloudTexture();
    this.cloudTex.repeat.set(5, 5);
    this.cloudMat = new THREE.MeshBasicMaterial({
      map: this.cloudTex, transparent: true, opacity: 0.5,
      depthWrite: false, fog: false, side: THREE.DoubleSide,
    });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), this.cloudMat);
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.position.y = 165;
    this.clouds.renderOrder = -1;
    scene.add(this.clouds);
  }

  setTime(t) { this.time = ((t % 1) + 1) % 1; }
  getTime() { return this.time; }
  getDayFactor() { return this.dayFactor; }

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

    this.skyColor.copy(NIGHT_COLOR).lerp(DAY_COLOR, dayF);
    const sunsetW = Math.exp(-Math.pow(elev / 0.14, 2)) * 0.55;
    this.skyColor.lerp(SUNSET_COLOR, sunsetW);

    this.pivot.position.copy(cameraPos);
    this.pivot.rotation.z = angle;
    this.starMat.opacity = Math.max(0, 1 - dayF * 1.4) * 0.9;

    this.cloudTex.offset.x += dt * 0.0022;
    this.clouds.position.x = cameraPos.x;
    this.clouds.position.z = cameraPos.z;
    this.cloudMat.color.setScalar(0.35 + 0.65 * dayF);

    if (headInWater) {
      this.scene.fog.color.set(0x1d4291);
      this.scene.fog.near = 1;
      this.scene.fog.far = 22;
      this.scene.background.set(0x1d4291);
    } else {
      this.scene.fog.color.copy(this.skyColor);
      this.scene.fog.near = this.fogFar * 0.55;
      this.scene.fog.far = this.fogFar;
    }
  }
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
