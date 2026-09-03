// Chunk mesh builder: per-face culling + vertex ambient occlusion.
// Produces up to three geometries per chunk: opaque, cutout (plants/glass),
// and water.

import * as THREE from 'three';
import { CHUNK, HEIGHT } from './worldgen.js';
import { B, BLOCKS, isOpaque, isCross } from './blocks.js';
import { uvRect } from './textures.js';

// face order matches blocks.faceTiles: +X, -X, +Y, -Y, +Z, -Z
const FACES = [
  {
    n: [1, 0, 0],
    v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
    shade: 0.65,
  },
  {
    n: [-1, 0, 0],
    v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
    shade: 0.65,
  },
  {
    n: [0, 1, 0],
    v: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
    shade: 1.0,
  },
  {
    n: [0, -1, 0],
    v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
    shade: 0.5,
  },
  {
    n: [0, 0, 1],
    v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
    shade: 0.82,
  },
  {
    n: [0, 0, -1],
    v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
    shade: 0.82,
  },
];

const AO_LUT = [0.42, 0.62, 0.8, 1.0];

function makeBucket() {
  return { pos: [], uv: [], color: [], index: [], count: 0 };
}

function pushQuad(bucket, verts, uvs, colors, flip) {
  const base = bucket.count;
  for (let i = 0; i < 4; i++) {
    bucket.pos.push(verts[i][0], verts[i][1], verts[i][2]);
    bucket.uv.push(uvs[i][0], uvs[i][1]);
    bucket.color.push(colors[i], colors[i], colors[i]);
  }
  if (flip) bucket.index.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  else bucket.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  bucket.count += 4;
}

function bucketToGeometry(bucket) {
  if (bucket.count === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bucket.pos), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bucket.uv), 2));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(bucket.color), 3));
  g.setIndex(bucket.index);
  g.computeBoundingSphere();
  return g;
}

export function buildChunkGeometry(world, cx, cz) {
  const data = world.ensureChunk(cx, cz);
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const opaque = makeBucket();
  const cutout = makeBucket();
  const water = makeBucket();

  const get = (x, y, z) => {
    if (y < 0) return B.BEDROCK;
    if (y >= HEIGHT) return B.AIR;
    if (x >= 0 && x < CHUNK && z >= 0 && z < CHUNK) {
      return data[(y * CHUNK + z) * CHUNK + x];
    }
    return world.getBlock(x0 + x, y, z0 + z);
  };

  for (let y = 0; y < HEIGHT; y++) {
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const id = data[(y * CHUNK + z) * CHUNK + x];
        if (id === B.AIR) continue;
        const bl = BLOCKS[id];

        if (bl.cross) {
          pushCross(cutout, x, y, z, bl.faceTiles[0], x0, z0);
          continue;
        }

        const isWaterBlock = bl.water;
        const topOpen = isWaterBlock && get(x, y + 1, z) !== B.WATER;
        const topY = topOpen ? y + 0.875 : y + 1;

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const nx = x + face.n[0], ny = y + face.n[1], nz = z + face.n[2];
          const nid = get(nx, ny, nz);

          let visible;
          if (isWaterBlock) visible = nid !== B.WATER && !isOpaque(nid);
          else if (bl.glass) visible = !isOpaque(nid) && nid !== B.GLASS;
          else visible = !isOpaque(nid);
          if (!visible) continue;

          const bucket = isWaterBlock ? water : bl.glass ? cutout : opaque;
          const rect = uvRect(bl.faceTiles[f]);
          const uvs = [
            [rect[0], rect[1]], [rect[2], rect[1]], [rect[2], rect[3]], [rect[0], rect[3]],
          ];

          const verts = [];
          const colors = [];
          const aos = [];
          for (let i = 0; i < 4; i++) {
            const v = face.v[i];
            let vy = v[1] === 1 ? topY : y;
            // lower the top edge of water side faces when surface is open
            if (isWaterBlock && v[1] === 1 && f !== 2 && f !== 3) vy = topY;
            verts.push([x + v[0], vy, z + v[2]]);

            if (bucket === opaque) {
              const ao = vertexAO(get, face, v, x, y, z);
              aos.push(ao);
              const c = face.shade * AO_LUT[ao];
              colors.push(c);
            } else {
              aos.push(3);
              colors.push(face.shade);
            }
          }
          const flip = aos[0] + aos[2] < aos[1] + aos[3];
          pushQuad(bucket, verts, uvs, colors, flip);
        }
      }
    }
  }

  return {
    opaque: bucketToGeometry(opaque),
    cutout: bucketToGeometry(cutout),
    water: bucketToGeometry(water),
  };
}

// standard corner AO: check the two edge neighbors + diagonal in the face plane
function vertexAO(get, face, v, x, y, z) {
  const [ax, ay, az] = face.n;
  const px = x + ax, py = y + ay, pz = z + az;

  // tangent axes = the two axes not equal to the normal axis
  let t1, t2;
  if (ax !== 0) { t1 = [0, 1, 0]; t2 = [0, 0, 1]; }
  else if (ay !== 0) { t1 = [1, 0, 0]; t2 = [0, 0, 1]; }
  else { t1 = [1, 0, 0]; t2 = [0, 1, 0]; }

  const d1 = (v[0] * t1[0] + v[1] * t1[1] + v[2] * t1[2]) ? 1 : -1;
  const d2 = (v[0] * t2[0] + v[1] * t2[1] + v[2] * t2[2]) ? 1 : -1;

  const s1 = isOpaque(get(px + t1[0] * d1, py + t1[1] * d1, pz + t1[2] * d1)) ? 1 : 0;
  const s2 = isOpaque(get(px + t2[0] * d2, py + t2[1] * d2, pz + t2[2] * d2)) ? 1 : 0;
  const c = isOpaque(get(px + t1[0] * d1 + t2[0] * d2, py + t1[1] * d1 + t2[1] * d2, pz + t1[2] * d1 + t2[2] * d2)) ? 1 : 0;

  if (s1 && s2) return 0;
  return 3 - (s1 + s2 + c);
}

function pushCross(bucket, x, y, z, tile, x0, z0) {
  const rect = uvRect(tile);
  const off = ((x0 + x) * 31 + (z0 + z) * 17 + y * 7) % 7 / 7; // deterministic jitter
  const ox = (off - 0.5) * 0.3;
  const oz = (((x0 + x) * 13 + (z0 + z) * 41) % 5 - 2) * 0.06;
  const lo = 0.15, hi = 0.85;

  const quads = [
    [[lo, 0, lo], [hi, 0, hi], [hi, 1, hi], [lo, 1, lo]],
    [[hi, 0, lo], [lo, 0, hi], [lo, 1, hi], [hi, 1, lo]],
  ];
  for (const q of quads) {
    const verts = q.map(([qx, qy, qz]) => [x + qx + ox, y + qy, z + qz + oz]);
    const uvs = [
      [rect[0], rect[1]], [rect[2], rect[1]], [rect[2], rect[3]], [rect[0], rect[3]],
    ];
    pushQuad(bucket, verts, uvs, [1, 1, 1, 1], false);
  }
}
