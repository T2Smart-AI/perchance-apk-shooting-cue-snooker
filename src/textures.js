import * as THREE from "../vendor/p2gx5c-three_0.170.0.js";

export const BALL_COLORS = {
  1: "#f0c200",
  2: "#1247b8",
  3: "#cf1f16",
  4: "#5a2a90",
  5: "#e9720d",
  6: "#0d7a3c",
  7: "#8c1f2b",
  8: "#161616",
  9: "#f0c200",
  10: "#1247b8",
  11: "#cf1f16",
  12: "#5a2a90",
  13: "#e9720d",
  14: "#0d7a3c",
  15: "#8c1f2b",
};

import { mulberry32, hashString } from "./rng.js";
export { mulberry32, hashString };

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  if (amt >= 0) c.lerp(new THREE.Color("#ffffff"), amt);
  else c.lerp(new THREE.Color("#000000"), -amt);
  return "#" + c.getHexString();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ------------------------------------------------------------------ */
/*  Balls                                                              */
/* ------------------------------------------------------------------ */

function drawStar(ctx, cx, cy, outer, inner, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i * Math.PI) / points - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawCrown(ctx, cx, cy, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - s, cy + s * 0.55);
  ctx.lineTo(cx - s, cy - s * 0.35);
  ctx.lineTo(cx - s * 0.5, cy + s * 0.05);
  ctx.lineTo(cx, cy - s * 0.6);
  ctx.lineTo(cx + s * 0.5, cy + s * 0.05);
  ctx.lineTo(cx + s, cy - s * 0.35);
  ctx.lineTo(cx + s, cy + s * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(cx - s, cy + s * 0.5, s * 2, s * 0.3);
}

function drawSkull(ctx, cx, cy, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.12, s * 0.78, Math.PI, 0);
  ctx.lineTo(cx + s * 0.62, cy + s * 0.4);
  ctx.lineTo(cx - s * 0.62, cy + s * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(cx - s * 0.42, cy + s * 0.36, s * 0.84, s * 0.34);
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(cx - s * 0.33, cy - s * 0.08, s * 0.22, 0, Math.PI * 2);
  ctx.arc(cx + s * 0.33, cy - s * 0.08, s * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}

function drawFlame(ctx, cx, cy, s, c1, c2) {
  const g = ctx.createRadialGradient(cx, cy + s * 0.3, s * 0.1, cx, cy, s * 1.1);
  g.addColorStop(0, c2);
  g.addColorStop(1, c1);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.bezierCurveTo(cx + s * 0.9, cy - s * 0.2, cx + s * 0.75, cy + s * 0.9, cx, cy + s);
  ctx.bezierCurveTo(cx - s * 0.75, cy + s * 0.9, cx - s * 0.9, cy - s * 0.2, cx, cy - s);
  ctx.fill();
}

function drawGear(ctx, cx, cy, s, color) {
  ctx.fillStyle = color;
  const teeth = 8;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const r = i % 2 === 0 ? s : s * 0.72;
    const a = (i * Math.PI) / teeth;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}

function drawClock(ctx, cx, cy, s, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.22;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.82, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = s * 0.14;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - s * 0.55);
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + s * 0.42, cy + s * 0.15);
  ctx.stroke();
}

function drawBolt(ctx, cx, cy, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.18, cy - s);
  ctx.lineTo(cx - s * 0.55, cy + s * 0.12);
  ctx.lineTo(cx - s * 0.05, cy + s * 0.12);
  ctx.lineTo(cx - s * 0.25, cy + s);
  ctx.lineTo(cx + s * 0.55, cy - s * 0.18);
  ctx.lineTo(cx + s * 0.02, cy - s * 0.18);
  ctx.closePath();
  ctx.fill();
}

function drawHeart(ctx, cx, cy, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.75);
  ctx.bezierCurveTo(cx - s * 1.3, cy - s * 0.15, cx - s * 0.55, cy - s * 1.05, cx, cy - s * 0.32);
  ctx.bezierCurveTo(cx + s * 0.55, cy - s * 1.05, cx + s * 1.3, cy - s * 0.15, cx, cy + s * 0.75);
  ctx.fill();
}

