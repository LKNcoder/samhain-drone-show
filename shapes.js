import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";

export const GOLDEN = Math.PI * (3 - Math.sqrt(5));

// Universal Image & SVG Silhouette Infill Compiler (Strict Single-Layer Z = 0)
export function sampleImageToDrones(imgElement, out, count, swatchOut, scale = 0.055, altitude = 16) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 512, 512);
  ctx.drawImage(imgElement, 0, 0, 512, 512);

  const imgData = ctx.getImageData(0, 0, 512, 512).data;
  const boundaryPts = [];
  const interiorPts = [];

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  // Scan 512x512 luminance: White (> 100) = Active Flame, Black = Void / Negative Silhouette
  for (let y = 2; y < 510; y += 2) {
    for (let x = 2; x < 510; x += 2) {
      const idx = (y * 512 + x) * 4;
      const lum = imgData[idx] * 0.299 + imgData[idx + 1] * 0.587 + imgData[idx + 2] * 0.114;

      if (lum > 100) {
        // Detect edges by checking 4 orthogonal neighbors
        const aTop = imgData[((y - 2) * 512 + x) * 4];
        const aBot = imgData[((y + 2) * 512 + x) * 4];
        const aLeft = imgData[(y * 512 + (x - 2)) * 4];
        const aRight = imgData[(y * 512 + (x + 2)) * 4];

        if (aTop < 80 || aBot < 80 || aLeft < 80 || aRight < 80) {
          boundaryPts.push({ x, y });
        } else {
          interiorPts.push({ x, y });
        }

        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }

  if (boundaryPts.length === 0 && interiorPts.length === 0) return;

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const heightSpan = Math.max(1, maxY - minY);

  // 60% outline drones to trace flame tongues and inner figure, 40% infill
  const targetBoundaryCount = Math.round(count * 0.60);
  const targetInteriorCount = count - targetBoundaryCount;

  let ptr = 0;

  if (boundaryPts.length > 0) {
    const stepB = boundaryPts.length / targetBoundaryCount;
    for (let i = 0; i < targetBoundaryCount && ptr < count; i++) {
      const p = boundaryPts[Math.floor(i * stepB) % boundaryPts.length];
      out[ptr * 3]     = (p.x - cx) * scale;
      out[ptr * 3 + 1] = altitude - (p.y - cy) * scale;
      out[ptr * 3 + 2] = 0.0;

      if (swatchOut) {
        const normH = 1.0 - (p.y - minY) / heightSpan;
        swatchOut[ptr] = normH > 0.65 ? 0 : (normH > 0.35 ? 1 : 2);
      }
      ptr++;
    }
  }

  const sourceInterior = interiorPts.length > 0 ? interiorPts : boundaryPts;
  const stepI = sourceInterior.length / targetInteriorCount;
  for (let i = 0; i < targetInteriorCount && ptr < count; i++) {
    const p = sourceInterior[Math.floor(i * stepI) % sourceInterior.length];
    out[ptr * 3]     = (p.x - cx) * scale;
    out[ptr * 3 + 1] = altitude - (p.y - cy) * scale;
    out[ptr * 3 + 2] = 0.0;

    if (swatchOut) {
      const normH = 1.0 - (p.y - minY) / heightSpan;
      swatchOut[ptr] = normH > 0.65 ? 0 : (normH > 0.35 ? 1 : 2);
    }
    ptr++;
  }

  while (ptr < count) {
    out[ptr * 3]     = out[(ptr - 1) * 3] + 0.1;
    out[ptr * 3 + 1] = out[(ptr - 1) * 3 + 1];
    out[ptr * 3 + 2] = 0.0;
    if (swatchOut) swatchOut[ptr] = 0;
    ptr++;
  }
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

// Continuous Arc-Length Vector Stroke Font (Upright Stacked Text Engine)
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
  '!': "M 0.2 0.35 L 0.2 1.4 M 0.2 0 L 0.2 0.1",
  '?': "M 0.1 1.05 C 0.1 1.45 0.8 1.45 0.8 1.05 C 0.8 0.7 0.45 0.7 0.45 0.35 M 0.45 0 L 0.45 0.1"
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
  // BLESSED stacked above (+Y), SAMHAIN below (-Y)
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
    out[i * 3 + 1] = altitude + pt.y * (scale * 6.5); // Additive keeps letters upright
    out[i * 3 + 2] = 0.0;
  }
}

