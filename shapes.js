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

// Procedural 18-meter vector geometries (instant execution, zero network delay)
export function generateProceduralShape(tileNum, out, count, swatchOut, altitude) {
  for (let i = 0; i < count; i++) {
    const u = i / count;
    let x = 0, y = altitude, z = 0, swatch = 0;

    switch (tileNum) {
      case 29: { // Celtic Knot: 3 interlaced loops (18m wide)
        const tLoop = u * Math.PI * 6.0;
        const rKnot = 8.5 * (1.0 + 0.5 * Math.sin(3.0 * (u * Math.PI * 2.0)));
        x = Math.cos(tLoop) * rKnot;
        y = altitude + Math.sin(tLoop) * rKnot;
        swatch = (y > altitude) ? 1 : 0;
        break;
      }
      case 30: { // Sigil: 5-point star (18m wide)
        const starT = u * 5.0;
        const seg = Math.floor(starT) % 5;
        const f = starT - Math.floor(starT);
        const order = [0, 2, 4, 1, 3, 0];
        const a1 = order[seg] * (Math.PI * 2 / 5) - Math.PI / 2;
        const a2 = order[seg + 1] * (Math.PI * 2 / 5) - Math.PI / 2;
        x = Math.cos(a1) * 9.0 + (Math.cos(a2) * 9.0 - Math.cos(a1) * 9.0) * f;
        y = altitude + Math.sin(a1) * 9.0 + (Math.sin(a2) * 9.0 - Math.sin(a1) * 9.0) * f;
        swatch = 1;
        break;
      }
      case 31: { // Solar Wheel: 8 radiating spokes (18m wide)
        if (u < 0.25) {
          const theta = (u / 0.25) * Math.PI * 2.0;
          x = Math.cos(theta) * 3.5;
          y = altitude + Math.sin(theta) * 3.5;
          swatch = 0;
        } else {
          const spokeIdx = Math.floor(((u - 0.25) / 0.75) * 8);
          const spokeF = (((u - 0.25) / 0.75) * 8) - spokeIdx;
          const theta = spokeIdx * (Math.PI / 4);
          const rad = 3.5 + spokeF * 5.5;
          x = Math.cos(theta) * rad;
          y = altitude + Math.sin(theta) * rad;
          swatch = 1;
        }
        break;
      }
      case 33: { // DEER HEAD: Stag head with branching antlers (18m wide, PURPLE)
        if (u < 0.35) {
          const tH = (u / 0.35) * Math.PI * 2.0;
          x = Math.sin(tH) * 3.2;
          y = altitude - 4.5 + Math.cos(tH) * 5.0;
          swatch = 0;
        } else if (u < 0.50) {
          const sign = (u < 0.425) ? -1 : 1;
          const tE = ((u - 0.35) % 0.075) / 0.075;
          x = sign * (2.8 + tE * 3.0);
          y = altitude + 0.8 + Math.sin(tE * Math.PI) * 2.5;
          swatch = 0;
        } else {
          const sign = (u < 0.75) ? -1 : 1;
          const tA = ((u - 0.5) % 0.25) / 0.25;
          const mainX = sign * (1.6 + Math.pow(tA, 0.8) * 7.5);
          const mainY = altitude + 1.2 + tA * 8.5;
          const tine = (Math.sin(tA * Math.PI * 4.0) > 0.4) ? sign * 1.8 : 0;
          x = mainX + tine;
          y = mainY;
          swatch = 1;
        }
        break;
      }
      case 34: { // CROSS: Celtic High Cross (18m tall, 14m wide, TEAL)
        if (u < 0.35) {
          const theta = (u / 0.35) * Math.PI * 2.0;
          x = Math.cos(theta) * 4.5;
          y = altitude + 1.8 + Math.sin(theta) * 4.5;
          swatch = 1;
        } else if (u < 0.70) {
          const tV = (u - 0.35) / 0.35;
          x = (Math.sin(tV * 35.0) > 0 ? 1 : -1) * 1.3;
          y = altitude - 7.5 + tV * 17.0;
          swatch = 0;
        } else {
          const tH = (u - 0.70) / 0.30;
          x = -7.0 + tH * 14.0;
          y = altitude + 1.8 + (Math.sin(tH * 35.0) > 0 ? 1 : -1) * 1.2;
          swatch = 0;
        }
        break;
      }
      default: {
        const theta = i * GOLDEN;
        const r = Math.sqrt((i + 0.5) / count) * 8.5;
        x = Math.cos(theta) * r;
        y = altitude + Math.sin(theta) * r;
        swatch = 0;
        break;
      }
    }

    out[i * 3]     = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
    if (swatchOut) swatchOut[i] = swatch;
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
  const cornerAlpha = (imgData[3] + imgData[511 * 4 + 3] + imgData[(511 * 512) * 4 + 3]) / 3;
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

  if (maxSpan < 70 || !isFinite(minX)) {
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

        while (queue.length > 0) {
          const pt = queue.pop();
          islandPixels.push(pt);

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
          islands.push({ pixels: islandPixels, loops: allLoops, totalLoopLen, weight });
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

  quotas.sort((a, b) => b.remainder - a.remainder);
  let remDrones = count - allocatedSum;
  for (let i = 0; i < quotas.length && remDrones > 0; i++, remDrones--) {
    quotas[i].base++;
  }
  quotas.sort((a, b) => a.index - b.index);

  let ptr = 0;
  for (let k = 0; k < islands.length; k++) {
    const isl = islands[k];
    const islDroneCount = quotas[k].base;
    const edgeCount = Math.min(Math.round(isl.totalLoopLen * 1.5), Math.round(islDroneCount * 0.75));
    const fillCount = islDroneCount - edgeCount;

    if (isl.loops.length > 0 && edgeCount > 0 && isl.totalLoopLen > 0) {
      for (const loop of isl.loops) {
        const loopDrones = Math.max(2, Math.round((loop.length / isl.totalLoopLen) * edgeCount));
        const resampled = resampleEquidistant(loop, loopDrones);

        for (let i = 0; i < resampled.length && ptr < count; i++) {
          const p = resampled[i];
          out[ptr * 3]     = (p.x - cx) * autoScale;
          out[ptr * 3 + 1] = altitude - (p.y - cy) * autoScale;
          out[ptr * 3 + 2] = 0.0;
          if (swatchOut) swatchOut[ptr] = getSemanticSwatch(p.x, p.y, tileNum, minY, maxY, minX, maxX);
          ptr++;
        }
      }
    }

    if (isl.pixels.length > 0 && fillCount > 0) {
      const stepF = isl.pixels.length / fillCount;
      for (let i = 0; i < fillCount && ptr < count; i++) {
        const p = isl.pixels[Math.floor(i * stepF) % isl.pixels.length];
        out[ptr * 3]     = (p.x - cx) * autoScale;
        out[ptr * 3 + 1] = altitude - (p.y - cy) * autoScale;
        out[ptr * 3 + 2] = 0.0;
        if (swatchOut) swatchOut[ptr] = getSemanticSwatch(p.x, p.y, tileNum, minY, maxY, minX, maxX);
        ptr++;
      }
    }
  }

  while (ptr < count) {
    const ref = Math.floor(Math.random() * Math.max(1, ptr));
    out[ptr * 3]     = out[ref * 3] + (Math.random() - 0.5) * 0.12;
    out[ptr * 3 + 1] = out[ref * 3 + 1] + (Math.random() - 0.5) * 0.12;
    out[ptr * 3 + 2] = 0.0;
    if (swatchOut) swatchOut[ptr] = swatchOut[ref];
    ptr++;
  }
}

function getSemanticSwatch(px, py, tileNum, minY = 0, maxY = 512, minX = 0, maxX = 512) {
  const normY = (py - minY) / Math.max(1, maxY - minY);
  switch (tileNum) {
    case 24: return (normY < 0.38) ? 1 : (normY > 0.88 ? 2 : 0);
    case 18: return 0;
    case 25: return (normY > 0.70) ? 1 : 0;
    case 26: return (normY > 0.65) ? 0 : 1;
    case 19: return 0;
    case 16: return (normY > 0.65) ? 1 : 0;
    case 27: return (normY > 0.78) ? 2 : (normY >= 0.28 && normY <= 0.52 ? 1 : 0);
    case 28: return (normY > 0.75) ? 1 : 0;
    case 32: return (normY < 0.45) ? 1 : 0;
    case 29: case 30: case 31: case 34: return (normY > 0.5) ? 1 : 0;
    case 33: return (normY < 0.42) ? 1 : 0;
    case 17:
      if (normY > 0.74) return 1;
      if (normY < 0.30) return 0;
      if (normY >= 0.14 && normY < 0.48) return 1;
      if (normY >= 0.48 && normY <= 0.74) return 2;
      return 3;
    default: return 0;
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

const TILE_ORDER = [16, 25, 28, 26, 27, 18, 24, 19, 32, 29, 30, 31, 33, 34, 17];

export const SHAPE_PAGES = [
  TILE_ORDER.map((tileNum) => {
    const filename = `samhain-tile${tileNum}.png`;
    return {
      id: `samhainTile${tileNum}`,
      tileNum,
      filename,
      gen: async (out, n, swatchOut) => {
        // Tiles 29, 30, 31, 33, 34 generate procedurally immediately (zero network delays)
        if (tileNum >= 29 && tileNum <= 34 && tileNum !== 32) {
          generateProceduralShape(tileNum, out, n, swatchOut, 16);
          return;
        }
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
