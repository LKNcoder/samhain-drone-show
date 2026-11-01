import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";

export const GOLDEN = Math.PI * (3 - Math.sqrt(5));

// Base URL for hosted Samhain tile assets
const ASSET_BASE_URL = "https://lkncoder.github.io/tacocat/";

// High-Fidelity Stratified Density Sampler (Preserves fine stars, crescents, and silhouettes)
export function sampleImageToDrones(imgElement, out, count, swatchOut, scale = 0.046, altitude = 16) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 512, 512);
  ctx.drawImage(imgElement, 0, 0, 512, 512);

  const imgData = ctx.getImageData(0, 0, 512, 512).data;
  const whitePixels = [];
  const edgePixels = [];

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  // 1. High-contrast threshold scan: White = Lit Drone, Black = Negative Sky Void
  for (let y = 1; y < 511; y++) {
    for (let x = 1; x < 511; x++) {
      const idx = (y * 512 + x) * 4;
      const lum = imgData[idx] * 0.299 + imgData[idx + 1] * 0.587 + imgData[idx + 2] * 0.114;

      if (lum > 115) {
        whitePixels.push({ x, y });
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;

        // Check 4-neighbor boundary to isolate crisp silhouette lines
        const aTop   = imgData[((y - 1) * 512 + x) * 4];
        const aBot   = imgData[((y + 1) * 512 + x) * 4];
        const aLeft  = imgData[(y * 512 + (x - 1)) * 4];
        const aRight = imgData[(y * 512 + (x + 1)) * 4];

        if (aTop < 80 || aBot < 80 || aLeft < 80 || aRight < 80) {
          edgePixels.push({ x, y });
        }
      }
    }
  }

  if (whitePixels.length === 0) return;

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  // 2. Stratified Spatial Grid (Blue Noise Centroid Snapping)
  const totalWhite = whitePixels.length;
  const areaPerDrone = Math.max(1, totalWhite / count);
  const cellDim = Math.max(2.4, Math.sqrt(areaPerDrone * 0.90));

  const grid = new Map();
  for (let i = 0; i < totalWhite; i++) {
    const p = whitePixels[i];
    const gx = Math.floor(p.x / cellDim);
    const gy = Math.floor(p.y / cellDim);
    const key = `${gx},${gy}`;
    let bucket = grid.get(key);
    if (!bucket) {
      bucket = { all: [], edge: [] };
      grid.set(key, bucket);
    }
    bucket.all.push(p);
  }

  for (let i = 0; i < edgePixels.length; i++) {
    const p = edgePixels[i];
    const gx = Math.floor(p.x / cellDim);
    const gy = Math.floor(p.y / cellDim);
    const key = `${gx},${gy}`;
    const bucket = grid.get(key);
    if (bucket) bucket.edge.push(p);
  }

  // 3. Extract Cell Centroids (Prioritizing Boundary Edges)
  const candidatePts = [];
  grid.forEach((bucket) => {
    const src = bucket.edge.length > 0 ? bucket.edge : bucket.all;
    let sumX = 0, sumY = 0;
    for (let j = 0; j < src.length; j++) {
      sumX += src[j].x;
      sumY += src[j].y;
    }
    const avgX = sumX / src.length;
    const avgY = sumY / src.length;

    let bestPt = src[0];
    let minD = Infinity;
    for (let j = 0; j < src.length; j++) {
      const d = (src[j].x - avgX) ** 2 + (src[j].y - avgY) ** 2;
      if (d < minD) { minD = d; bestPt = src[j]; }
    }
    candidatePts.push(bestPt);
  });

  // 4. Quantize to Fleet Count
  const finalPts = [];
  if (candidatePts.length >= count) {
    const step = candidatePts.length / count;
    for (let i = 0; i < count; i++) {
      finalPts.push(candidatePts[Math.floor(i * step)]);
    }
  } else {
    for (let i = 0; i < candidatePts.length; i++) finalPts.push(candidatePts[i]);
    const rem = count - candidatePts.length;
    const stepW = whitePixels.length / rem;
    for (let i = 0; i < rem; i++) {
      finalPts.push(whitePixels[Math.floor(i * stepW)]);
    }
  }

  // 5. Output Single-Layer Coordinates ($Z=0$) with Height-Zoned Coloring
  for (let i = 0; i < count; i++) {
    const p = finalPts[i];
    out[i * 3]     = (p.x - cx) * scale;
    out[i * 3 + 1] = altitude - (p.y - cy) * scale;
    out[i * 3 + 2] = 0.0;

    if (swatchOut) {
      if (p.y < 165 && (Math.abs(p.x - 256) > 85 || p.y < 95)) {
        swatchOut[i] = 0; // Moon, Stars, Upper Sky (Silver White)
      } else if (Math.abs(p.x - 256) < 135 && p.y >= 70 && p.y < 380) {
        swatchOut[i] = (p.y < 210) ? 1 : 2; // Flame Vortex (Gold to Amber)
      } else {
        swatchOut[i] = (p.y >= 380) ? 3 : 2; // Hearth Wood and Robed Figures (Crimson to Amber)
      }
    }
  }
}

