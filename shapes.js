import * as THREE from "three";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";

export const GOLDEN = Math.PI * (3 - Math.sqrt(5));

// Universal Vector Graphic to Drone Converter (Strict Single-Layer Z = 0)
export function sampleVectorGraphic(svgElements, out, count, swatchOut, scale = 0.28, altitude = 16) {
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

  // Single-layer projection: Z is strictly 0.0
  for (let i = 0; i < count; i++) {
    const pt = samplePts[i];
    out[i * 3]     = (pt.x - cx) * scale;
    out[i * 3 + 1] = altitude + (pt.y - cy) * scale;
    out[i * 3 + 2] = 0.0;
    if (swatchOut) swatchOut[i] = pt.swatch;
  }
}

// Continuous Arc-Length Vector Stroke Font Engine (Full Alphabet)
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
  '?': "M 0.1 1.05 C 0.1 1.45 0.8 1.45 0.8 1.05 C 0.8 0.7 0.45 0.7 0.45 0.35 M 0.45 0 L 0.45 0.1",
  '-': "M 0.1 0.7 L 0.7 0.7"
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
  const elements = [];

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
        // Transform normalized glyph path to line/xOffset
        const transformedD = d.replace(/([0-9\.\-]+)\s+([0-9\.\-]+)/g, (_, x, y) => {
          const nx = (parseFloat(x) + xOffset).toFixed(3);
          const ny = (parseFloat(y) + yOffset).toFixed(3);
          return `${nx} ${ny}`;
        });
        elements.push({ type: "path", d: transformedD, swatch: (charIdx % 2 === 0 ? 0 : 1), weight: 1.0 });
      }
    });
  });

  if (elements.length === 0) {
    elements.push({ type: "line", x1: -5, y1: 0, x2: 5, y2: 0, swatch: 0 });
  }

  // Sample along continuous vector arc length
  sampleVectorGraphic(elements, out, count, null, scale * 6.5, altitude);
}

export function sampleCompositePrimitives(primitives, count, out, swatchOut, baseAltitude = 14) {
  if (!primitives || primitives.length === 0) return;
  const areas = [];
  let totalArea = 0;
  for (const p of primitives) {
    p.mesh.updateWorldMatrix(true, false);
    const geom = p.mesh.geometry;
    if (!geom.boundingBox) geom.computeBoundingBox();
    const size = new THREE.Vector3();
    geom.boundingBox.getSize(size);
    size.multiply(p.mesh.scale);
    const area = 2 * (size.x * size.y + size.y * size.z + size.z * size.x) || 1.0;
    areas.push(area);
    totalArea += area;
  }

  let ptr = 0;
  const tempV = new THREE.Vector3();

  for (let idx = 0; idx < primitives.length; idx++) {
    const p = primitives[idx];
    const pCount = (idx === primitives.length - 1)
      ? (count - ptr)
      : Math.max(12, Math.round((areas[idx] / totalArea) * count));

    const meshClone = p.mesh.clone();
    meshClone.applyMatrix4(p.mesh.matrixWorld);
    const sampler = new MeshSurfaceSampler(meshClone).build();

    for (let i = 0; i < pCount && ptr < count; i++) {
      sampler.sample(tempV);
      out[ptr * 3]     = tempV.x;
      out[ptr * 3 + 1] = tempV.y;
      out[ptr * 3 + 2] = tempV.z;
      if (swatchOut) swatchOut[ptr] = p.swatchIdx || 0;
      ptr++;
    }
  }
}

