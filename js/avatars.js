// Remote player avatars: original blocky figures tinted with each
// player's color, with name tags, smoothed movement and a walk cycle.

import * as THREE from 'three';

function nameSprite(name, color) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = 'bold 28px "Courier New", monospace';
  ctx.font = font;
  const text = name.slice(0, 16);
  const w = Math.ceil(ctx.measureText(text).width) + 28;
  c.width = w;
  c.height = 44;
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(10,9,16,0.65)';
  ctx.fillRect(0, 0, w, 44);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 5, 44);
  ctx.fillStyle = '#f2eee6';
  ctx.fillText(text, w / 2 + 2, 23);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(w / 44 * 0.55, 0.55, 1);
  return spr;
}

function buildBody(colorHex) {
  const base = new THREE.Color(colorHex);
  const shirt = base.clone();
  const pants = base.clone().multiplyScalar(0.55);
  const skin = base.clone().lerp(new THREE.Color('#f0c8a0'), 0.55);

  const mat = (c) => new THREE.MeshBasicMaterial({ color: c.clone() });
  const group = new THREE.Group();
  const materials = [];

  const box = (w, h, d, c, x, y, z, pivotTop = false) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const m = mat(c);
    materials.push(m);
    const mesh = new THREE.Mesh(geo, m);
    let holder = mesh;
    if (pivotTop) {
      holder = new THREE.Group();
      holder.position.y = y + h / 2;
      mesh.position.y = -h / 2;
      holder.add(mesh);
      holder.position.x = x; holder.position.z = z;
    } else {
      mesh.position.set(x, y + h / 2, z);
    }
    group.add(holder);
    return holder;
  };

  const legL = box(0.24, 0.75, 0.24, pants, -0.13, 0, 0, true);
  const legR = box(0.24, 0.75, 0.24, pants, 0.13, 0, 0, true);
  box(0.52, 0.72, 0.28, shirt, 0, 0.75, 0); // body
  const armL = box(0.2, 0.7, 0.24, shirt, -0.37, 1.42, 0, true);
  const armR = box(0.2, 0.7, 0.24, shirt, 0.37, 1.42, 0, true);
  const headHolder = new THREE.Group();
  headHolder.position.y = 1.47;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat(skin));
  materials.push(head.material);
  head.position.y = 0.25;
  // simple face: darker front pixels
  const faceMat = new THREE.MeshBasicMaterial({ color: skin.clone().multiplyScalar(0.35) });
  materials.push(faceMat);
  const eye1 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.02), faceMat);
  eye1.position.set(-0.11, 0.3, 0.26);
  const eye2 = eye1.clone(); eye2.position.x = 0.11;
  head.add(eye1, eye2);
  headHolder.add(head);
  group.add(headHolder);

  return { group, legL, legR, armL, armR, headHolder, materials };
}

export class Avatars {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map(); // id -> {body, target, yaw, pitch, phase, pos}
    this.brightness = 1;
  }

  add(id, name, color, state) {
    if (this.map.has(id)) this.remove(id);
    const body = buildBody(color);
    const tag = nameSprite(name, color);
    tag.position.y = 2.35;
    body.group.add(tag);
    this.scene.add(body.group);
    const pos = state ? new THREE.Vector3(state.x, state.y, state.z) : new THREE.Vector3(0, -100, 0);
    body.group.position.copy(pos);
    this.map.set(id, {
      body, tag,
      pos: pos.clone(),
      target: pos.clone(),
      yaw: state?.yaw ?? 0, pitch: state?.pitch ?? 0,
      phase: 0, speed: 0,
    });
    this.setBrightness(this.brightness);
  }

  remove(id) {
    const a = this.map.get(id);
    if (!a) return;
    this.scene.remove(a.body.group);
    a.body.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material?.map) o.material.map.dispose();
      if (o.material) o.material.dispose();
    });
    this.map.delete(id);
  }

  setState(id, s) {
    const a = this.map.get(id);
    if (!a) return;
    a.target.set(s.x, s.y, s.z);
    a.yaw = s.yaw ?? a.yaw;
    a.pitch = s.pitch ?? a.pitch;
  }

  update(dt) {
    for (const a of this.map.values()) {
      // exponential smoothing toward target
      const k = 1 - Math.exp(-12 * dt);
      const prev = a.pos.clone();
      a.pos.lerp(a.target, k);
      a.speed = a.pos.distanceTo(prev) / Math.max(dt, 1e-4);

      a.body.group.position.copy(a.pos);

      // shortest-arc yaw smoothing
      let d = a.yaw - a.body.group.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      a.body.group.rotation.y += d * Math.min(1, 10 * dt);
      a.body.headHolder.rotation.x = -a.pitch * 0.7;

      // walk cycle
      const targetSpeed = Math.min(a.speed, 7);
      a.phase += dt * (2 + targetSpeed * 1.6);
      const swing = Math.sin(a.phase) * Math.min(0.7, targetSpeed * 0.18);
      a.body.legL.rotation.x = swing;
      a.body.legR.rotation.x = -swing;
      a.body.armL.rotation.x = -swing * 0.8;
      a.body.armR.rotation.x = swing * 0.8;

      // name tag faces camera automatically (Sprite) — hide when far
      const camDist = a.body.group.position.distanceTo(this.cameraPos || a.pos);
      a.tag.visible = camDist < 80;
    }
  }

  setCameraPos(p) { this.cameraPos = p; }

  setBrightness(b) {
    this.brightness = b;
    for (const a of this.map.values()) {
      for (const m of a.body.materials) {
        // materials store their day color on first dim
        if (!m.userData.base) m.userData.base = m.color.clone();
        m.color.copy(m.userData.base).multiplyScalar(b);
      }
    }
  }

  clear() {
    for (const id of [...this.map.keys()]) this.remove(id);
  }
}
