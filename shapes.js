import * as THREE from "three";

export const GOLDEN = Math.PI * (3 - Math.sqrt(5));

// Universal Client-Side SVG Parser (Pure JS, Zero AI)
export function parseAndSampleSVG(svgString, out, count, swatchOut, scale = 0.28, altitude = 16, invertY = true) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const svgEl = doc.querySelector("svg");
  if (!svgEl) return;

  const paths = [];
  let totalLength = 0;

  // Extract all vector drawing primitives
  const elements = svgEl.querySelectorAll("path, polygon, polyline, line, rect, circle, ellipse");
  elements.forEach((el, elIdx) => {
    let p;
    const tag = el.tagName.toLowerCase();

    if (tag === "polygon" || tag === "polyline") {
      p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const rawPoints = el.getAttribute("points") || "";
      const pts = rawPoints.trim().split(/[\s,]+/).map(Number);
      if (pts.length >= 4) {
        let d = `M ${pts[0]} ${pts[1]}`;
        for (let i = 2; i < pts.length; i += 2) d += ` L ${pts[i]} ${pts[i + 1]}`;
        if (tag === "polygon") d += " Z";
        p.setAttribute("d", d);
      }
    } else if (tag === "line") {
      p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", `M ${el.getAttribute("x1")||0} ${el.getAttribute("y1")||0} L ${el.getAttribute("x2")||0} ${el.getAttribute("y2")||0}`);
    } else if (tag === "rect") {
      p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const x = parseFloat(el.getAttribute("x")||0), y = parseFloat(el.getAttribute("y")||0);
      const w = parseFloat(el.getAttribute("width")||0), h = parseFloat(el.getAttribute("height")||0);
      p.setAttribute("d", `M ${x} ${y} L ${x+w} ${y} L ${x+w} ${y+h} L ${x} ${y+h} Z`);
    } else if (tag === "circle") {
      p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const cx = parseFloat(el.getAttribute("cx")||0), cy = parseFloat(el.getAttribute("cy")||0), r = parseFloat(el.getAttribute("r")||0);
      p.setAttribute("d", `M ${cx-r} ${cy} A ${r} ${r} 0 1 0 ${cx+r} ${cy} A ${r} ${r} 0 1 0 ${cx-r} ${cy}`);
    } else if (tag === "ellipse") {
      p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const cx = parseFloat(el.getAttribute("cx")||0), cy = parseFloat(el.getAttribute("cy")||0);
      const rx = parseFloat(el.getAttribute("rx")||0), ry = parseFloat(el.getAttribute("ry")||0);
      p.setAttribute("d", `M ${cx-rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx+rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx-rx} ${cy}`);
    } else {
      p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", el.getAttribute("d") || "");
    }

    if (p) {
      const len = p.getTotalLength();
      if (len > 0) {
        // Map swatch index based on element index or fill/stroke attribute
        const fill = el.getAttribute("fill") || "";
        const swatch = fill.includes("#") ? (elIdx % 3) : (elIdx % 2);
        paths.push({ path: p, len, swatch });
        totalLength += len;
      }
    }
  });

  if (paths.length === 0) return;

  // Bounding box measurement
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const samplePts = [];

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
    samplePts.push({ x: pt.x, y: pt.y, swatch: selected.swatch });
    if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  for (let i = 0; i < count; i++) {
    const pt = samplePts[i];
    out[i * 3]     = (pt.x - cx) * scale;
    // Invert SVG Y axis so SVG is right-side up in Three.js sky
    out[i * 3 + 1] = invertY ? (altitude - (pt.y - cy) * scale) : (altitude + (pt.y - cy) * scale);
    out[i * 3 + 2] = 0.0; // Strictly single-layer
    if (swatchOut) swatchOut[i] = pt.swatch;
  }
}

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

// Continuous Vector Stroke Text Generator (Guaranteed Upright)
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
  // BLESSED on top (+Y), SAMHAIN below (-Y)
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
          paths.push({ path: p, len, swatch: (lineIdx % 2) });
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

