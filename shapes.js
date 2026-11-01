import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";

export const GOLDEN = Math.PI * (3 - Math.sqrt(5));

// High-Fidelity Spatial-Grid Density (Blue Noise) Image Sampler
export function sampleImageToDrones(imgElement, out, count, swatchOut, scale = 0.048, altitude = 16) {
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

  // 1. High-contrast threshold scan (White = Lit Drone, Black = Negative Sky Void)
  for (let y = 1; y < 511; y++) {
    for (let x = 1; x < 511; x++) {
      const idx = (y * 512 + x) * 4;
      const lum = imgData[idx] * 0.299 + imgData[idx + 1] * 0.587 + imgData[idx + 2] * 0.114;

      if (lum > 110) {
        whitePixels.push({ x, y });
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;

        // Check 4-neighbor boundary to detect silhouette edges
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

  // 2. Spatial Bucket Partitioning (Blue Noise / Density Equalization)
  const totalWhite = whitePixels.length;
  const areaPerDrone = Math.max(1, totalWhite / count);
  const cellDim = Math.max(2.2, Math.sqrt(areaPerDrone * 0.88));

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

  // Populate edges inside buckets
  for (let i = 0; i < edgePixels.length; i++) {
    const p = edgePixels[i];
    const gx = Math.floor(p.x / cellDim);
    const gy = Math.floor(p.y / cellDim);
    const key = `${gx},${gy}`;
    const bucket = grid.get(key);
    if (bucket) bucket.edge.push(p);
  }

  // 3. Extract Cell Centroids (Prioritizing Boundary Edges for Sharp Silhouettes)
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

    // Pick pixel closest to cell centroid
    let bestPt = src[0];
    let minD = Infinity;
    for (let j = 0; j < src.length; j++) {
      const d = (src[j].x - avgX) ** 2 + (src[j].y - avgY) ** 2;
      if (d < minD) { minD = d; bestPt = src[j]; }
    }
    candidatePts.push(bestPt);
  });

  // 4. Exact Fleet Count Quantization
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

  // 5. Transform to Three.js Single-Plane Coordinates ($Z=0$) with Height-Zoned Color Palette
  for (let i = 0; i < count; i++) {
    const p = finalPts[i];
    const worldX = (p.x - cx) * scale;
    const worldY = altitude - (p.y - cy) * scale; // Invert Y so canvas image renders right-side up

    out[i * 3]     = worldX;
    out[i * 3 + 1] = worldY;
    out[i * 3 + 2] = 0.0; // Strictly coplanar

    if (swatchOut) {
      // Swatch 0: Moon, Stars & High Clouds (Upper corners & top sky)
      if (p.y < 160 && (Math.abs(p.x - 256) > 90 || p.y < 90)) {
        swatchOut[i] = 0; // Celestial White / Ice Blue
      }
      // Swatch 1: Towering Flame Column & Rising Sparks (Center column)
      else if (Math.abs(p.x - 256) < 130 && p.y >= 70 && p.y < 380) {
        swatchOut[i] = (p.y < 220) ? 1 : 2; // Flame Gold at core, Amber Orange at flanks
      }
      // Swatch 2: Firewood Logs & Hooded Circle of Figures
      else {
        swatchOut[i] = (p.y >= 380) ? 3 : 2; // Hearth Crimson at ground, Amber at mid-robes
      }
    }
  }
}

// Procedural Canvas Linocut Generator for the Samhain Bonfire Gathering Scene
export function generateBonfireLinocutImage() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  // Solid Black Night Sky Void
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 512, 512);

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";

  // 1. Crescent Moon (Upper Left Sky)
  ctx.beginPath();
  ctx.arc(95, 80, 36, -Math.PI * 0.75, Math.PI * 0.55);
  ctx.arc(108, 74, 30, Math.PI * 0.5, -Math.PI * 0.65, true);
  ctx.closePath();
  ctx.fill();

  // 2. Celtic Night Sky Stars (4-Point Diamond Sparkles)
  const stars = [
    [48, 40, 6], [168, 48, 7], [48, 115, 5], [195, 110, 8],
    [360, 42, 6], [470, 50, 7], [440, 105, 8], [340, 85, 5],
    [140, 140, 4], [370, 135, 4], [475, 145, 5], [35, 165, 5]
  ];
  stars.forEach(([sx, sy, r]) => {
    ctx.beginPath();
    ctx.moveTo(sx, sy - r * 1.5);
    ctx.lineTo(sx + r * 0.35, sy - r * 0.35);
    ctx.lineTo(sx + r * 1.5, sy);
    ctx.lineTo(sx + r * 0.35, sy + r * 0.35);
    ctx.lineTo(sx, sy + r * 1.5);
    ctx.lineTo(sx - r * 0.35, sy + r * 0.35);
    ctx.lineTo(sx - r * 1.5, sy);
    ctx.lineTo(sx - r * 0.35, sy - r * 0.35);
    ctx.closePath();
    ctx.fill();
  });

  // 3. Billowing Smoke & Cloud Banks (Upper Left & Right Corners)
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 160); ctx.bezierCurveTo(50, 185, 90, 140, 140, 195);
  ctx.moveTo(0, 205); ctx.bezierCurveTo(60, 220, 110, 180, 165, 250);
  ctx.moveTo(512, 160); ctx.bezierCurveTo(462, 185, 422, 140, 372, 195);
  ctx.moveTo(512, 205); ctx.bezierCurveTo(452, 220, 402, 180, 347, 250);
  ctx.stroke();

  // 4. Massive Towering Flame Vortex (Center Column)
  ctx.lineWidth = 10;
  ctx.beginPath();
  // Central curling flame spiral
  ctx.moveTo(256, 380);
  ctx.bezierCurveTo(240, 260, 290, 180, 260, 90);
  ctx.bezierCurveTo(250, 60, 275, 40, 290, 65);
  ctx.bezierCurveTo(305, 90, 270, 115, 270, 130);
  ctx.stroke();

  // Flanking sweeping flame tongues
  const flameBlades = [
    // Left flame sweeps
    [[220, 380], [170, 300], [210, 220], [235, 120]],
    [[190, 385], [140, 320], [175, 240], [210, 170]],
    [[160, 395], [120, 340], [140, 280], [180, 225]],
    [[240, 360], [200, 260], [230, 170], [250, 75]],
    // Right flame sweeps
    [[292, 380], [342, 300], [302, 220], [277, 120]],
    [[322, 385], [372, 320], [337, 240], [302, 170]],
    [[352, 395], [392, 340], [372, 280], [332, 225]],
    [[272, 360], [312, 260], [282, 170], [262, 75]]
  ];
  flameBlades.forEach(([p0, p1, p2, p3]) => {
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
    ctx.stroke();
  });

  // Solid internal flame tongues
  ctx.beginPath();
  ctx.moveTo(215, 380);
  ctx.quadraticCurveTo(180, 310, 225, 260);
  ctx.quadraticCurveTo(240, 320, 256, 380);
  ctx.quadraticCurveTo(272, 320, 287, 260);
  ctx.quadraticCurveTo(332, 310, 297, 380);
  ctx.closePath();
  ctx.fill();

  // Rising embers & sparks around the column
  const embers = [
    [210, 130], [230, 110], [245, 95], [265, 80], [285, 95], [300, 115],
    [190, 160], [175, 190], [205, 210], [185, 235], [310, 150], [330, 185],
    [320, 210], [335, 240], [200, 270], [315, 270], [225, 160], [285, 160]
  ];
  embers.forEach(([ex, ey]) => {
    ctx.beginPath();
    ctx.arc(ex, ey, 4.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // 5. Firewood Logs at the Hearth Base
  ctx.lineWidth = 9;
  for (let i = -4; i <= 4; i++) {
    const lx1 = 256 + i * 16;
    const ly1 = 405 + Math.abs(i) * 3;
    const lx2 = 256 + i * 22;
    const ly2 = 425 + Math.abs(i) * 5;
    ctx.beginPath();
    ctx.moveTo(lx1, ly1);
    ctx.lineTo(lx2, ly2);
    ctx.stroke();
  }

  // 6. Illuminated Ground Ring beneath the Circle of Figures
  ctx.beginPath();
  ctx.ellipse(256, 435, 210, 50, 0, 0, Math.PI * 2);
  ctx.lineWidth = 16;
  ctx.stroke();

  // 7. Circle of Hooded Figures Holding Hands
  // Background figures (White Robes with Black Hood/Head Negative Cutouts)
  const bgFigures = [
    [55, 305], [95, 285], [135, 275], [175, 270],
    [337, 270], [377, 275], [417, 285], [457, 305]
  ];
  bgFigures.forEach(([fx, fy]) => {
    // White Robe Contour
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(fx - 14, fy + 45);
    ctx.lineTo(fx - 10, fy + 12);
    ctx.lineTo(fx - 14, fy + 24);
    ctx.lineTo(fx - 6, fy);
    ctx.lineTo(fx + 6, fy);
    ctx.lineTo(fx + 14, fy + 24);
    ctx.lineTo(fx + 10, fy + 12);
    ctx.lineTo(fx + 14, fy + 45);
    ctx.closePath();
    ctx.fill();

    // Dark Hood Negative Cutout
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(fx, fy + 8, 7.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Foreground figures (Solid Black Silhouettes against the Illuminated Ground)
  ctx.fillStyle = "#000000";
  const fgFigures = [
    [65, 420], [130, 445], [205, 465], [256, 475], [307, 465], [382, 445], [447, 420]
  ];
  fgFigures.forEach(([fx, fy]) => {
    ctx.beginPath();
    ctx.arc(fx, fy - 26, 12, 0, Math.PI * 2); // Head
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(fx - 20, fy + 35);
    ctx.lineTo(fx - 16, fy - 14);
    ctx.lineTo(fx + 16, fy - 14);
    ctx.lineTo(fx + 20, fy + 35);
    ctx.closePath();
    ctx.fill();
  });

  return canvas;
}

// Universal SVG Vector-to-Drone Compiler
export function compileSVGToDrones(svgString, out, count, swatchOut, scale = 0.048, altitude = 16) {
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

// Glyph Vector Definitions
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

// Continuous Vector Stroke Font with "BLESSED" above "SAMHAIN"
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

// Built-in Vector Asset Library
export const RAW_SVGS = {
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
    <line x1="256" y1="50" x2="256" y2="10" stroke="#ffb300" stroke-width="4"/>
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
      id: "bonfireGathering",
      drawSVG: `<circle cx="12" cy="12" r="10" stroke="#ffab00" stroke-width="1.5"/><path d="M12 4 C10 8, 14 11, 12 16" stroke="#ffab00" stroke-width="2"/>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.fillStyle = "#ff6d00";
        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#000000";
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.fill();
      },
      gen: (out, n, swatchOut) => {
        return new Promise((resolve) => {
          const img = new Image();
          // Check if local file exists, otherwise use procedural linocut canvas
          img.onload = () => {
            sampleImageToDrones(img, out, n, swatchOut, 0.046, 16);
            resolve();
          };
          img.onerror = () => {
            const fallbackCanvas = generateBonfireLinocutImage();
            sampleImageToDrones(fallbackCanvas, out, n, swatchOut, 0.046, 16);
            resolve();
          };
          img.src = "./samhain-tile1.jpg";
        });
      }
    },
    {
      id: "wheatBarley",
      drawSVG: `<line x1="12" y1="22" x2="12" y2="10" stroke="#5d4037" stroke-width="2"/><circle cx="9" cy="13" r="2" fill="#ffb300"/><circle cx="15" cy="13" r="2" fill="#ffb300"/>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.strokeStyle = "#ffb300"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(cx, cy + 22); ctx.lineTo(cx, cy - 18); ctx.stroke();
      },
      gen: (out, n, swatchOut) => compileSVGToDrones(RAW_SVGS.wheat, out, n, swatchOut, 0.052, 16)
    },
    {
      id: "scytheAgriculture",
      drawSVG: `<path d="M4 20 L18 6 M18 6 C22 4, 24 9, 20 12" stroke="#e0f7fa" stroke-width="2"/><line x1="4" y1="20" x2="16" y2="8" stroke="#5d4037" stroke-width="3"/>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx - 16, cy + 22); ctx.lineTo(cx + 10, cy - 14); ctx.stroke();
      },
      gen: (out, n, swatchOut) => compileSVGToDrones(RAW_SVGS.scythe, out, n, swatchOut, 0.056, 16)
    },
    {
      id: "turnipLantern",
      drawSVG: `<polygon points="12,2 19,7 21,15 15,22 9,22 3,15 5,7" stroke="#a1887f" stroke-width="1.5"/><polygon points="8,9 10,12 7,12" fill="#ffab00"/>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.strokeStyle = "#a1887f"; ctx.lineWidth = 2.5; ctx.beginPath();
        ctx.arc(cx, cy, 16, 0, Math.PI * 2); ctx.stroke();
      },
      gen: (out, n, swatchOut) => compileSVGToDrones(RAW_SVGS.turnip, out, n, swatchOut, 0.28, 16)
    },
    {
      id: "wickerMan",
      drawSVG: `<line x1="8" y1="22" x2="10" y2="14" stroke="#8d6e63" stroke-width="2"/><rect x="8" y="7" width="8" height="7" stroke="#8d6e63" stroke-width="2"/>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.strokeStyle = "#8d6e63"; ctx.lineWidth = 3;
        ctx.strokeRect(cx - 8, cy - 6, 16, 14);
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