// Built-in Vector Asset Library
export const RAW_SVGS = {
  // Fire Silhouette (Faithful reproduction of user vector)
  fireSilhouette: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <path fill="#ffffff" fill-rule="evenodd" d="
      M 256 18
      C 295 75, 385 68, 418 152
      C 442 225, 412 308, 438 358
      C 458 398, 410 448, 362 468
      C 342 418, 332 348, 322 348
      C 322 408, 292 480, 256 480
      C 220 480, 190 408, 190 348
      C 180 348, 170 418, 150 468
      C 102 448, 54 398, 74 358
      C 100 308, 70 225, 94 152
      C 127 68, 217 75, 256 18 Z
      M 256 178
      A 40 45 0 1 0 256 268
      A 40 45 0 1 0 256 178 Z
      M 210 278
      C 225 268, 287 268, 302 278
      C 320 292, 330 365, 330 375
      L 182 375
      C 182 365, 192 292, 210 278 Z
      M 220 375
      L 292 375
      L 284 480
      L 228 480 Z
    "/>
  </svg>`,

  // SVGRepo 196385: Scythe Agriculture
  scythe: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <path fill="#e0f7fa" d="M472.6,39.4C374.3,39.4,272.5,91.8,206.2,176.6c-18.4,23.6-32.9,50.1-43,78.2l76.7,30.7c8.5-22.6,20.4-43.8,35.3-62.7 c52.7-67.4,133.5-108.9,211.2-108.9c3.9,0,7.9,0.1,11.8,0.3L512,41.2C498.9,40,485.8,39.4,472.6,39.4z"/>
    <path fill="#5d4037" d="M72.2,498.4l148.6-371.5c3.2-8,12.2-12,20.2-8.8c8,3.2,12,12.2,8.8,20.2L101.2,510c-3.2,8-12.2,12-20.2,8.8 C73,515.6,69,506.4,72.2,498.4z"/>
    <rect fill="#8d6e63" x="145" y="270" width="16" height="58" transform="matrix(0.3746 -0.9272 0.9272 0.3746 -181.7 298.6)"/>
    <rect fill="#8d6e63" x="195" y="160" width="16" height="58" transform="matrix(0.3746 -0.9272 0.9272 0.3746 -79.3 260.4)"/>
  </svg>`,

  // SVGRepo 211999: Wheat Barley
  wheat: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <path fill="#5d4037" d="M256,502c-5.5,0-10-4.5-10-10V220c0-5.5,4.5-10,10-10s10,4.5,10,10v272C266,497.5,261.5,502,256,502z"/>
    <path fill="#ffb300" d="M256,190c-28,0-50-32-50-70s22-70,50-70s50,32,50,70S284,190,256,190z M256,70c-16.5,0-30,22.4-30,50s13.5,50,30,50s30-22.4,30-50S272.5,70,256,70z"/>
    <path fill="#ffa000" d="M210,250c-26-10-40-44-30-76s40-50,66-40s40,44,30,76S236,260,210,250z"/>
    <path fill="#ffb300" d="M302,250c26-10,40-44,30-76s-40-50-66-40s-40,44-30,76S276,260,302,250z"/>
    <path fill="#ffa000" d="M200,320c-26-10-40-44-30-76s40-50,66-40s40,44,30,76S226,330,200,320z"/>
    <path fill="#ffb300" d="M312,320c26-10,40-44,30-76s-40-50-66-40s-40,44-30,76S286,330,312,320z"/>
    <path fill="#ffa000" d="M190,390c-26-10-40-44-30-76s40-50,66-40s40,44,30,76S216,400,190,390z"/>
    <path fill="#ffb300" d="M322,390c26-10,40-44,30-76s-40-50-66-40s-40,44-30,76S296,400,322,390z"/>
    <line x1="256" y1="50" x2="256" y2="10" stroke="#ffb300" stroke-width="4"/>
    <line x1="180" y1="160" x2="130" y2="100" stroke="#ffb300" stroke-width="4"/>
    <line x1="332" y1="160" x2="382" y2="100" stroke="#ffb300" stroke-width="4"/>
  </svg>`,

  // Authentic Turnip Lantern
  turnip: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120">
    <polygon points="50,12 82,34 96,72 68,112 32,112 4,72 18,34" fill="#a1887f"/>
    <path d="M 50 12 C 45 -4, 30 -8, 25 -14 M 50 12 C 55 -6, 68 -6, 75 -12 M 50 12 L 50 -12" stroke="#689f38" stroke-width="3" fill="none"/>
    <polygon points="26,44 44,58 26,62" fill="#ffab00"/>
    <polygon points="74,44 56,58 74,62" fill="#ffab00"/>
    <polygon points="50,62 56,74 44,74" fill="#ffab00"/>
    <path d="M 20 84 L 30 96 L 40 84 L 50 98 L 60 84 L 70 96 L 80 84 L 72 104 L 60 92 L 50 106 L 40 92 L 28 104 Z" fill="#ffab00"/>
  </svg>`,

  // Wicker Man Effigy
  wickerMan: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120">
    <line x1="34" y1="118" x2="44" y2="72" stroke="#8d6e63" stroke-width="4"/>
    <line x1="66" y1="118" x2="56" y2="72" stroke="#8d6e63" stroke-width="4"/>
    <rect x="32" y="34" width="36" height="38" stroke="#8d6e63" stroke-width="3" fill="none"/>
    <line x1="32" y1="34" x2="68" y2="72" stroke="#ffd54f" stroke-width="2"/>
    <line x1="68" y1="34" x2="32" y2="72" stroke="#ffd54f" stroke-width="2"/>
    <line x1="8" y1="42" x2="92" y2="42" stroke="#8d6e63" stroke-width="4"/>
    <circle cx="50" cy="18" r="12" stroke="#8d6e63" stroke-width="3" fill="none"/>
  </svg>`
};

export const SHAPE_PAGES = [
  [
    {
      id: "fireSilhouette",
      drawSVG: `<path d="M12 2 C8 6, 4 9, 4 14 C4 18, 8 22, 12 22 C16 22, 20 18, 20 14 C20 9, 16 6, 12 2 Z" fill="#ffab00"/><circle cx="12" cy="11" r="2.5" fill="#000"/><rect x="10" y="14" width="4" height="6" fill="#000"/>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.fillStyle = "#ff6d00";
        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#000000";
        ctx.beginPath();
        ctx.arc(cx, cy - 3, 5, 0, Math.PI * 2);
        ctx.fillRect(cx - 5, cy + 3, 10, 12);
      },
      gen: (out, n, swatchOut) => compileSVGToDrones(RAW_SVGS.fireSilhouette, out, n, swatchOut, 0.055, 16)
    },
    {
      id: "wheatBarley",
      drawSVG: `<line x1="12" y1="22" x2="12" y2="10" stroke="#5d4037" stroke-width="2"/><path d="M12 10 C8 8, 8 4, 12 2 C16 4, 16 8, 12 10 Z" fill="#ffb300"/><circle cx="9" cy="13" r="2" fill="#ffb300"/><circle cx="15" cy="13" r="2" fill="#ffb300"/>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.strokeStyle = "#ffb300"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(cx, cy + 22); ctx.lineTo(cx, cy - 18); ctx.stroke();
        for (let y = -14; y <= 10; y += 7) ctx.strokeRect(cx - 6, cy + y, 12, 5);
      },
      gen: (out, n, swatchOut) => compileSVGToDrones(RAW_SVGS.wheat, out, n, swatchOut, 0.052, 16)
    },
    {
      id: "scytheAgriculture",
      drawSVG: `<path d="M4 20 L18 6 M18 6 C22 4, 24 9, 20 12" stroke="#e0f7fa" stroke-width="2"/><line x1="4" y1="20" x2="16" y2="8" stroke="#5d4037" stroke-width="3"/>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx - 16, cy + 22); ctx.lineTo(cx + 10, cy - 14); ctx.stroke();
        ctx.strokeStyle = "#e0f7fa"; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(cx + 10, cy - 14); ctx.bezierCurveTo(cx + 24, cy - 22, cx + 22, cy - 2, cx + 8, cy - 4); ctx.stroke();
      },
      gen: (out, n, swatchOut) => compileSVGToDrones(RAW_SVGS.scythe, out, n, swatchOut, 0.056, 16)
    },
    {
      id: "turnipLantern",
      drawSVG: `<polygon points="12,2 19,7 21,15 15,22 9,22 3,15 5,7" stroke="#a1887f" stroke-width="1.5"/><polygon points="8,9 10,12 7,12" fill="#ffab00"/><polygon points="16,9 17,12 14,12" fill="#ffab00"/>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.strokeStyle = "#a1887f"; ctx.lineWidth = 2.5; ctx.beginPath();
        ctx.moveTo(cx, cy - 22); ctx.lineTo(cx + 18, cy - 10); ctx.lineTo(cx + 14, cy + 12);
        ctx.lineTo(cx, cy + 24); ctx.lineTo(cx - 14, cy + 12); ctx.lineTo(cx - 18, cy - 10); ctx.closePath(); ctx.stroke();
        ctx.fillStyle = "#ffab00";
        ctx.beginPath(); ctx.moveTo(cx - 9, cy - 6); ctx.lineTo(cx - 4, cy - 2); ctx.lineTo(cx - 10, cy + 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx + 9, cy - 6); ctx.lineTo(cx + 4, cy - 2); ctx.lineTo(cx + 10, cy + 2); ctx.fill();
      },
      gen: (out, n, swatchOut) => compileSVGToDrones(RAW_SVGS.turnip, out, n, swatchOut, 0.28, 16)
    },
    {
      id: "wickerMan",
      drawSVG: `<line x1="8" y1="22" x2="10" y2="14" stroke="#8d6e63" stroke-width="2"/><line x1="16" y1="22" x2="14" y2="14" stroke="#8d6e63" stroke-width="2"/><rect x="8" y="7" width="8" height="7" stroke="#8d6e63" stroke-width="2"/><circle cx="12" cy="4" r="2.5" stroke="#8d6e63" stroke-width="1.5"/>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.strokeStyle = "#8d6e63"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx - 7, cy + 24); ctx.lineTo(cx - 4, cy + 8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 7, cy + 24); ctx.lineTo(cx + 4, cy + 8); ctx.stroke();
        ctx.strokeRect(cx - 8, cy - 6, 16, 14);
        ctx.beginPath(); ctx.moveTo(cx - 22, cy - 6); ctx.lineTo(cx + 22, cy - 6); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy - 14, 5, 0, Math.PI * 2); ctx.stroke();
      },
      gen: (out, n, swatchOut) => compileSVGToDrones(RAW_SVGS.wickerMan, out, n, swatchOut, 0.28, 16)
    }
  ]
];

export function findShapeById(id) {
  for (const page of SHAPE_PAGES) {
    for (const shape of page) {
      if (shape.id === id) return shape;
    }
  }
  return SHAPE_PAGES[0][0];
}
