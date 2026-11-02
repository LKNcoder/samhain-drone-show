import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";

export const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const ASSET_BASE_URL = "https://lkncoder.github.io/tacocat/";

// Traces ALL closed boundary loops (both outer silhouettes AND interior holes like eyes, beaks, and key rings)
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
        if (nearest && minD <= 25) { // Jump up to 5px gap
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

  // 2. Connected Component Segmentation (Isolates shapes & preserves inner cutouts)
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

          const weight = totalLoopLen * 2.2 + Math.sqrt(islandPixels.length) * 4.0;
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

    // A. Sample all boundary loops (outer perimeter + inner eye/beak/key holes)
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

// Logical Semantic Color Classifier based on Shape Physics and Icon Features
function getSemanticSwatch(px, py, tileNum) {
  switch (tileNum) {
    case 21: // Cauldron: Fire underneath (0), Pot Iron Slate (1), Bubbling Steam/Potion (2)
      if (py > 370) return 0; // Fire underneath (Bright Orange/Red)
      if (py >= 220) return 1; // Cauldron Pot Body (Visible Slate/Iron)
      return 2; // Steam curls & bubbling brew (Electric Blue)

    case 23: // Witch: Pale Moon (0), Straw/Wood Broom (1), Emerald Witch Cloak (2)
      if (py < 160 && (px < 180 || px > 330)) return 0; // Pale Moon
      if (py > 350 || (px > 310 && py > 280)) return 1; // Broom Handle & Straw
      return 2; // Witch Cloak & Hat (Vibrant Emerald Green)

    case 22: // Skull & Leaves: Bone White Skull (0), Forest Green Wreath (1)
      if (Math.abs(px - 256) < 115 && py > 110 && py < 365) return 0; // Skull (White)
      return 1; // Surrounding Leaves/Branches (Foliage Green)

    case 18: // Pumpkin: Ribs/Body (0: Saturated Orange), Stem (1: Fresh Green)
      if (py < 165 && Math.abs(px - 256) < 48) return 1; // Pumpkin Stem (Green)
      return 0; // Pumpkin Ribs & Body (Deep Saturated Orange)

    case 20: // Crow/Raven: Bird Body (0: Electric Blue), Perch Branch (1: Warm Wood Brown), Eye/Beak (2: Gold)
      if (py > 365) return 1; // Branch (Wood Brown)
      if (py < 210 && Math.abs(px - 256) < 55) return 2; // Eye & Beak (Amber Gold)
      return 0; // Raven Feathers (Luminous Twilight Blue)

    case 24: // Candle: Wax Body (0: Ivory White), Flame (1: Fiery Red/Orange), Base (2: Brass)
      if (py < 185) return 1; // Flame Tip (Red/Orange)
      if (py >= 395) return 2; // Brass Holder (Dark Gold)
      return 0; // Candle Wax & Dripping Droplets (Pure White)

    case 25: // Scythe: Blade (0: Steel Grey), Handle Snath (1: Hardwood Brown)
      if (py < 240 && px > 160) return 0; // Curved Cutting Blade (Silver Steel Grey)
      return 1; // Long Wooden Handle (Timber Brown)

    case 27: // Owl: Feathers (0: Soft White/Cream), Beak & Eyes (1: Glowing Amber Gold), Perch (2: Brown)
      if (py > 390) return 2; // Branch (Forest Brown)
      if (py >= 160 && py <= 260 && Math.abs(px - 256) < 65) return 1; // Beak & Eyes (Amber Gold)
      return 0; // Body Feathers (Crisp White)

    case 28: // Autumn Leaf: Blade (0: Crimson Red), Stem & Veins (1: Amber Gold)
      if (py > 380 || (Math.abs(px - 256) < 15 && py > 200)) return 1; // Stem (Amber Gold)
      return 0; // Leaf Blade (Vibrant Autumn Red)

    case 32: // Skeleton Key: Shaft & Teeth (0: Polished Gold), Handle Ring Bow (1: Warm Brass)
      if (py < 230) return 1; // Handle Bow & Ring (Brass)
      return 0; // Shaft & Key Bits (Gold)

    case 19: // Ghost: Spectral Body (0: Brilliant White), Eyes/Mouth (1: Luminous Spectral Cyan)
      if (py >= 160 && py <= 240 && Math.abs(px - 256) < 70) return 1; // Eyes / Mouth cutouts (Cyan)
      return 0; // Flowing Sheet Body (Pure White)

    case 26: // Ancient Tree: Trunk & Roots (0: Bark Brown), Canopy (1: Autumn Amber)
      if (py > 310 && Math.abs(px - 256) < 65) return 0; // Trunk (Bark Brown)
      return 1; // Canopy Foliage (Autumn Gold/Amber)

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

// Robust Vector Typography Engine with Precision Path Bounds (Guarantees 'N' has full drone allotment)
const GLYPH_PATHS = {
  'A': "M 0 0 L 0.5 1.4 L 1 0 M 0.2 0.55 L 0.8 0.55",
  'B': "M 0 0 L 0 1.4 L 0.55 1.4 C 0.9 1.4 0.9 0.72 0.55 0.72 L 0 0.72 M 0.55 0.72 C 0.95 0.72 0.95 0 0.55 0 L 0 0",
  'C': "M 0.95 1.15 C 0.7 1.45 0.25 1.45 0.1 1.15 C -0.05 0.85 -0.05 0.55 0.1 0.25 C 0.25 -0.05 0.7 -0.05 0.95 0.25",
  'D': "M 0 0 L 0 1.4 L 0.45 1.4 C 1.0 1.4 1.0 0 0.45 0 Z",
  'E': "M 0.85 0 L 0 0 L 0 1.4 L 0.85 1.4 M 0 0.7 L 0.65 0.7",
  'F': "M 0 0 L 0 1.4 L 0.85 1.4 M 0 0.7 L 0.65 0.7",
  'G': "M 0.95 1.15 C 0.7 1.45 0.25 1.45 0.1 1.15 C -0.05 0.85 -0.05 0.55 0.1 0.25 C 0.25 -0.05 0.7 -0.05 0.95 0.25 L 0.95 0.65 L 0.5 0.65",
  'H': "M 0 0 L 0 1.4 M 0.9 0 L 0.9 1.4 M 0 0.7 L 0.9 0.7",
  'I': "M 0.1 0 L 0.5 0 M 0.3 0 L 0.3 1.4 M 0.1 1.4 L 0.5 1.4",
  'J': "M 0.1 0.4 C 0.1 0 0.6 0 0.7 0.3 L 0.7 1.4 L 0.5 1.4",
  'K': "M 0 0 L 0 1.4 M 0.9 1.4 L 0 0.6 L 0.9 0",
  'L': "M 0 1.4 L 0 0 L 0.8 0",
  'M': "M 0 0 L 0 1.4 L 0.5 0.5 L 1.0 1.4 L 1.0 0",
  'N': "M 0 0 L 0 1.4 L 0.9 0 L 0.9 1.4", // Perfect symmetry N with full height
  'O': "M 0.5 0 C 1.0 0 1.0 1.4 0.5 1.4 C 0 1.4 0 0 0.5 0 Z",
  'P': "M 0 0 L 0 1.4 L 0.55 1.4 C 0.95 1.4 0.95 0.7 0.55 0.7 L 0 0.7",
  'Q': "M 0.5 0 C 1.0 0 1.0 1.4 0.5 1.4 C 0 1.4 0 0 0.5 0 Z M 0.6 0.3 L 0.95 -0.15",
  'R': "M 0 0 L 0 1.4 L 0.55 1.4 C 0.95 1.4 0.95 0.7 0.55 0.7 L 0 0.7 M 0.5 0.7 L 0.9 0",
  'S': "M 0.85 1.15 C 0.65 1.45 0.2 1.45 0.1 1.15 C 0 0.8 0.9 0.8 0.85 0.3 C 0.8 -0.05 0.25 -0.05 0.05 0.25",
  'T': "M 0.5 0 L 0.5 1.4 M 0 1.4 L 1.0 1.4",
  'U': "M 0 1.4 L 0 0.45 C 0 -0.05 0.9 -0.05 0.9 0.45 L 0.9 1.4",
  'V': "M 0 1.4 L 0.5 0 L 1.0 1.4",
  'W': "M 0 1.4 L 0.25 0 L 0.5 0.9 L 0.75 0 L 1.0 1.4",
  'X': "M 0 0 L 0.9 1.4 M 0 1.4 L 0.9 0",
  'Y': "M 0.45 0 L 0.45 0.65 L 0 1.4 M 0.45 0.65 L 0.9 1.4",
  'Z': "M 0 1.4 L 0.9 1.4 L 0 0 L 0.9 0"
};

export function generateTextDrones(out, text, count, font = "Impact", scale = 0.28, altitude = 16) {
  const words = text.trim().toUpperCase().split(/\s+/);
  let lines = [text.trim().toUpperCase()];
  if (words.length >= 2) {
    const mid = Math.ceil(words.length / 2);
    lines = [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
  }

  const lineSpacing = 2.4;
  const charSpacing = 1.35;
  const paths = [];
  let totalLength = 0;

  const totalLines = lines.length;
  const startY = ((totalLines - 1) * lineSpacing) / 2;

  lines.forEach((line, lineIdx) => {
    const yOffset = startY - lineIdx * lineSpacing;
    const chars = line.split("");
    const lineWidth = chars.length * charSpacing;
    const startX = -lineWidth / 2 + charSpacing * 0.15;

    chars.forEach((ch, charIdx) => {
      const d = GLYPH_PATHS[ch];
      if (d) {
        const xOffset = startX + charIdx * charSpacing;
        const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const transformedD = d.replace(/([0-9\.\-]+)\s+([0-9\.\-]+)/g, (_, x, y) => {
          const nx = (parseFloat(x) + xOffset).toFixed(3);
          const ny = (parseFloat(y) + yOffset).toFixed(3);
          return `${nx} ${ny}`;
        });
        p.setAttribute("d", transformedD);
        const len = p.getTotalLength();
        if (len > 0) {
          paths.push({ path: p, len });
          totalLength += len;
        }
      }
    });
  });

  if (paths.length === 0) return;

  // Clamped arc-length stepping prevents float inaccuracies from clipping the final 'N'
  for (let i = 0; i < count; i++) {
    const targetDist = THREE.MathUtils.clamp((i / (count - 1)) * (totalLength - 0.001), 0, totalLength);
    let accum = 0;
    let selected = paths[paths.length - 1];
    let distOnPath = selected.len;

    for (const p of paths) {
      if (accum + p.len >= targetDist) {
        selected = p;
        distOnPath = Math.max(0, Math.min(p.len, targetDist - accum));
        break;
      }
      accum += p.len;
    }

    const pt = selected.path.getPointAtLength(distOnPath);
    out[i * 3]     = pt.x * (scale * 6.5);
    out[i * 3 + 1] = altitude + pt.y * (scale * 6.5);
    out[i * 3 + 2] = 0.0;
  }
}

// Master Shape Directory prioritizing Tiles 16–34
const TILE_ORDER = [
  16, 25, 28, 26, 20, 27, 18, 24, 21, 23, 22, 19, 32, 29, 30, 31, 33, 34, 17,
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
