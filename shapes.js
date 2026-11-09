import * as THREE from "three";

export const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const ASSET_BASE_URL = "https://lkncoder.github.io/samhain-drone-show/";

function traceAllBoundaryLoops(edgePixels) {
  if (edgePixels.length === 0) return [];
  const edgeSet = new Set(edgePixels.map(p => (p.y << 10) | p.x));
  const visited = new Set();
  const allLoops = [];

  const dirs = [
    { dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 1 },
    { dx: -1, dy: 0 }, { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }
  ];

  for (const startPt of edgePixels) {
    const startKey = (startPt.y << 10) | startPt.x;
    if (visited.has(startKey)) continue;

    const currentLoop = [];
    let curr = startPt;
    let lastDir = 0;
    visited.add(startKey);
    currentLoop.push(curr);

    const maxSteps = Math.max(300, edgePixels.length);
    for (let step = 0; step < maxSteps; step++) {
      let found = false;
      for (let i = 0; i < 8; i++) {
        const dIdx = (lastDir + i) % 8;
        const nx = curr.x + dirs[dIdx].dx;
        const ny = curr.y + dirs[dIdx].dy;
        const nKey = (ny << 10) | nx;

        if (edgeSet.has(nKey) && !visited.has(nKey)) {
          visited.add(nKey);
          curr = { x: nx, y: ny };
          currentLoop.push(curr);
          lastDir = (dIdx + 5) % 8;
          found = true;
          break;
        }
      }

      if (!found) {
        let nearest = null;
        let minD = Infinity;
        for (const p of edgePixels) {
          const pk = (p.y << 10) | p.x;
          if (!visited.has(pk)) {
            const d = (p.x - curr.x) ** 2 + (p.y - curr.y) ** 2;
            if (d < minD) { minD = d; nearest = p; }
          }
        }
        if (nearest && minD <= 25) {
          curr = nearest;
          visited.add((curr.y << 10) | curr.x);
          currentLoop.push(curr);
          lastDir = 0;
        } else {
          break;
        }
      }
    }

    if (currentLoop.length >= 3) allLoops.push(currentLoop);
  }

  return allLoops;
}

