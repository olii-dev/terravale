// Pooled GPU particle system: a single THREE.Points with per-particle
// position/velocity/color/life in typed arrays. Effects spawn from a
// cursor-free pool; particles fade, shrink, fall or float per mode.

import * as THREE from 'three';

const CAP = 700;

const PART_VERT = `
  attribute float psize;
  attribute vec3 pcolor;
  attribute float palpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = pcolor;
    vAlpha = palpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(psize * (140.0 / max(1.0, -mvPosition.z)), 2.0, 48.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const PART_FRAG = `
  precision mediump float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = max(abs(c.x), abs(c.y)); // blocky square particles
    if (d > 0.5) discard;
    gl_FragColor = vec4(vColor, vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// '#rrggbb' or 'rgb(r,g,b)' -> [r,g,b] 0..1
const colorCache = new Map();
function toRGB(c) {
  let v = colorCache.get(c);
  if (v) return v;
  if (c[0] === '#') {
    const n = parseInt(c.slice(1), 16);
    v = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  } else {
    const m = c.match(/[\d.]+/g);
    v = m ? m.slice(0, 3).map(Number).map(x => x / 255) : [1, 1, 1];
  }
  colorCache.set(c, v);
  return v;
}

export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(CAP * 3);
    this.vel = new Float32Array(CAP * 3);
    this.col = new Float32Array(CAP * 3);
    this.size = new Float32Array(CAP);
    this.alpha = new Float32Array(CAP);
    this.life = new Float32Array(CAP);   // remaining seconds
    this.maxLife = new Float32Array(CAP);
    this.grav = new Float32Array(CAP);   // gravity factor
    this.drag = new Float32Array(CAP);
    this.head = 0;
    this.alive = 0;

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('psize', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('palpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo.setDrawRange(0, CAP);

    this.mat = new THREE.ShaderMaterial({
      vertexShader: PART_VERT,
      fragmentShader: PART_FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, color, opts = {}) {
    const i = this.head;
    this.head = (this.head + 1) % CAP;
    const rgb = typeof color === 'string' ? toRGB(color) : color;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = rgb[0]; this.col[i * 3 + 1] = rgb[1]; this.col[i * 3 + 2] = rgb[2];
    const life = opts.life ?? 0.7;
    this.life[i] = life; this.maxLife[i] = life;
    this.size[i] = opts.size ?? 3;
    this.alpha[i] = opts.alpha ?? 1;
    this.grav[i] = opts.grav ?? 1;
    this.drag[i] = opts.drag ?? 1.5;
    this.alive = Math.min(CAP, this.alive + 1);
  }

  burst(x, y, z, colors, count = 16, power = 3) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 1.5 + Math.random() * 3.5;
      const spd = power * (0.4 + Math.random() * 0.8);
      this.spawn(
        x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.6, z + (Math.random() - 0.5) * 0.6,
        Math.cos(a) * spd, up, Math.sin(a) * spd,
        colors[Math.floor(Math.random() * colors.length)],
        { life: 0.45 + Math.random() * 0.5, size: 2.5 + Math.random() * 2.5, grav: 1.4 }
      );
    }
  }

  update(dt, world) {
    let anyAlive = false;
    for (let i = 0; i < CAP; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      anyAlive = true;
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = Math.min(1, t * 2);
      this.vel[i * 3 + 1] -= 14 * this.grav[i] * dt;
      const d = 1 - Math.min(0.9, this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    if (anyAlive || this._dirty) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.pcolor.needsUpdate = true;
      this.geo.attributes.psize.needsUpdate = true;
      this.geo.attributes.palpha.needsUpdate = true;
      this._dirty = anyAlive;
    }
  }

  setVisible(v) { this.points.visible = v; }
}
