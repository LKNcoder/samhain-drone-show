import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";

export const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const ASSET_BASE_URL = "https://lkncoder.github.io/tacocat/";

// Traces continuous closed boundary paths using circular Moore neighborhood search
function traceOrderedPerimeter(edgePixels, binaryMask) {
  if (edgePixels.length === 0) return [];
  const edgeSet = new Set(edgePixels.map(p => (p.y << 10) | p.x));
  const visited = new Set();
  const ordered = [];

  let curr = edgePixels[0];
  for (const p of edgePixels) {
    if (p.y < curr.y || (p.y === curr.y && p.x < curr.x)) curr = p;
  }

  const startKey = (curr.y << 10) | curr.x;
  visited.add(startKey);
  ordered.push(curr);

  const dirs = [
    { dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 1 },
    { dx: -1, dy: 0 }, { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }
  ];

  let lastDir = 0;
  const maxSteps = edgePixels.length * 2;

  for (let step = 0; step < maxSteps; step++) {
    let found = false;
    for (let i = 0; i < 8; i++) {
      const dIdx = (lastDir + i) % 8;
      const nx = curr.x + dirs[dIdx].dx;
      const ny = curr.y + dirs[dIdx].dy;
      const nKey = (ny << 10) | nx;

      if (edgeSet.has(nKey)) {
        if (nKey === startKey && ordered.length > 10) {
          return ordered;
        }
        if (!visited.has(nKey)) {
          visited.add(nKey);
          curr = { x: nx, y: ny };
          ordered.push(curr);
          lastDir = (dIdx + 5) % 8;
          found = true;
          break;
        }
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
      if (nearest && minD < 49) {
        curr = nearest;
        visited.add((curr.y << 10) | curr.x);
        ordered.push(curr);
        lastDir = 0;
      } else {
        break;
      }
    }
  }

  return ordered.length > 0 ? ordered : edgePixels;
}

// Resamples an ordered contour polygon at exact equidistant arc-length intervals
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
    while (segIdx < dists.length - 2 && dists[segIdx + 1] < targetD) {
      segIdx++;
    }
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

// Island-Aware Boundary & Blue Noise Particle Relaxation Sampler
export function sampleImageToDrones(imgElement, out, count, swatchOut, scale = 0.048, altitude = 16) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 512, 512);
  ctx.drawImage(imgElement, 0, 0, 512, 512);

  const imgData = ctx.getImageData(0, 0, 512, 512).data;
  const binary = new Uint8Array(512 * 512);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  // 1. High-contrast threshold
  for (let y = 1; y < 511; y++) {
    for (let x = 1; x < 511; x++) {
      const idx = (y * 512 + x) * 4;
      const lum = imgData[idx] * 0.299 + imgData[idx + 1] * 0.587 + imgData[idx + 2] * 0.114;

      if (lum > 110) {
        binary[y * 512 + x] = 1;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }

  // 2. Connected Component Segmentation
  const visited = new Uint8Array(512 * 512);
  const islands = [];

  for (let y = 1; y < 511; y++) {
    for (let x = 1; x < 511; x++) {
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
            if (n.x >= 0 && n.x < 512 && n.y >= 0 && n.y < 512) {
              const nIdx = n.y * 512 + n.x;
              if (binary[nIdx] === 1 && !visited[nIdx]) {
                visited[nIdx] = 1;
                queue.push(n);
              }
            }
          }
        }

        if (islandPixels.length >= 12) {
          const edge = [];
          for (const p of islandPixels) {
            const top   = binary[(p.y - 1) * 512 + p.x];
            const bot   = binary[(p.y + 1) * 512 + p.x];
            const left  = binary[p.y * 512 + (p.x - 1)];
            const right = binary[p.y * 512 + (p.x + 1)];
            if (!top || !bot || !left || !right) edge.push(p);
          }

          const orderedContour = traceOrderedPerimeter(edge, binary);
          const weight = orderedContour.length * 1.5 + Math.sqrt(islandPixels.length) * 4.0;
          islands.push({ pixels: islandPixels, contour: orderedContour, weight });
        }
      }
    }
  }

  if (islands.length === 0) return;

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const totalWeight = islands.reduce((acc, isl) => acc + isl.weight, 0);

  // 3. Proportional Fleet Budget Allocation (75% Outlines, 25% Infill)
  let ptr = 0;
  for (const isl of islands) {
    const islDroneCount = Math.max(6, Math.round((isl.weight / totalWeight) * count));
    const edgeCount = Math.min(isl.contour.length, Math.round(islDroneCount * 0.75));
    const fillCount = islDroneCount - edgeCount;

    const edgeDrones = resampleEquidistant(isl.contour, edgeCount);
    for (let i = 0; i < edgeDrones.length && ptr < count; i++) {
      const p = edgeDrones[i];
      out[ptr * 3]     = (p.x - cx) * scale;
      out[ptr * 3 + 1] = altitude - (p.y - cy) * scale;
      out[ptr * 3 + 2] = 0.0;
      if (swatchOut) swatchOut[ptr] = 0;
      ptr++;
    }

    if (isl.pixels.length > 0 && fillCount > 0) {
      const stepF = isl.pixels.length / fillCount;
      for (let i = 0; i < fillCount && ptr < count; i++) {
        const p = isl.pixels[Math.floor(i * stepF) % isl.pixels.length];
        out[ptr * 3]     = (p.x - cx) * scale;
        out[ptr * 3 + 1] = altitude - (p.y - cy) * scale;
        out[ptr * 3 + 2] = 0.0;
        if (swatchOut) swatchOut[ptr] = 1;
        ptr++;
      }
    }
  }

  while (ptr < count) {
    out[ptr * 3]     = out[(ptr - 1) * 3] + 0.1;
    out[ptr * 3 + 1] = out[(ptr - 1) * 3 + 1];
    out[ptr * 3 + 2] = 0.0;
    if (swatchOut) swatchOut[ptr] = 0;
    ptr++;
  }
}

