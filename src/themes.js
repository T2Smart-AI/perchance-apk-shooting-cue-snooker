import * as THREE from "../vendor/p2gx5c-three_0.170.0.js";
import { feltTexture, voidTexture, woodTexture, mulberry32 } from "./textures.js";

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.85,
    metalness: opts.metalness ?? 0,
    emissive: opts.emissive ?? "#000000",
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    flatShading: opts.flat ?? false,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    envMapIntensity: opts.env ?? 0.5,
  });
}

function groundMesh(color, size, seed, opts = {}) {
  const tileUnits = opts.stars ? 7.5 : 2;
  const tex = opts.stars
    ? voidTexture(color, { seed, nebula: opts.nebula ?? 0.6, accent: opts.accent, accent2: opts.accent2 })
    : feltTexture(color, { seed, fibers: 4000 });
  tex.repeat.set(size / tileUnits, size / tileUnits);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.96, metalness: 0 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = -0.28;
  m.receiveShadow = true;
  return m;
}

function tower(rnd, palette, emissive) {
  const g = new THREE.Group();
  const w = 0.5 + rnd() * 0.9;
  const d = 0.5 + rnd() * 0.9;
  const h = 1.2 + rnd() * 4.5;
  const color = palette[Math.floor(rnd() * palette.length)];
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), std(color, { roughness: 0.72 }));
  body.position.y = h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const winMat = std("#000000", { emissive, emissiveIntensity: 1.4, roughness: 0.4, env: 0 });
  const rows = Math.floor(h / 0.34);
  const cols = Math.max(2, Math.floor(w / 0.22));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rnd() > 0.55) continue;
      const lit = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.11), winMat);
      lit.position.set(-w / 2 + 0.16 + c * 0.22, 0.24 + r * 0.34, d / 2 + 0.006);
      g.add(lit);
    }
  }
  return g;
}

function palm(rnd) {
  const g = new THREE.Group();
  const h = 1.4 + rnd() * 1.4;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.09, h, 7),
    std("#6b4a2a", { roughness: 0.9, flat: true })
  );
  trunk.position.y = h / 2;
  trunk.castShadow = true;
  g.add(trunk);
  const leafMat = std("#1f7a3a", { roughness: 0.8, flat: true });
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.85, 4), leafMat);
    leaf.position.y = h;
    leaf.rotation.z = Math.PI / 2.4;
    leaf.rotation.y = (i / 7) * Math.PI * 2;
    leaf.translateY(0.32);
    leaf.castShadow = true;
    g.add(leaf);
  }
  return g;
}

function pine(rnd) {
  const g = new THREE.Group();
  const h = 0.7 + rnd() * 0.5;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, h, 6), std("#4a3520", { flat: true }));
  trunk.position.y = h / 2;
  g.add(trunk);
  const mat = std("#256b39", { flat: true, roughness: 0.85 });
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42 - i * 0.1, 0.7, 7), mat);
    cone.position.y = h + 0.22 + i * 0.36;
    cone.castShadow = true;
    g.add(cone);
  }
  return g;
}

function cactus(rnd) {
  const g = new THREE.Group();
  const h = 0.7 + rnd() * 0.7;
  const mat = std("#3f8a4a", { roughness: 0.9, flat: true });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, h, 4, 8), mat);
  body.position.y = h / 2 + 0.11;
  body.castShadow = true;
  g.add(body);
  for (let i = 0; i < 2; i++) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.3, 4, 7), mat);
    arm.position.set((i ? 1 : -1) * 0.16, h * 0.55, 0);
    arm.rotation.z = (i ? -1 : 1) * 0.5;
    arm.castShadow = true;
    g.add(arm);
  }
  return g;
}

function crystal(rnd, color) {
  const g = new THREE.Group();
  const h = 0.5 + rnd() * 1.3;
  const mat = std(color, { roughness: 0.15, metalness: 0.1, emissive: color, emissiveIntensity: 0.28, flat: true, env: 1.2, transparent: true, opacity: 0.92 });
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.22 + rnd() * 0.18, 0), mat);
  m.scale.y = h * 1.6;
  m.position.y = h * 0.6;
  m.castShadow = true;
  g.add(m);
  return g;
}

