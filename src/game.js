import * as THREE from "https://esm.sh/three@0.170.0";
import { createRenderer, createEnvironment, createLights, fitPerspectiveCamera, makeSkyDome, disposeTree } from "./gfx.js";
import { buildTable, TABLE_DEFAULTS } from "./table.js";
import { getTheme, buildDecor } from "./themes.js";
import { ballTexture, BALL_COLORS, aimDashTexture, blobShadowTexture, dotTexture, woodTexture } from "./textures.js";
import { PoolSim } from "./physics.js";
import { getLevel, cueSpot } from "./levels.js";
import { getBonusLevel, MODE_BY_ID } from "./modes.js";
import { sfx } from "./audio.js";

const UP = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _axis = new THREE.Vector3();

const MAX_PTS = 96;
const SIM_DT = 1 / 60;
const QUALITY_TIERS = [
  { pixelRatio: 1, shadows: false, shadowSize: 1024 },
  { pixelRatio: 1.5, shadows: true, shadowSize: 1024 },
  { pixelRatio: 2, shadows: true, shadowSize: 1536 },
  { pixelRatio: 2, shadows: true, shadowSize: 2048 },
];

/* Merge a bonus mode's palette over a base theme (deep-merging the nested
 * blocks so a mode only has to specify what it changes). */
function mergeTheme(base, ov) {
  if (!ov) return base;
  const out = { ...base, ...ov };
  for (const k of ["lights", "fog", "env", "sky", "props"]) {
    if (ov[k]) out[k] = { ...base[k], ...ov[k] };
  }
  return out;
}

class Ribbon {
  constructor(color, width, y, maxSegs = MAX_PTS - 1, opacity = 1, opts = {}) {
    this.width = width;
    this.y = y;
    this.maxSegs = maxSegs;
    this.period = opts.period ?? 0.085;
    this.flow = 0;
    const pos = new Float32Array(maxSegs * 4 * 3);
    const uv = new Float32Array(maxSegs * 4 * 2);
    const idx = new Uint16Array(maxSegs * 6);
    for (let i = 0; i < maxSegs; i++) {
      const o = i * 4;
      const k = i * 6;
      idx[k] = o; idx[k + 1] = o + 1; idx[k + 2] = o + 2;
      idx[k + 3] = o; idx[k + 4] = o + 2; idx[k + 5] = o + 3;
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.matOpts = {
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    };
    if (opts.dashed) {
      this.map = aimDashTexture({ dashes: opts.dashes ?? 3 });
      this.matOpts.map = this.map;
      this.matOpts.alphaTest = 0.01;
    }
    this.mat = new THREE.MeshBasicMaterial(this.matOpts);
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }
  advance(dt, speed = 0.28) {
    if (!this.map) return;
    this.flow -= dt * speed;
    this.map.offset.x = this.flow;
  }
  setTint(color) {
    if (this.mat.color.getHex() !== color) this.mat.color.setHex(color);
  }
  update(points, visible = true) {
    this.mesh.visible = visible && points.length > 1;
    if (!visible || points.length < 2) return;
    const n = Math.min(points.length, MAX_PTS);
    const pos = this.geo.attributes.position.array;
    const uv = this.geo.attributes.uv.array;
    let segs = 0;
    let run = 0;
    for (let i = 0; i < n - 1 && segs < this.maxSegs; i++) {
      const ax = points[i].x, az = points[i].z;
      const bx = points[i + 1].x, bz = points[i + 1].z;
      let dx = bx - ax, dz = bz - az;
      const L = Math.hypot(dx, dz);
      if (L < 1e-6) continue;
      dx /= L; dz /= L;
      const px = -dz * this.width, pz = dx * this.width;
      const o = segs * 12;
      pos[o + 0] = ax + px; pos[o + 1] = this.y; pos[o + 2] = az + pz;
      pos[o + 3] = ax - px; pos[o + 4] = this.y; pos[o + 5] = az - pz;
      pos[o + 6] = bx - px; pos[o + 7] = this.y; pos[o + 8] = bz - pz;
      pos[o + 9] = bx + px; pos[o + 10] = this.y; pos[o + 11] = bz + pz;
      const u0 = run / this.period;
      const u1 = (run + L) / this.period;
      const u = segs * 8;
      uv[u + 0] = u0; uv[u + 1] = 0;
      uv[u + 2] = u0; uv[u + 3] = 1;
      uv[u + 4] = u1; uv[u + 5] = 1;
      uv[u + 6] = u1; uv[u + 7] = 0;
      run += L;
      segs++;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.uv.needsUpdate = true;
    this.geo.setDrawRange(0, segs * 6);
  }
}

function cueMesh(def) {
  const g = new THREE.Group();
  const wood = new THREE.Color(def.wood ?? "#b98a4f");
  const wrap = new THREE.Color(def.wrap ?? "#5b3b22");
  const L = 1.06;
  const cyl = (r1, r2, h, y, mat) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 16), mat);
    m.position.y = y;
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const grain = woodTexture(def.wood ?? "#b98a4f", { seed: 21, W: 512, H: 128, glossy: true });
  grain.rotation = Math.PI / 2;
  grain.center.set(0.5, 0.5);
  grain.repeat.set(1, 1);
  const shaftMat = new THREE.MeshStandardMaterial({ map: grain, roughness: 0.34, metalness: 0.05, envMapIntensity: 0.9 });
  const wrapMat = new THREE.MeshStandardMaterial({ color: wrap, roughness: 0.6, metalness: 0.08 });
  const ferruleMat = new THREE.MeshStandardMaterial({ color: "#f4f1e8", roughness: 0.25, metalness: 0.05 });
  const tipMat = new THREE.MeshStandardMaterial({ color: "#2f6fd0", roughness: 0.55 });

  const tipLen = 0.012;
  const ferLen = 0.022;
  cyl(0.0042, 0.0042, tipLen, -tipLen / 2, tipMat);
  cyl(0.0055, 0.0055, ferLen, -tipLen - ferLen / 2, ferruleMat);
  const shaftLen = L * 0.62;
  cyl(0.0098, 0.0055, shaftLen, -tipLen - ferLen - shaftLen / 2, shaftMat);
  const wrapLen = L * 0.3;
  cyl(0.0112, 0.0098, wrapLen, -tipLen - ferLen - shaftLen - wrapLen / 2, wrapMat);
  const buttLen = L - tipLen - ferLen - shaftLen - wrapLen;
  cyl(0.0112, 0.0124, buttLen, -L + buttLen / 2, shaftMat);
  if (def.gems) {
    const ringMat = new THREE.MeshStandardMaterial({ color: wood, roughness: 0.15, metalness: 0.9, emissive: wood.clone().multiplyScalar(0.35), envMapIntensity: 1.6 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0126, 0.0026, 8, 20), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -L * 0.72;
    g.add(ring);
  }
  return g;
}

export class Game {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.events = opts.events ?? {};
    this.params = { ...TABLE_DEFAULTS, ...(opts.params ?? {}) };
    this.physics = opts.physics ?? {};

    this.renderer = createRenderer(canvas);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 220);

    this.fxGroup = new THREE.Group();
    this.scene.add(this.fxGroup);
    this.tableGroupHolder = new THREE.Group();
    this.scene.add(this.tableGroupHolder);
    this.bonusGroup = new THREE.Group();
    this.scene.add(this.bonusGroup);

    this.texCache = new Map();
    this.ballMeshes = [];
    this.sim = null;
    this.level = null;
    this.cueDef = { power: 1, spin: 1, aimBounces: 2, assist: true };
    this.state = "idle";
    this.aim = 0;
    this.power = 0;
    this.spin = { x: 0, y: 0 };
    this.shotsUsed = 0;
    this.fouls = 0;
    this.combo = 0;
    this.shake = { t: 0, mag: 0 };
    this.cueHidden = false;
    this.cueAnim = null;
    this.drag = null;
    this.portrait = true;
    this.clothY = 0.001;
    this.demo = true;
    this.demoT = 0;
    this._lastPointer = null;
    this.resizeObserver = null;
    this.paused = false;
    this.timeLimit = 0;
    this.timeLeft = 0;
    this.pendingBallInHand = false;
    this.placeSpot = null;
    this.placeValid = true;
    this.placeDrag = null;
    this._tickT = 0;
    this.assistMode = "auto";
    this.aimHelp = "basic";
    this.aimMaxAngles = 3;
    this._simAcc = 0;
    this.snapped = false;
    this._solKey = null;
    this._sols = null;
    this._pred = null;
    this._predKey = null;
    this.quality = "high";
    this.blobShadowTex = null;

    this.buildCue();
    this.buildGuide();
    this.bindInput();
    window.addEventListener("resize", () => this.resize());
    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  scene building                                                     */
  /* ------------------------------------------------------------------ */

  setTheme(themeId, overrides = null) {
    const theme = mergeTheme(getTheme(themeId), overrides);
    this.theme = theme;
    if (this.skyMesh) disposeTree(this.skyMesh);
    if (this.decor) disposeTree(this.decor);
    if (this.envRT) this.envRT.dispose();
    this.envRT = createEnvironment(this.renderer, theme.env);
    this.scene.environment = this.envRT.texture;
    this.scene.fog = new THREE.Fog(theme.fog.color, theme.fog.near, theme.fog.far);
    this.skyMesh = makeSkyDome(theme);
    this.scene.add(this.skyMesh);
    this.decor = buildDecor(theme, 1);
    this.scene.add(this.decor);
    if (this.lights) {
      this.scene.remove(this.lights.hemi, this.lights.key, this.lights.key.target, this.lights.fill, this.lights.rim);
    }
    this.lights = createLights(this.scene, theme.lights);
    this.rebuildTable(theme);
  }

