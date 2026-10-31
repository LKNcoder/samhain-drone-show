import * as THREE from "three";

export const GOLDEN = Math.PI * (3 - Math.sqrt(5));

// Universal SVG Vector Graphic to Drone Converter
export function sampleVectorGraphic(svgElements, out, count, swatchOut, scale = 0.26, altitude = 16) {
  // svgElements: Array of { d: pathString, points: polygonPoints, type: 'path'|'polygon'|'line'|'rect'|'circle', swatch: number, weight: number }
  const paths = [];
  let totalLength = 0;

  for (const elem of svgElements) {
    let p;
    if (elem.type === "polygon") {
      p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const pts = elem.points.trim().split(/\s+/).map(pair => pair.split(","));
      if (pts.length > 0) {
        let d = `M ${pts[0][0]} ${pts[0][1]}`;
        for (let i = 1; i < pts.length; i++) d += ` L ${pts[i][0]} ${pts[i][1]}`;
        d += " Z";
        p.setAttribute("d", d);
      }
    } else if (elem.type === "line") {
      p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", `M ${elem.x1} ${elem.y1} L ${elem.x2} ${elem.y2}`);
    } else if (elem.type === "rect") {
      p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const x = elem.x || 0, y = elem.y || 0, w = elem.w, h = elem.h;
      p.setAttribute("d", `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`);
    } else if (elem.type === "circle") {
      p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const cx = elem.cx, cy = elem.cy, r = elem.r;
      p.setAttribute("d", `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy}`);
    } else {
      p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", elem.d);
    }

    const len = p.getTotalLength();
    if (len > 0) {
      const weight = elem.weight || 1.0;
      const weightedLen = len * weight;
      paths.push({ path: p, len, weightedLen, swatch: elem.swatch || 0 });
      totalLength += weightedLen;
    }
  }

  if (paths.length === 0) return;

  // Measure bounding box to center the vector graphic
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const samplePts = [];

  for (let i = 0; i < count; i++) {
    const targetDist = (i / count) * totalLength;
    let accum = 0;
    let selected = paths[paths.length - 1];
    let distOnPath = 0;

    for (const p of paths) {
      if (accum + p.weightedLen >= targetDist) {
        selected = p;
        const norm = (targetDist - accum) / p.weightedLen;
        distOnPath = norm * p.len;
        break;
      }
      accum += p.weightedLen;
    }

    const pt = selected.path.getPointAtLength(distOnPath);
    samplePts.push({ x: pt.x, y: pt.y, swatch: selected.swatch });

    if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  for (let i = 0; i < count; i++) {
    const pt = samplePts[i];
    out[i * 3]     = (pt.x - cx) * scale;
    out[i * 3 + 1] = altitude - (pt.y - cy) * scale;
    out[i * 3 + 2] = (i % 2 === 0 ? 0.4 : -0.4); // Subtle relief depth
    if (swatchOut) swatchOut[i] = pt.swatch;
  }
}

// Crisp Multi-Line Stroke Text Rasterizer
export function generateTextDrones(out, text, count, font = "Impact", scale = 0.28, altitude = 16) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 384;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 1024, 384);

  // Auto-split into lines if long or contains spaces
  const words = text.trim().toUpperCase().split(/\s+/);
  let lines = [text.trim().toUpperCase()];
  if (words.length >= 2 && words.join(" ").length > 9) {
    const mid = Math.ceil(words.length / 2);
    lines = [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
  }

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 10;
  ctx.lineJoin = "round";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const fontSize = lines.length > 1 ? 92 : 110;
  ctx.font = `bold ${fontSize}px ${font}, sans-serif`;

  const lineSpacing = fontSize * 1.15;
  const startY = 192 - ((lines.length - 1) * lineSpacing) / 2;

  lines.forEach((line, idx) => {
    ctx.strokeText(line, 512, startY + idx * lineSpacing);
  });

  const imgData = ctx.getImageData(0, 0, 1024, 384).data;
  const strokePixels = [];
  for (let y = 0; y < 384; y += 2) {
    for (let x = 0; x < 1024; x += 2) {
      if (imgData[(y * 1024 + x) * 4] > 120) {
        strokePixels.push({ x: x - 512, y: 192 - y });
      }
    }
  }

  if (strokePixels.length === 0) {
    for (let i = 0; i < count; i++) {
      out[i * 3]     = (Math.random() - 0.5) * 24;
      out[i * 3 + 1] = altitude;
      out[i * 3 + 2] = 0;
    }
    return;
  }

  const step = strokePixels.length / count;
  for (let i = 0; i < count; i++) {
    const pt = strokePixels[Math.floor(i * step) % strokePixels.length];
    out[i * 3]     = pt.x * (scale * 0.45);
    out[i * 3 + 1] = altitude + pt.y * (scale * 0.45);
    out[i * 3 + 2] = (i % 2 === 0 ? 0.3 : -0.3);
  }
}