function rock(rnd, color) {
  const m = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.16 + rnd() * 0.36, 0),
    std(color, { roughness: 0.95, flat: true })
  );
  m.position.y = 0.12 + rnd() * 0.1;
  m.rotation.set(rnd(), rnd(), rnd());
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function lollipop(rnd, color) {
  const g = new THREE.Group();
  const h = 0.9 + rnd() * 0.6;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h, 8), std("#f6e7d0", { roughness: 0.6 }));
  stick.position.y = h / 2;
  g.add(stick);
  const head = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.075, 10, 24),
    std(color, { roughness: 0.24, emissive: color, emissiveIntensity: 0.18 })
  );
  head.position.y = h + 0.1;
  head.rotation.x = Math.PI / 2;
  head.castShadow = true;
  g.add(head);
  return g;
}

function bubble(rnd, color) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.1 + rnd() * 0.22, 12, 10),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.05,
      metalness: 0,
      transparent: true,
      opacity: 0.32,
      envMapIntensity: 1.6,
    })
  );
  m.position.set(0, 0.4 + rnd() * 1.4, 0);
  return m;
}

function starfield(rnd, count = 700) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 28 + rnd() * 26;
    const th = rnd() * Math.PI * 2;
    const ph = Math.acos(2 * rnd() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) * 0.55 + 1.5;
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.42,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    fog: false,
    depthWrite: false,
  });
  const p = new THREE.Points(geo, mat);
  p.name = "stars";
  p.renderOrder = -1;
  return p;
}

function torch(rnd, color) {
  const g = new THREE.Group();
  const h = 0.7 + rnd() * 0.4;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, h, 8), std("#2a2a30", { roughness: 0.7 }));
  pole.position.y = h / 2;
  g.add(pole);
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 0.28, 8),
    std("#000000", { emissive: color, emissiveIntensity: 2.6, rough: 0.4, env: 0 })
  );
  flame.position.y = h + 0.1;
  g.add(flame);
  const light = new THREE.PointLight(color, 3.2, 4.4, 2);
  light.position.y = h + 0.2;
  g.add(light);
  return g;
}

const PROPS = {
  tower: (rnd, t) => tower(rnd, t.props.palette, t.props.emissive ?? "#ffd98a"),
  pine: (rnd) => pine(rnd),
  palm: (rnd) => palm(rnd),
  cactus: (rnd) => cactus(rnd),
  crystal: (rnd, t) => crystal(rnd, t.props.palette[Math.floor(rnd() * t.props.palette.length)]),
  rock: (rnd, t) => rock(rnd, t.props.rockColor ?? "#6a6a72"),
  lollipop: (rnd, t) => lollipop(rnd, t.props.palette[Math.floor(rnd() * t.props.palette.length)]),
  bubble: (rnd, t) => bubble(rnd, t.props.palette[Math.floor(rnd() * t.props.palette.length)]),
  torch: (rnd, t) => torch(rnd, t.props.palette[Math.floor(rnd() * t.props.palette.length)]),
};