  rebuildTable(theme) {
    if (this.table) {
      this.tableGroupHolder.remove(this.table.group);
      disposeTree(this.table.group);
    }
    this.table = buildTable(theme, this.params);
    this.tableGroupHolder.add(this.table.group);
    this.decal = this.table.decal;
    this.clothY = 0.001;
  }

  buildCue() {
    this.cueGroup = new THREE.Group();
    this.scene.add(this.cueGroup);
    this.cuePull = 0;
  }

  setCue(def) {
    this.cueDef = { power: 1, spin: 1, aimBounces: 2, assist: true, ...def };
    if (this.cueObj) {
      this.cueGroup.remove(this.cueObj);
      disposeTree(this.cueObj);
    }
    this.cueObj = cueMesh(this.cueDef);
    this.cueGroup.add(this.cueObj);
    if (this.sim) this.sim.maxSpeed = (this.physics.maxSpeed ?? 13) * this.hitMul() * (this.cueDef.power ?? 1);
  }

  buildGuide() {
    this.guideGroup = new THREE.Group();
    this.scene.add(this.guideGroup);
    const accent = 0x8ef5c0;
    this.ribbon = new Ribbon(accent, 0.009, this.clothY + 0.0012, MAX_PTS - 1, 0.85, { dashed: true, dashes: 4, period: 0.085 });
    this.ribbonObj = new Ribbon(0xffffff, 0.0034, this.clothY + 0.0019, MAX_PTS - 1, 0.9, { dashed: true, dashes: 2, period: 0.048 });
    this.railRibbon = new Ribbon(accent, 0.0078, this.clothY + 0.0011, MAX_PTS - 1, 0.58, { dashed: true, dashes: 4, period: 0.085 });
    this.tangentRibbon = new Ribbon(0x9fd8ff, 0.006, this.clothY + 0.0012, 24, 0.7);
    this.objectRibbon = new Ribbon(0xff4d97, 0.011, this.clothY + 0.0012, 24, 0.95);
    this.pocketRibbon = new Ribbon(0x2bff88, 0.0095, this.clothY + 0.0024, 2, 1, { dashed: true, dashes: 3, period: 0.055 });
    this.solutionRibbon = new Ribbon(0xffa61e, 0.011, this.clothY + 0.0015, 2, 0.95, { dashed: true, dashes: 3, period: 0.06 });
    this.solObjectRibbon = new Ribbon(0xffa61e, 0.0105, this.clothY + 0.0014, 2, 0.9, { dashed: true, dashes: 4, period: 0.065 });
    this.guideGroup.add(this.ribbon.mesh, this.ribbonObj.mesh, this.railRibbon.mesh, this.tangentRibbon.mesh, this.objectRibbon.mesh, this.pocketRibbon.mesh, this.solutionRibbon.mesh, this.solObjectRibbon.mesh);

    this.ghost = new THREE.Mesh(
      new THREE.SphereGeometry(this.params.ballRadius * 1.005, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false })
    );
    this.ghost.renderOrder = 4;
    this.guideGroup.add(this.ghost);
    this.ghostRing = new THREE.Mesh(
      new THREE.RingGeometry(this.params.ballRadius * 0.98, this.params.ballRadius * 1.12, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide })
    );
    this.ghostRing.rotation.x = -Math.PI / 2;
    this.ghostRing.renderOrder = 4;
    this.guideGroup.add(this.ghostRing);

    const R = this.params.ballRadius;
    this.targetRing = new THREE.Mesh(
      new THREE.RingGeometry(R * 1.16, R * 1.5, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide })
    );
    this.targetRing.rotation.x = -Math.PI / 2;
    this.targetRing.renderOrder = 3;
    this.targetRing.visible = false;
    this.guideGroup.add(this.targetRing);

    this.solRing = new THREE.Mesh(
      new THREE.RingGeometry(R * 1.02, R * 1.32, 36),
      new THREE.MeshBasicMaterial({ color: 0xffa61e, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide })
    );
    this.solRing.rotation.x = -Math.PI / 2;
    this.solRing.renderOrder = 4;
    this.solRing.visible = false;
    this.guideGroup.add(this.solRing);

    this.placeGhost = new THREE.Mesh(      new THREE.SphereGeometry(R * 0.98, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false })
    );
    this.placeGhost.renderOrder = 4;
    this.placeGhost.visible = false;
    this.guideGroup.add(this.placeGhost);
    this.placeRing = new THREE.Mesh(
      new THREE.RingGeometry(R * 1.22, R * 1.6, 44),
      new THREE.MeshBasicMaterial({ color: 0x7ef2b0, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide })
    );
    this.placeRing.rotation.x = -Math.PI / 2;
    this.placeRing.renderOrder = 3;
    this.placeRing.visible = false;
    this.guideGroup.add(this.placeRing);
  }

  /* ------------------------------------------------------------------ */
  /*  ball meshes                                                        */
  /* ------------------------------------------------------------------ */

  texFor(number, special, seedKey) {
    const key = `${number}-${special}-${seedKey}`;
    if (this.texCache.has(key)) return this.texCache.get(key);
    const stripe = number > 8;
    const color = number == null ? "#f6f3ec" : BALL_COLORS[number] ?? "#dddddd";
    const tex = ballTexture({ number, color, stripe, special, seed: seedKey });
    this.texCache.set(key, tex);
    return tex;
  }

  ballMaterial(tex) {
    return new THREE.MeshPhysicalMaterial({
      map: tex,
      roughness: 0.055,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      envMapIntensity: 1.45,
    });
  }

  makeBallMesh(number, special) {
    const R = this.params.ballRadius;
    const geo = new THREE.SphereGeometry(R, 40, 28);
    const mat = this.ballMaterial(this.texFor(number, special, number ?? "cue"));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  makeBlobShadow() {
    if (!this.blobShadowTex) this.blobShadowTex = blobShadowTexture();
    const R = this.params.ballRadius;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(R * 5.4, R * 5.4),
      new THREE.MeshBasicMaterial({ map: this.blobShadowTex, transparent: true, opacity: 1, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 2;
    return m;
  }

  /* ------------------------------------------------------------------ */
  /*  level                                                              */
  /* ------------------------------------------------------------------ */

  loadLevel(levelNumber, opts = {}) {
    const level = opts.bonusId ? getBonusLevel(opts.bonusId, this.params) : getLevel(levelNumber, this.params);
    this.level = level;
    const mode = level.bonus ? MODE_BY_ID[level.mode] : null;
    this.bonus = mode ? { id: mode.id, mode, level, state: { pots: 0, score: 0 }, t: 0 } : null;
    const themeOv = mode?.palette ?? null;
    if (!this.theme || this.theme.id !== level.themeId || this._themeOv !== themeOv) {
      this.setTheme(level.themeId, themeOv);
      this._themeOv = themeOv;
    }

    for (const bm of this.ballMeshes) {
      this.scene.remove(bm.mesh);
      bm.mesh.geometry.dispose();
      bm.mesh.material.dispose();
      if (bm.shadow) {
        this.scene.remove(bm.shadow);
        bm.shadow.geometry.dispose();
        bm.shadow.material.dispose();
      }
    }
    this.ballMeshes = [];
    this.fxList = [];
    this.puffList = [];
    while (this.fxGroup.children.length) this.fxGroup.remove(this.fxGroup.children[0]);

    const P = this.params;
    this.sim = new PoolSim({
      ballRadius: P.ballRadius,
      halfLength: P.halfLength,
      halfWidth: P.halfWidth,
      cornerRadius: P.pocketRadius,
      sideRadius: P.sidePocketRadius,
      pocketInset: P.pocketInset,
      cornerMouth: P.cornerMouth,
      sideMouth: P.sideMouth,
      posts: mode?.posts ? mode.posts(P) : [],
      pocketsEnabled: !mode?.noPockets,
      ...this.physics,
    });
    this.sim.maxSpeed = (this.physics.maxSpeed ?? 13) * this.hitMul() * (this.cueDef.power ?? 1);

    const cs = level.cue ?? cueSpot(P);
    this.cueBall = this.sim.addBall(cs.x, cs.z, { r: P.ballRadius, data: { cue: true } });
    const cueMeshObj = this.makeBallMesh(null, null);
    this.scene.add(cueMeshObj);
    const cueShadow = this.makeBlobShadow();
    this.scene.add(cueShadow);
    this.ballMeshes.push({ ball: this.cueBall, mesh: cueMeshObj, number: null, special: null, drop: null, hidden: false, shadow: cueShadow });

    for (const b of level.balls) {
      const ball = this.sim.addBall(b.x, b.z, { r: P.ballRadius, data: { number: b.number, special: b.special } });
      const mesh = this.makeBallMesh(b.number, b.special);
      this.scene.add(mesh);
      const sh = this.makeBlobShadow();
      this.scene.add(sh);
      this.ballMeshes.push({ ball, mesh, number: b.number, special: b.special, drop: null, hidden: false, shadow: sh });
    }

    this.remaining = level.balls.filter((b) => this.isRequired(b)).length;
    this.rack = this.table?.rack ? { slot: 0 } : null;
    this.state = "aim";
    this.aim = 0;
    this.power = 0;
    this.spin = { x: 0, y: 0 };
    this.shotsUsed = 0;
    this.fouls = 0;
    this.combo = 0;
    this.pottedOrderCount = 0;
    this.pendingFail = null;
    this.pendingBallInHand = false;
    this.placeSpot = null;
    this.placeDrag = null;
    this.settledFor = 0;
    this.cueHidden = false;
    this.cuePull = 0;
    this.cueAnim = null;
    this.timeLimit = level.timeLimit || 0;
    this.timeLeft = this.timeLimit;
    this._tickT = 0;
    this._pred = null;
    this._predKey = null;
    if (this.placeRing) this.placeRing.visible = false;
    if (this.placeGhost) this.placeGhost.visible = false;
    this.clearBonusProps();
    if (mode) {
      this.buildBonusProps(mode);
      if (mode.setup) mode.setup(this);
      this.emitBonusProgress();
    }
    this.faceCueToward();
    this.resize();
    this.emit("start", { level });
    this.emit("timer", { timeLeft: this.timeLeft, timeLimit: this.timeLimit });
    return level;
  }

  isRequired(b) {
    const o = this.level.objective;
    if (!o) return true;
    if (o.type === "group") {
      const SOL = [1, 2, 3, 4, 5, 6, 7];
      const STR = [9, 10, 11, 12, 13, 14, 15];
      return (o.group === "solids" ? SOL : STR).includes(b.number);
    }
    if (o.type === "forbid") return b.number !== o.ball;
    return true;
  }

  faceCueToward() {
    let best = null;
    let bestD = Infinity;
    const c = this.cueBall;
    for (const bm of this.ballMeshes) {
      if (bm.ball === c || bm.ball.potted) continue;
      const d = Math.hypot(bm.ball.x - c.x, bm.ball.z - c.z);
      if (d < bestD) { bestD = d; best = bm.ball; }
    }
    if (best) this.aim = Math.atan2(best.z - c.z, best.x - c.x);
  }

  findFreeSpot(px, pz, ignoreId = null) {
    const P = this.params;
    const R = P.ballRadius;
    const cs = cueSpot(P);
    const sx = Number.isFinite(px) ? px : cs.x;
    const sz = Number.isFinite(pz) ? pz : cs.z;
    if (this.sim.canPlace(sx, sz, R, ignoreId)) return { x: sx, z: sz };
    for (let ring = 1; ring < 50; ring++) {
      const rad = ring * 0.05;
      const steps = 6 + ring * 2;
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2 + ring * 0.7;
        const x = sx + Math.cos(a) * rad;
        const z = sz + Math.sin(a) * rad;
        if (this.sim.canPlace(x, z, R, ignoreId)) return { x, z };
      }
    }
    if (this.sim.canPlace(cs.x, cs.z, R, ignoreId)) return { x: cs.x, z: cs.z };
    for (let i = 0; i < 800; i++) {
      const x = (Math.random() * 2 - 1) * (P.halfLength - R);
      const z = (Math.random() * 2 - 1) * (P.halfWidth - R);
      if (this.sim.canPlace(x, z, R, ignoreId)) return { x, z };
    }
    return { x: cs.x, z: cs.z };
  }

  /* ------------------------------------------------------------------ */
  /*  camera                                                             */
  /* ------------------------------------------------------------------ */

  resize() {
    const canvas = this.canvas;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (w < 2 || h < 2) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.portrait = h >= w;
    this.fitCamera();
  }

  fitCamera(yawExtra = 0, pitchExtra = 0) {
    if (!this.table) return;
    const zoom = this.portrait ? 0.94 : 1.0;
    const b = this.table.bounds;
    const box = { min: [...b.min], max: [...b.max] };
    const rack = this.table.rack;
    if (rack) {
      box.max[0] = Math.max(box.max[0], rack.frontX + 0.04);
      box.min[1] -= 0.04; /* a little air under the return case */
    }
    /* centre the frame on the table *plus* the ball-return case so the case is
     * never cropped (in portrait that lifts the table, clearing the bottom bar) */
    const targetX = rack ? (box.min[0] + box.max[0]) / 2 : 0;
    fitPerspectiveCamera(this.camera, {
      target: new THREE.Vector3(targetX, 0.02, 0),
      pitch: THREE.MathUtils.degToRad((this.portrait ? 48 : 39) + pitchExtra),
      yaw: (this.portrait ? 0 : Math.PI / 2) + yawExtra,
      box,
      margin: 1.05,
      zoom,
    });
    if (this.decal) this.decal.rotation.z = this.portrait ? Math.PI / 2 : 0;
  }

  applyQuality(q) {
    this.quality = q || "auto";
    this.autoQuality = this.quality === "auto";
    this.qualityTier = this.quality === "low" ? 0 : this.quality === "high" ? 3 : 2;
    this.qualityMin = this.autoQuality ? 0 : this.qualityTier;
    this.qualityMax = this.autoQuality ? 3 : this.qualityTier;
    this._ft = [];
    this._bad = 0;
    this._good = 0;
    this.applyQualityTier();
  }

  applyQualityTier() {
    const t = QUALITY_TIERS[Math.max(0, Math.min(QUALITY_TIERS.length - 1, this.qualityTier))];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, t.pixelRatio));
    this.renderer.shadowMap.enabled = t.shadows;
    if (this.lights?.key) {
      this.lights.key.castShadow = t.shadows;
      const sh = this.lights.key.shadow;
      if (sh.mapSize.width !== t.shadowSize) {
        sh.mapSize.set(t.shadowSize, t.shadowSize);
        if (sh.map) {
          sh.map.dispose();
          sh.map = null;
        }
      }
    }
    this.resize();
  }

  /* Adaptive quality ("auto"): watch real frame times and step the tier down
   * when the device cannot hold the target, back up when it has headroom, so a
   * weak phone keeps a smooth framerate instead of dropping frames. */
  adaptQuality(frameMs) {
    if (!this.autoQuality || !(frameMs > 0) || frameMs > 250) return;
    this._ft = this._ft || [];
    this._ft.push(frameMs);
    if (this._ft.length < 60) return;
    const sorted = this._ft.slice().sort((a, b) => a - b);
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    this._ft.length = 0;
    if (p90 > 21) {
      this._bad++;
      this._good = 0;
    } else if (p90 < 12.5) {
      this._good++;
      this._bad = 0;
    } else {
      this._bad = 0;
      this._good = 0;
    }
    if (this._bad >= 2 && this.qualityTier > this.qualityMin) {
      this.qualityTier--;
      this._bad = 0;
      this.applyQualityTier();
    } else if (this._good >= 6 && this.qualityTier < this.qualityMax) {
      this.qualityTier++;
      this._good = 0;
      this.applyQualityTier();
    }
  }

  /* ------------------------------------------------------------------ */
  /*  input                                                              */
  /* ------------------------------------------------------------------ */

  bindInput() {
    const c = this.canvas;
    const opts = { passive: false };
    c.addEventListener("pointerdown", (e) => this.onDown(e), opts);
    c.addEventListener("pointermove", (e) => this.onMove(e), opts);
    c.addEventListener("pointerup", (e) => this.onUp(e), opts);
    c.addEventListener("pointercancel", (e) => this.onUp(e), opts);
    window.addEventListener("keydown", (e) => this.onKey(e));
  }

  pointerToPlane(e) {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    _v1.set(nx, ny, 0.5).unproject(this.camera);
    _v2.copy(_v1).sub(this.camera.position).normalize();
    const t = (this.params.ballRadius - this.camera.position.y) / _v2.y;
    if (!isFinite(t) || t < 0) return null;
    _v1.copy(this.camera.position).addScaledVector(_v2, t);
    return { x: _v1.x, z: _v1.z };
  }

  onDown(e) {
    if (this.paused) return;
    if (this.state === "placing") {
      this.canvas.setPointerCapture?.(e.pointerId);
      this.placeDrag = { id: e.pointerId };
      const p = this.pointerToPlane(e);
      if (p) this.tryPlace(p);
      e.preventDefault();
      return;
    }
    if (this.state !== "aim") return;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.drag = {
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      moved: 0,
      aim0: this.aim,
      acc: 0,
      ang: null,
    };
    const p0 = this.pointerToPlane(e);
    if (p0 && this.cueBall) {
      const vx = p0.x - this.cueBall.x;
      const vz = p0.z - this.cueBall.z;
      if (Math.hypot(vx, vz) > 0.09) this.drag.ang = Math.atan2(vz, vx);
    }
    e.preventDefault();
  }

  onMove(e) {
    if (this.placeDrag && e.pointerId === this.placeDrag.id) {
      if (this.state === "placing") {
        const p = this.pointerToPlane(e);
        if (p) this.tryPlace(p);
      }
      e.preventDefault();
      return;
    }
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const dx = e.clientX - this.drag.sx;
    const dy = e.clientY - this.drag.sy;
    const dist = Math.hypot(dx, dy);
    this.drag.moved = Math.max(this.drag.moved, dist);
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    if (dist > 8) {
      this.updateAimFromDrag(e);
      e.preventDefault();
    }
  }

  tryPlace(p) {
    if (!p || !this.cueBall) return;
    const P = this.params;
    const R = P.ballRadius;
    const hl = P.halfLength - R - 0.003;
    const hw = P.halfWidth - R - 0.003;
    const x = Math.max(-hl, Math.min(hl, p.x));
    const z = Math.max(-hw, Math.min(hw, p.z));
    this.placeSpot = { x, z };
    this.placeValid = this.sim.canPlace(x, z, R, this.cueBall.id);
    if (this.placeRing) {
      this.placeRing.material.color.setHex(this.placeValid ? 0x7ef2b0 : 0xff5b86);
      this.placeGhost.material.color.setHex(this.placeValid ? 0xffffff : 0xff9aa8);
    }
  }

  confirmPlace() {
    if (this.state !== "placing" || !this.placeSpot || !this.placeValid) return false;
    const P = this.params;
    const c = this.cueBall;
    c.x = this.placeSpot.x;
    c.z = this.placeSpot.z;
    c.vx = c.vz = c.wx = c.wy = c.wz = 0;
    c.potted = false;
    c.pocket = null;
    const bm = this.ballMeshes.find((b) => b.ball === c);
    if (bm) {
      bm.drop = null;
      bm.mesh.scale.setScalar(1);
      bm.mesh.visible = true;
      bm.mesh.position.set(c.x, P.ballRadius, c.z);
    }
    this.pendingBallInHand = false;
    this.placeSpot = null;
    if (this.placeRing) this.placeRing.visible = false;
    if (this.placeGhost) this.placeGhost.visible = false;
    this.state = "aim";
    sfx.click();
    this.faceCueToward();
    this.emit("ready", { shotsUsed: this.shotsUsed, shots: this.level.shots });
    return true;
  }

  beginBallInHand() {
    this.pendingBallInHand = false;
    const P = this.params;
    const c = this.cueBall;
    const bm = this.ballMeshes.find((b) => b.ball === c);
    if (bm) bm.mesh.visible = false;
    const cs = cueSpot(P);
    const start = this.sim.canPlace(cs.x, cs.z, P.ballRadius, c.id)
      ? cs
      : this.findFreeSpot(cs.x, cs.z, c.id);
    this.placeSpot = { x: start.x, z: start.z };
    this.placeValid = this.sim.canPlace(start.x, start.z, P.ballRadius, c.id);
    this.state = "placing";
    this.cueAnim = null;
    this.cueGroup.visible = false;
    if (this.placeRing) {
      this.placeRing.material.color.setHex(this.placeValid ? 0x7ef2b0 : 0xff5b86);
      this.placeRing.visible = true;
    }
    if (this.placeGhost) this.placeGhost.visible = true;
    this.emit("banner", { text: "Ball in hand — drag to place the cue ball" });
    this.emit("ballInHand", {});
  }

  updateAimFromDrag(e) {
    const p = this.pointerToPlane(e);
    if (!p || !this.cueBall) return;
    const c = this.cueBall;
    const vx = p.x - c.x;
    const vz = p.z - c.z;
    const len = Math.hypot(vx, vz);
    /* Aiming is RELATIVE: it is the rotation of the pointer *around* the cue
     * ball that turns the aim, scaled by aimDragGain (main.pjs `aiming.dragGain`).
     * A gain below 1 makes the same hand movement turn the aim far less, which
     * is what makes fine aiming possible (and the aim no longer jumps to the
     * pointer when the drag starts). */
    if (len > 0.09) {
      const ang = Math.atan2(vz, vx);
      if (this.drag.ang === null) {
        this.drag.ang = ang;
      } else {
        let d = ang - this.drag.ang;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) < 1.1) this.drag.acc += d; /* ignore wild jumps near the ball */
        this.drag.ang = ang;
      }
      this.aim = this.drag.aim0 + this.drag.acc * (this.aimDragGain ?? 0.45);
    }
    /* keep a magnetic lock sticky: re-base the drag on the snapped angle so the
     * next pointer move continues from it instead of pulling the aim back off */
    if (this.snapAim()) {
      this.drag.aim0 = this.aim;
      this.drag.acc = 0;
    }
    const dx = e.clientX - this.drag.sx;
    const dy = e.clientY - this.drag.sy;
    const screenDist = Math.hypot(dx, dy);
    this.power = Math.max(0, Math.min(1, (screenDist - 8) / 170));
    this.emit("aim", { power: this.power, angle: this.aim });
  }

  onUp(e) {
    if (this.placeDrag && e.pointerId === this.placeDrag.id) {
      this.placeDrag = null;
      if (this.state === "placing") this.confirmPlace();
      return;
    }
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const d = this.drag;
    this.drag = null;
    const dt = performance.now() - d.t;
    if (d.moved < 8 && dt < 320) {
      // tap: rotate aim toward the tapped position
      const p = this.pointerToPlane(e);
      if (p && this.cueBall) {
        const vx = p.x - this.cueBall.x;
        const vz = p.z - this.cueBall.z;
        if (Math.hypot(vx, vz) > 0.12) {
          this.aim = Math.atan2(vz, vx);
          this.snapAim();
          this.emit("aim", { power: this.power, angle: this.aim });
          sfx.ui();
        }
      }
      this.power = 0;
      this.emit("aim", { power: 0, angle: this.aim });
      return;
    }
    if (this.power > 0.06) this.shoot();
    else {
      this.power = 0;
      this.emit("aim", { power: 0, angle: this.aim });
    }
  }

  onKey(e) {
    if (e.key === "Escape" || e.key === "p" || e.key === "P") {
      if (this.state !== "idle") {
        e.preventDefault();
        this.emit("pauseToggle", {});
      }
      return;
    }
    if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      this.emit("muteToggle", {});
      return;
    }
    if (e.key === "r" || e.key === "R") {
      if (this.state !== "idle" && this.level) {
        e.preventDefault();
        this.emit("restart", { level: this.level.number });
      }
      return;
    }
    if (this.paused) return;
    if (this.state !== "aim") {
      if (e.key === " " && this.state === "idle") return;
      return;
    }
    const step = e.shiftKey ? 0.002 : 0.02;
    if (e.key === "ArrowLeft") { this.aim -= step; e.preventDefault(); }
    else if (e.key === "ArrowRight") { this.aim += step; e.preventDefault(); }
    else if (e.key === "ArrowUp") { this.power = Math.min(1, this.power + 0.06); e.preventDefault(); }
    else if (e.key === "ArrowDown") { this.power = Math.max(0, this.power - 0.06); e.preventDefault(); }
    else if (e.key === " ") { this.shoot(0.62); e.preventDefault(); }
    else return;
    this.emit("aim", { power: this.power, angle: this.aim });
  }

  nudgeAim(delta) {
    if (this.state !== "aim") return;
    this.aim += delta;
    this.snapAim();
    this.emit("aim", { power: this.power, angle: this.aim });
  }

  /* ------------------------------------------------------------------ */
  /*  shooting                                                           */
  /* ------------------------------------------------------------------ */

  hitMul() {
    const m = this.physics?.hitPower;
    return Number.isFinite(m) && m > 0 ? m : 1.15;
  }

  shoot(powerOverride = null) {
    if (this.state !== "aim" || !this.cueBall) return;
    const pw = powerOverride ?? this.power;
    if (pw <= 0.02) return;
    const cue = this.cueDef;
    const pm = cue.power ?? 1;
    const speed = (2.2 + pw * 10.8) * this.hitMul() * pm;
    const dx = Math.cos(this.aim);
    const dz = Math.sin(this.aim);
    const spinSide = (this.spin.x / 0.5) * (cue.spin ?? 1);
    const spinTop = (-this.spin.y / 0.5) * (cue.spin ?? 1);
    this.sim.strike(this.cueBall, dx, dz, speed, { top: spinTop, side: spinSide });
    this.shotsUsed++;
    this.combo = 0;
    this.state = "rolling";
    this._simAcc = 0;
    this.bonus?.mode.onShot?.(this);
    this.power = 0;
    this.cueAnim = { t: 0, dur: 0.085, from: this.cuePull };
    this.settledFor = 0;
    sfx.cue(pw);
    this.spawnPuff(this.cueBall.x, this.cueBall.z, 0xa8d8ff, 6, 0.05);
    this.emit("shot", { power: pw, shotsUsed: this.shotsUsed, shots: this.level.shots });
    this.emit("aim", { power: 0, angle: this.aim });
  }

  /* ------------------------------------------------------------------ */
  /*  update                                                             */
  /* ------------------------------------------------------------------ */

  update(dt) {
    if (this.paused) {
      this.syncBalls(0);
      return;
    }
    this.adaptQuality(dt * 1000);
    if (this.demo) {
      this.demoT += dt;
      if (!this._resizeT) this._resizeT = 0;
      this._resizeT += dt;
      if (this._resizeT > 0.05) {
        this._resizeT = 0;
        this.fitCamera(Math.sin(this.demoT * 0.22) * 0.42, Math.sin(this.demoT * 0.15) * 5);
      }
      if (this.state === "aim" && this.cueBall) {
        this.aim += dt * 0.12;
        const pred = this.predictCurrent();
        this.updateGuideFrom(pred);
      }
      this.syncBalls(dt);
      this.updateCue(dt);
      this.advanceGuides(dt);
      return;
    }
    if (this.shake.t > 0) this.shake.t = Math.max(0, this.shake.t - dt);
    if (this.bonus) this.updateBonus(dt);
    if (this.state === "rolling" || this.state === "settling") {
      this._simAcc = (this._simAcc ?? 0) + dt;
      let steps = 0;
      while (this._simAcc >= SIM_DT && steps < 8) {
        const events = this.sim.step(SIM_DT);
        this.handleEvents(events);
        this._simAcc -= SIM_DT;
        steps++;
      }
      if (steps >= 8) this._simAcc = 0;
    }
    this.syncBalls(dt);
    this.updateDrops(dt);
    this.updateRack(dt);
    this.updateFx(dt);
    this.updateCue(dt);
    this.updateGuide();
    this.updatePlacement();
    this.advanceGuides(dt);
    this.updateTimer(dt);
    if (this.state === "rolling") {
      if (!this.sim.isMoving()) {
        this.state = "settling";
        this.settledFor = 0;
      }
    } else if (this.state === "settling") {
      this.settledFor += dt;
      if (this.settledFor > 0.32) this.resolveShot();
    }
  }

  advanceGuides(dt) {
    if (this.ribbon) this.ribbon.advance(dt, 0.55);
    if (this.ribbonObj) this.ribbonObj.advance(dt, 0.85);
    if (this.pocketRibbon) this.pocketRibbon.advance(dt, 0.7);
  }

  updatePlacement() {
    const placing = this.state === "placing" && this.placeSpot;
    if (this.placeRing) this.placeRing.visible = !!placing;
    if (this.placeGhost) this.placeGhost.visible = !!placing;
    if (!placing) return;
    const R = this.params.ballRadius;
    const p = this.placeSpot;
    this.placeGhost.position.set(p.x, R, p.z);
    this.placeRing.position.set(p.x, this.clothY + 0.0018, p.z);
    const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.09;
    this.placeRing.scale.setScalar(pulse);
  }

  updateTimer(dt) {
    if (this.timeLimit <= 0) return;
    if (this.state !== "aim" && this.state !== "rolling" && this.state !== "settling") return;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    this._tickT += dt;
    if (this._tickT >= 0.1) {
      this._tickT = 0;
      this.emit("tick", { timeLeft: this.timeLeft, timeLimit: this.timeLimit });
    }
    if (this.timeLeft <= 0) this.fail("Time's up");
  }

  handleEvents(events) {
    for (const ev of events) {
      if (ev.type === "ball") {
        const s = Math.min(1, ev.strength / 6);
        if (s > 0.06) sfx.ball(s);
      } else if (ev.type === "cushion") {
        const s = Math.min(1, ev.strength / 6);
        if (s > 0.08) sfx.cushion(s);
        this.bonus?.mode.onCushion?.(this, ev);
      } else if (ev.type === "bumper") {
        this.bonus?.mode.onBumper?.(this, ev);
      } else if (ev.type === "pocket") {
        this.onPocket(ev.ball, ev.pocket);
      }
    }
  }

  onPocket(ball, pocket) {
    const bm = this.ballMeshes.find((b) => b.ball === ball);
    if (!bm) return;
    const P = this.params;

    if (ball === this.cueBall) {
      sfx.foul();
      this.fouls++;
      this.combo = 0;
      this.pendingBallInHand = true;
      bm.drop = { t: 0, sx: ball.x, sz: ball.z, tx: pocket.x, tz: pocket.z };
      this.popLabel(pocket.x, pocket.z, "FOUL", "#ff6b8a");
      this.emit("foul", { reason: "scratch" });
      return;
    }

    const rx = ball.x;
    const rz = ball.z;
    bm.drop = { t: 0, sx: rx, sz: rz, tx: pocket.x, tz: pocket.z };
    sfx.pocket();
    this.spawnRipple(pocket.x, pocket.z, 0xffe9a8);
    this.spawnPuff(pocket.x, pocket.z, 0xffe9a8, 5, 0.03);

    const o = this.level.objective;
    const num = ball.data?.number;
    let credited = true;

    /* A ball potted at the wrong moment comes back with a foul instead of ending
     * the level: recovering is far fairer than an instant, unrecoverable loss
     * (accidental caroms into a "last" or "forbidden" ball are common). */
    const respot = (label, color) => {
      this.fouls++;
      const spot = this.findFreeSpot(ball.x, ball.z, ball.id);
      ball.potted = false;
      ball.pocket = null;
      ball.x = spot.x;
      ball.z = spot.z;
      ball.vx = ball.vz = ball.wx = ball.wy = ball.wz = 0;
      bm.drop = null;
      bm.mesh.scale.setScalar(1);
      bm.mesh.position.set(spot.x, P.ballRadius, spot.z);
      bm.mesh.visible = true;
      this.popLabel(spot.x, spot.z, label, color);
      sfx.foul();
      this.emit("pocket", { number: num, remaining: this.remaining, special: bm.special, credited: false });
    };

    if (o.type === "order") {
      const sorted = this.level.balls.map((b) => b.number).sort((a, b) => a - b);
      const expected = sorted[this.pottedOrderCount ?? 0];
      if (num !== expected) {
        respot("WRONG ORDER " + num, "#ff9a4a");
        return;
      }
      this.pottedOrderCount = (this.pottedOrderCount ?? 0) + 1;
    }

    if (o.type === "last" && num === o.ball) {
      const others = this.ballMeshes.filter((b) => b.ball !== this.cueBall && !b.ball.potted && b.number !== o.ball).length;
      if (others > 0) {
        respot(num + " IS LAST!", "#ff4a6b");
        return;
      }
    }
    if (o.type === "forbid" && num === o.ball) {
      respot("FORBIDDEN " + num, "#ff4a6b");
      return;
    }

    const coinMul = (this.cueDef.coinBonus ?? 1) * (this.bonus ? 0.35 : 1);
    if (bm.special === "star") {
      const bonus = Math.round(40 * coinMul);
      this.emit("bonus", { coins: bonus });
      this.popLabel(ball.x, ball.z, `+${bonus}`, "#ffd24a");
      sfx.coin();
    } else if (bm.special === "gold") {
      const bonus = Math.round(120 * coinMul);
      this.emit("bonus", { coins: bonus });
      this.popLabel(ball.x, ball.z, `+${bonus}`, "#ffd24a");
      sfx.coin();
    } else if (bm.special === "gem") {
      this.emit("bonusGems", { gems: 1 });
      this.popLabel(ball.x, ball.z, "+1 GEM", "#7ee0ff");
      sfx.gem();
    } else if (bm.special === "time") {
      if (this.timeLimit > 0) {
        this.timeLeft += 6;
        this.popLabel(ball.x, ball.z, "+6s", "#7ee0ff");
        this.emit("timer", { timeLeft: this.timeLeft, timeLimit: this.timeLimit });
      } else {
        this.level.shots += 1;
        this.popLabel(ball.x, ball.z, "+1 SHOT", "#7ee0ff");
        this.emit("shot", { power: 0, shotsUsed: this.shotsUsed, shots: this.level.shots });
      }
      sfx.gem();
    } else if (bm.special === "bomb") {
      sfx.bomb();
      this.shake.t = 0.45;
      this.shake.mag = 0.03;
      this.explode(pocket.x, pocket.z, 0.46, 4.6);
      this.popLabel(ball.x, ball.z, "BOOM!", "#ff8a3a");
    }

    if (credited && this.isRequired(ball.data)) {
      this.remaining = Math.max(0, this.remaining - 1);
      this.combo++;
      if (this.combo >= 2) {
        const coins = Math.round(10 * (this.combo - 1) * coinMul);
        this.emit("bonus", { coins });
        this.popLabel(ball.x, ball.z, `COMBO x${this.combo} +${coins}`, "#7ef2b0");
        sfx.star(Math.min(3, this.combo - 2));
      }
    } else if (credited) {
      this.combo++;
      if (this.combo >= 2) this.popLabel(ball.x, ball.z, `COMBO x${this.combo}`, "#7ef2b0");
    }
    this.emit("pocket", { number: num, remaining: this.remaining, special: bm.special, credited, combo: this.combo });
    if (this.bonus) {
      this.bonus.state.pots = (this.bonus.state.pots ?? 0) + 1;
      this.bonus.mode.onPocket?.(this, { ball, bm, num, pocket, credited });
      this.emitBonusProgress();
    }
  }

  explode(x, z, radius, force) {
    for (const b of this.sim.balls) {
      if (b.potted || b === this.cueBall) continue;
      const dx = b.x - x;
      const dz = b.z - z;
      const d = Math.hypot(dx, dz);
      if (d > radius || d < 1e-4) continue;
      const f = force * (1 - d / radius);
      b.vx += (dx / d) * f;
      b.vz += (dz / d) * f;
    }
    for (let i = 0; i < 3; i++) {
      this.spawnRipple(x, z, 0xffa04a, 0.14 + i * 0.1);
    }
    this.spawnPuff(x, z, 0xffa04a, 14, 0.1);
  }

  resolveShot() {
    if (this.pendingFail) {
      this.fail(this.pendingFail);
      return;
    }
    if (this.bonus) {
      if (this.bonusGoalMet()) {
        this.complete();
        return;
      }
      if (this.shotsUsed >= this.level.shots) {
        this.fail("Out of shots");
        return;
      }
      if (this.pendingBallInHand) {
        this.beginBallInHand();
        return;
      }
      this.state = "aim";
      this.emit("ready", { shotsUsed: this.shotsUsed, shots: this.level.shots });
      return;
    }
    const done = this.remaining === 0;
    if (done) {
      this.complete();
      return;
    }
    if (this.shotsUsed >= this.level.shots) {
      this.fail("Out of shots");
      return;
    }
    if (this.pendingBallInHand) {
      this.beginBallInHand();
      return;
    }
    this.state = "aim";
    this.emit("ready", { shotsUsed: this.shotsUsed, shots: this.level.shots });
  }

  stars() {
    if (this.bonus) return 3;
    const eff = this.shotsUsed + this.fouls;
    const par = this.level.par;
    let s = 3;
    if (eff > par) s = 2;
    if (eff > par + 2) s = 1;
    if (this.fouls >= 3) s = Math.min(s, 1);
    return s;
  }

  complete() {
    this.state = "complete";
    const stars = this.stars();
    sfx.win();
    this.popLabel(this.cueBall.x, this.cueBall.z, "CLEARED!", "#7ef2b0");
    this.emit("complete", { stars, shotsUsed: this.shotsUsed, fouls: this.fouls, level: this.level });
  }

  fail(reason) {
    this.state = "failed";
    sfx.lose();
    this.emit("fail", { reason, level: this.level });
  }

  /* ------------------------------------------------------------------ */
  /*  bonus stages                                                       */
  /* ------------------------------------------------------------------ */

  bonusGoalMet() {
    const b = this.bonus;
    if (!b?.mode.goal) return false;
    const g = b.mode.goal;
    if (g.type === "clear") return this.remaining <= 0;
    if (g.type === "pots") return (b.state.pots ?? 0) >= g.target;
    if (g.type === "score") return (b.state.score ?? 0) >= g.target;
    if (g.type === "fn") return !!g.check(this);
    return false;
  }

  bonusGoalText() {
    const b = this.bonus;
    if (!b?.mode.goalText) return "";
    return b.mode.goalText({ ...b.state, left: this.remaining, balls: this.ballMeshes.length });
  }

  emitBonusProgress() {
    if (!this.bonus) return;
    this.emit("bonusProgress", {
      text: this.bonusGoalText(),
      score: this.bonus.state.score ?? 0,
      pots: this.bonus.state.pots ?? 0,
      mode: this.bonus.mode.name,
      icon: this.bonus.mode.icon,
    });
  }

  bonusPop(text, color) {
    const c = this.cueBall;
    this.popLabel(c ? c.x : 0, c ? c.z : 0, text, color);
  }

  /* wipe anything a previous bonus mode left in the scene */
  clearBonusProps() {
    if (!this.bonusGroup) return;
    for (const child of [...this.bonusGroup.children]) {
      if (child.isLight) this.bonusGroup.remove(child);
    }
    disposeTree(this.bonusGroup);
    this.bonusGroup.clear();
  }

  buildBonusProps(mode) {
    if (!this.bonusGroup || !mode.posts) return;
    const col = mode.palette?.rim ?? "#7ef2b0";
    const cap = new THREE.Color(col);
    for (const p of this.sim.posts) {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(p.r, p.r * 1.08, 0.05, 30),
        new THREE.MeshStandardMaterial({ color: col, emissive: cap.clone().multiplyScalar(0.55), roughness: 0.32, metalness: 0.25 })
      );
      m.position.set(p.x, 0.025, p.z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.bonusGroup.add(m);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(p.r * 1.15, p.r * 1.5, 32),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.x, this.clothY + 0.0016, p.z);
      this.bonusGroup.add(ring);
    }
  }

  /* a translucent swirl that marks an active vortex field (CYCLONE) */
  bonusVortex(radius = 1.9) {
    const g = new THREE.Group();
    const rings = 3;
    const arms = 4;
    for (let ring = 0; ring < rings; ring++) {
      const rr = radius * (0.30 + ring * 0.26);
      const w = radius * (0.030 + ring * 0.006);
      for (let i = 0; i < arms; i++) {
        const mat = new THREE.MeshBasicMaterial({
          color: ring === 0 ? 0xa8f0ff : 0x5ad6ff, transparent: true,
          opacity: 0.55 - ring * 0.13,
          depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        });
        const start = ((i / arms) + ring * 0.17) * Math.PI * 2;
        const geo = new THREE.RingGeometry(rr - w, rr + w, 48, 1, start, (Math.PI * 2 / arms) * 0.62);
        const m = new THREE.Mesh(geo, mat);
        m.rotation.x = -Math.PI / 2;
        m.position.y = this.clothY + 0.0015;
        m.renderOrder = 2;
        g.add(m);
      }
    }
    g.visible = false;
    this.bonusGroup.add(g);
    return g;
  }

  /* a soft light that follows the cue ball (MIDNIGHT) */
  bonusLamp(radius = 1.1) {
    const l = { radius };
    l.light = new THREE.PointLight(0xcfe0ff, 90, 7.5, 1.5);
    l.light.position.set(0, 1.5, 0);
    l.glow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 44),
      new THREE.MeshBasicMaterial({ color: 0x9fc8ff, transparent: true, opacity: 0.16, depthWrite: false })
    );
    l.glow.rotation.x = -Math.PI / 2;
    l.glow.renderOrder = 1;
    l.set = (x, z, r) => {
      l.light.position.set(x, 1.5, z);
      l.glow.position.set(x, 0.004, z);
      l.glow.scale.set(r, r, 1);
    };
    this.bonusGroup.add(l.light);
    this.bonusGroup.add(l.glow);
    return l;
  }

  spawnBall(number, special, x, z) {
    const P = this.params;
    const ball = this.sim.addBall(x, z, { r: P.ballRadius, data: { number, special } });
    const mesh = this.makeBallMesh(number, special);
    this.scene.add(mesh);
    const sh = this.makeBlobShadow();
    this.scene.add(sh);
    const bm = { ball, mesh, number, special, drop: null, hidden: false, shadow: sh };
    this.ballMeshes.push(bm);
    this.spawnRipple(x, z, 0xffe9a8, 0.7);
    this.spawnPuff(x, z, 0xffe9a8, 6, 0.04);
    return bm;
  }

  /* BLITZ: drop a fresh ball into a free spot */
  refillBall() {
    const P = this.params;
    let spot = null;
    for (let i = 0; i < 80 && !spot; i++) {
      const x = (Math.random() * 2 - 1) * (P.halfLength - 0.34);
      const z = (Math.random() * 2 - 1) * (P.halfWidth - 0.16);
      if (this.sim.canPlace(x, z, P.ballRadius, this.cueBall.id)) spot = { x, z };
    }
    if (!spot) return null;
    const pool = [2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];
    const number = pool[Math.floor(Math.random() * pool.length)];
    return this.spawnBall(number, this.bonus?.mode.special ?? null, spot.x, spot.z);
  }

  /* BOMB SQUAD: queue a ball to be blasted (chained off an exploding bomb) */
  bonusBlast(list, from) {
    if (!this.bonus) return;
    const q = (this.bonus.state.blasts = this.bonus.state.blasts ?? []);
    for (const bm of list) {
      if (q.some((x) => x.bm === bm)) continue;
      q.push({ bm, t: 0, delay: 0.1 + Math.random() * 0.14 });
    }
    this.spawnPuff(from.x, from.z, 0xffa04a, 10, 0.07);
  }

  destroyBall(bm) {
    if (!bm || bm.ball.potted) return;
    const ball = bm.ball;
    const p = this.sim.pockets[0] ?? { x: ball.x, z: ball.z };
    sfx.pocket();
    this.spawnRipple(ball.x, ball.z, 0xffa04a, 0.9);
    this.spawnPuff(ball.x, ball.z, 0xffa04a, 8, 0.06);
    ball.potted = true;
    ball.pocket = p;
    ball.vx = ball.vz = ball.wx = ball.wz = 0;
    bm.drop = { t: 0, sx: ball.x, sz: ball.z, tx: p.x, tz: p.z };
    if (this.isRequired(ball.data)) this.remaining = Math.max(0, this.remaining - 1);
    if (this.bonus) {
      this.bonus.state.pots = (this.bonus.state.pots ?? 0) + 1;
      this.bonus.state.score = (this.bonus.state.score ?? 0) + 150;
      this.popLabel(ball.x, ball.z, "BLAST +150", "#ffa04a");
      this.emitBonusProgress();
    }
    this.combo++;
    this.emit("pocket", { number: ball.data?.number, remaining: this.remaining, special: bm.special, credited: true, combo: this.combo });
  }

  updateBonus(dt) {
    const b = this.bonus;
    if (!b) return;
    b.t += dt;
    const q = b.state.blasts;
    if (q?.length) {
      for (let i = q.length - 1; i >= 0; i--) {
        const it = q[i];
        it.t += dt;
        if (it.t >= it.delay) {
          q.splice(i, 1);
          this.destroyBall(it.bm);
        }
      }
    }
    if (b.mode.tick) b.mode.tick(this, dt);
  }

  /* ------------------------------------------------------------------ */
  /*  visuals                                                            */
  /* ------------------------------------------------------------------ */

  syncBalls(dt) {
    if (!this.sim) return;
    const R = this.params.ballRadius;
    const sy = this.clothY + 0.0016;
    for (const bm of this.ballMeshes) {
      const b = bm.ball;
      if (bm.drop) {
        if (bm.shadow) {
          bm.shadow.visible = bm.mesh.visible;
          bm.shadow.position.set(bm.mesh.position.x, sy, bm.mesh.position.z);
          bm.shadow.scale.setScalar(bm.mesh.scale.x);
        }
        continue;
      }
      if (bm.stashed) {
        if (bm.shadow) bm.shadow.visible = false;
        continue;
      }
      if (b.potted) {
        bm.mesh.visible = false;
        if (bm.shadow) bm.shadow.visible = false;
        continue;
      }
      bm.mesh.visible = true;
      bm.mesh.position.set(b.x, R, b.z);
      if (bm.shadow) {
        bm.shadow.visible = true;
        bm.shadow.position.set(b.x, sy, b.z);
      }
      const wm = Math.hypot(b.wx, b.wy, b.wz);
      if (wm > 1e-4 && dt > 0) {
        _axis.set(b.wx / wm, b.wy / wm, b.wz / wm);
        _q.setFromAxisAngle(_axis, wm * dt);
        bm.mesh.quaternion.premultiply(_q);
      }
    }
  }

  updateDrops(dt) {
    for (const bm of this.ballMeshes) {
      if (!bm.drop) continue;
      const d = bm.drop;
      d.t += dt;
      const k = Math.min(1, d.t / 0.34);
      const e = k * k;
      bm.mesh.position.x = d.sx + (d.tx - d.sx) * e;
      bm.mesh.position.z = d.sz + (d.tz - d.sz) * e;
      bm.mesh.position.y = this.params.ballRadius - e * (this.params.ballRadius + 0.2);
      bm.mesh.scale.setScalar(1 - 0.45 * e);
      if (k >= 1) {
        bm.drop = null;
        if (!this.stashInRack(bm)) bm.mesh.visible = false;
      }
    }
  }

  /* A potted ball rolls into the next free slot of the glass return rack
   * (vintage tables show the potted balls lined up under the cloth). */
  stashInRack(bm) {
    const rack = this.table?.rack;
    if (!rack || !this.rack || bm.ball === this.cueBall) return false;
    if (this.rack.slot >= rack.slots.length) return false;
    const s = rack.slots[this.rack.slot++];
    const p = bm.mesh.position;
    bm.stashed = true;
    bm.rack = {
      t: 0,
      dur: 0.42 + Math.min(0.3, Math.hypot(s.x - p.x, s.z - p.z) * 0.16),
      sx: p.x, sy: p.y, sz: p.z,
      tx: s.x, ty: s.y, tz: s.z,
      lx: p.x, lz: p.z,
    };
    return true;
  }

  updateRack(dt) {
    const R = this.params.ballRadius;
    for (const bm of this.ballMeshes) {
      if (!bm.rack) continue;
      const r = bm.rack;
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      const e = k * k * (3 - 2 * k);
      const x = r.sx + (r.tx - r.sx) * e;
      const y = r.sy + (r.ty - r.sy) * e;
      const z = r.sz + (r.tz - r.sz) * e;
      const dx = x - r.lx;
      const dz = z - r.lz;
      const ds = Math.hypot(dx, dz);
      if (ds > 1e-6) {
        _axis.set(dz / ds, 0, -dx / ds);
        _q.setFromAxisAngle(_axis, ds / R);
        bm.mesh.quaternion.premultiply(_q);
      }
      r.lx = x;
      r.lz = z;
      bm.mesh.visible = true;
      bm.mesh.position.set(x, y, z);
      bm.mesh.scale.setScalar(Math.min(1, 0.55 + k * 1.8));
      if (k >= 1) bm.rack = null;
    }
  }

  updateCue(dt) {
    if (!this.cueObj) return;
    const show = this.state === "aim" || (this.cueAnim && this.cueAnim.t < this.cueAnim.dur);
    this.cueGroup.visible = show;
    if (!show) return;
    const cue = this.cueBall;
    if (!cue) return;
    if (this.cueAnim) {
      this.cueAnim.t += dt;
      const k = Math.min(1, this.cueAnim.t / this.cueAnim.dur);
      this.cuePull = this.cueAnim.from * (1 - k) - 0.02 * k;
      if (k >= 1) { this.cueAnim = null; this.cueGroup.visible = false; return; }
    } else {
      const target = this.power * 0.3;
      this.cuePull += (target - this.cuePull) * Math.min(1, dt * 14);
    }
    const dx = Math.cos(this.aim);
    const dz = Math.sin(this.aim);
    const tilt = 0.16;
    _v1.set(dx * Math.cos(tilt), -Math.sin(tilt), dz * Math.cos(tilt)).normalize();
    this.cueGroup.quaternion.setFromUnitVectors(UP, _v1);
    const gap = this.params.ballRadius + 0.016 + this.cuePull;
    this.cueGroup.position.set(
      cue.x - dx * gap,
      this.params.ballRadius,
      cue.z - dz * gap
    );
  }

  /* Two levels of aiming help:
   *   0 = off, 1 = basic (aim line + rail angles + ghost ball at contact),
   *   2 = advanced (+ object/tangent/pocket lines + recommended-aim solver + magnetic snap) */
  helpLevel() {
    const v = this.aimHelp;
    if (v === "off" || v === 0 || v === false) return 0;
    if (v === "advanced" || v === "full" || v === 2) return 2;
    if (v === "auto") return this.level?.assist ? 2 : 1;
    return 1;
  }

  assistEnabled() {
    return this.helpLevel() > 0;
  }

  helpBounces(lvl) {
    const angles = Math.max(1, Math.min(4, Math.round(this.aimMaxAngles ?? 3)));
    return angles - 1;
  }

  /* Recommended-aim solver. For every live ball × pocket we compute the cue-ball
   * ghost position that sends the ball into that pocket, then reject the ones
   * whose cue→ghost or ball→pocket path is blocked, or whose cut is too thin.
   * Results are cached until the cue ball moves or a ball is potted. */
  aimSolutions() {
    const cue = this.cueBall;
    if (!cue || this.state !== "aim") {
      this._sols = null;
      this._solKey = null;
      return [];
    }
    const live = this.sim.balls.filter((b) => !b.potted).length;
    /* The recommended *angle* does not depend on the shot power, so the solver
     * uses a fixed nominal power and caches only on cue position + live balls —
     * it therefore never re-runs while the player drags the power. */
    const pw = 0.85;
    const key = `${cue.x.toFixed(4)}|${cue.z.toFixed(4)}|${live}`;
    if (this._solKey === key && this._sols) return this._sols;
    const sim = this.sim;
    const R = this.params.ballRadius;
    const req = new Set();
    for (const bm of this.ballMeshes) {
      if (bm.ball !== cue && !bm.ball.potted && this.isRequired(bm.ball.data)) req.add(bm.ball.id);
    }
    const sols = [];
    for (const bm of this.ballMeshes) {
      const b = bm.ball;
      if (b === cue || b.potted) continue;
      for (const p of sim.pockets) {
        const dx = p.x - b.x;
        const dz = p.z - b.z;
        const d = Math.hypot(dx, dz);
        if (d < 1e-4) continue;
        const nx = dx / d;
        const nz = dz / d;
        const gx = b.x - nx * 2 * R;
        const gz = b.z - nz * 2 * R;
        if (Math.abs(gx) > sim.halfLength || Math.abs(gz) > sim.halfWidth) continue;
        const ax = gx - cue.x;
        const az = gz - cue.z;
        const ad = Math.hypot(ax, az);
        if (ad < 2 * R) continue;
        const cx = ax / ad;
        const cz = az / ad;
        const cut = cx * nx + cz * nz;
        if (cut < 0.34) continue;
        if (!sim.pathClear(cue, { x: gx, z: gz, id: "__ghost" }, [cue.id, b.id])) continue;
        if (!sim.pathClear(b, p, [b.id])) continue;
        sols.push({
          ball: b,
          pocket: p,
          angle: Math.atan2(cz, cx),
          ghost: { x: gx, z: gz },
          objectDir: { x: nx, z: nz },
          required: req.has(b.id),
          cut,
          dist: ad,
        });
      }
    }
    sols.sort((a, b) => b.required - a.required || b.cut - a.cut || a.dist - b.dist);
    /* Keep at most three recommendations, each pointing in a clearly different
     * direction (so the player is never shown a fan of near-identical angles).
     * Every kept candidate is confirmed against the real physics: it only
     * counts if the forward simulation actually drops that ball, and the pocket
     * and direction we then draw are exactly the ones the simulation produced. */
    const MAX_SOLS = 3;
    const MIN_SEP = 0.05;
    const speed = (2.2 + pw * 10.8) * this.hitMul() * (this.cueDef.power ?? 1);
    const verified = [];
    for (let i = 0; i < sols.length && verified.length < MAX_SOLS && i < 16; i++) {
      const s = sols[i];
      let dup = false;
      for (const v of verified) {
        let d = s.angle - v.angle;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) < MIN_SEP) { dup = true; break; }
      }
      if (dup) continue;
      const pr = sim.predictShot(cue.id, Math.cos(s.angle), Math.sin(s.angle), speed, { top: 0, side: 0 }, { cueBounces: 2, objBounces: 2, maxTime: 6, dt: SIM_DT });
      if (pr.object && pr.object.ballId === s.ball.id && pr.object.potted && pr.object.pocket) {
        s.pocket = pr.object.pocket;
        s.objectDir = pr.object.dir;
        s.ghost = pr.object.ghost;
        verified.push(s);
      }
    }
    this._solKey = key;
    this._sols = verified;
    return verified;
  }

  bestSolution() {
    const s = this.aimSolutions();
    return s.length ? s[0] : null;
  }

  nearestSolution() {
    const s = this.aimSolutions();
    if (!s.length) return null;
    let best = null;
    let bestD = Infinity;
    for (const sol of s) {
      let d = sol.angle - this.aim;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < Math.abs(bestD)) { bestD = d; best = sol; }
    }
    return best;
  }

  lockAim() {
    if (this.state !== "aim") return false;
    const s = this.nearestSolution();
    if (!s) return false;
    this.aim = s.angle;
    this.snapped = true;
    this.drag = null;
    this.emit("aim", { power: this.power, angle: this.aim });
    return true;
  }

  /* Magnetic aim: if the current aim is within ~1.15° of one of the (at most
   * three) recommended potting angles, lock onto the exact angle. */
  snapAim() {
    if (this.state !== "aim" || this.helpLevel() < 1) {
      this.snapped = false;
      return false;
    }
    let best = null;
    let bestD = Infinity;
    for (const s of this.aimSolutions()) {
      let d = s.angle - this.aim;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < Math.abs(bestD)) { bestD = d; best = s; }
    }
    if (!best || Math.abs(bestD) > 0.02) {
      this.snapped = false;
      return false;
    }
    const changed = !this.snapped || Math.abs(bestD) > 1e-6;
    this.aim = best.angle;
    this.snapped = true;
    if (changed) this.emit("aim", { power: this.power, angle: this.aim });
    return true;
  }

  updateGuide() {
    const lvl = this.helpLevel();
    const cue = this.cueBall;
    const aiming = this.state === "aim" && !!cue;
    this.updateTargetRing();
    if (!aiming || lvl === 0) {
      this.ribbon.update([], false);
      this.ribbonObj.update([], false);
      this.railRibbon.update([], false);
      this.objectRibbon.update([], false);
      this.tangentRibbon.update([], false);
      this.pocketRibbon.update([], false);
      this.solutionRibbon.update([], false);
      this.solObjectRibbon.update([], false);
      this.ghost.visible = false;
      this.ghostRing.visible = false;
      this.solRing.visible = false;
      this.snapped = false;
      return;
    }
    this.snapAim();
    const pred = this.predictCurrent(this.helpBounces(lvl));
    this.updateGuideFrom(pred, lvl);
  }

  /* Build (or reuse) a forward simulation of the shot that the current aim,
   * power and spin would produce. Everything the guide draws is derived from
   * this real simulation, so the guides match the actual outcome. Cached on a
   * key covering the cue position, aim, spin and the whole ball layout. */
  predictCurrent(bounces = null) {
    const cue = this.cueBall;
    if (!cue || this.state !== "aim") return null;
    const cd = this.cueDef;
    const spinSide = (this.spin.x / 0.5) * (cd.spin ?? 1);
    const spinTop = (-this.spin.y / 0.5) * (cd.spin ?? 1);
    /* Use the actual shot power so the prediction matches the real shot exactly;
     * only when the player is merely looking (no power pulled) fall back to a
     * nominal power so the guide is still visible. */
    const pw = this.power > 0.1 ? this.power : 0.7;
    const speed = (2.2 + pw * 10.8) * this.hitMul() * (cd.power ?? 1);
    const cueB = bounces ?? this.helpBounces(this.helpLevel());
    let layout = "";
    for (const b of this.sim.balls) layout += `${b.id}:${b.x.toFixed(3)},${b.z.toFixed(3)},${b.potted ? 1 : 0};`;
    const key = `${cue.x.toFixed(4)}|${cue.z.toFixed(4)}|${this.aim.toFixed(4)}|${spinTop.toFixed(3)}|${spinSide.toFixed(3)}|${pw.toFixed(3)}|${cueB}|${layout}`;
    if (key === this._predKey && this._pred) return this._pred;
    this._predKey = key;
    this._pred = this.sim.predictShot(
      cue.id,
      Math.cos(this.aim),
      Math.sin(this.aim),
      speed,
      { top: spinTop, side: spinSide },
      { cueBounces: cueB, objBounces: cueB, maxTime: 6, dt: SIM_DT }
    );
    return this._pred;
  }

  targetBall() {
    const lv = this.level;
    if (!lv) return null;
    const o = lv.objective;
    const live = this.ballMeshes.filter((b) => b.ball !== this.cueBall && !b.ball.potted);
    if (o.type === "forbid") {
      const bm = live.find((b) => b.number === o.ball);
      return bm ? { ball: bm.ball, kind: "forbid" } : null;
    }
    const required = live.filter((b) => this.isRequired(b.ball.data));
    if (o.type === "last") {
      if (required.length === 1 && required[0].number === o.ball) return { ball: required[0].ball, kind: "last" };
      return null;
    }
    if (o.type === "order") {
      const sorted = lv.balls.map((b) => b.number).sort((a, b) => a - b);
      const expected = sorted[this.pottedOrderCount ?? 0];
      const bm = live.find((b) => b.number === expected);
      return bm ? { ball: bm.ball, kind: "order" } : null;
    }
    if (required.length === 1) return { ball: required[0].ball, kind: "last" };
    return null;
  }

  updateTargetRing() {
    if (!this.targetRing) return;
    const t = this.state === "aim" ? this.targetBall() : null;
    if (!t) {
      this.targetRing.visible = false;
      return;
    }
    const col = t.kind === "forbid" ? 0xff5b86 : t.kind === "last" ? 0xffd24a : t.kind === "order" ? 0x9fd8ff : 0xffffff;
    this.targetRing.material.color.setHex(col);
    this.targetRing.position.set(t.ball.x, this.clothY + 0.0018, t.ball.z);
    this.targetRing.scale.setScalar(1 + Math.sin(performance.now() * 0.005) * 0.1);
    this.targetRing.visible = true;
  }

  /* endpoint of a straight line from (x,z) along (dx,dz): the first ball it
   * meets, or the cushion it runs into. Used so the "where will that ball go"
   * guides are drawn all the way to the rail instead of a stub. */
  projectLine(x, z, dx, dz, ignoreId = -1) {
    const dl = Math.hypot(dx, dz);
    if (dl < 1e-6) return { x, z };
    const res = this.sim.aimPreview(x, z, dx / dl, dz / dl, { maxBounces: 0, ignoreId });
    const pts = res.points;
    return pts.length > 1 ? pts[pts.length - 1] : { x: x + dx * 0.6, z: z + dz * 0.6 };
  }

  updateGuideFrom(pred, lvl = this.helpLevel()) {
    const advanced = lvl >= 2;
    const cue = this.cueBall;
    this.ribbon.setTint(this.snapped ? 0xffa61e : 0x8ef5c0);
    const cuePts = pred?.cue?.path ?? [];
    this.ribbon.update(cuePts.length > 1 ? [cuePts[0], cuePts[1]] : [], true);
    this.ribbonObj.update([], false);
    this.railRibbon.update([], false);

    const ob = pred?.object ?? null;
    if (ob && lvl > 0) {
      const g = ob.ghost;
      this.ghost.visible = true;
      this.ghost.position.set(g.x, this.params.ballRadius, g.z);
      this.ghost.material.opacity = this.snapped ? 0.34 : 0.22;
      this.ghostRing.visible = true;
      this.ghostRing.position.set(g.x, this.clothY + 0.0016, g.z);
      this.ghostRing.material.opacity = this.snapped ? 0.95 : 0.6;

      const path = ob.path ?? [];
      if (path.length > 1) {
        this.objectRibbon.update(path, true);
        if (ob.potted && ob.pocket) {
          const tail = path.length > 2 ? path[path.length - 2] : path[0];
          this.pocketRibbon.update([tail, { x: ob.pocket.x, z: ob.pocket.z }], true);
        } else {
          this.pocketRibbon.update([], false);
        }
      } else {
        this.objectRibbon.update([], false);
        this.pocketRibbon.update([], false);
      }
    } else {
      this.ghost.visible = false;
      this.ghostRing.visible = false;
      this.objectRibbon.update([], false);
      this.pocketRibbon.update([], false);
    }
    this.tangentRibbon.update([], false);

    /* recommended shot (advanced only): a single amber line to the exact angle
     * that pots a ball, shown while the current aim is not already a clear pot
     * and hidden again once the aim locks on. */
    const alreadyPotting = !!(ob && ob.potted);
    const sol = advanced && cue && !this.snapped && !alreadyPotting ? this.bestSolution() : null;
    if (sol) {
      this.solutionRibbon.update([{ x: cue.x, z: cue.z }, { x: sol.ghost.x, z: sol.ghost.z }], true);
      this.solutionRibbon.mat.opacity = 0.78 + Math.sin(performance.now() * 0.003) * 0.18;
      this.solRing.visible = true;
      this.solRing.position.set(sol.ghost.x, this.clothY + 0.0018, sol.ghost.z);
      this.solRing.scale.setScalar(1 + Math.sin(performance.now() * 0.004) * 0.08);
    } else {
      this.solutionRibbon.update([], false);
      this.solRing.visible = false;
    }
    this.solObjectRibbon.update([], false);
  }

  spawnRipple(x, z, color, scale = 1) {
    const geo = new THREE.RingGeometry(0.02, 0.03, 32);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.004, z);
    m.renderOrder = 5;
    this.fxGroup.add(m);
    this.fxList = this.fxList || [];
    this.fxList.push({ m, t: 0, dur: 0.5, scale });
  }

  spawnPuff(x, z, color = 0xffffff, count = 7, spread = 0.05) {
    if (!this.puffTex) this.puffTex = dotTexture("#ffffff");
    this.puffList = this.puffList || [];
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.puffTex,
        color,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const s = new THREE.Sprite(mat);
      const a = Math.random() * Math.PI * 2;
      const v = spread * (0.4 + Math.random());
      s.position.set(x, this.params.ballRadius * 0.7, z);
      this.fxGroup.add(s);
      this.puffList.push({
        s,
        t: 0,
        dur: 0.34 + Math.random() * 0.22,
        vx: Math.cos(a) * v,
        vz: Math.sin(a) * v,
        vy: 0.2 + Math.random() * 0.22,
        r0: this.params.ballRadius * (0.5 + Math.random() * 0.7),
      });
    }
  }

  updateFx(dt) {
    if (this.fxList) {
      for (let i = this.fxList.length - 1; i >= 0; i--) {
        const f = this.fxList[i];
        f.t += dt;
        const k = f.t / f.dur;
        if (k >= 1) {
          this.fxGroup.remove(f.m);
          f.m.geometry.dispose();
          f.m.material.dispose();
          this.fxList.splice(i, 1);
          continue;
        }
        const s = (0.4 + k * 3.4) * f.scale;
        f.m.scale.setScalar(s);
        f.m.material.opacity = 0.85 * (1 - k);
      }
    }
    if (this.puffList) {
      for (let i = this.puffList.length - 1; i >= 0; i--) {
        const p = this.puffList[i];
        p.t += dt;
        const k = p.t / p.dur;
        if (k >= 1) {
          this.fxGroup.remove(p.s);
          p.s.material.dispose();
          this.puffList.splice(i, 1);
          continue;
        }
        p.s.position.x += p.vx * dt;
        p.s.position.z += p.vz * dt;
        p.s.position.y += p.vy * dt;
        p.vy -= 0.55 * dt;
        p.s.scale.setScalar(p.r0 * (0.6 + k * 2.3));
        p.s.material.opacity = 0.6 * (1 - k);
      }
    }
  }

  popLabel(x, z, text, color) {
    if (!this.events.label) return;
    const p = this.worldToScreen(x, this.params.ballRadius * 1.2, z);
    if (p) this.events.label(text, color, p.x, p.y);
  }

  worldToScreen(x, y, z) {
    const rect = this.canvas.getBoundingClientRect();
    _v1.set(x, y, z).project(this.camera);
    if (_v1.z > 1) return null;
    return {
      x: (_v1.x * 0.5 + 0.5) * rect.width,
      y: (-_v1.y * 0.5 + 0.5) * rect.height,
    };
  }

  render() {
    let ox = 0;
    let oy = 0;
    if (this.shake && this.shake.t > 0) {
      const k = this.shake.t / 0.45;
      const m = this.shake.mag * k;
      ox = (Math.random() - 0.5) * m;
      oy = (Math.random() - 0.5) * m;
      this.camera.position.x += ox;
      this.camera.position.y += oy;
    }
    this.renderer.render(this.scene, this.camera);
    if (ox || oy) {
      this.camera.position.x -= ox;
      this.camera.position.y -= oy;
    }
  }

  emit(name, data) {
    const fn = this.events[name];
    if (typeof fn === "function") fn(data);
  }
}
