// Chunk mesh builder v2: per-face culling + vertex ambient occlusion +
// smooth per-vertex sky/block light (baked as two float attributes; the
// terrain shader combines them with the day factor at render time).

import * as THREE from 'three';
import { CHUNK, HEIGHT } from './worldgen.js';
import { B, BLOCKS, isOpaque, isCross, isWater, waterLevel } from './blocks.js';

// per-biome grass/foliage tint (the signature look)
const BIOME_TINTS = [
  [0.57, 0.74, 0.35], // plains  #91bd59
  [0.47, 0.75, 0.35], // forest  #79c05a
  [0.75, 0.72, 0.33], // desert  #bfb755
  [0.50, 0.71, 0.59], // snowy   #80b497
  [0.53, 0.72, 0.51], // taiga   #86b783
  [0.75, 0.72, 0.33], // savanna #bfb755
];
const TINTED_BLOCKS = new Set([B.GRASS, B.OAK_LEAVES, B.BIRCH_LEAVES, B.WILD_GRASS]);
import { uvRect } from './textures.js';

// face order matches blocks.faceTiles: +X, -X, +Y, -Y, +Z, -Z
const FACES = [
  { n: [1, 0, 0], v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.65 },
  { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.65 },
  { n: [0, 1, 0], v: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], shade: 1.0 },
  { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5 },
  { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.82 },
  { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.82 },
];

const AO_LUT = [0.42, 0.62, 0.8, 1.0];

function makeBucket() {
  return { pos: [], uv: [], color: [], sky: [], block: [], index: [], count: 0 };
}

function pushQuad(bucket, verts, uvs, colors, skys, blocks, flip) {
  const base = bucket.count;
  for (let i = 0; i < 4; i++) {
    bucket.pos.push(verts[i][0], verts[i][1], verts[i][2]);
    bucket.uv.push(uvs[i][0], uvs[i][1]);
    bucket.color.push(colors[i], colors[i], colors[i]);
    bucket.sky.push(skys[i]);
    bucket.block.push(blocks[i * 3], blocks[i * 3 + 1], blocks[i * 3 + 2]);
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
  g.setAttribute('skylight', new THREE.BufferAttribute(new Float32Array(bucket.sky), 1));
  g.setAttribute('blocklight', new THREE.BufferAttribute(new Float32Array(bucket.block), 3));
  g.setIndex(bucket.index);
  g.computeBoundingSphere();
  return g;
}

export function buildChunkGeometry(world, lighting, cx, cz) {
  const entry = world.ensureChunk(cx, cz);
  const data = entry.data;
  const maxY = Math.min(HEIGHT, entry.maxY + 1);
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const biomes = new Int8Array(CHUNK * CHUNK);
  for (let z = 0; z < CHUNK; z++) {
    for (let x = 0; x < CHUNK; x++) {
      biomes[z * CHUNK + x] = world.worldgen.biomeAt(x0 + x, z0 + z);
    }
  }
  const opaque = makeBucket();
  const cutout = makeBucket();
  const flora = makeBucket();
  const water = makeBucket();

  const get = (x, y, z) => {
    if (y < 0) return B.BEDROCK;
    if (y >= HEIGHT) return B.AIR;
    if (x >= 0 && x < CHUNK && z >= 0 && z < CHUNK) {
      return data[(y * CHUNK + z) * CHUNK + x];
    }
    return world.getBlock(x0 + x, y, z0 + z);
  };

  const skyAt = (x, y, z) => lighting ? lighting.getSky(x0 + x, y, z0 + z) : 15;
  const blkScratch = [0, 0, 0];
  const blockAtL = (x, y, z, out) => {
    if (!lighting) return (out[0] = out[1] = out[2] = 0);
    return lighting.getBlockRGB(x0 + x, y, z0 + z, out);
  };

  for (let y = 0; y < maxY; y++) {
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const id = data[(y * CHUNK + z) * CHUNK + x];
        if (id === B.AIR) continue;
        const bl = BLOCKS[id];
        const tint = TINTED_BLOCKS.has(id) ? BIOME_TINTS[biomes[z * CHUNK + x]] : null;

        if (bl.cross) {
          pushCross(flora, x, y, z, bl.faceTiles[0], x0, z0, skyAt(x, y, z) / 15, blockAtL(x, y, z, blkScratch), bl.wallOffset);
          continue;
        }

        const isWaterBlock = bl.water;
        const wLevel = isWaterBlock ? waterLevel(id) : -1;
        const topOpen = isWaterBlock && !isWater(get(x, y + 1, z));
        // source sits at 7/8; flowing levels get shallower with distance
        const topY = topOpen && isWaterBlock ? y + Math.max(0.125, 1 - (wLevel + 1) / 9) : y + 1;

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const nx = x + face.n[0], ny = y + face.n[1], nz = z + face.n[2];
          const nid = get(nx, ny, nz);

          let visible;
          if (isWaterBlock) visible = nid !== id && !isOpaque(nid);
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
          const skys = [];
          const blocksL = [];  // 3 floats per vertex (r,g,b)
          const aos = [];
          for (let i = 0; i < 4; i++) {
            const v = face.v[i];
            let vy = v[1] === 1 ? topY : y;
            if (isWaterBlock && v[1] === 1 && f !== 2 && f !== 3) vy = topY;
            verts.push([x + v[0], vy, z + v[2]]);

            if (bucket === opaque) {
              const sample = faceLightAO(get, skyAt, blockAtL, face, v, x, y, z);
              aos.push(sample.ao);
              const tc = tint && f === 2 ? tint : null; // tint only top faces of grass
              colors.push(face.shade * AO_LUT[sample.ao] * (tc ? tc[0] : 1), face.shade * AO_LUT[sample.ao] * (tc ? tc[1] : 1), face.shade * AO_LUT[sample.ao] * (tc ? tc[2] : 1));
              skys.push(sample.sky);
              blocksL.push(sample.block[0], sample.block[1], sample.block[2]);
            } else {
              aos.push(3);
              colors.push(face.shade * (tint ? tint[0] : 1), face.shade * (tint ? tint[1] : 1), face.shade * (tint ? tint[2] : 1));
              // flat light for water/glass/cutout
              const s = skyAt(nx, ny, nz) / 15;
              const b = blockAtL(nx, ny, nz, blkScratch);
              skys.push(s);
              blocksL.push(b[0], b[1], b[2]);
            }
          }
          const flip = aos[0] + aos[2] < aos[1] + aos[3];
          pushQuad(bucket, verts, uvs, colors, skys, blocksL, flip);
        }
      }
    }
  }

  return {
    opaque: bucketToGeometry(opaque),
    cutout: bucketToGeometry(cutout),
    flora: bucketToGeometry(flora),
    water: bucketToGeometry(water),
  };
}