// Universal Tile Image Loader (Handles tileX.png and samhain-tileX.png both locally & on GitHub)
export function loadTileImage(filename) {
  return new Promise((resolve) => {
    const numMatch = filename.match(/\d+/);
    const tileNum = numMatch ? numMatch[0] : "";

    const candidates = [
      `./samhain-tile${tileNum}.png`,
      `${ASSET_BASE_URL}samhain-tile${tileNum}.png`,
      `./tile${tileNum}.png`,
      `${ASSET_BASE_URL}tile${tileNum}.png`,
      `./${filename}`,
      `${ASSET_BASE_URL}${filename}`
    ];

    let idx = 0;
    function tryNext() {
      if (idx >= candidates.length) {
        console.warn(`Could not resolve tile image for: ${filename}`);
        resolve(null);
        return;
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => {
        idx++;
        tryNext();
      };
      img.src = candidates[idx];
    }

    tryNext();
  });
}

// Master Shape Directory prioritizing Tiles 16–34 (with 17 as finale)
const TILE_ORDER = [
  16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34,
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14
];

export const SHAPE_PAGES = [
  TILE_ORDER.map((tileNum) => {
    const filename = `samhain-tile${tileNum}.png`;
    return {
      id: `samhainTile${tileNum}`,
      filename,
      drawSVG: `<rect x="3" y="3" width="18" height="18" rx="2" stroke="#ffab00" stroke-width="1.5"/><text x="12" y="15" fill="#ffab00" font-size="8" text-anchor="middle">T${tileNum}</text>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.strokeStyle = "#ffab00"; ctx.lineWidth = 2;
        ctx.strokeRect(cx - 14, cy - 14, 28, 28);
        ctx.fillStyle = "#ffab00"; ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(`T${tileNum}`, cx, cy);
      },
      gen: async (out, n, swatchOut) => {
        const img = await loadTileImage(filename);
        if (img) sampleImageToDrones(img, out, n, swatchOut, 0.048, 16);
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