export const THEMES = [
  {
    id: "arena",
    name: "Grand Arena",
    felt: "#1e8a4b",
    rail: "#5a3520",
    cushion: "#1a6b3c",
    pocket: "#0b0b0d",
    rim: "#c9a24a",
    accent: "#37e08a",
    sky: { skyStops: [[0, "#05070d"], [0.5, "#101828"], [0.75, "#1c2a42"], [1, "#05070d"]] },
    fog: { color: "#080b12", near: 6, far: 26 },
    env: { ceiling: "#ffffff", sideA: "#9fc0ff", sideB: "#ffe0b0", floor: "#15181f" },
    lights: { skyColor: "#dbe8ff", groundColor: "#241d16", keyIntensity: 62, fillIntensity: 0.6, rimIntensity: 0.5 },
    ground: "#101420",
    props: { kind: "none" },
  },
  {
    id: "nightcity",
    name: "Night City",
    felt: "#1c8a63",
    rail: "#3a2a22",
    cushion: "#14614a",
    pocket: "#08080a",
    rim: "#5ad6ff",
    accent: "#35e0ff",
    sky: { skyStops: [[0, "#02040c"], [0.42, "#0a1430"], [0.62, "#243a6a"], [1, "#05070f"]] },
    fog: { color: "#070c18", near: 7, far: 24 },
    env: { ceiling: "#e8f2ff", sideA: "#4f7cff", sideB: "#ff8ad0", floor: "#0a0d16" },
    lights: { skyColor: "#c3d8ff", groundColor: "#151a26", keyIntensity: 58, lightScale: 0.64, hemiIntensity: 0.78, fillIntensity: 0.75, rimIntensity: 0.8, fillColor: "#7fa8ff", rimColor: "#ff9ad0" },
    ground: "#181d28",
    props: { kind: "towers", count: 34, palette: ["#232a38", "#2c3446", "#1b2130", "#333c50"], emissive: "#ffe08a", radius: 9, stars: true },
  },
  {
    id: "beach",
    name: "Sunset Beach",
    felt: "#1f9a6a",
    rail: "#8a5a30",
    cushion: "#17764f",
    pocket: "#0d0a08",
    rim: "#ffd07a",
    accent: "#ffb35c",
    sky: { skyStops: [[0, "#2a4a8f"], [0.42, "#f08a4a"], [0.6, "#ffcf7a"], [1, "#2a3a5a"]] },
    fog: { color: "#e8b98a", near: 9, far: 34 },
    env: { ceiling: "#ffe9c0", sideA: "#7fc4ff", sideB: "#ffb877", floor: "#b09060" },
    lights: { skyColor: "#ffe6c2", groundColor: "#6a5030", keyIntensity: 66, keyColor: "#fff0d0", fillIntensity: 0.5, rimIntensity: 0.55 },
    ground: "#d8b478",
    props: { kind: "palms", count: 16, radius: 8 },
  },
  {
    id: "forest",
    name: "Emerald Forest",
    felt: "#1a7a3f",
    rail: "#5a3a1e",
    cushion: "#146030",
    pocket: "#0a0806",
    rim: "#bfa266",
    accent: "#6ddb6a",
    sky: { skyStops: [[0, "#0c1a12"], [0.45, "#1d3a24"], [0.7, "#3d6b3f"], [1, "#0c1a12"]] },
    fog: { color: "#16281a", near: 6, far: 28 },
    env: { ceiling: "#e6ffe8", sideA: "#7fd0a0", sideB: "#ffe6a0", floor: "#1a2416" },
    lights: { skyColor: "#d8ffdc", groundColor: "#1a2414", keyIntensity: 54, fillIntensity: 0.55, rimIntensity: 0.45 },
    ground: "#2c4a2a",
    props: { kind: "pines", count: 42, radius: 7.5 },
  },
  {
    id: "ice",
    name: "Frozen Peak",
    felt: "#2fb0c8",
    rail: "#c8d8e8",
    cushion: "#1f8aa0",
    pocket: "#08141c",
    rim: "#e8f6ff",
    accent: "#8fe8ff",
    sky: { skyStops: [[0, "#0a1626"], [0.42, "#2a5a8f"], [0.66, "#a8d8f0"], [1, "#0e1c2c"]] },
    fog: { color: "#bcd8ea", near: 8, far: 30 },
    env: { ceiling: "#ffffff", sideA: "#9fd8ff", sideB: "#dff4ff", floor: "#8fa8bd" },
    lights: { skyColor: "#eaf8ff", groundColor: "#3a5a70", keyIntensity: 60, keyColor: "#eaf8ff", fillIntensity: 0.7, fillColor: "#9fd8ff", rimIntensity: 0.5 },
    ground: "#cfe4f0",
    props: { kind: "crystals", count: 26, radius: 7.5, palette: ["#8fe8ff", "#bfe8ff", "#6fd0f0", "#ffffff"] },
  },
  {
    id: "desert",
    name: "Scorched Dunes",
    felt: "#199a72",
    rail: "#7a5230",
    cushion: "#137a56",
    pocket: "#140f0a",
    rim: "#e8c07a",
    accent: "#ffc46a",
    sky: { skyStops: [[0, "#2a1a4a"], [0.4, "#c85a2a"], [0.62, "#f0a850"], [1, "#3a2a1a"]] },
    fog: { color: "#d8a468", near: 9, far: 32 },
    env: { ceiling: "#ffe6b0", sideA: "#ffb877", sideB: "#e08a4a", floor: "#a07840" },
    lights: { skyColor: "#ffd9a0", groundColor: "#6a4a24", keyIntensity: 68, keyColor: "#ffe0a8", fillIntensity: 0.45, rimIntensity: 0.55 },
    ground: "#c99a5e",
    props: { kind: "cactus", count: 26, radius: 7.5, rockColor: "#8a6a48" },
  },
  {
    id: "candy",
    name: "Sugar Rush",
    felt: "#ff7ab8",
    rail: "#ffd0e6",
    cushion: "#e84a96",
    pocket: "#5a1030",
    rim: "#fff0f8",
    accent: "#ff9ad8",
    sky: { skyStops: [[0, "#2a1030"], [0.42, "#7a3aa0"], [0.66, "#ff9ad8"], [1, "#3a1840"]] },
    fog: { color: "#6a3a70", near: 8, far: 30 },
    env: { ceiling: "#ffffff", sideA: "#ffb0e0", sideB: "#b0d8ff", floor: "#8a5a90" },
    lights: { skyColor: "#ffe0f4", groundColor: "#5a3a60", keyIntensity: 60, keyColor: "#fff0fa", fillIntensity: 0.7, fillColor: "#ffb0e0", rimIntensity: 0.6, rimColor: "#a0d8ff" },
    ground: "#f0b0d4",
    props: { kind: "lollipops", count: 24, radius: 7, palette: ["#ff5aa0", "#ffd24a", "#63d0ff", "#8ce86a", "#c07aff"] },
  },
  {
    id: "neon",
    name: "Neon Grid",
    felt: "#16365c",
    rail: "#0a1424",
    cushion: "#12466f",
    pocket: "#000000",
    rim: "#25e6ff",
    accent: "#25e6ff",
    sky: { skyStops: [[0, "#01030a"], [0.5, "#06101f"], [0.72, "#0d2440"], [1, "#01030a"]] },
    fog: { color: "#050a14", near: 6, far: 26 },
    env: { ceiling: "#cfefff", sideA: "#25e6ff", sideB: "#ff3ad0", floor: "#05080f" },
    lights: { skyColor: "#bfe8ff", groundColor: "#0a1018", keyIntensity: 64, lightScale: 0.82, hemiIntensity: 0.98, keyColor: "#dff6ff", fillIntensity: 0.95, fillColor: "#25e6ff", rimIntensity: 1.0, rimColor: "#ff3ad0" },
    ground: "#08111e",
    props: { kind: "torches", count: 22, radius: 6.6, palette: ["#25e6ff", "#ff3ad0", "#7a5cff", "#3affc8"] },
  },
  {
    id: "space",
    name: "Deep Orbit",
    felt: "#333d7d",
    rail: "#20263f",
    cushion: "#3a4488",
    pocket: "#000000",
    rim: "#9ab4ff",
    accent: "#9ab4ff",
    sky: { skyStops: [[0, "#000004"], [0.5, "#04061a"], [0.8, "#0a0c2a"], [1, "#000004"]] },
    fog: { color: "#02030a", near: 8, far: 20 },
    env: { ceiling: "#dfe8ff", sideA: "#6a8cff", sideB: "#c06aff", floor: "#05060f" },
    lights: { skyColor: "#c8d8ff", groundColor: "#0a0c18", keyIntensity: 66, lightScale: 1.05, hemiIntensity: 1.3, keyColor: "#eef4ff", fillIntensity: 1.05, fillColor: "#7a9cff", rimIntensity: 0.85, rimColor: "#c08aff" },
    ground: "#0a0d1e",
    props: { kind: "crystals", count: 30, radius: 8, palette: ["#9ab4ff", "#c88aff", "#5ad0ff", "#ffffff"], stars: true },
  },
  {
    id: "volcano",
    name: "Volcano Core",
    felt: "#8a2a18",
    rail: "#2a1a16",
    cushion: "#5a1a10",
    pocket: "#0a0300",
    rim: "#ff7a2a",
    accent: "#ff7a2a",
    sky: { skyStops: [[0, "#1a0400"], [0.42, "#5a1400"], [0.62, "#c04a10"], [1, "#180600"]] },
    fog: { color: "#2a0a00", near: 6, far: 26 },
    env: { ceiling: "#ffd0a0", sideA: "#ff7a2a", sideB: "#ffd24a", floor: "#1a0800" },
    lights: { skyColor: "#ffc49a", groundColor: "#2a1000", keyIntensity: 60, keyColor: "#ffd0a0", fillIntensity: 0.6, fillColor: "#ff7a2a", rimIntensity: 0.7, rimColor: "#ffb04a" },
    ground: "#2a1008",
    props: { kind: "torches", count: 20, radius: 6.4, palette: ["#ff7a2a", "#ffd24a", "#ff3a10"] },
  },
  {
    id: "royal",
    name: "Royal Hall",
    felt: "#1f6a4a",
    rail: "#7a5a18",
    cushion: "#164a34",
    pocket: "#0a0804",
    rim: "#e8c060",
    accent: "#e8c060",
    sky: { skyStops: [[0, "#0a0806"], [0.45, "#241a10"], [0.7, "#4a3520"], [1, "#0a0806"]] },
    fog: { color: "#181008", near: 7, far: 28 },
    env: { ceiling: "#fff2cc", sideA: "#d8b062", sideB: "#8a6a3a", floor: "#241a10" },
    lights: { skyColor: "#ffeec6", groundColor: "#2a1e10", keyIntensity: 58, keyColor: "#fff2cc", fillIntensity: 0.55, fillColor: "#d8b062", rimIntensity: 0.5 },
    ground: "#3a2a18",
    props: { kind: "towers", count: 22, palette: ["#3a2a18", "#4a3520", "#2a1e10"], emissive: "#ffd98a", radius: 8 },
  },
  {
    id: "ocean",
    name: "Coral Reef",
    felt: "#0f6a7a",
    rail: "#0a3a44",
    cushion: "#0c5464",
    pocket: "#02141a",
    rim: "#7ae8e0",
    accent: "#66e8e0",
    sky: { skyStops: [[0, "#02141f"], [0.4, "#063a52"], [0.68, "#0f7a96"], [1, "#02141f"]] },
    fog: { color: "#06303f", near: 4, far: 24 },
    env: { ceiling: "#c8f8ff", sideA: "#3ac0e0", sideB: "#7affd0", floor: "#03202a" },
    lights: { skyColor: "#d0f8ff", groundColor: "#062028", keyIntensity: 56, keyColor: "#d8fbff", fillIntensity: 0.75, fillColor: "#4ad0e8", rimIntensity: 0.55 },
    ground: "#0a3a48",
    props: { kind: "bubbles", count: 40, radius: 7, palette: ["#7ae8e0", "#4ad0e8", "#a0f8d0"] },
  },
];

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function buildDecor(theme, seed = 1) {
  const group = new THREE.Group();
  group.name = "decor";
  const cfg = theme.props ?? { kind: "none" };
  const kind = cfg.kind;

  group.add(groundMesh(theme.ground ?? "#20242c", 46, seed + 21, {
    stars: !!cfg.stars,
    accent: cfg.starAccent ?? theme.accent ?? "#3a5cff",
    accent2: cfg.starAccent2 ?? theme.rim ?? "#b06bff",
    nebula: cfg.nebula ?? 0.6,
  }));

  if (cfg.stars) {
    group.add(starfield(mulberry32((seed * 40503 + 7) >>> 0)));
  }

  if (kind === "none") return group;

  const rnd = mulberry32((seed * 2654435761) >>> 0);
  const count = cfg.count ?? 20;
  const radius = cfg.radius ?? 7.5;
  const builder = PROPS[
    kind === "towers" ? "tower" : kind === "pines" ? "pine" : kind === "palms" ? "palm" : kind === "cactus" ? "cactus" : kind === "crystals" ? "crystal" : kind === "lollipops" ? "lollipop" : kind === "bubbles" ? "bubble" : kind === "torches" ? "torch" : null
  ];
  if (!builder) return group;

  const inner = kind === "bubbles" ? 2.2 : 4.4;
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + rnd() * 0.35;
    const r = inner + rnd() * (radius - inner);
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r * 0.76;
    const p = builder(rnd, theme);
    p.position.x = x;
    p.position.z = z;
    if (kind === "bubbles") p.position.y = rnd() * 2.6;
    if (kind !== "bubbles" && kind !== "torches") p.position.y = -0.28;
    p.rotation.y = rnd() * Math.PI * 2;
    const sc = kind === "towers" ? 0.8 + rnd() * 0.6 : 0.85 + rnd() * 0.45;
    p.scale.setScalar(sc);
    group.add(p);
  }

  if (theme.rim) {
    const ringGeo = new THREE.RingGeometry(radius + 2.2, radius + 2.5, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: theme.accent ?? theme.rim,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.35,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.275;
    group.add(ring);
  }
  return group;
}