export const SHAPE_PAGES = [
  // Page 1: Samhain Festival (Single-Layer High-Density Vector Art)
  [
    // 1. Traditional Carved Turnip Lantern (Rich Root Wrinkles, Greens & Menacing Fangs)
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
          // Heavy root contour silhouette (Swatch 0: Earth Root Bone #a1887f)
          { type: "polygon", points: "50,12 82,34 96,72 68,112 32,112 4,72 18,34", swatch: 0, weight: 2.2 },
          // Top turnip stem & sprout greens (Swatch 2: Stem Green #689f38)
          { type: "path", d: "M 50 12 C 45 -4, 30 -8, 25 -14 M 50 12 C 55 -6, 68 -6, 75 -12 M 50 12 L 50 -12", swatch: 2, weight: 1.5 },
          // Lower fibrous root tendrils extending downward (Swatch 0)
          { type: "path", d: "M 42 112 C 40 124, 32 130, 28 138 M 58 112 C 60 124, 68 130, 72 138 M 50 112 L 50 142", swatch: 0, weight: 1.5 },
          // Internal root skin wrinkles (Swatch 0)
          { type: "path", d: "M 16 52 C 28 56, 32 64, 32 64 M 84 52 C 72 56, 68 64, 68 64 M 20 86 C 30 92, 38 92, 42 98", swatch: 0, weight: 1.2 },
          // Left Carved Slanted Eye & Brow Ridge (Swatch 1: Candle Flame #ffab00)
          { type: "polygon", points: "26,44 44,58 26,62", swatch: 1, weight: 1.8 },
          { type: "line", x1: 22, y1: 40, x2: 48, y2: 54, swatch: 1, weight: 1.2 },
          // Right Carved Slanted Eye & Brow Ridge (Swatch 1)
          { type: "polygon", points: "74,44 56,58 74,62", swatch: 1, weight: 1.8 },
          { type: "line", x1: 78, y1: 40, x2: 52, y2: 54, swatch: 1, weight: 1.2 },
          // Triangular Carved Nose Hole (Swatch 1)
          { type: "polygon", points: "50,62 56,74 44,74", swatch: 1, weight: 1.2 },
          // Wide Serrated Mouth with Alternating Fangs (Swatch 1)
          { type: "path", d: "M 20 84 L 30 96 L 40 84 L 50 98 L 60 84 L 70 96 L 80 84 L 72 104 L 60 92 L 50 106 L 40 92 L 28 104 Z", swatch: 1, weight: 3.2 }
        ], out, n, swatchOut, 0.26, 16);
      }
    },

    // 2. Intricate 6-Fold Dendritic Crystalline Snowflake
    {
      id: "snowflake",
      drawSVG: `<line x1="12" y1="2" x2="12" y2="22" stroke-width="1.5"/><line x1="2" y1="12" x2="22" y2="12" stroke-width="1.5"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1" stroke-width="1.5"/><line x1="4.9" y1="19.1" x2="19.1" y2="4.9" stroke-width="1.5"/><polygon points="12,7 16,12 12,17 8,12" stroke-width="1.5"/>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.strokeStyle = "#70e6ff"; ctx.lineWidth = 2.5;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26);
          const mx = cx + Math.cos(a) * 16, my = cy + Math.sin(a) * 16;
          const a1 = a + Math.PI / 3, a2 = a - Math.PI / 3;
          ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(a1) * 9, my + Math.sin(a1) * 9);
          ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(a2) * 9, my + Math.sin(a2) * 9);
          ctx.stroke();
        }
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const x = cx + Math.cos(a) * 9, y = cy + Math.sin(a) * 9;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.stroke();
      },
      gen: (out, n, swatchOut) => {
        const elements = [];
        // Inner Hexagonal Core Star (Swatch 0: Ice White)
        let innerPoly = "";
        let outerPoly = "";
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          innerPoly += `${(50 + Math.cos(a) * 10).toFixed(1)},${(50 + Math.sin(a) * 10).toFixed(1)} `;
          outerPoly += `${(50 + Math.cos(a) * 20).toFixed(1)},${(50 + Math.sin(a) * 20).toFixed(1)} `;
        }
        elements.push({ type: "polygon", points: innerPoly.trim(), swatch: 0, weight: 1.5 });
        elements.push({ type: "polygon", points: outerPoly.trim(), swatch: 1, weight: 1.8 });

        // 6 Main Dual-Rail Spines with 3 Heavy Chevron Tiers (Swatch 1: Cyan)
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const cos = Math.cos(a), sin = Math.sin(a);
          const x2 = 50 + cos * 46;
          const y2 = 50 + sin * 46;

          // Main heavy spine
          elements.push({ type: "line", x1: 50, y1: 50, x2, y2, swatch: 0, weight: 2.2 });

          // 3 Distinct Tiers of Feathered Chevrons
          const tiers = [18, 28, 38];
          const lengths = [10, 13, 9];

          tiers.forEach((dist, tIdx) => {
            const bx = 50 + cos * dist;
            const by = 50 + sin * dist;
            const cLen = lengths[tIdx];

            const aLeft = a + Math.PI / 3;
            const aRight = a - Math.PI / 3;

            elements.push({ type: "line", x1: bx, y1: by, x2: bx + Math.cos(aLeft) * cLen, y2: by + Math.sin(aLeft) * cLen, swatch: 1, weight: 1.6 });
            elements.push({ type: "line", x1: bx, y1: by, x2: bx + Math.cos(aRight) * cLen, y2: by + Math.sin(aRight) * cLen, swatch: 1, weight: 1.6 });

            // Sub-barbs on the middle chevron for rich dendritic detail
            if (tIdx === 1) {
              const subBxL = bx + Math.cos(aLeft) * (cLen * 0.55);
              const subByL = by + Math.sin(aLeft) * (cLen * 0.55);
              elements.push({ type: "line", x1: subBxL, y1: subByL, x2: subBxL + cos * 4, y2: subByL + sin * 4, swatch: 1, weight: 1.0 });

              const subBxR = bx + Math.cos(aRight) * (cLen * 0.55);
              const subByR = by + Math.sin(aRight) * (cLen * 0.55);
              elements.push({ type: "line", x1: subBxR, y1: subByR, x2: subBxR + cos * 4, y2: subByR + sin * 4, swatch: 1, weight: 1.0 });
            }
          });

          // Outer Diamond Arrowhead Tips
          const tipX = 50 + cos * 43;
          const tipY = 50 + sin * 43;
          elements.push({ type: "polygon", points: `${x2},${y2} ${tipX + sin * 3},${tipY - cos * 3} ${50 + cos * 48},${50 + sin * 48} ${tipX - sin * 3},${tipY + cos * 3}`, swatch: 1, weight: 1.4 });
        }

        sampleVectorGraphic(elements, out, n, swatchOut, 0.32, 16);
      }
    },

    // 3. Scythe & Ripe Wheat Sheaves with Tie Ribbon
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
          // Heavy Curved Scythe Blade with Backing Ridge (Swatch 0: Silver Steel #e0f7fa)
          { type: "path", d: "M 70 34 C 112 16, 124 52, 94 72 C 72 82, 52 70, 52 70 C 64 68, 88 64, 82 48 C 78 38, 70 34, 70 34 Z", swatch: 0, weight: 3.2 },
          // Wooden Snath Handle with 2 Nibs / Hand Pegs (Swatch 2: Dark Timber #5d4037)
          { type: "line", x1: 18, y1: 114, x2: 72, y2: 34, swatch: 2, weight: 2.2 },
          { type: "line", x1: 38, y1: 86, x2: 30, y2: 80, swatch: 2, weight: 1.5 },
          { type: "line", x1: 52, y1: 64, x2: 44, y2: 58, swatch: 2, weight: 1.5 },
          // Sheaf of 5 Wheat Stalks with Bearded Awn Heads (Swatch 1: Harvest Gold #ffb300)
          { type: "path", d: "M 32 114 C 32 82, 40 70, 40 50 M 36 56 L 44 52 M 44 48 L 36 44 M 40 42 L 35 34", swatch: 1, weight: 1.8 },
          { type: "path", d: "M 44 114 C 44 82, 52 70, 52 46 M 48 52 L 56 48 M 56 44 L 48 40 M 52 38 L 47 30", swatch: 1, weight: 1.8 },
          { type: "path", d: "M 56 114 C 56 82, 64 70, 64 48 M 60 54 L 68 50 M 68 46 L 60 42 M 64 40 L 59 32", swatch: 1, weight: 1.8 },
          { type: "path", d: "M 68 114 C 68 88, 74 76, 74 58 M 70 64 L 78 60 M 78 56 L 70 52 M 74 50 L 70 42", swatch: 1, weight: 1.8 },
          // Central Sheaf Binding Ribbon Bow (Swatch 0: Red/Amber Ribbon)
          { type: "rect", x: 28, y: 76, w: 46, h: 6, swatch: 0, weight: 1.6 }
        ], out, n, swatchOut, 0.28, 16);
      }
    },

    // 4. The Wicker Man Titan (Anthropomorphic Lattice with Splayed 4-Finger Hands)
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
          // Heavy Timber Legs with Bracing (Swatch 0: Wicker Wood #8d6e63)
          { type: "line", x1: 34, y1: 118, x2: 44, y2: 72, swatch: 0, weight: 2.5 },
          { type: "line", x1: 66, y1: 118, x2: 56, y2: 72, swatch: 0, weight: 2.5 },
          { type: "line", x1: 38, y1: 94, x2: 62, y2: 94, swatch: 0, weight: 1.5 },
          // Torso Outer Basket Cage (Swatch 0)
          { type: "rect", x: 32, y: 34, w: 36, h: 38, swatch: 0, weight: 2.8 },
          // Internal Crisscross Structural Weave (Swatch 1: Glowing Golden Straw #ffd54f)
          { type: "line", x1: 32, y1: 34, x2: 68, y2: 72, swatch: 1, weight: 2.0 },
          { type: "line", x1: 68, y1: 34, x2: 32, y2: 72, swatch: 1, weight: 2.0 },
          { type: "line", x1: 32, y1: 53, x2: 68, y2: 53, swatch: 1, weight: 1.8 },
          { type: "line", x1: 50, y1: 34, x2: 50, y2: 72, swatch: 1, weight: 1.8 },
          // Wide Ceremonial Outstretched Arms (Swatch 0)
          { type: "line", x1: 8, y1: 42, x2: 92, y2: 42, swatch: 0, weight: 3.2 },
          // Splayed 4-Finger Wooden Hands at each arm tip (Swatch 1)
          { type: "path", d: "M 8 42 L 2 34 M 8 42 L 0 40 M 8 42 L 0 46 M 8 42 L 3 52", swatch: 1, weight: 2.0 },
          { type: "path", d: "M 92 42 L 98 34 M 92 42 L 100 40 M 92 42 L 100 46 M 92 42 L 97 52", swatch: 1, weight: 2.0 },
          // Woven Head Cage with Twig Headdress (Swatch 0)
          { type: "circle", cx: 50, cy: 18, r: 12, swatch: 0, weight: 2.2 },
          { type: "path", d: "M 44 7 L 40 -2 M 50 6 L 50 -4 M 56 7 L 60 -2", swatch: 1, weight: 1.5 }
        ], out, n, swatchOut, 0.28, 16);
      }
    },

    // 5. The Dying Celtic Oak
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
          // Heavy Gnarled Trunk with Ground Root Spurs (Swatch 0: Bark Brown #5d4037)
          { type: "path", d: "M 44 116 L 46 72 M 56 116 L 54 72 M 44 116 L 32 124 M 56 116 L 68 124", swatch: 0, weight: 3.2 },
          // 5 Major Twisted Sprawling Limbs
          { type: "path", d: "M 50 72 C 34 56, 14 60, 8 34 M 50 72 C 66 56, 86 60, 92 34 M 50 56 C 38 42, 44 26, 28 10 M 50 56 C 62 42, 56 26, 72 10 M 50 46 L 50 14", swatch: 0, weight: 3.0 },
          // Falling Autumn Leaves (Swatch 1: Crimson Orange #ff6d00)
          { type: "circle", cx: 8, cy: 32, r: 8, swatch: 1, weight: 1.5 },
          { type: "circle", cx: 92, cy: 32, r: 8, swatch: 1, weight: 1.5 },
          { type: "circle", cx: 28, cy: 10, r: 8, swatch: 1, weight: 1.5 },
          { type: "circle", cx: 72, cy: 10, r: 8, swatch: 1, weight: 1.5 },
          { type: "circle", cx: 50, cy: 12, r: 6, swatch: 1, weight: 1.2 }
        ], out, n, swatchOut, 0.28, 16);
      }
    }
  ],

  // Page 2: Christmas & Winter Festival Showcase (Preserved & Rebalanced)
  [
    // 3-Axis Red & Yellow Gift Box (68% Ribbon Drones, Balanced Crosses on Every Face)
    {
      id: "giftBox3D",
      drawSVG: `<rect x="3" y="3" width="18" height="18" rx="2" stroke="#d50000" stroke-width="2"/><line x1="12" y1="3" x2="12" y2="21" stroke="#ffe600" stroke-width="3"/><line x1="3" y1="12" x2="21" y2="12" stroke="#ffe600" stroke-width="3"/>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.strokeStyle = "#d50000"; ctx.lineWidth = 3;
        ctx.strokeRect(cx - 18, cy - 14, 36, 36);
        ctx.strokeStyle = "#ffe600"; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(cx, cy - 14); ctx.lineTo(cx, cy + 22); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 18, cy + 4); ctx.lineTo(cx + 18, cy + 4); ctx.stroke();
      },
      gen: (out, n, swatchOut) => {
        let ptr = 0;
        const H = 6.0;
        const boxCenterY = 13.5;

        // Clean Red Cube Wireframe (Swatch 0: Crimson Red #d50000, 28% of drones)
        const edgePoints = Math.round((n * 0.28) / 12);
        const edges = [
          { p0: [-H, boxCenterY + H, -H], p1: [H, boxCenterY + H, -H] },
          { p0: [H, boxCenterY + H, -H],  p1: [H, boxCenterY + H, H] },
          { p0: [H, boxCenterY + H, H],   p1: [-H, boxCenterY + H, H] },
          { p0: [-H, boxCenterY + H, H],  p1: [-H, boxCenterY + H, -H] },
          { p0: [-H, boxCenterY - H, -H], p1: [H, boxCenterY - H, -H] },
          { p0: [H, boxCenterY - H, -H],  p1: [H, boxCenterY - H, H] },
          { p0: [H, boxCenterY - H, H],   p1: [-H, boxCenterY - H, H] },
          { p0: [-H, boxCenterY - H, H],  p1: [-H, boxCenterY - H, -H] },
          { p0: [-H, boxCenterY - H, -H], p1: [-H, boxCenterY + H, -H] },
          { p0: [H, boxCenterY - H, -H],  p1: [H, boxCenterY + H, -H] },
          { p0: [H, boxCenterY - H, H],   p1: [H, boxCenterY + H, H] },
          { p0: [-H, boxCenterY - H, H],  p1: [-H, boxCenterY + H, H] }
        ];

        for (const edge of edges) {
          for (let i = 0; i < edgePoints; i++) {
            const u = i / edgePoints;
            out[ptr * 3]     = edge.p0[0] + (edge.p1[0] - edge.p0[0]) * u;
            out[ptr * 3 + 1] = edge.p0[1] + (edge.p1[1] - edge.p0[1]) * u;
            out[ptr * 3 + 2] = edge.p0[2] + (edge.p1[2] - edge.p0[2]) * u;
            if (swatchOut) swatchOut[ptr] = 0;
            ptr++;
          }
        }

        // Heavy Electric Yellow Ribbons (Swatch 1: Electric Yellow #ffe600, 72% of drones)
        // 3-Axis Orthogonal Loops so every single face has a cross:
        // Band 1: Vertical perimeter loop wrapping X = 0
        const ribbon1Count = Math.round(n * 0.18);
        for (let i = 0; i < ribbon1Count; i++) {
          const u = (i / ribbon1Count) * 4;
          let y = 0, z = 0;
          if (u < 1) { y = boxCenterY + H + 0.2; z = -H + u * 2 * H; }
          else if (u < 2) { y = (boxCenterY + H) - (u - 1) * 2 * H; z = H + 0.2; }
          else if (u < 3) { y = boxCenterY - H - 0.2; z = H - (u - 2) * 2 * H; }
          else { y = (boxCenterY - H) + (u - 3) * 2 * H; z = -H - 0.2; }
          out[ptr * 3]     = (i % 2 === 0 ? 0.75 : -0.75);
          out[ptr * 3 + 1] = y;
          out[ptr * 3 + 2] = z;
          if (swatchOut) swatchOut[ptr] = 1;
          ptr++;
        }

        // Band 2: Vertical perimeter loop wrapping Z = 0
        const ribbon2Count = Math.round(n * 0.18);
        for (let i = 0; i < ribbon2Count; i++) {
          const u = (i / ribbon2Count) * 4;
          let x = 0, y = 0;
          if (u < 1) { x = -H + u * 2 * H; y = boxCenterY + H + 0.2; }
          else if (u < 2) { x = H + 0.2; y = (boxCenterY + H) - (u - 1) * 2 * H; }
          else if (u < 3) { x = H - (u - 2) * 2 * H; y = boxCenterY - H - 0.2; }
          else { x = -H - 0.2; y = (boxCenterY - H) + (u - 3) * 2 * H; }
          out[ptr * 3]     = x;
          out[ptr * 3 + 1] = y;
          out[ptr * 3 + 2] = (i % 2 === 0 ? 0.75 : -0.75);
          if (swatchOut) swatchOut[ptr] = 1;
          ptr++;
        }

        // Band 3: Horizontal perimeter loop wrapping Y = boxCenterY
        const ribbon3Count = Math.round(n * 0.18);
        for (let i = 0; i < ribbon3Count; i++) {
          const u = (i / ribbon3Count) * 4;
          let x = 0, z = 0;
          if (u < 1) { x = -H + u * 2 * H; z = H + 0.2; }
          else if (u < 2) { x = H + 0.2; z = H - (u - 1) * 2 * H; }
          else if (u < 3) { x = H - (u - 2) * 2 * H; z = -H - 0.2; }
          else { x = -H - 0.2; z = -H + (u - 3) * 2 * H; }
          out[ptr * 3]     = x;
          out[ptr * 3 + 1] = boxCenterY + (i % 2 === 0 ? 0.75 : -0.75);
          out[ptr * 3 + 2] = z;
          if (swatchOut) swatchOut[ptr] = 1;
          ptr++;
        }

        // Lush 8-Loop Rosette Bow on Top
        while (ptr < n) {
          const loopIdx = ptr % 8;
          const a = (loopIdx / 8) * Math.PI * 2;
          const u = ((n - ptr) / 45) * Math.PI * 2;
          const r = Math.sin(u) * 3.6;

          out[ptr * 3]     = Math.cos(a) * (Math.abs(Math.cos(u)) * 4.2 + 0.6);
          out[ptr * 3 + 1] = (boxCenterY + H + 0.4) + Math.abs(r);
          out[ptr * 3 + 2] = Math.sin(a) * (Math.abs(Math.cos(u)) * 4.2 + 0.6);
          if (swatchOut) swatchOut[ptr] = 1;
          ptr++;
        }
      }
    },

    // 3D Conical Christmas Tree with Star
    {
      id: "xmasTree",
      drawSVG: `<polygon points="12,1 13,3 15,3 13.5,4.5 14,6.5 12,5 10,6.5 10.5,4.5 9,3 11,3" fill="#70e6ff"/><polygon points="12,6 15,10 13.5,10 17,14 15,14 19,19 5,19 9,14 7,14 10.5,10 9,10" stroke-width="1.5"/><rect x="10.5" y="19" width="3" height="4" stroke-width="1.5"/>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.strokeStyle = "#70e6ff"; ctx.lineWidth = 2.5; ctx.beginPath();
        ctx.fillStyle = "#ffd700";
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
          const aInner = a + Math.PI / 5;
          const ox = cx + Math.cos(a) * 6, oy = (cy - 24) + Math.sin(a) * 6;
          const ix = cx + Math.cos(aInner) * 2.5, iy = (cy - 24) + Math.sin(aInner) * 2.5;
          if (i === 0) ctx.moveTo(ox, oy); else ctx.lineTo(ox, oy);
          ctx.lineTo(ix, iy);
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
        const starCount = Math.max(12, Math.round(n * 0.07));
        const trunkCount = Math.max(16, Math.round(n * 0.12));
        const foliageCount = n - starCount - trunkCount;
        let ptr = 0;

        const starCenterY = 24.5;
        const starR = 2.2;
        for (let i = 0; i < starCount; i++) {
          const angle = (i / starCount) * Math.PI * 4;
          const isTip = i % 2 === 0;
          const r = isTip ? starR : starR * 0.45;
          out[ptr * 3]     = Math.cos(angle) * r;
          out[ptr * 3 + 1] = starCenterY + Math.sin(angle) * r;
          out[ptr * 3 + 2] = (i % 3 === 0 ? 0.7 : -0.7) * (1 - (r / starR) * 0.5);
          if (swatchOut) swatchOut[ptr] = 0;
          ptr++;
        }

        const tiers = [
          { count: Math.round(foliageCount * 0.25), yBase: 17.5, h: 6.5, rBase: 4.2 },
          { count: Math.round(foliageCount * 0.35), yBase: 12.0, h: 7.5, rBase: 7.2 },
          { count: foliageCount - Math.round(foliageCount * 0.25) - Math.round(foliageCount * 0.35), yBase: 6.5, h: 8.5, rBase: 10.2 }
        ];

        for (const tier of tiers) {
          for (let i = 0; i < tier.count; i++) {
            const v = Math.sqrt((i + 0.5) / tier.count);
            const y = tier.yBase + v * tier.h;
            let r = tier.rBase * (1.0 - v * 0.92);
            const theta = i * GOLDEN;
            const isLight = (i % 9 === 2 || i % 9 === 7);
            if (isLight) {
              r *= 1.06;
              if (swatchOut) swatchOut[ptr] = (i % 2 === 0) ? 3 : 4;
            } else {
              if (swatchOut) swatchOut[ptr] = 1;
            }
            out[ptr * 3]     = Math.cos(theta) * r;
            out[ptr * 3 + 1] = y;
            out[ptr * 3 + 2] = Math.sin(theta) * r;
            ptr++;
          }
        }

        const trunkYBase = 2.0;
        const trunkHeight = 5.0;
        const trunkRadius = 1.8;
        for (let i = 0; i < trunkCount; i++) {
          const u = i / trunkCount;
          const y = trunkYBase + u * trunkHeight;
          const theta = i * GOLDEN;
          out[ptr * 3]     = Math.cos(theta) * trunkRadius;
          out[ptr * 3 + 1] = y;
          out[ptr * 3 + 2] = Math.sin(theta) * trunkRadius;
          if (swatchOut) swatchOut[ptr] = 2;
          ptr++;
        }
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
