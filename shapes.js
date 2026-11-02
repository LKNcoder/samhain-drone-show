import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";

export const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const ASSET_BASE_URL = "https://lkncoder.github.io/tacocat/";

// Traces ALL closed boundary loops (both outer silhouettes AND interior cutouts like eyes, beaks, and key rings)
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
        // Connect across anti-aliasing gaps to nearest unvisited pixel
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

    if (currentLoop.length >= 3) {
      allLoops.push(currentLoop);
    }
  }

  return allLoops;
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

// Multi-Loop Arc-Length Density Sampler with Per-Tile Semantic Coloring
export function sampleImageToDrones(imgElement, out, count, swatchOut, scale = 0.048, altitude = 16, tileNum = 16) {
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

          // Extra weight dedicated to the bottom text of Tile 17 (boosting the letter 'N')
          if (tileNum === 17) {
            const avgY = islandPixels.reduce((acc, p) => acc + p.y, 0) / islandPixels.length;
            const avgX = islandPixels.reduce((acc, p) => acc + p.x, 0) / islandPixels.length;
            if (avgY > 360) {
              weight *= 2.6;
              if (avgX > 320) weight *= 3.4;
            }
          }

          islands.push({ pixels: islandPixels, loops: allLoops, totalLoopLen, weight });
        }
      }
    }
  }

  if (islands.length === 0) return;

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const totalWeight = islands.reduce((acc, isl) => acc + isl.weight, 0);

  // 3. Proportional Fleet Budget Allocation (75% Boundaries & Cutouts, 25% Infill)
  let ptr = 0;
  for (const isl of islands) {
    const islDroneCount = Math.max(6, Math.round((isl.weight / totalWeight) * count));
    const edgeCount = Math.min(Math.round(isl.totalLoopLen * 1.5), Math.round(islDroneCount * 0.75));
    const fillCount = islDroneCount - edgeCount;

    // A. Sample all boundary loops
    if (isl.loops.length > 0 && edgeCount > 0 && isl.totalLoopLen > 0) {
      for (const loop of isl.loops) {
        const loopDrones = Math.max(3, Math.round((loop.length / isl.totalLoopLen) * edgeCount));
        const resampled = resampleEquidistant(loop, loopDrones);

        for (let i = 0; i < resampled.length && ptr < count; i++) {
          const p = resampled[i];
          out[ptr * 3]     = (p.x - cx) * scale;
          out[ptr * 3 + 1] = altitude - (p.y - cy) * scale;
          out[ptr * 3 + 2] = 0.0;

          if (swatchOut) {
            swatchOut[ptr] = getSemanticSwatch(p.x, p.y, tileNum);
          }
          ptr++;
        }
      }
    }

    // B. Interior Fill
    if (isl.pixels.length > 0 && fillCount > 0) {
      const stepF = isl.pixels.length / fillCount;
      for (let i = 0; i < fillCount && ptr < count; i++) {
        const p = isl.pixels[Math.floor(i * stepF) % isl.pixels.length];
        out[ptr * 3]     = (p.x - cx) * scale;
        out[ptr * 3 + 1] = altitude - (p.y - cy) * scale;
        out[ptr * 3 + 2] = 0.0;

        if (swatchOut) {
          swatchOut[ptr] = getSemanticSwatch(p.x, p.y, tileNum);
        }
        ptr++;
      }
    }
  }

  while (ptr < count) {
    out[ptr * 3]     = out[(ptr - 1) * 3] + 0.08;
    out[ptr * 3 + 1] = out[(ptr - 1) * 3 + 1];
    out[ptr * 3 + 2] = 0.0;
    if (swatchOut) swatchOut[ptr] = 0;
    ptr++;
  }
}