export const SHAPE_PAGES = [
  // Page 1: Samhain Festival (Faithful High-Density Vector Icons)
  [
    // 1. Traditional Carved Turnip Lantern (Exact Reproduction of the UI Icon)
    {
      id: "turnipLantern",
      drawSVG: `<polygon points="12,2 19,7 21,15 15,22 9,22 3,15 5,7" stroke="#a1887f" stroke-width="1.5"/><polygon points="8,9 10,12 7,12" fill="#ffab00"/><polygon points="16,9 17,12 14,12" fill="#ffab00"/><path d="M7 16 L9 18 L11 16 L13 18 L15 16 L17 18" stroke="#ffab00" stroke-width="2"/>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.strokeStyle = "#a1887f"; ctx.lineWidth = 2.5; ctx.beginPath();
        ctx.moveTo(cx, cy - 22); ctx.lineTo(cx + 18, cy - 10); ctx.lineTo(cx + 14, cy + 12);
        ctx.lineTo(cx, cy + 24); ctx.lineTo(cx - 14, cy + 12); ctx.lineTo(cx - 18, cy - 10); ctx.closePath(); ctx.stroke();
        ctx.fillStyle = "#ffab00";
        ctx.beginPath(); ctx.moveTo(cx - 9, cy - 6); ctx.lineTo(cx - 4, cy - 2); ctx.lineTo(cx - 10, cy + 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx + 9, cy - 6); ctx.lineTo(cx + 4, cy - 2); ctx.lineTo(cx + 10, cy + 2); ctx.fill();
        ctx.strokeStyle = "#ffab00"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx - 10, cy + 10); ctx.lineTo(cx - 5, cy + 14); ctx.lineTo(cx, cy + 10); ctx.lineTo(cx + 5, cy + 14); ctx.lineTo(cx + 10, cy + 10); ctx.stroke();
      },
      gen: (out, n, swatchOut) => {
        sampleVectorGraphic([
          // Heavy root contour outline (Swatch 0: Earth Root Bone #a1887f)
          { type: "polygon", points: "50,10 85,35 95,75 65,110 35,110 5,75 15,35", swatch: 0, weight: 2.2 },
          // Left Carved Slanted Eye (Swatch 1: Glowing Candle Flame #ffab00)
          { type: "polygon", points: "32,45 42,60 28,60", swatch: 1, weight: 1.5 },
          // Right Carved Slanted Eye (Swatch 1: Glowing Flame)
          { type: "polygon", points: "68,45 72,60 58,60", swatch: 1, weight: 1.5 },
          // Triangular Nose (Swatch 1)
          { type: "polygon", points: "50,65 55,75 45,75", swatch: 1, weight: 1.0 },
          // Jagged Menacing Mouth with Fangs (Swatch 1)
          { type: "path", d: "M 25 85 L 35 95 L 45 85 L 55 95 L 65 85 L 75 95 L 85 85", swatch: 1, weight: 2.5 }
        ], out, n, swatchOut, 0.28, 16);
      }
    },

    // 2. Scythe & Ripe Wheat Stalks
    {
      id: "scytheAndWheat",
      drawSVG: `<path d="M4 20 L18 6 M18 6 C22 4, 24 9, 20 12 C16 14, 12 12, 12 12" stroke-width="2"/><path d="M7 21 C7 16, 9 14, 9 11 M11 21 C11 16, 13 14, 13 11" stroke="#ffb300" stroke-width="2"/>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx - 16, cy + 22); ctx.lineTo(cx + 10, cy - 14); ctx.stroke();
        ctx.strokeStyle = "#e0f7fa"; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(cx + 10, cy - 14); ctx.bezierCurveTo(cx + 24, cy - 22, cx + 22, cy - 2, cx + 8, cy - 4); ctx.stroke();
        ctx.strokeStyle = "#ffb300"; ctx.lineWidth = 2.5;
        for (let x = -10; x <= 6; x += 4) {
          ctx.beginPath(); ctx.moveTo(cx + x, cy + 22); ctx.lineTo(cx + x, cy + 4); ctx.stroke();
        }
      },
      gen: (out, n, swatchOut) => {
        sampleVectorGraphic([
          // Crescent Scythe Blade (Swatch 0: Silver Steel #e0f7fa)
          { type: "path", d: "M 75 30 C 110 15, 120 45, 95 65 C 75 75, 55 65, 55 65", swatch: 0, weight: 3.0 },
          // Wooden Snath / Handle (Swatch 2: Dark Timber #5d4037)
          { type: "line", x1: 20, y1: 110, x2: 75, y2: 30, swatch: 2, weight: 1.8 },
          // 4 Stalks of Golden Grain with Seed Heads (Swatch 1: Harvest Gold #ffb300)
          { type: "path", d: "M 35 110 C 35 80, 42 70, 42 55 M 39 60 L 45 57 M 45 52 L 39 49", swatch: 1, weight: 1.8 },
          { type: "path", d: "M 48 110 C 48 80, 55 70, 55 50 M 52 55 L 58 52 M 58 47 L 52 44", swatch: 1, weight: 1.8 },
          { type: "path", d: "M 62 110 C 62 85, 68 75, 68 55 M 65 60 L 71 57 M 71 52 L 65 49", swatch: 1, weight: 1.8 },
          { type: "path", d: "M 76 110 C 76 90, 82 80, 82 65 M 79 70 L 85 67", swatch: 1, weight: 1.5 }
        ], out, n, swatchOut, 0.28, 16);
      }
    },

    // 3. The Dying Celtic Oak
    {
      id: "dyingOak",
      drawSVG: `<path d="M12 22 L12 14 M12 14 C8 10, 3 11, 2 6 M12 14 C16 10, 21 11, 22 6 M12 11 C10 8, 11 5, 8 2 M12 11 C14 8, 13 5, 16 2" stroke="#8d6e63" stroke-width="2"/><circle cx="5" cy="5" r="1.5" fill="#ff6d00"/><circle cx="19" cy="5" r="1.5" fill="#ff6d00"/><circle cx="12" cy="3" r="1.5" fill="#ff6d00"/>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 3.5; ctx.beginPath();
        ctx.moveTo(cx, cy + 22); ctx.lineTo(cx, cy + 6);
        ctx.lineTo(cx - 16, cy - 6); ctx.moveTo(cx, cy + 6); ctx.lineTo(cx + 16, cy - 6);
        ctx.moveTo(cx, cy + 2); ctx.lineTo(cx - 8, cy - 18); ctx.moveTo(cx, cy + 2); ctx.lineTo(cx + 8, cy - 18);
        ctx.stroke();
        ctx.fillStyle = "#ff6d00";
        for (const [ox, oy] of [[-16, -6], [16, -6], [-8, -18], [8, -18], [0, -14]]) {
          ctx.beginPath(); ctx.arc(cx + ox, cy + oy, 3, 0, Math.PI * 2); ctx.fill();
        }
      },
      gen: (out, n, swatchOut) => {
        sampleVectorGraphic([
          // Heavy Gnarled Trunk & Twisted Branches (Swatch 0: Bark Brown #5d4037)
          { type: "path", d: "M 48 115 L 48 70 M 52 115 L 52 70 M 50 70 C 35 55, 15 58, 10 32 M 50 70 C 65 55, 85 58, 90 32 M 50 55 C 40 40, 45 25, 30 10 M 50 55 C 60 40, 55 25, 70 10 M 50 45 L 50 15", swatch: 0, weight: 3.0 },
          // Autumn Dying Leaf Clusters (Swatch 1: Crimson Orange #ff6d00)
          { type: "circle", cx: 10, cy: 30, r: 8, swatch: 1, weight: 1.5 },
          { type: "circle", cx: 90, cy: 30, r: 8, swatch: 1, weight: 1.5 },
          { type: "circle", cx: 30, cy: 10, r: 8, swatch: 1, weight: 1.5 },
          { type: "circle", cx: 70, cy: 10, r: 8, swatch: 1, weight: 1.5 },
          { type: "circle", cx: 50, cy: 12, r: 6, swatch: 1, weight: 1.2 }
        ], out, n, swatchOut, 0.28, 16);
      }
    },

    // 4. The Wicker Man Titan Effigy
    {
      id: "wickerMan",
      drawSVG: `<line x1="8" y1="22" x2="10" y2="14" stroke="#8d6e63" stroke-width="2"/><line x1="16" y1="22" x2="14" y2="14" stroke="#8d6e63" stroke-width="2"/><rect x="8" y="7" width="8" height="7" stroke="#8d6e63" stroke-width="2"/><circle cx="12" cy="4" r="2.5" stroke="#8d6e63" stroke-width="1.5"/><line x1="2" y1="9" x2="22" y2="9" stroke="#8d6e63" stroke-width="2"/>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.strokeStyle = "#8d6e63"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx - 7, cy + 24); ctx.lineTo(cx - 4, cy + 8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 7, cy + 24); ctx.lineTo(cx + 4, cy + 8); ctx.stroke();
        ctx.strokeRect(cx - 8, cy - 6, 16, 14);
        ctx.beginPath(); ctx.moveTo(cx - 8, cy - 6); ctx.lineTo(cx + 8, cy + 8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 8, cy - 6); ctx.lineTo(cx - 8, cy + 8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 22, cy - 6); ctx.lineTo(cx + 22, cy - 6); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy - 14, 5, 0, Math.PI * 2); ctx.stroke();
      },
      gen: (out, n, swatchOut) => {
        sampleVectorGraphic([
          // Legs (Swatch 0: Wicker Wood #8d6e63)
          { type: "line", x1: 36, y1: 115, x2: 44, y2: 70, swatch: 0, weight: 2.0 },
          { type: "line", x1: 64, y1: 115, x2: 56, y2: 70, swatch: 0, weight: 2.0 },
          // Torso Outer Cage
          { type: "rect", x: 34, y: 35, w: 32, h: 35, swatch: 0, weight: 2.5 },
          // Torso Internal Crisscross Wicker Struts (Swatch 1: Heart Fire / Golden Straw)
          { type: "line", x1: 34, y1: 35, x2: 66, y2: 70, swatch: 1, weight: 2.0 },
          { type: "line", x1: 66, y1: 35, x2: 34, y2: 70, swatch: 1, weight: 2.0 },
          // Wide Ceremonial Outstretched Arms
          { type: "line", x1: 5, y1: 42, x2: 95, y2: 42, swatch: 0, weight: 3.5 },
          // Head Basket Cage
          { type: "circle", cx: 50, cy: 20, r: 12, swatch: 0, weight: 2.0 }
        ], out, n, swatchOut, 0.28, 16);
      }
    },

    // 5. The Spirit Veil (Twin Spiral Vortex)
    {
      id: "spiritVeil",
      drawSVG: `<path d="M6 22 C6 14, 18 14, 18 6 M18 22 C18 14, 6 14, 6 6" stroke="#00e5ff" stroke-width="2"/><circle cx="12" cy="14" r="2" fill="#fff"/>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.strokeStyle = "#00e5ff"; ctx.lineWidth = 2.5; ctx.beginPath();
        for (let t = 0; t <= Math.PI * 4; t += 0.1) {
          const y = cy + 22 - (t / (Math.PI * 4)) * 44;
          const x = cx + Math.sin(t) * 16;
          if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.strokeStyle = "#e1bee7"; ctx.beginPath();
        for (let t = 0; t <= Math.PI * 4; t += 0.1) {
          const y = cy + 22 - (t / (Math.PI * 4)) * 44;
          const x = cx + Math.sin(t + Math.PI) * 16;
          if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      },
      gen: (out, n, swatchOut) => {
        sampleVectorGraphic([
          { type: "path", d: "M 25 115 C 25 75, 75 75, 75 15", swatch: 0, weight: 3.0 },
          { type: "path", d: "M 75 115 C 75 75, 25 75, 25 15", swatch: 1, weight: 3.0 },
          { type: "circle", cx: 50, cy: 65, r: 14, swatch: 0, weight: 2.0 }
        ], out, n, swatchOut, 0.28, 16);
      }
    }
  ],

  // Page 2: Christmas & Winter Festival Showcase (Preserved)
  [
    {
      id: "xmasTree",
      drawSVG: `<polygon points="12,1 13,3 15,3 13.5,4.5 14,6.5 12,5 10,6.5 10.5,4.5 9,3 11,3" fill="#70e6ff"/><polygon points="12,6 15,10 13.5,10 17,14 15,14 19,19 5,19 9,14 7,14 10.5,10 9,10" stroke-width="1.5"/><rect x="10.5" y="19" width="3" height="4" stroke-width="1.5"/>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.strokeStyle = "#70e6ff"; ctx.lineWidth = 2.5; ctx.beginPath();
        ctx.fillStyle = "#ffd700"; ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
          const ox = cx + Math.cos(a) * 6, oy = (cy - 24) + Math.sin(a) * 6;
          if (i === 0) ctx.moveTo(ox, oy); else ctx.lineTo(ox, oy);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy - 18); ctx.lineTo(cx + 8, cy - 10); ctx.lineTo(cx + 5, cy - 10);
        ctx.lineTo(cx + 14, cy - 1); ctx.lineTo(cx + 9, cy - 1);
        ctx.lineTo(cx + 20, cy + 14); ctx.lineTo(cx - 20, cy + 14);
        ctx.lineTo(cx - 9, cy - 1); ctx.lineTo(cx - 14, cy - 1);
        ctx.lineTo(cx - 5, cy - 10); ctx.lineTo(cx - 8, cy - 10); ctx.closePath();
        ctx.strokeRect(cx - 3.5, cy + 14, 7, 8); ctx.stroke();
      },
      gen: (out, n, swatchOut) => {
        sampleVectorGraphic([
          { type: "polygon", points: "12,1 13,3 15,3 13.5,4.5 14,6.5 12,5 10,6.5 10.5,4.5 9,3 11,3", swatch: 0, weight: 1.5 },
          { type: "polygon", points: "12,6 15,10 13.5,10 17,14 15,14 19,19 5,19 9,14 7,14 10.5,10 9,10", swatch: 1, weight: 3.0 },
          { type: "rect", x: 10.5, y: 19, w: 3, h: 4, swatch: 2, weight: 1.0 }
        ], out, n, swatchOut, 1.8, 16);
      }
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