// per-corner AO + smooth light: sample the face-adjacent cell, the two edge
// neighbors and the diagonal; light averages non-opaque samples
function faceLightAO(get, skyAt, blockAtL, face, v, x, y, z) {
  const [ax, ay, az] = face.n;
  const px = x + ax, py = y + ay, pz = z + az;

  let t1, t2;
  if (ax !== 0) { t1 = [0, 1, 0]; t2 = [0, 0, 1]; }
  else if (ay !== 0) { t1 = [1, 0, 0]; t2 = [0, 0, 1]; }
  else { t1 = [1, 0, 0]; t2 = [0, 1, 0]; }

  const d1 = (v[0] * t1[0] + v[1] * t1[1] + v[2] * t1[2]) ? 1 : -1;
  const d2 = (v[0] * t2[0] + v[1] * t2[1] + v[2] * t2[2]) ? 1 : -1;

  const s1x = px + t1[0] * d1, s1y = py + t1[1] * d1, s1z = pz + t1[2] * d1;
  const s2x = px + t2[0] * d2, s2y = py + t2[1] * d2, s2z = pz + t2[2] * d2;
  const cxx = s1x + t2[0] * d2, cyy = s1y + t2[1] * d2, czz = s1z + t2[2] * d2;

  const o1 = isOpaque(get(s1x, s1y, s1z)) ? 1 : 0;
  const o2 = isOpaque(get(s2x, s2y, s2z)) ? 1 : 0;
  const oc = isOpaque(get(cxx, cyy, czz)) ? 1 : 0;
  const ao = (o1 && o2) ? 0 : 3 - (o1 + o2 + oc);

  // light: average the non-opaque samples among base + 3 neighbors
  const blk = [0, 0, 0];
  let skySum = skyAt(px, py, pz);
  blockAtL(px, py, pz, blk);
  let br = blk[0], bg = blk[1], bb = blk[2], n = 1;
  if (!o1) { skySum += skyAt(s1x, s1y, s1z); blockAtL(s1x, s1y, s1z, blk); br += blk[0]; bg += blk[1]; bb += blk[2]; n++; }
  if (!o2) { skySum += skyAt(s2x, s2y, s2z); blockAtL(s2x, s2y, s2z, blk); br += blk[0]; bg += blk[1]; bb += blk[2]; n++; }
  if (!oc && !(o1 && o2)) { skySum += skyAt(cxx, cyy, czz); blockAtL(cxx, cyy, czz, blk); br += blk[0]; bg += blk[1]; bb += blk[2]; n++; }

  return { ao, sky: skySum / n / 15, block: [br / n, bg / n, bb / n] };
}

function pushCross(bucket, x, y, z, tile, x0, z0, sky, blockL, wallOff) {
  const bl = [blockL[0], blockL[1], blockL[2]];
  const rect = uvRect(tile);
  const off = ((x0 + x) * 31 + (z0 + z) * 17 + y * 7) % 7 / 7;
  const ox = wallOff ? wallOff[0] : (off - 0.5) * 0.3;
  const oz = wallOff ? wallOff[1] : (((x0 + x) * 13 + (z0 + z) * 41) % 5 - 2) * 0.06;
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
    pushQuad(bucket, verts, uvs, [1, 1, 1, 1], [sky, sky, sky, sky], [bl[0], bl[1], bl[2], bl[0], bl[1], bl[2], bl[0], bl[1], bl[2], bl[0], bl[1], bl[2]], false);
  }
}