// Loads a local or hosted PNG tile with cross-origin fallback
export function loadTileImage(filename) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => resolve(img);
    img.onerror = () => {
      const fallbackImg = new Image();
      fallbackImg.crossOrigin = "anonymous";
      fallbackImg.onload = () => resolve(fallbackImg);
      fallbackImg.onerror = () => resolve(null);
      fallbackImg.src = ASSET_BASE_URL + filename;
    };
    img.src = "./" + filename;
  });
}

// Universal SVG Vector-to-Drone Compiler
export function compileSVGToDrones(svgString, out, count, swatchOut, scale = 0.055, altitude = 16) {
  return new Promise((resolve) => {
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      sampleImageToDrones(img, out, count, swatchOut, scale, altitude);
      URL.revokeObjectURL(url);
      resolve();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    img.src = url;
  });
}

export const parseAndSampleSVG = compileSVGToDrones;

// Vector Stroke Typography Engine (Stacked "BLESSED" above "SAMHAIN")
const GLYPH_PATHS = {
  'A': "M 0 0 L 0.5 1.4 L 1 0 M 0.22 0.52 L 0.78 0.52",
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
  'N': "M 0 0 L 0 1.4 L 0.9 0 L 0.9 1.4",
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
  'Z': "M 0 1.4 L 0.9 1.4 L 0 0 L 0.9 0",
  '!': "M 0.2 0.35 L 0.2 1.4 M 0.2 0 L 0.2 0.1"
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

  for (let i = 0; i < count; i++) {
    const targetDist = (i / count) * totalLength;
    let accum = 0;
    let selected = paths[paths.length - 1];
    let distOnPath = 0;

    for (const p of paths) {
      if (accum + p.len >= targetDist) {
        selected = p;
        distOnPath = targetDist - accum;
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

// Build registered Samhain shapes (Tiles 1 through 13)
export const SHAPE_PAGES = [
  // Page 1: Samhain Woodcut Tiles (Tiles 1-13)
  Array.from({ length: 13 }, (_, idx) => {
    const tileNum = idx + 1;
    const filename = `samhain-tile${tileNum}.png`;
    return {
      id: `samhainTile${tileNum}`,
      filename,
      drawSVG: `<rect x="3" y="3" width="18" height="18" rx="2" stroke="#ffab00" stroke-width="1.5"/><text x="12" y="15" fill="#ffab00" font-size="8" text-anchor="middle">T${tileNum}</text>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.strokeStyle = "#ffab00";
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - 14, cy - 14, 28, 28);
        ctx.fillStyle = "#ffab00";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`T${tileNum}`, cx, cy);
      },
      gen: async (out, n, swatchOut) => {
        const img = await loadTileImage(filename);
        if (img) {
          sampleImageToDrones(img, out, n, swatchOut, 0.046, 16);
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