function drawGem(ctx, cx, cy, s, color, hi) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.lineTo(cx + s * 0.82, cy - s * 0.22);
  ctx.lineTo(cx + s * 0.52, cy + s);
  ctx.lineTo(cx - s * 0.52, cy + s);
  ctx.lineTo(cx - s * 0.82, cy - s * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = hi;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.lineTo(cx + s * 0.82, cy - s * 0.22);
  ctx.lineTo(cx, cy - s * 0.05);
  ctx.lineTo(cx - s * 0.82, cy - s * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hi;
  ctx.lineWidth = s * 0.09;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.52, cy + s);
  ctx.lineTo(cx, cy - s * 0.05);
  ctx.lineTo(cx + s * 0.52, cy + s);
  ctx.stroke();
}

const SPECIAL_STYLES = {
  gold: { bg: ["#fff3c4", "#e0a217", "#8a5c05"], draw: (c, x, y, s) => drawCrown(c, x, y, s, "#7a4a05") },
  bomb: { bg: ["#5e5e66", "#171719", "#050506"], draw: (c, x, y, s) => drawSkull(c, x, y, s * 0.92, "#f2f2f2") },
  fire: { bg: ["#ffe08a", "#e2530a", "#5c1402"], draw: (c, x, y, s) => drawFlame(c, x, y, s * 0.95, "#ffb020", "#fff2b0") },
  robot: { bg: ["#dfe6ee", "#7d8794", "#31363d"], draw: (c, x, y, s) => drawGear(c, x, y, s * 0.95, "#3a4048") },
  time: { bg: ["#d7f2ff", "#2f8fd6", "#0b3355"], draw: (c, x, y, s) => drawClock(c, x, y, s * 0.95, "#e9f7ff") },
  bolt: { bg: ["#fff4c9", "#f5c022", "#7c5a00"], draw: (c, x, y, s) => drawBolt(c, x, y, s * 0.98, "#6b4a00") },
  heart: { bg: ["#ffd9e2", "#e0325b", "#63041b"], draw: (c, x, y, s) => drawHeart(c, x, y, s * 0.95, "#ff9ab0") },
  star: { bg: ["#fff8d8", "#f2c200", "#7c5f00"], draw: (c, x, y, s) => drawStar(c, x, y, s * 1.0, s * 0.45) || (c.fillStyle = "#7c5f00", c.fill()) },
  gem: { bg: ["#e6fbff", "#22b6d8", "#06455c"], draw: (c, x, y, s) => drawGem(c, x, y, s * 1.0, "#7ef0ff", "#eafeff") },
};

