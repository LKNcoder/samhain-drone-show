import * as THREE from "three";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function generateBalancedGrid(out, count, width = 32, height = 20, altitude = 14) {
  const aspect = width / height;
  const R = Math.max(2, Math.round(Math.sqrt(count / aspect)));
  const Cbase = Math.floor(count / R);
  const remainder = count % R;

  let droneIdx = 0;
  for (let r = 0; r < R; r++) {
    const numInRow = r < remainder ? (Cbase + 1) : Cbase;
    const y = (r / (R - 1) - 0.5) * height + altitude;

    for (let c = 0; c < numInRow; c++) {
      const x = numInRow > 1 ? (c / (numInRow - 1) - 0.5) * width : 0;
      out[droneIdx * 3]     = x;
      out[droneIdx * 3 + 1] = y;
      out[droneIdx * 3 + 2] = 0;
      droneIdx++;
    }
  }
}

export function sampleSVGString(svgD, out, count, scale = 0.24, altitude = 14) {
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", svgD);
  const totalLength = p.getTotalLength();
  if (!totalLength) return;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const rawPts = [];
  for (let i = 0; i < count; i++) {
    const pt = p.getPointAtLength((i / count) * totalLength);
    rawPts.push(pt);
    if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  for (let i = 0; i < count; i++) {
    const pt = rawPts[i];
    out[i * 3]     = (pt.x - cx) * scale;
    out[i * 3 + 1] = altitude - (pt.y - cy) * scale;
    out[i * 3 + 2] = (i % 2 === 0 ? 1 : -1) * 1.2;
  }
}

export function generateTextDrones(out, text, count, font = "Impact", scale = 0.28, altitude = 14) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold 60px ${font}, sans-serif`;
  ctx.fillText(text.trim() || "SAMHAIN", 256, 64);

  const imgData = ctx.getImageData(0, 0, 512, 128).data;
  const validPixels = [];
  for (let y = 0; y < 128; y += 2) {
    for (let x = 0; x < 512; x += 2) {
      if (imgData[(y * 512 + x) * 4] > 110) {
        validPixels.push({ x: x - 256, y: 64 - y });
      }
    }
  }

  if (validPixels.length === 0) {
    for (let i = 0; i < count; i++) {
      out[i * 3]     = (Math.random() - 0.5) * 24;
      out[i * 3 + 1] = altitude;
      out[i * 3 + 2] = 0;
    }
    return;
  }

  const step = validPixels.length / count;
  for (let i = 0; i < count; i++) {
    const pt = validPixels[Math.floor(i * step) % validPixels.length];
    out[i * 3]     = pt.x * scale;
    out[i * 3 + 1] = altitude + pt.y * scale;
    out[i * 3 + 2] = (i % 2 === 0 ? 0.35 : -0.35);
  }
}

export function sampleCompositePrimitives(primitives, count, out, swatchOut, baseAltitude = 14) {
  if (!primitives || primitives.length === 0) {
    generateBalancedGrid(out, count, 24, 16, baseAltitude);
    return;
  }

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

  while (ptr < count) {
    out[ptr * 3]     = out[(ptr - 1) * 3] + 0.1;
    out[ptr * 3 + 1] = out[(ptr - 1) * 3 + 1];
    out[ptr * 3 + 2] = out[(ptr - 1) * 3 + 2];
    if (swatchOut) swatchOut[ptr] = 0;
    ptr++;
  }
}

export const SHAPE_PAGES = [
  // Page 1: Samhain Pagan Festival Pack
  [
    // 1. Scythe & Golden Wheat Stalks
    {
      id: "scytheAndWheat",
      drawSVG: `<path d="M4 20 L18 6 M18 6 C22 4, 24 9, 20 12 C16 14, 12 12, 12 12" stroke-width="2"/><path d="M7 21 C7 16, 9 14, 9 11 M11 21 C11 16, 13 14, 13 11" stroke="#ffb300" stroke-width="2"/>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.strokeStyle = "#8d6e63"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx - 16, cy + 22); ctx.lineTo(cx + 10, cy - 14); ctx.stroke();
        ctx.strokeStyle = "#e0f7fa"; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(cx + 10, cy - 14); ctx.bezierCurveTo(cx + 24, cy - 22, cx + 22, cy - 2, cx + 8, cy - 4); ctx.stroke();
        ctx.strokeStyle = "#ffb300"; ctx.lineWidth = 2.5;
        for (let x = -10; x <= 6; x += 4) {
          ctx.beginPath(); ctx.moveTo(cx + x, cy + 22); ctx.lineTo(cx + x, cy + 4); ctx.stroke();
        }
      },
      gen: (out, n, swatchOut) => {
        let ptr = 0;
        const bladeCount = Math.round(n * 0.28);
        const handleCount = Math.round(n * 0.18);
        const wheatCount = n - bladeCount - handleCount;

        // Scythe Crescent Blade (Swatch 0: Silver Steel #e0f7fa)
        for (let i = 0; i < bladeCount; i++) {
          const u = i / bladeCount;
          const a = 0.2 + u * Math.PI * 0.75;
          const r = 14.5 - u * 3.5;
          const bx = 2.0 + Math.cos(a) * r;
          const by = 13.0 + Math.sin(a) * (r * 1.1);
          out[ptr * 3]     = bx;
          out[ptr * 3 + 1] = by;
          out[ptr * 3 + 2] = (i % 2 === 0 ? 0.4 : -0.4);
          if (swatchOut) swatchOut[ptr] = 0;
          ptr++;
        }

        // Scythe Wooden Snath/Handle (Swatch 2: Dark Timber #5d4037)
        for (let i = 0; i < handleCount; i++) {
          const u = i / handleCount;
          out[ptr * 3]     = -16.0 + u * 24.0;
          out[ptr * 3 + 1] = 2.0 + u * 20.0 + Math.sin(u * Math.PI) * 1.5;
          out[ptr * 3 + 2] = 0;
          if (swatchOut) swatchOut[ptr] = 2;
          ptr++;
        }

        // 5 Sheaves of Ripe Grain & Wheat (Swatch 1: Harvest Gold #ffb300)
        const stalks = [-12, -6, 0, 6, 12];
        const perStalk = Math.floor(wheatCount / stalks.length);
        for (let s = 0; s < stalks.length; s++) {
          const sx = stalks[s];
          for (let i = 0; i < perStalk; i++) {
            const u = i / perStalk;
            let x = sx + Math.sin(u * 2.0 + s) * 1.2;
            let y = 1.0 + u * 12.0;
            let z = (s % 2 === 0 ? 1 : -1) * 1.2;
            if (u > 0.7) {
              const headProg = (u - 0.7) / 0.3;
              x += Math.sin(headProg * Math.PI * 4) * 1.5;
              y += headProg * 2.5;
            }
            out[ptr * 3]     = x;
            out[ptr * 3 + 1] = y;
            out[ptr * 3 + 2] = z;
            if (swatchOut) swatchOut[ptr] = 1;
            ptr++;
          }
        }
        while (ptr < n) {
          out[ptr * 3] = out[(ptr - 1) * 3];
          out[ptr * 3 + 1] = out[(ptr - 1) * 3 + 1];
          out[ptr * 3 + 2] = out[(ptr - 1) * 3 + 2];
          if (swatchOut) swatchOut[ptr] = 1;
          ptr++;
        }
      }
    },

    // 2. The Gnarled Celtic Oak with Falling Leaves
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
        let ptr = 0;
        const trunkCount = Math.round(n * 0.28);
        const boughCount = Math.round(n * 0.38);
        const foliageCount = n - trunkCount - boughCount;

        // Massive Gnarled Trunk (Swatch 0: Bark Brown #5d4037)
        for (let i = 0; i < trunkCount; i++) {
          const u = i / trunkCount;
          const a = u * Math.PI * 12;
          const r = 2.4 * (1.2 - u * 0.4);
          out[ptr * 3]     = Math.cos(a) * r;
          out[ptr * 3 + 1] = 1.0 + u * 10.0;
          out[ptr * 3 + 2] = Math.sin(a) * r;
          if (swatchOut) swatchOut[ptr] = 0;
          ptr++;
        }

        // 6 Sprawling Twisted Boughs (Swatch 0: Bark Brown)
        const boughAngles = [0, 1.05, 2.1, 3.14, 4.2, 5.25];
        const perBough = Math.floor(boughCount / boughAngles.length);
        for (let b = 0; b < boughAngles.length; b++) {
          const ba = boughAngles[b];
          for (let i = 0; i < perBough; i++) {
            const u = i / perBough;
            const reach = u * 15.0;
            const curveY = Math.sin(u * Math.PI * 0.8) * 6.0;
            out[ptr * 3]     = Math.cos(ba) * reach;
            out[ptr * 3 + 1] = 10.0 + u * 11.0 + curveY;
            out[ptr * 3 + 2] = Math.sin(ba) * reach;
            if (swatchOut) swatchOut[ptr] = 0;
            ptr++;
          }
        }

        // Canopy Leaf Clusters (Swatch 1: Fiery Autumn Crimson/Orange #ff6d00)
        for (let i = 0; i < foliageCount; i++) {
          const b = i % boughAngles.length;
          const ba = boughAngles[b];
          const dist = 10.0 + Math.random() * 7.5;
          out[ptr * 3]     = Math.cos(ba) * dist + (Math.random() - 0.5) * 4.5;
          out[ptr * 3 + 1] = 18.0 + Math.random() * 9.0;
          out[ptr * 3 + 2] = Math.sin(ba) * dist + (Math.random() - 0.5) * 4.5;
          if (swatchOut) swatchOut[ptr] = 1;
          ptr++;
        }
      }
    },

    // 3. Ancient Irish Carved Turnip Lantern (Original Samhain Jack-o'-Lantern)
    {
      id: "turnipLantern",
      drawSVG: `<polygon points="12,2 19,7 21,15 15,22 9,22 3,15 5,7" stroke="#8d6e63" stroke-width="1.5"/><polygon points="8,9 10,12 7,12" fill="#ffab00"/><polygon points="16,9 17,12 14,12" fill="#ffab00"/><path d="M7 16 L9 18 L11 16 L13 18 L15 16 L17 18" stroke="#ffab00" stroke-width="2"/>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.strokeStyle = "#8d6e63"; ctx.lineWidth = 2.5; ctx.beginPath();
        ctx.moveTo(cx, cy - 22); ctx.lineTo(cx + 18, cy - 10); ctx.lineTo(cx + 14, cy + 12);
        ctx.lineTo(cx, cy + 24); ctx.lineTo(cx - 14, cy + 12); ctx.lineTo(cx - 18, cy - 10); ctx.closePath(); ctx.stroke();
        ctx.fillStyle = "#ffab00";
        ctx.beginPath(); ctx.moveTo(cx - 9, cy - 6); ctx.lineTo(cx - 4, cy - 2); ctx.lineTo(cx - 10, cy + 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx + 9, cy - 6); ctx.lineTo(cx + 4, cy - 2); ctx.lineTo(cx + 10, cy + 2); ctx.fill();
        ctx.strokeStyle = "#ffab00"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx - 10, cy + 10); ctx.lineTo(cx - 5, cy + 14); ctx.lineTo(cx, cy + 10); ctx.lineTo(cx + 5, cy + 14); ctx.lineTo(cx + 10, cy + 10); ctx.stroke();
      },
      gen: (out, n, swatchOut) => {
        let ptr = 0;
        const faceCount = Math.round(n * 0.32);
        const rootCount = n - faceCount;

        // Bulbous Tapered Root Geodesic Lattice (Swatch 0: Earth Root Bone #a1887f)
        for (let i = 0; i < rootCount; i++) {
          const u = i / rootCount;
          const y = 3.5 + u * 18.0;
          const r = Math.sin(u * Math.PI * 0.85) * (7.2 - (1 - u) * 2.2);
          const t = i * GOLDEN;
          out[ptr * 3]     = Math.cos(t) * r;
          out[ptr * 3 + 1] = y;
          out[ptr * 3 + 2] = Math.sin(t) * r;
          if (swatchOut) swatchOut[ptr] = 0;
          ptr++;
        }

        // Fierce Carved Slanted Eyes, Nose & Jagged Fangs (Swatch 1: Glowing Candle Flame #ffab00)
        // Left Eye (Angular triangle)
        const eyeCount = Math.round(faceCount * 0.28);
        for (let i = 0; i < eyeCount; i++) {
          const side = i % 2 === 0 ? 1 : -1;
          const u = (i / eyeCount);
          const ex = side * (3.8 + u * 2.6);
          const ey = 14.5 + Math.abs(u - 0.5) * 3.2;
          out[ptr * 3]     = ex;
          out[ptr * 3 + 1] = ey;
          out[ptr * 3 + 2] = 6.2;
          if (swatchOut) swatchOut[ptr] = 1;
          ptr++;
        }

        // Jagged Menacing Mouth with Alternating Fangs (Swatch 1: Glowing Flame)
        const mouthCount = faceCount - eyeCount;
        for (let i = 0; i < mouthCount; i++) {
          const u = (i / (mouthCount - 1)) * 2 - 1;
          const mx = u * 8.5;
          const tooth = (i % 2 === 0 ? 1.6 : -1.6);
          const my = 8.5 + (1 - u * u) * 1.5 + tooth;
          out[ptr * 3]     = mx;
          out[ptr * 3 + 1] = my;
          out[ptr * 3 + 2] = 5.8;
          if (swatchOut) swatchOut[ptr] = 1;
          ptr++;
        }
      }
    },

    // 4. The Spirit Veil (Twin Intertwined Ascending Helix Vortex)
    {
      id: "spiritVeil",
      drawSVG: `<path d="M6 22 C6 14, 18 14, 18 6 M18 22 C18 14, 6 14, 6 6" stroke="#00e5ff" stroke-width="2"/><circle cx="12" cy="14" r="2" fill="#fff"/>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.strokeStyle = "#00e5ff"; ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let t = 0; t <= Math.PI * 4; t += 0.1) {
          const y = cy + 22 - (t / (Math.PI * 4)) * 44;
          const x = cx + Math.sin(t) * 16;
          if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.strokeStyle = "#e1bee7";
        ctx.beginPath();
        for (let t = 0; t <= Math.PI * 4; t += 0.1) {
          const y = cy + 22 - (t / (Math.PI * 4)) * 44;
          const x = cx + Math.sin(t + Math.PI) * 16;
          if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      },
      gen: (out, n, swatchOut) => {
        let ptr = 0;
        const helix1 = Math.round(n * 0.44);
        const helix2 = Math.round(n * 0.44);
        const cross = n - helix1 - helix2;

        // Helix Ribbon 1 (Swatch 0: Ethereal Cyan #00e5ff)
        for (let i = 0; i < helix1; i++) {
          const u = i / helix1;
          const a = u * Math.PI * 6;
          const r = 9.0 * (0.6 + Math.sin(u * Math.PI) * 0.6);
          out[ptr * 3]     = Math.cos(a) * r;
          out[ptr * 3 + 1] = 2.0 + u * 24.0;
          out[ptr * 3 + 2] = Math.sin(a) * r;
          if (swatchOut) swatchOut[ptr] = 0;
          ptr++;
        }

        // Helix Ribbon 2 (Swatch 1: Spirit Lilac/White #f3e5f5)
        for (let i = 0; i < helix2; i++) {
          const u = i / helix2;
          const a = u * Math.PI * 6 + Math.PI;
          const r = 9.0 * (0.6 + Math.sin(u * Math.PI) * 0.6);
          out[ptr * 3]     = Math.cos(a) * r;
          out[ptr * 3 + 1] = 2.0 + u * 24.0;
          out[ptr * 3 + 2] = Math.sin(a) * r;
          if (swatchOut) swatchOut[ptr] = 1;
          ptr++;
        }

        // Celestial Rungs / Bridging Struts
        for (let i = 0; i < cross; i++) {
          const u = (i / cross) * 2 - 1;
          out[ptr * 3]     = u * 6.5;
          out[ptr * 3 + 1] = 14.0 + (i % 5) * 2.5;
          out[ptr * 3 + 2] = (Math.random() - 0.5) * 3.0;
          if (swatchOut) swatchOut[ptr] = (i % 2 === 0 ? 0 : 1);
          ptr++;
        }
      }
    },

    // 5. The Wicker Man Titan (Anthropomorphic Architectural Lattice Effigy)
    {
      id: "wickerMan",
      drawSVG: `<line x1="8" y1="22" x2="10" y2="14" stroke="#8d6e63" stroke-width="2"/><line x1="16" y1="22" x2="14" y2="14" stroke="#8d6e63" stroke-width="2"/><rect x="8" y="7" width="8" height="7" stroke="#8d6e63" stroke-width="2"/><circle cx="12" cy="4" r="2.5" stroke="#8d6e63" stroke-width="1.5"/><line x1="2" y1="9" x2="22" y2="9" stroke="#8d6e63" stroke-width="2"/>`,
      drawCanvas: (ctx, cx, cy) => {
        ctx.strokeStyle = "#8d6e63"; ctx.lineWidth = 3;
        // Legs
        ctx.beginPath(); ctx.moveTo(cx - 7, cy + 24); ctx.lineTo(cx - 4, cy + 8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 7, cy + 24); ctx.lineTo(cx + 4, cy + 8); ctx.stroke();
        // Torso Cage
        ctx.strokeRect(cx - 8, cy - 6, 16, 14);
        ctx.beginPath(); ctx.moveTo(cx - 8, cy - 6); ctx.lineTo(cx + 8, cy + 8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 8, cy - 6); ctx.lineTo(cx - 8, cy + 8); ctx.stroke();
        // Arms
        ctx.beginPath(); ctx.moveTo(cx - 22, cy - 6); ctx.lineTo(cx + 22, cy - 6); ctx.stroke();
        // Head Basket
        ctx.beginPath(); ctx.arc(cx, cy - 14, 5, 0, Math.PI * 2); ctx.stroke();
      },
      gen: (out, n, swatchOut) => {
        let ptr = 0;
        const legCount = Math.round(n * 0.20);
        const torsoCount = Math.round(n * 0.38);
        const armCount = Math.round(n * 0.24);
        const headCount = n - legCount - torsoCount - armCount;

        // Two Sturdy Wicker Pillar Legs (Swatch 0: Wicker Wood #8d6e63)
        const halfLeg = Math.floor(legCount / 2);
        for (let i = 0; i < legCount; i++) {
          const side = i < halfLeg ? -1 : 1;
          const u = (i % halfLeg) / halfLeg;
          const a = u * Math.PI * 8;
          const lx = side * 4.5 + Math.cos(a) * 1.4;
          const ly = 2.0 + u * 8.5;
          const lz = Math.sin(a) * 1.4;
          out[ptr * 3]     = lx;
          out[ptr * 3 + 1] = ly;
          out[ptr * 3 + 2] = lz;
          if (swatchOut) swatchOut[ptr] = 0;
          ptr++;
        }

        // Torso 3D Box-Cage with Crisscross Wicker Struts (Swatch 0: Wicker, Swatch 1: Fire Hearth Core)
        const tw = 4.5, th = 8.5, td = 2.5;
        const torsoBaseY = 10.5;
        for (let i = 0; i < torsoCount; i++) {
          const u = i / torsoCount;
          let x, y, z;
          if (u < 0.4) {
            // 4 Vertical corner posts
            const corner = Math.floor((u / 0.4) * 4);
            const postU = ((u / 0.4) * 4) % 1.0;
            const cx = (corner % 2 === 0 ? 1 : -1) * tw;
            const cz = (corner < 2 ? 1 : -1) * td;
            x = cx; y = torsoBaseY + postU * th; z = cz;
          } else {
            // Internal X-diagonal structural wicker weave
            const diagU = (u - 0.4) / 0.6;
            const diagA = diagU * Math.PI * 6;
            x = Math.sin(diagA) * tw;
            y = torsoBaseY + diagU * th;
            z = Math.cos(diagA) * td;
          }
          out[ptr * 3]     = x;
          out[ptr * 3 + 1] = y;
          out[ptr * 3 + 2] = z;
          // Inner core drones tagged for fire ignition
          if (swatchOut) swatchOut[ptr] = (Math.abs(x) < 2.0 && Math.abs(z) < 1.5) ? 1 : 0;
          ptr++;
        }

        // Outstretched Ceremonial Lattice Arms (Swatch 0: Wicker)
        const halfArm = Math.floor(armCount / 2);
        for (let i = 0; i < armCount; i++) {
          const side = i < halfArm ? -1 : 1;
          const u = (i % halfArm) / halfArm;
          const ax = side * (tw + u * 12.0);
          const ay = 18.0 + Math.sin(u * Math.PI * 0.5) * 2.2;
          const az = (i % 2 === 0 ? 0.8 : -0.8);
          out[ptr * 3]     = ax;
          out[ptr * 3 + 1] = ay;
          out[ptr * 3 + 2] = az;
          if (swatchOut) swatchOut[ptr] = 0;
          ptr++;
        }

        // Woven Conical Basket Head (Swatch 0: Wicker)
        for (let i = 0; i < headCount; i++) {
          const u = i / headCount;
          const a = u * Math.PI * 10;
          const hr = 2.4 * (1.0 - u * 0.4);
          out[ptr * 3]     = Math.cos(a) * hr;
          out[ptr * 3 + 1] = 19.5 + u * 5.2;
          out[ptr * 3 + 2] = Math.sin(a) * hr;
          if (swatchOut) swatchOut[ptr] = 0;
          ptr++;
        }
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
    },
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
        const edgePoints = Math.round((n * 0.32) / 12);
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
        while (ptr < n) {
          const u = (ptr / n) * Math.PI * 4;
          out[ptr * 3]     = Math.cos(u) * (H + 0.3);
          out[ptr * 3 + 1] = boxCenterY + Math.sin(u) * (H + 0.3);
          out[ptr * 3 + 2] = (ptr % 2 === 0 ? 0.8 : -0.8);
          if (swatchOut) swatchOut[ptr] = 1;
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
