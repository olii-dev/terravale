// First-person held item: a block cube or item sprite attached to the
// camera with walk bob and a swing animation on use.

import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { buildBlockMesh } from './drops.js';
import { itemTexture } from './sprites.js';

export class HandView {
  constructor(camera) {
    this.camera = camera;
    this.group = new THREE.Group();
    camera.add(this.group);
    this.group.position.set(0.42, -0.42, -0.7);
    this.swingT = 1;      // >= 1 = idle
    this.bobPhase = 0;
    this.heldId = -1;
    this.mesh = null;
    this.setHeld(null);
  }

  setHeld(stack) {
    const id = stack ? stack.id : 0;
    if (id === this.heldId) return;
    this.heldId = id;
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry?.dispose();
      this.mesh = null;
    }
    if (id && id < 100 && BLOCKS[id] && !BLOCKS[id].cross) {
      this.mesh = buildBlockMesh(id, 0.34);
      this.mesh.rotation.y = Math.PI / 5;
    } else if (id) {
      const mat = new THREE.MeshBasicMaterial({
        map: itemTexture(id), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide,
      });
      this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), mat);
      this.mesh.rotation.y = -0.4;
      this.mesh.rotation.z = 0.35;
    } else {
      // bare arm: skin with sleeve shading via a tiny procedural texture
      const c = document.createElement('canvas');
      c.width = c.height = 16;
      const tctx = c.getContext('2d');
      tctx.fillStyle = '#f0c8a0';
      tctx.fillRect(0, 0, 16, 16);
      tctx.fillStyle = '#e0b288';
      for (let i = 0; i < 30; i++) tctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1, 1);
      tctx.fillStyle = '#4a7a8c';
      tctx.fillRect(0, 0, 16, 5); // sleeve
      tctx.fillStyle = '#3d6776';
      tctx.fillRect(0, 4, 16, 1);
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      this.mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.34, 0.14),
        new THREE.MeshBasicMaterial({ map: tex })
      );
      this.mesh.rotation.set(0.5, 0, -0.2);
    }
    this.group.add(this.mesh);
  }

  swing() {
    this.swingT = 0;
  }

  update(dt, horizontalSpeed, onGround) {
    if (onGround && horizontalSpeed > 0.5) {
      this.bobPhase += dt * horizontalSpeed * 1.6;
    }
    const bobY = Math.sin(this.bobPhase * 2) * 0.018;
    const bobX = Math.cos(this.bobPhase) * 0.012;

    if (this.swingT < 1) {
      this.swingT = Math.min(1, this.swingT + dt * 4.5);
    }
    const s = this.swingT;
    const swingCurve = Math.sin(s * Math.PI); // out and back
    this.group.position.set(
      0.42 + bobX - swingCurve * 0.18,
      -0.42 + bobY - swingCurve * 0.22,
      -0.7 + swingCurve * -0.12
    );
    this.group.rotation.set(-swingCurve * 0.9, swingCurve * 0.35, 0);
  }
}