function resampleEquidistant(orderedPts, targetCount) {
  if (orderedPts.length === 0 || targetCount <= 0) return [];
  if (targetCount === 1) return [orderedPts[0]];

  const dists = [0];
  for (let i = 1; i < orderedPts.length; i++) {
    const dx = orderedPts[i].x - orderedPts[i - 1].x;
    const dy = orderedPts[i].y - orderedPts[i - 1].y;
    dists.push(dists[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }

  const totalLen = dists[dists.length - 1];
  if (totalLen <= 0.001) return Array(targetCount).fill(orderedPts[0]);

  const stepDist = totalLen / targetCount;
  const resampled = [];

  let segIdx = 0;
  for (let i = 0; i < targetCount; i++) {
    const targetD = i * stepDist;
    while (segIdx < dists.length - 2 && dists[segIdx + 1] < targetD) segIdx++;
    const segLen = dists[segIdx + 1] - dists[segIdx];
    const t = segLen > 0.0001 ? (targetD - dists[segIdx]) / segLen : 0;
    const p0 = orderedPts[segIdx];
    const p1 = orderedPts[segIdx + 1];

    resampled.push({
      x: p0.x + (p1.x - p0.x) * t,
      y: p0.y + (p1.y - p0.y) * t
    });
  }

  return resampled;
}

// Emergency fallback only if all network/local image loads fail
export function generateProceduralShape(tileNum, out, count, swatchOut, altitude) {
  for (let i = 0; i < count; i++) {
    const theta = i * GOLDEN;
    const r = Math.sqrt((i + 0.5) / count) * 8.5;
    out[i * 3]     = Math.cos(theta) * r;
    out[i * 3 + 1] = altitude + Math.sin(theta) * r;
    out[i * 3 + 2] = 0;
    if (swatchOut) swatchOut[i] = i % 2;
  }
}

export function sampleImageToDrones(imgElement, out, count, swatchOut, scale = 0.048, altitude = 16, tileNum = 16) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  ctx.clearRect(0, 0, 512, 512);
  ctx.drawImage(imgElement, 0, 0, 512, 512);

  const imgData = ctx.getImageData(0, 0, 512, 512).data;
  const binary = new Uint8Array(512 * 512);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const cornerAlpha = (imgData[16 * 512 * 4 + 16 * 4 + 3] + imgData[16 * 512 * 4 + 495 * 4 + 3] + imgData[495 * 512 * 4 + 16 * 4 + 3]) / 3;
  const isTransparentBg = cornerAlpha < 50;

  for (let y = 16; y < 496; y++) {
    for (let x = 16; x < 496; x++) {
      const idx = (y * 512 + x) * 4;
      const r = imgData[idx], g = imgData[idx + 1], b = imgData[idx + 2], a = imgData[idx + 3];
      const lum = r * 0.299 + g * 0.587 + b * 0.114;
      const isForeground = isTransparentBg ? (a > 40) : (lum > 45 || (r + g + b > 80));

      if (isForeground) {
        binary[y * 512 + x] = 1;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const maxSpan = Math.max(spanX, spanY);

  if (maxSpan < 40 || !isFinite(minX)) {
    generateProceduralShape(tileNum, out, count, swatchOut, altitude);
    return;
  }

  const autoScale = 18.0 / maxSpan;
  const visited = new Uint8Array(512 * 512);
  const islands = [];

  for (let y = 16; y < 496; y++) {
    for (let x = 16; x < 496; x++) {
      const idx = y * 512 + x;
      if (binary[idx] === 1 && !visited[idx]) {
        const islandPixels = [];
        const queue = [{ x, y }];
        visited[idx] = 1;
        let ix0 = x, ix1 = x, iy0 = y, iy1 = y;

        while (queue.length > 0) {
          const pt = queue.pop();
          islandPixels.push(pt);
          if (pt.x < ix0) ix0 = pt.x;
          if (pt.x > ix1) ix1 = pt.x;
          if (pt.y < iy0) iy0 = pt.y;
          if (pt.y > iy1) iy1 = pt.y;

          const neighbors = [
            { x: pt.x + 1, y: pt.y }, { x: pt.x - 1, y: pt.y },
            { x: pt.x, y: pt.y + 1 }, { x: pt.x, y: pt.y - 1 }
          ];

          for (const n of neighbors) {
            if (n.x >= 16 && n.x < 496 && n.y >= 16 && n.y < 496) {
              const nIdx = n.y * 512 + n.x;
              if (binary[nIdx] === 1 && !visited[nIdx]) {
                visited[nIdx] = 1;
                queue.push(n);
              }
            }
          }
        }

        if (islandPixels.length >= 8) {
          const edge = [];
          for (const p of islandPixels) {
            const top   = binary[(p.y - 1) * 512 + p.x];
            const bot   = binary[(p.y + 1) * 512 + p.x];
            const left  = binary[p.y * 512 + (p.x - 1)];
            const right = binary[p.y * 512 + (p.x + 1)];
            if (!top || !bot || !left || !right) edge.push(p);
          }

          const allLoops = traceAllBoundaryLoops(edge);
          let totalLoopLen = 0;
          for (const loop of allLoops) totalLoopLen += loop.length;

          let weight = totalLoopLen * 2.2 + Math.sqrt(islandPixels.length) * 4.0;
          if (tileNum === 22) {
            // Skull: reduce back-of-cranium side plates & emphasize facial features, acorns, and oak leaves
            if (ix0 < 180 && iy1 < 350 && islandPixels.length < 15000) weight *= 0.42;
            else if (iy0 >= 398 && ix1 < 245) weight *= 1.8;
            else if ((ix0 < 60 && iy0 > 310) || ix0 > 400) weight *= 1.35;
          } else if (tileNum === 21) {
            // Cauldron: boost steam plumes and campfire flames/logs for rich detail
            if (iy1 < 210) weight *= 1.35;
            else if (iy0 >= 345) weight *= 1.35;
          }
          islands.push({
            pixels: islandPixels,
            loops: allLoops,
            totalLoopLen,
            weight,
            pixelCount: islandPixels.length,
            x0: ix0,
            x1: ix1,
            y0: iy0,
            y1: iy1
          });
        }
      }
    }
  }

  if (islands.length === 0) {
    generateProceduralShape(tileNum, out, count, swatchOut, altitude);
    return;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const totalWeight = islands.reduce((acc, isl) => acc + isl.weight, 0);

  const quotas = [];
  let allocatedSum = 0;

  for (let i = 0; i < islands.length; i++) {
    const rawQuota = (islands[i].weight / totalWeight) * count;
    const baseQuota = Math.max(3, Math.floor(rawQuota));
    quotas.push({ base: baseQuota, remainder: rawQuota - baseQuota, index: i });
    allocatedSum += baseQuota;
  }

  if (allocatedSum <= count) {
    quotas.sort((a, b) => b.remainder - a.remainder);
    let remDrones = count - allocatedSum;
    for (let i = 0; i < quotas.length && remDrones > 0; i++, remDrones--) {
      quotas[i].base++;
    }
  } else {
    quotas.sort((a, b) => b.base - a.base);
    let excess = allocatedSum - count;
    for (let i = 0; excess > 0; i = (i + 1) % quotas.length) {
      if (quotas[i].base > 4) {
        quotas[i].base--;
        excess--;
      }
    }
  }
  quotas.sort((a, b) => a.index - b.index);

  let ptr = 0;
  for (let k = 0; k < islands.length; k++) {
    const isl = islands[k];
    const islDroneCount = quotas[k].base;
    const edgeRatio = (tileNum === 22 && isl.pixelCount > 7000) ? 0.92 : 0.75;
    const edgeCount = Math.min(Math.round(isl.totalLoopLen * 1.5), Math.round(islDroneCount * edgeRatio));
    let islPlaced = 0;

    if (isl.loops.length > 0 && edgeCount > 0 && isl.totalLoopLen > 0) {
      for (let lIdx = 0; lIdx < isl.loops.length; lIdx++) {
        const remEdge = edgeCount - islPlaced;
        if (remEdge <= 0) break;
        const loop = isl.loops[lIdx];
        const loopDrones = (lIdx === isl.loops.length - 1)
          ? remEdge
          : Math.min(remEdge, Math.max(2, Math.round((loop.length / isl.totalLoopLen) * edgeCount)));
        const resampled = resampleEquidistant(loop, loopDrones);

        for (let i = 0; i < resampled.length && islPlaced < islDroneCount && ptr < count; i++) {
          const p = resampled[i];
          out[ptr * 3]     = (p.x - cx) * autoScale;
          out[ptr * 3 + 1] = altitude - (p.y - cy) * autoScale;
          out[ptr * 3 + 2] = 0.0;
          if (swatchOut) {
            swatchOut[ptr] = getSemanticSwatch(p.x, p.y, tileNum, minY, maxY, minX, maxX, isl, lIdx);
          }
          ptr++;
          islPlaced++;
        }
      }
    }

    const fillCount = Math.max(0, islDroneCount - islPlaced);
    if (isl.pixels.length > 0 && fillCount > 0) {
      const stepF = isl.pixels.length / fillCount;
      for (let i = 0; i < fillCount && ptr < count; i++) {
        const p = isl.pixels[Math.floor((i + 0.5) * stepF) % isl.pixels.length];
        out[ptr * 3]     = (p.x - cx) * autoScale;
        out[ptr * 3 + 1] = altitude - (p.y - cy) * autoScale;
        out[ptr * 3 + 2] = 0.0;
        if (swatchOut) {
          swatchOut[ptr] = getSemanticSwatch(p.x, p.y, tileNum, minY, maxY, minX, maxX, isl, 0);
        }
        ptr++;
      }
    }
  }

  while (ptr < count) {
    const ref = ptr > 0 ? (ptr % Math.max(1, ptr)) : 0;
    const srcIdx = Math.floor((ptr - ref) * 0.73) % Math.max(1, ptr);
    out[ptr * 3]     = out[srcIdx * 3] + (Math.random() - 0.5) * 0.1;
    out[ptr * 3 + 1] = out[srcIdx * 3 + 1] + (Math.random() - 0.5) * 0.1;
    out[ptr * 3 + 2] = 0.0;
    if (swatchOut) swatchOut[ptr] = swatchOut[srcIdx];
    ptr++;
  }
}

// Island-aware & coordinate-accurate semantic color swatch assignment for all 19 tiles
export function getSemanticSwatch(px, py, tileNum, minY = 0, maxY = 512, minX = 0, maxX = 512, isl = null, loopIdx = 0) {
  const normY = (py - minY) / Math.max(1, maxY - minY);
  const normX = (px - minX) / Math.max(1, maxX - minX);
  const pCount = isl ? isl.pixelCount : 5000;
  const ix0 = isl ? isl.x0 : minX;
  const ix1 = isl ? isl.x1 : maxX;
  const iy0 = isl ? isl.y0 : minY;
  const iy1 = isl ? isl.y1 : maxY;

  switch (tileNum) {
    case 16: { // 1. Wheat: 0 = Harvest Gold Kernels, 1 = Brown Stem & Sheath Leaves, 2 = Pale Gold Upper Awns
      if (iy1 > 420) return 1;
      if (pCount < 550 && py < 300) return 2;
      return 0;
    }
    case 25: { // 2. Scythe: 0 = Metallic Steel Blade, 1 = Wood Brown Handle, 2 = Brass/Gold Collar Ring
      if (iy0 > 330) return 1;
      if (pCount < 2000) return 2;
      return 0;
    }
    case 28: { // 3. Oak Leaf & Acorns: 0 = Crimson Red Leaf, 1 = Dark Brown Branch & Acorn Caps, 2 = Tan Acorn Nuts
      if (pCount > 10000) {
        const branchLineY = 330.0 - (px - 205.0) * 0.42;
        return (py > branchLineY) ? 1 : 0;
      }
      return (pCount < 3000) ? 1 : 2;
    }
    case 26: { // 4. Tree: 0 = Deep Bark Brown Trunk & Roots, 1 = Bronze Boughs, 2 = Amber Twig Tips
      if (normY > 0.58 || (normY > 0.40 && Math.abs(normX - 0.5) < 0.14)) return 0;
      if (normY < 0.25 || normX < 0.18 || normX > 0.82) return 2;
      return 1;
    }
    case 27: { // 5. Owl on Branch: 0 = Snowy White Owl, 1 = Golden Amber Eyes/Beak/Talons, 2 = Brown Branch
      if (ix0 < 100 || ix1 > 395 || pCount < 450) return 2;
      if (pCount < 1500 && iy0 > 350) return 1;
      if (iy0 > 395) return 0;
      if (pCount > 20000) {
        const dLeftEye  = Math.hypot(px - 224, py - 128);
        const dRightEye = Math.hypot(px - 285, py - 128);
        const dBeak     = Math.hypot(px - 254, (py - 156) * 0.85);
        if (dLeftEye <= 22 || dRightEye <= 22 || dBeak <= 16) return 1;
      }
      return 0;
    }
    case 20: { // 6. Raven on Branch: 0 = Vibrant Blue Body, 1 = Yellow Beak & Legs, 2 = Brown Branch, 3 = Cyan-Blue Wing Feathers
      if (ix0 < 80 || iy1 > 455 || pCount < 800 || iy0 > 375) return 2;
      if (pCount < 10000) return 3;
      if (py >= 62 && py <= 104 && px <= 156 - (py - 64) * 0.12) return 1;
      if (py >= 312 && px <= 305 && py > 312 + (px - 245) * 0.25) return 1;
      if (px >= 205 && px <= 355 && py >= 140 && py <= 238 && py >= 140 + (px - 220) * 0.42) return 3;
      return 0;
    }
    case 18: { // 7. Pumpkin: 0 = Deep Pumpkin Orange, 1 = Lush Vine Green Stem, 2 = Warm Orange Rib Highlight
      if (iy0 < 100) return 1;
      if (pCount > 25000 || pCount < 12000) return 0;
      return 2;
    }
    case 24: { // 8. Candle: 0 = White Candlestick, 1 = Red Outer Flame, 2 = Gold Holder Base, 3 = Yellow Inner Flame Core
      if (iy1 < 190) {
        const coreDist = ((px - 260.0) / 28.0) ** 2 + ((py - 146.0) / 44.0) ** 2;
        if (loopIdx > 0 || coreDist <= 1.0) return 3;
        return 1;
      }
      if (iy0 > 395) return 2;
      if (py < 190 && px >= 248 && px <= 268) return 3;
      return 0;
    }
    case 21: { // 9. Cauldron: 0 = Vibrant Blue Cauldron, 1 = White Rising Steam & Bubbles, 2 = Red-Orange Fire, 3 = Brown Wood Logs, 4 = Yellow Inner Fire Core
      if (iy1 < 210) return 1;
      if (iy0 >= 408) return 3;
      if (iy0 >= 345 && iy1 <= 418 && ix0 > 175 && ix1 < 330) {
        if (Math.abs(px - 253) < 26 && py > 372) return 4;
        return 2;
      }
      return 0;
    }
    case 23: { // 10. Witch on Broomstick: 0 = Emerald Green Cloak & Hat, 1 = White Skin (Face & Hand), 2 = Brown Broomstick, 3 = Golden Straw Bristles, 4 = Motionless White Crescent Moon
      if (ix1 < 180 && iy1 < 180) return 4;
      if (ix0 >= 310 && iy0 >= 110 && iy1 <= 175 && pCount < 2000) return 1;
      if (ix0 >= 358 && ix1 <= 406 && iy0 >= 245 && iy1 <= 280 && pCount < 600) return 1;
      if (ix1 < 155 && iy0 > 325) return 3;
      if (
        (ix1 < 200 && iy0 > 325) ||
        ix0 > 390 ||
        (ix0 > 340 && iy0 > 264 && iy1 < 290) ||
        (ix0 > 180 && ix1 < 230 && iy0 > 325 && iy1 < 355)
      ) {
        return 2;
      }
      return 0;
    }
    case 32: { // 11. Key: 0 = Bright Gold Bow/Collar/Bit, 1 = Rich Amber Shaft
      return (iy0 > 200 && iy1 < 330) ? 1 : 0;
    }
    case 19: { // 12. Ghost: 0 = Spectral White Sheet, 1 = Icy Blue Floating Wisps
      return (pCount < 1500) ? 1 : 0;
    }
    case 22: { // 13. Skull with Oak Leaves & Acorns: 0 = Bone White Skull, 1 = Crimson Oak Leaves, 2 = Dark Brown Twig & Acorn Caps, 3 = Golden Tan Acorn Nuts, 4 = Muted Bone Cranial Suture Shadow
      if (ix0 < 60 && iy0 > 310) {
        if ((px > 152 && py > 348) || (px > 120 && Math.abs(py - (392 - (px - 120) * 0.36)) < 9)) {
          return 2;
        }
        return 1;
      }
      if (ix0 > 400) return 1;
      if (iy0 >= 398 && ix1 < 245) {
        return (pCount < 450) ? 2 : 3;
      }
      if (px > 115 && px < 222 && py > 135 && py < 305) return 4;
      return 0;
    }
    case 29: { // 14. Celtic Triquetra Knot: 0 = Emerald Triquetra Lobes & Inner Ribbon, 1 = Electric Blue Interwoven Circle
      return (pCount > 8500 || (ix0 > 175 && ix1 < 255 && iy0 > 265 && iy1 < 365)) ? 0 : 1;
    }
    case 30: { // 15. Celtic Shield Sigil: 0 = Crimson Outer Loops, 1 = Fiery Amber Inner Lattice
      return (pCount < 6200) ? 1 : 0;
    }
    case 31: { // 16. Celtic Triskelion: 0 = Bright Solar Gold Center, 1 = Deep Orange Outer Spirals
      return (Math.hypot(px - 256, py - 265) < 115) ? 0 : 1;
    }
    case 33: { // 17. Deer Head: 0 = Royal Purple Head/Ears/Neck, 1 = Luminous Violet Antlers, 2 = Rose-Pink Eyes
      if (iy0 < 100) return 1;
      if (pCount > 13000) {
        if (Math.hypot(px - 205, py - 280) <= 22 || Math.hypot(px - 304, py - 280) <= 22) {
          return 2;
        }
      }
      return 0;
    }
    case 34: { // 18. Brigid's Cross: 0 = Deep Electric Teal Arms, 1 = Bright Cyan Woven Square & Tying Bands
      if (
        (px >= 188 && px <= 325 && py >= 188 && py <= 325) ||
        (py >= 90 && py <= 108) ||
        (py >= 402 && py <= 420) ||
        (px >= 92 && px <= 110) ||
        (px >= 401 && px <= 420)
      ) {
        return 1;
      }
      return 0;
    }
    case 17: { // 19. Finale ("BLESSED SAMHAIN"): 4-stop warm Samhain fire gradient
      if (py < 248) {
        return (normY < 0.22) ? 0 : 1;
      }
      return (normY < 0.78) ? 2 : 3;
    }
    default:
      return 0;
  }
}

export function loadTileImage(filename) {
  return new Promise((resolve) => {
    const numMatch = filename.match(/\d+/);
    const tileNum = numMatch ? numMatch[0] : "";
    const candidates = [
      `./samhain-tile${tileNum}.png`,
      `${ASSET_BASE_URL}samhain-tile${tileNum}.png`,
      `./tile${tileNum}.png`,
      `${ASSET_BASE_URL}tile${tileNum}.png`
    ];

    let idx = 0;
    function tryNext() {
      if (idx >= candidates.length) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => { idx++; tryNext(); };
      img.src = candidates[idx];
    }
    tryNext();
  });
}

export const TILE_ORDER = [16, 25, 28, 26, 27, 20, 18, 24, 21, 23, 32, 19, 22, 29, 30, 31, 33, 34, 17];

export const SHAPE_PAGES = [
  TILE_ORDER.map((tileNum) => {
    const filename = `samhain-tile${tileNum}.png`;
    return {
      id: `samhainTile${tileNum}`,
      tileNum,
      filename,
      gen: async (out, n, swatchOut) => {
        const img = await loadTileImage(filename);
        if (img) {
          sampleImageToDrones(img, out, n, swatchOut, 0.048, 16, tileNum);
        } else {
          generateProceduralShape(tileNum, out, n, swatchOut, 16);
        }
      }
    };
  })
];

export function findShapeById(id) {
  for (const page of SHAPE_PAGES) {
    for (const shape of page) {
      if (shape.id === id) return shape;
    }
  }
  return SHAPE_PAGES[0][0];
}