// Logical Semantic Color Classifier
function getSemanticSwatch(px, py, tileNum) {
  switch (tileNum) {
    case 16: // Wheat: Grain Head (0: Gold), Stalk (1: Wood Brown)
      if (py > 290) return 1;
      return 0;

    case 25: // Scythe: Blade (0: Steel Grey), Handle Snath (1: Hardwood Brown)
      if (py < 240 && px > 160) return 0;
      return 1;

    case 26: // Oak/Acorn Branch: Leaf (0: Leaf Green), Branch Wood (1: Wood Brown), Acorn (2: Gold)
      if (py > 280) return 1; // Wood Branch
      if (py > 210 && Math.abs(px - 256) < 45) return 2; // Acorn
      return 0; // Leaf

    case 20: // Raven: Bird Feathers (0: Electric Cyan-Blue), Branch (1: Vibrant Red), Beak & Feet (2: Bright Yellow), Wing Accents (3: Crisp White)
      if (py > 370) return 1; // Branch -> RED
      if (py >= 320 && py <= 370 && Math.abs(px - 256) < 60) return 2; // Legs/Feet -> YELLOW
      if (py < 195 && px < 250) return 2; // Beak -> YELLOW
      if (Math.abs(px - 256) > 45 && py > 200 && py < 340) return 3; // Wing Highlights -> WHITE
      return 0; // Raven Body -> ELECTRIC CYAN-BLUE

    case 27: // Owl: Body Feathers (0: White), Beak & Eyes (1: Amber Gold), Perch (2: Wood Brown)
      if (py > 405) return 2;
      if (py >= 155 && py <= 245 && Math.abs(px - 256) < 55) return 1;
      return 0;

    case 18: // Pumpkin: Body & Ribs (0: Deep Orange), Stem ONLY (1: Leaf Green)
      if (py < 120 && Math.abs(px - 256) < 28) return 1;
      return 0;

    case 24: // Candle: Candle Wax (0: White), Flame (1: Red/Orange), Holder Base (2: Bronze Gold)
      if (py < 170) return 1;
      if (py >= 390) return 2;
      return 0;

    case 23: // Witch: Pale Moon (0: White), Broom (1: Wood Brown), Witch Cloak (2: Emerald Green), Trim (3: White)
      if (py < 155 && (px < 175 || px > 335)) return 0;
      if (py > 375 || (px > 310 && py > 280)) return 1;
      if (py >= 165 && py <= 225 && Math.abs(px - 256) < 32) return 0;
      if (Math.abs(px - 256) > 55) return 3;
      return 2;

    case 22: // Skull: 100% Bone White
      return 0;

    case 19: // Ghost: Spectral Body (0: White), Eyes/Mouth (1: Spectral Cyan)
      if (py >= 150 && py <= 240 && Math.abs(px - 256) < 65) return 1;
      return 0;

    case 28: // Autumn Leaf: Leaf Blade (0: Crimson Red), Stem (1: Wood Brown)
      if (py > 380) return 1;
      return 0;

    case 32: // Skeleton Key: Shaft & Teeth (0: Gold), Bow/Handle (1: Brass)
      if (py < 230) return 1;
      return 0;

    case 17: // Finale Bonfire: White (0), Gold (1), Orange (2), Crimson (3)
      if (py > 370) return 1; // Blessed Samhain text banner
      if (py < 160 && (Math.abs(px - 256) > 85 || py < 95)) return 0;
      if (py >= 70 && py < 250) return 1;
      if (py >= 250 && py <= 370) return 2;
      return 3;

    default:
      return 0;
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

// Master Shape Directory in logical narrative order
const TILE_ORDER = [
  16, 25, 28, 26, 20, 27, 18, 24, 23, 22, 19, 32, 29, 30, 31, 33, 34, 17,
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15
];

export const SHAPE_PAGES = [
  TILE_ORDER.map((tileNum) => {
    const filename = `samhain-tile${tileNum}.png`;
    return {
      id: `samhainTile${tileNum}`,
      tileNum,
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
        if (img) sampleImageToDrones(img, out, n, swatchOut, 0.048, 16, tileNum);
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
