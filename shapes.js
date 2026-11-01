import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";

export const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const ASSET_BASE_URL = "https://lkncoder.github.io/tacocat/";

// Hierarchical Boundary-First + Particle Relaxation Sampler
export function sampleImageToDrones(imgElement, out, count, swatchOut, scale = 0.046, altitude = 16) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 512, 512);
  ctx.drawImage(imgElement, 0, 0, 512, 512);

  const imgData = ctx.getImageData(0, 0, 512, 512).data;
  const whiteMask = new Uint8Array(512 * 512);
  const edgeMask = new Uint8Array(512 * 512);
  const edgePoints = [];
  const interiorPoints = [];

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  // 1. Threshold scan: White (> 110) = Drones, Black = Empty Negative Space
  for (let y = 1; y < 511; y++) {
    for (let x = 1; x < 511; x++) {
      const idx = (y * 512 + x) * 4;
      const lum = imgData[idx] * 0.299 + imgData[idx + 1] * 0.587 + imgData[idx + 2] * 0.114;

      if (lum > 110) {
        whiteMask[y * 512 + x] = 1;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }

  // Detect boundary pixels using 4-connectivity
  for (let y = 1; y < 511; y++) {
    for (let x = 1; x < 511; x++) {
      if (whiteMask[y * 512 + x] === 1) {
        const top = whiteMask[(y - 1) * 512 + x];
        const bot = whiteMask[(y + 1) * 512 + x];
        const left = whiteMask[y * 512 + (x - 1)];
        const right = whiteMask[y * 512 + (x + 1)];

        if (!top || !bot || !left || !right) {
          edgeMask[y * 512 + x] = 1;
          edgePoints.push({ x, y });
        } else {
          interiorPoints.push({ x, y });
        }
      }
    }
  }

  if (edgePoints.length === 0 && interiorPoints.length === 0) return;

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  // 2. Chained Contour Extraction (Sequential perimeter walk)
  const visited = new Uint8Array(512 * 512);
  const chainedPerimeter = [];

  for (let i = 0; i < edgePoints.length; i++) {
    const startPt = edgePoints[i];
    const sIdx = startPt.y * 512 + startPt.x;
    if (visited[sIdx]) continue;

    let curr = startPt;
    visited[sIdx] = 1;
    chainedPerimeter.push(curr);

    let found = true;
    while (found) {
      found = false;
      const neighbors = [
        { x: curr.x + 1, y: curr.y }, { x: curr.x + 1, y: curr.y + 1 },
        { x: curr.x, y: curr.y + 1 }, { x: curr.x - 1, y: curr.y + 1 },
        { x: curr.x - 1, y: curr.y }, { x: curr.x - 1, y: curr.y - 1 },
        { x: curr.x, y: curr.y - 1 }, { x: curr.x + 1, y: curr.y - 1 }
      ];

      for (const n of neighbors) {
        if (n.x >= 0 && n.x < 512 && n.y >= 0 && n.y < 512) {
          const nIdx = n.y * 512 + n.x;
          if (edgeMask[nIdx] && !visited[nIdx]) {
            visited[nIdx] = 1;
            chainedPerimeter.push(n);
            curr = n;
            found = true;
            break;
          }
        }
      }
    }
  }

  // 3. Allocate 65% of drones to perimeter edges, 35% to relaxed interior
  const targetEdgeCount = Math.min(count, Math.round(count * 0.65));
  const targetFillCount = count - targetEdgeCount;
  let ptr = 0;

  if (chainedPerimeter.length > 0) {
    const stepE = chainedPerimeter.length / targetEdgeCount;
    for (let i = 0; i < targetEdgeCount && ptr < count; i++) {
      const p = chainedPerimeter[Math.floor(i * stepE) % chainedPerimeter.length];
      out[ptr * 3]     = (p.x - cx) * scale;
      out[ptr * 3 + 1] = altitude - (p.y - cy) * scale;
      out[ptr * 3 + 2] = 0.0;
      if (swatchOut) swatchOut[ptr] = 0;
      ptr++;
    }
  }

  // 4. Interior Blue Noise / Spring Repulsion
  if (targetFillCount > 0 && interiorPoints.length > 0) {
    const fillDrones = [];
    const stepI = interiorPoints.length / targetFillCount;
    for (let i = 0; i < targetFillCount; i++) {
      const p = interiorPoints[Math.floor(i * stepI) % interiorPoints.length];
      fillDrones.push({ x: p.x, y: p.y });
    }

    for (let iter = 0; iter < 8; iter++) {
      for (let a = 0; a < fillDrones.length; a++) {
        let fx = 0, fy = 0;
        const da = fillDrones[a];

        for (let b = 0; b < fillDrones.length; b++) {
          if (a === b) continue;
          const db = fillDrones[b];
          const dx = da.x - db.x;
          const dy = da.y - db.y;
          const distSq = dx * dx + dy * dy;

          if (distSq < 144 && distSq > 0.01) {
            const dist = Math.sqrt(distSq);
            const force = (12 - dist) / dist;
            fx += dx * force * 0.25;
            fy += dy * force * 0.25;
          }
        }

        const nx = Math.round(da.x + fx);
        const ny = Math.round(da.y + fy);
        if (nx >= 0 && nx < 512 && ny >= 0 && ny < 512 && whiteMask[ny * 512 + nx]) {
          da.x = nx;
          da.y = ny;
        }
      }
    }

    for (let i = 0; i < fillDrones.length && ptr < count; i++) {
      const p = fillDrones[i];
      out[ptr * 3]     = (p.x - cx) * scale;
      out[ptr * 3 + 1] = altitude - (p.y - cy) * scale;
      out[ptr * 3 + 2] = 0.0;
      if (swatchOut) swatchOut[ptr] = 1;
      ptr++;
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

// Robust Image Loader supporting exact GitHub asset naming
export function loadTileImage(filename) {
  return new Promise((resolve) => {
    const raw = filename.replace(/^samhain-/, "");
    const candidates = [
      `./samhain-${raw}`,
      `${ASSET_BASE_URL}samhain-${raw}`,
      `./${raw}`,
      `${ASSET_BASE_URL}${raw}`
    ];

    let idx = 0;
    function tryNext() {
      if (idx >= candidates.length) {
        console.warn(`Could not load image: ${filename}`);
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

// Registered Samhain Woodcut Tiles (Tiles 1-15)
const TILE_NUMBERS = [1, 2, 3, 4, 15, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export const SHAPE_PAGES = [
  TILE_NUMBERS.map((tileNum) => {
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
        if (img) sampleImageToDrones(img, out, n, swatchOut, 0.046, 16);
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
