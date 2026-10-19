import * as THREE from "https://esm.sh/three@0.170.0";
import { mulberry32 } from "./textures.js";

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  return renderer;
}

export function createEnvironment(renderer, opts = {}) {
  const {
    ceiling = "#ffffff",
    sideA = "#8fb6ff",
    sideB = "#ffd9a0",
    floor = "#20242c",
    intensity = 1,
  } = opts;
  const scene = new THREE.Scene();
  const geo = new THREE.BoxGeometry(10, 10, 10);
  const mat = new THREE.MeshBasicMaterial({ side: THREE.BackSide });
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, ceiling);
  g.addColorStop(0.42, "#9aa7b8");
  g.addColorStop(0.5, "#3a4150");
  g.addColorStop(1, floor);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  mat.map = tex;
  scene.add(new THREE.Mesh(geo, mat));

  const panel = (color, x, y, z, w, h, rx, ry) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color })
    );
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    scene.add(m);
  };
  panel(sideA, -4.95, 1.5, 0, 6, 4, 0, Math.PI / 2);
  panel(sideB, 4.95, 1.5, 0, 6, 4, 0, -Math.PI / 2);
  const top = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 3.4),
    new THREE.MeshBasicMaterial({ color: "#ffffff" })
  );
  top.position.set(0, 4.9, 0);
  top.rotation.x = Math.PI / 2;
  top.material.color.multiplyScalar(intensity * 2.2);
  scene.add(top);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const rt = pmrem.fromScene(scene, 0.02, 0.1, 40);
  pmrem.dispose();
  geo.dispose();
  mat.dispose();
  tex.dispose();
  return rt.texture;
}

export function createLights(scene, theme = {}) {
  const lights = {};
  const LS = theme.lightScale ?? 0.5;
  const hemi = new THREE.HemisphereLight(
    theme.skyColor ?? "#dfe9ff",
    theme.groundColor ?? "#26201a",
    (theme.hemiIntensity ?? 0.55) * 0.7
  );
  scene.add(hemi);
  lights.hemi = hemi;

  const key = new THREE.SpotLight(
    theme.keyColor ?? "#fff3e0",
    (theme.keyIntensity ?? 55) * LS,
    0,
    theme.keyAngle ?? Math.PI / 5.2,
    0.45,
    1.6
  );
  key.position.set(theme.keyPos?.[0] ?? 1.05, theme.keyPos?.[1] ?? 3.4, theme.keyPos?.[2] ?? 0.85);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.width = 2048;
  key.shadow.mapSize.height = 2048;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.0025;
  key.shadow.radius = 2.2;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 14;
  const s = theme.shadowSize ?? 1.7;
  key.shadow.camera.left = -s;
  key.shadow.camera.right = s;
  key.shadow.camera.top = s;
  key.shadow.camera.bottom = -s;
  scene.add(key);
  scene.add(key.target);
  lights.key = key;

  const fill = new THREE.DirectionalLight(
    theme.fillColor ?? "#8fb4ff",
    (theme.fillIntensity ?? 0.55) * LS * 1.6
  );
  fill.position.set(-2.2, 2.4, -2.0);
  scene.add(fill);
  lights.fill = fill;

  const rim = new THREE.DirectionalLight(
    theme.rimColor ?? "#ffd9a8",
    (theme.rimIntensity ?? 0.4) * LS * 1.6
  );
  rim.position.set(2.6, 1.4, 2.4);
  scene.add(rim);
  lights.rim = rim;
  return lights;
}

const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _corner = new THREE.Vector3();

export function fitPerspectiveCamera(camera, opts = {}) {
  const {
    target = new THREE.Vector3(0, 0, 0),
    pitch = THREE.MathUtils.degToRad(42),
    yaw = 0,
    box = { min: [-1.4, 0, -0.75], max: [1.4, 0.12, 0.75] },
    margin = 1.06,
    zoom = 1,
    extraDistance = 0,
    tiltCam = 0,
  } = opts;

  const p = pitch + tiltCam;
  const dir = new THREE.Vector3(Math.cos(p) * Math.cos(yaw), Math.sin(p), Math.cos(p) * Math.sin(yaw));
  _fwd.copy(dir).multiplyScalar(-1);
  _right.set(-Math.sin(yaw), 0, Math.cos(yaw)).normalize();
  _up.crossVectors(_right, _fwd).normalize();

  const vTan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const hTan = vTan * camera.aspect;

  let need = 0;
  for (let i = 0; i < 8; i++) {
    _corner.set(
      i & 1 ? box.max[0] : box.min[0],
      i & 2 ? box.max[1] : box.min[1],
      i & 4 ? box.max[2] : box.min[2]
    );
    _corner.sub(target);
    const a = _corner.dot(_right);
    const b = _corner.dot(_up);
    const c = _corner.dot(_fwd);
    need = Math.max(need, Math.abs(a) * margin / hTan - c);
    need = Math.max(need, Math.abs(b) * margin / vTan - c);
  }
  need = Math.max(need, 0.6) / zoom + extraDistance;
  camera.position.copy(target).addScaledVector(dir, need);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.near = Math.max(0.05, need * 0.05);
  camera.far = need * 8 + 40;
  camera.updateProjectionMatrix();
  return need;
}

export function makeSkyDome(theme = {}) {
  const W = 512;
  const S = 256;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = S;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, S);
  const stops = theme.skyStops ?? theme.sky?.skyStops ?? [
    [0, "#0a1020"],
    [0.45, "#1b2a4a"],
    [0.62, "#3a5a86"],
    [1, "#0a0e16"],
  ];
  for (const [p, col] of stops) g.addColorStop(p, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, S);
  if (theme.props && theme.props.stars) drawSkyStars(ctx, W, S, theme.skySeed ?? 11);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const geo = new THREE.SphereGeometry(60, 32, 24);
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -1;
  return mesh;
}

function drawSkyStars(ctx, W, S, seed) {
  const rnd = mulberry32(seed * 7919 + 3);
  for (let i = 0; i < 700; i++) {
    const y = Math.pow(rnd(), 1.5) * S * 0.52;
    const x = rnd() * W;
    const r = 0.4 + Math.pow(rnd(), 3) * 1.5;
    const t = rnd();
    ctx.globalAlpha = 0.2 + rnd() * 0.8;
    ctx.fillStyle = t > 0.9 ? "#ffd8ae" : t > 0.78 ? "#bdd4ff" : "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        for (const k of Object.keys(m)) {
          const v = m[k];
          if (v && v.isTexture) v.dispose();
        }
        m.dispose();
      }
    }
  });
}