export function ballTexture(opts = {}) {
  const {
    number = null,
    color = "#ffffff",
    stripe = false,
    special = null,
    seed = 1,
    wear = 0.35,
  } = opts;
  const W = 1024;
  const H = 512;
  const c = canvas(W, H);
  const ctx = c.getContext("2d");

  if (special && SPECIAL_STYLES[special]) {
    const st = SPECIAL_STYLES[special];
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, st.bg[0]);
    g.addColorStop(0.5, st.bg[1]);
    g.addColorStop(1, st.bg[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const yTop = ctx.createLinearGradient(0, 0, 0, H * 0.16);
    yTop.addColorStop(0, shade(st.bg[0], 0.25));
    yTop.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = yTop;
    ctx.fillRect(0, 0, W, H * 0.16);
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 14;
    st.draw(ctx, W * 0.25, H * 0.5, H * 0.24);
    st.draw(ctx, W * 0.75, H * 0.5, H * 0.24);
    ctx.shadowBlur = 0;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  const NUM_V = 0.34;
  const BAND_TOP = 0.155;
  const BAND_BOT = 0.685;

  if (stripe) {
    ctx.fillStyle = "#f8f5ef";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = color;
    ctx.fillRect(0, H * BAND_TOP, W, H * (BAND_BOT - BAND_TOP));
    const g = ctx.createLinearGradient(0, H * BAND_TOP, 0, H * BAND_BOT);
    g.addColorStop(0, "rgba(0,0,0,0.30)");
    g.addColorStop(0.14, "rgba(0,0,0,0)");
    g.addColorStop(0.86, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.30)");
    ctx.fillStyle = g;
    ctx.fillRect(0, H * BAND_TOP, W, H * (BAND_BOT - BAND_TOP));
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgba(255,255,255,0.22)");
    g.addColorStop(0.4, "rgba(255,255,255,0)");
    g.addColorStop(1, "rgba(0,0,0,0.34)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  if (number !== null) {
    const cy = H * NUM_V;
    const r = H * 0.15;
    for (const cx of [W * 0.5, 0, W]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "#fcfaf5";
      ctx.fill();
      ctx.lineWidth = r * 0.07;
      ctx.strokeStyle = "rgba(0,0,0,0.12)";
      ctx.stroke();
      ctx.fillStyle = "#191919";
      ctx.font = `700 ${Math.round(r * 1.30)}px Helvetica, Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(number), cx, cy + r * 0.07);
    }
  }

  const rnd = mulberry32(seed * 7919 + 13);
  ctx.globalAlpha = wear * 0.14;
  for (let i = 0; i < 900; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const s = rnd() * 1.8 + 0.4;
    ctx.fillStyle = rnd() > 0.5 ? "#ffffff" : "#000000";
    ctx.fillRect(x, y, s, s);
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* ------------------------------------------------------------------ */
/*  Cloth / felt                                                       */
/* ------------------------------------------------------------------ */

export function feltTexture(color = "#1a8a4a", opts = {}) {
  const { seed = 3, fibers = 9000 } = opts;
  const S = 512;
  const c = canvas(S, S);
  const ctx = c.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, S, S);
  const base = new THREE.Color(color);
  const rnd = mulberry32(seed * 104729 + 7);
  for (let i = 0; i < 64; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 24 + rnd() * 96;
    const light = rnd() > 0.5;
    const a = 0.01 + rnd() * 0.02;
    const col0 = light ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    const offs = [[0, 0], ...(x < r ? [[S, 0]] : x > S - r ? [[-S, 0]] : []), ...(y < r ? [[0, S]] : y > S - r ? [[0, -S]] : [])];
    for (const [ox, oy] of offs) {
      const gg = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gg.addColorStop(0, col0);
      gg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gg;
      ctx.fillRect(0, 0, S, S);
    }
  }
  const weaveAngle = () => (rnd() < 0.5 ? 0 : Math.PI / 2) + (rnd() - 0.5) * 0.62;
  for (let i = 0; i < fibers * 0.12; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const l = rnd() * 6 + 1.6;
    const a = weaveAngle();
    const t = (rnd() - 0.5) * 0.08;
    const col = base.clone().lerp(t > 0 ? new THREE.Color("#ffffff") : new THREE.Color("#000000"), Math.abs(t));
    ctx.strokeStyle = "#" + col.getHexString();
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = rnd() * 1.3 + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  for (let i = 0; i < fibers * 1.7; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const l = rnd() * 2.6 + 0.5;
    const a = weaveAngle();
    const t = (rnd() - 0.5) * 0.13;
    const col = base.clone().lerp(t > 0 ? new THREE.Color("#ffffff") : new THREE.Color("#000000"), Math.abs(t));
    ctx.strokeStyle = "#" + col.getHexString();
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = rnd() * 0.9 + 0.3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  const wear = opts.wear ?? 1;
  ctx.lineCap = "round";
  for (let i = 0; i < 14 * wear; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const a = rnd() * Math.PI;
    const l = 30 + rnd() * 90;
    ctx.strokeStyle = `rgba(238,244,232,${0.02 + rnd() * 0.025})`;
    ctx.lineWidth = 6 + rnd() * 14;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(a) * l * 0.5 + (rnd() - 0.5) * 30,
      y + Math.sin(a) * l * 0.5 + (rnd() - 0.5) * 30,
      x + Math.cos(a) * l,
      y + Math.sin(a) * l
    );
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  for (let i = 0; i < 620 * wear; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    ctx.fillStyle = rnd() > 0.7
      ? `rgba(255,255,255,${0.04 + rnd() * 0.06})`
      : `rgba(0,0,0,${0.03 + rnd() * 0.05})`;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function feltNormal(opts = {}) {
  const { seed = 3, fibers = 9000, strength = 1.6 } = opts;
  const S = 256;
  const h = canvas(S, S);
  const hx = h.getContext("2d");
  hx.fillStyle = "#808080";
  hx.fillRect(0, 0, S, S);
  const rnd = mulberry32(seed * 40503 + 91);
  for (let i = 0; i < fibers * 1.5; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const l = rnd() * 2.2 + 0.5;
    const a = (rnd() < 0.5 ? 0 : Math.PI / 2) + (rnd() - 0.5) * 0.62;
    const v = rnd() > 0.5 ? 255 : 0;
    hx.strokeStyle = `rgba(${v},${v},${v},0.34)`;
    hx.lineWidth = rnd() * 0.8 + 0.3;
    hx.beginPath();
    hx.moveTo(x, y);
    hx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    hx.stroke();
  }
  const src = hx.getImageData(0, 0, S, S).data;
  const out = canvas(S, S);
  const ox = out.getContext("2d");
  const img = ox.createImageData(S, S);
  const d = img.data;
  const at = (x, y) => src[((((y + S) % S) * S) + ((x + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      let nx = -dx;
      let ny = -dy;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      const i = (y * S + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz / len) * 255;
      d[i + 3] = 255;
    }
  }
  ox.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(out);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

export function railShadowTexture(opts = {}) {
  const { W = 1024, H = 512, band = 48, strength = 0.34 } = opts;
  const c = canvas(W, H);
  const ctx = c.getContext("2d");
  const y0 = `rgba(0,0,0,${strength})`;
  const yMid = `rgba(0,0,0,${strength * 0.42})`;
  const y1 = "rgba(0,0,0,0)";
  const sides = [
    [0, 0, 0, band],
    [0, H, 0, H - band],
    [0, 0, band, 0],
    [W, 0, W - band, 0],
  ];
  for (const [x0, yy0, x1, yy1] of sides) {
    const g = ctx.createLinearGradient(x0, yy0, x1, yy1);
    g.addColorStop(0, y0);
    g.addColorStop(0.5, yMid);
    g.addColorStop(1, y1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const R = band * 2.1;
  for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, `rgba(0,0,0,${strength * 0.6})`);
    g.addColorStop(1, y1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function voidTexture(color = "#0a0e1a", opts = {}) {
  const { seed = 7, stars = 700, nebula = 0.6, accent = "#3a5cff", accent2 = "#b06bff" } = opts;
  const S = 1024;
  const c = canvas(S, S);
  const ctx = c.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, S, S);
  const rnd = mulberry32(seed * 92821 + 13);
  const rgba = (hex, a) => {
    const col = new THREE.Color(hex);
    return `rgba(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)},${a})`;
  };
  for (let i = 0; i < 6; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 120 + rnd() * 240;
    const col = i % 2 ? accent2 : accent;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, 0.1 * nebula * (0.45 + rnd())));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  for (let i = 0; i < stars; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 0.35 + Math.pow(rnd(), 3.4) * 1.25;
    const t = rnd();
    const col = t > 0.92 ? "#ffd8ae" : t > 0.8 ? "#bdd4ff" : "#ffffff";
    const alpha = 0.3 + rnd() * 0.7;
    const glow = r > 1.05;
    const reach = glow ? r * 2.6 : r;
    for (const [ox, oy] of [[0, 0], ...(x < reach ? [[S, 0]] : x > S - reach ? [[-S, 0]] : []), ...(y < reach ? [[0, S]] : y > S - reach ? [[0, -S]] : [])]) {
      const px = x + ox;
      const py = y + oy;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      if (glow) {
        const g = ctx.createRadialGradient(px, py, 0, px, py, r * 2.6);
        g.addColorStop(0, "rgba(255,255,255,0.3)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, r * 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function clothRoughness(seed = 5) {
  const S = 128;
  const c = canvas(S, S);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(S, S);
  const rnd = mulberry32(seed * 31337 + 11);
  for (let i = 0; i < S * S; i++) {
    const v = 214 + Math.floor(rnd() * 26);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tmp = canvas(S, S);
  tmp.getContext("2d").drawImage(c, 0, 0);
  ctx.globalAlpha = 0.55;
  ctx.filter = "blur(1.3px)";
  ctx.drawImage(tmp, 0, 0);
  ctx.filter = "none";
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/* ------------------------------------------------------------------ */
/*  Wood                                                               */
/* ------------------------------------------------------------------ */

export function woodTexture(color = "#6b4423", opts = {}) {
  const { seed = 9, W = 1024, H = 256, glossy = false } = opts;
  const c = canvas(W, H);
  const ctx = c.getContext("2d");
  const base = new THREE.Color(color);
  const rnd = mulberry32(seed * 2246822519 + 3);

  const makeNoise = (nw, nh) => {
    const grid = new Float32Array(nw * nh);
    for (let i = 0; i < grid.length; i++) grid[i] = rnd();
    return (fx, fy) => {
      const gx = fx * nw;
      const gy = fy * nh;
      let x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = gx - x0;
      const ty = gy - y0;
      x0 = ((x0 % nw) + nw) % nw;
      const x1 = (x0 + 1) % nw;
      const yi = Math.min(nh - 1, Math.max(0, y0));
      const yi1 = Math.min(nh - 1, yi + 1);
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const a = grid[yi * nw + x0];
      const b = grid[yi * nw + x1];
      const d = grid[yi1 * nw + x0];
      const e = grid[yi1 * nw + x1];
      const top = a + (b - a) * sx;
      const bot = d + (e - d) * sx;
      return top + (bot - top) * sy;
    };
  };

  const rings = makeNoise(3, 13);
  const fibre = makeNoise(300, 120);
  const blotch = makeNoise(4, 4);

  const knots = [];
  const knotCount = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < knotCount; i++) {
    knots.push({ x: rnd() * W, y: rnd() * H, r: 9 + rnd() * 15 });
  }

  const img = ctx.createImageData(W, H);
  const d = img.data;
  const dark = base.clone().multiplyScalar(0.45);
  for (let y = 0; y < H; y++) {
    const fy = y / H;
    for (let x = 0; x < W; x++) {
      const fx = x / W;
      let v = rings(fx, fy);
      let knotShade = 0;
      for (const k of knots) {
        const dx = x - k.x;
        const dy = (y - k.y) * 2.1;
        const dist = Math.hypot(dx, dy);
        if (dist < k.r * 6) {
          v += 0.16 * Math.exp(-(dist * dist) / (k.r * k.r * 2.6));
          if (dist < k.r) knotShade = Math.max(knotShade, 1 - dist / k.r);
        }
      }
      const R = 11;
      const ring = Math.abs(Math.sin(v * R * Math.PI));
      const fine = fibre(fx, fy);
      let shade = 0.74 + 0.34 * ring + 0.09 * (fine - 0.5) + 0.07 * (blotch(fx, fy) - 0.5);
      shade *= 0.99 + 0.02 * rnd();
      if (glossy) shade *= 1.06;
      let r = base.r * shade;
      let g = base.g * shade;
      let b = base.b * shade;
      if (knotShade > 0) {
        r = r + (dark.r - r) * knotShade;
        g = g + (dark.g - g) * knotShade;
        b = b + (dark.b - b) * knotShade;
      }
      const i = (y * W + x) * 4;
      d[i] = Math.min(255, r * 255);
      d[i + 1] = Math.min(255, g * 255);
      d[i + 2] = Math.min(255, b * 255);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = "rgba(0,0,0,.34)";
  ctx.fillRect(0, 0, W, 1.6);
  ctx.fillStyle = "rgba(0,0,0,.16)";
  ctx.fillRect(0, H - 1.4, W, 1.4);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* ------------------------------------------------------------------ */
/*  Misc                                                               */
/* ------------------------------------------------------------------ */

export function chalkTexture(color = "#2f6fd0") {
  const S = 256;
  const c = canvas(S, S);
  const ctx = c.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, S, S);
  const rnd = mulberry32(99);
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = rnd() > 0.5 ? "#ffffff" : "#000000";
    ctx.fillRect(rnd() * S, rnd() * S, rnd() * 2 + 0.5, rnd() * 2 + 0.5);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function radialGlowTexture(inner = "rgba(255,255,255,0.95)", outer = "rgba(255,255,255,0)") {
  const S = 256;
  const c = canvas(S, S);
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, "0.5)"));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function gradientTexture(top, bottom, opts = {}) {
  const { W = 64, H = 512, stops = null } = opts;
  const c = canvas(W, H);
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, H);
  if (stops) for (const [p, col] of stops) g.addColorStop(p, col);
  else {
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function panelTexture(color = "#0d1626", accent = "#25c2ff") {
  const S = 256;
  const c = canvas(S, S);
  const ctx = c.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, S - 12, S - 12);
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function spriteFromCanvas(w, h, draw) {
  const c = canvas(w, h);
  draw(c.getContext("2d"), w, h);
  return c;
}

/* ------------------------------------------------------------------ */
/*  Aim guides / fx sprites                                            */
/* ------------------------------------------------------------------ */

export function aimDashTexture(opts = {}) {
  const { W = 128, H = 8, dashes = 3 } = opts;
  const c = canvas(W, H);
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  const period = W / dashes;
  for (let i = 0; i < dashes; i++) {
    const x0 = i * period;
    const g = ctx.createLinearGradient(x0, 0, x0 + period, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.3, "rgba(255,255,255,1)");
    g.addColorStop(0.65, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x0, 0, period, H);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function blobShadowTexture() {
  const S = 128;
  const c = canvas(S, S);
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(0,0,0,0.72)");
  g.addColorStop(0.34, "rgba(0,0,0,0.55)");
  g.addColorStop(0.62, "rgba(0,0,0,0.22)");
  g.addColorStop(0.85, "rgba(0,0,0,0.05)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function dotTexture(color = "#ffffff") {
  const S = 64;
  const c = canvas(S, S);
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, color);
  g.addColorStop(0.4, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function textDecalTexture(text, opts = {}) {
  const {
    W = 1024,
    H = 256,
    color = "#ffffff",
    font = `800 ${Math.round(H * 0.46)}px "Baloo 2", system-ui, sans-serif`,
    sub = null,
    subFont = `600 ${Math.round(H * 0.17)}px "Baloo 2", system-ui, sans-serif`,
    letterSpacing = "0.18em",
  } = opts;
  const c = canvas(W, H);
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  try { ctx.letterSpacing = letterSpacing; } catch (e) { /* older browsers */ }
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fitFont = (fontStr, target) => {
    const m = String(fontStr).match(/(\d+(?:\.\d+)?)px/);
    if (!m) return fontStr;
    ctx.font = fontStr;
    const w = ctx.measureText(target).width;
    const maxW = W * 0.9;
    if (w > maxW) {
      const size = (parseFloat(m[1]) * maxW) / w;
      return String(fontStr).replace(/(\d+(?:\.\d+)?)px/, `${size.toFixed(0)}px`);
    }
    return fontStr;
  };
  ctx.font = fitFont(font, text);
  ctx.fillText(text, W / 2, sub ? H * 0.42 : H / 2);
  if (sub) {
    ctx.font = fitFont(subFont, sub);
    ctx.globalAlpha = 0.8;
    ctx.fillText(sub, W / 2, H * 0.74);
    ctx.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