// Built-in Raw SVG Vector Assets
export const RAW_SVGS = {
  // Scythe Agriculture (svgrepo.com/show/196385)
  scythe: `<svg viewBox="0 0 512 512">
    <path fill="#e0f7fa" d="M472.6,39.4C374.3,39.4,272.5,91.8,206.2,176.6c-18.4,23.6-32.9,50.1-43,78.2l76.7,30.7c8.5-22.6,20.4-43.8,35.3-62.7 c52.7-67.4,133.5-108.9,211.2-108.9c3.9,0,7.9,0.1,11.8,0.3L512,41.2C498.9,40,485.8,39.4,472.6,39.4z"/>
    <path fill="#5d4037" d="M72.2,498.4l148.6-371.5c3.2-8,12.2-12,20.2-8.8c8,3.2,12,12.2,8.8,20.2L101.2,510c-3.2,8-12.2,12-20.2,8.8 C73,515.6,69,506.4,72.2,498.4z"/>
    <rect fill="#8d6e63" x="145" y="270" width="16" height="58" transform="rotate(-68 153 299)"/>
    <rect fill="#8d6e63" x="195" y="160" width="16" height="58" transform="rotate(-68 203 189)"/>
  </svg>`,

  // Wheat Barley (svgrepo.com/show/211999)
  wheat: `<svg viewBox="0 0 512 512">
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

  // Traditional Turnip Lantern
  turnip: `<svg viewBox="0 0 100 120">
    <polygon points="50,12 82,34 96,72 68,112 32,112 4,72 18,34" fill="#a1887f"/>
    <path d="M 50 12 C 45 -4, 30 -8, 25 -14 M 50 12 C 55 -6, 68 -6, 75 -12 M 50 12 L 50 -12" stroke="#689f38" stroke-width="3"/>
    <polygon points="26,44 44,58 26,62" fill="#ffab00"/>
    <polygon points="74,44 56,58 74,62" fill="#ffab00"/>
    <polygon points="50,62 56,74 44,74" fill="#ffab00"/>
    <path d="M 20 84 L 30 96 L 40 84 L 50 98 L 60 84 L 70 96 L 80 84 L 72 104 L 60 92 L 50 106 L 40 92 L 28 104 Z" fill="#ffab00"/>
  </svg>`,

  // Wicker Man Effigy
  wickerMan: `<svg viewBox="0 0 100 120">
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
  // Page 1: Samhain Festival (Native SVG Implementations)
  [
    {
      id: "scytheAgriculture",
      drawSVG: `<path d="M4 20 L18 6 M18 6 C22 4, 24 9, 20 12" stroke="#e0f7fa" stroke-width="2"/><line x1="4" y1="20" x2="16" y2="8" stroke="#5d4037" stroke-width="3"/>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx - 16, cy + 22); ctx.lineTo(cx + 10, cy - 14); ctx.stroke();
        ctx.strokeStyle = "#e0f7fa"; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(cx + 10, cy - 14); ctx.bezierCurveTo(cx + 24, cy - 22, cx + 22, cy - 2, cx + 8, cy - 4); ctx.stroke();
      },
      gen: (out, n, swatchOut) => parseAndSampleSVG(RAW_SVGS.scythe, out, n, swatchOut, 0.065, 16)
    },
    {
      id: "wheatBarley",
      drawSVG: `<line x1="12" y1="22" x2="12" y2="10" stroke="#5d4037" stroke-width="2"/><path d="M12 10 C8 8, 8 4, 12 2 C16 4, 16 8, 12 10 Z" fill="#ffb300"/><circle cx="9" cy="13" r="2" fill="#ffb300"/><circle cx="15" cy="13" r="2" fill="#ffb300"/>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.strokeStyle = "#ffb300"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(cx, cy + 22); ctx.lineTo(cx, cy - 18); ctx.stroke();
        for (let y = -14; y <= 10; y += 7) {
          ctx.strokeRect(cx - 6, cy + y, 12, 5);
        }
      },
      gen: (out, n, swatchOut) => parseAndSampleSVG(RAW_SVGS.wheat, out, n, swatchOut, 0.065, 15)
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
      gen: (out, n, swatchOut) => parseAndSampleSVG(RAW_SVGS.turnip, out, n, swatchOut, 0.28, 16)
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
      gen: (out, n, swatchOut) => parseAndSampleSVG(RAW_SVGS.wickerMan, out, n, swatchOut, 0.28, 16)
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
