import * as THREE from "https://esm.sh/three@0.170.0";
import { feltTexture, feltNormal, railShadowTexture, clothRoughness, woodTexture, textDecalTexture } from "./textures.js";

export const TABLE_DEFAULTS = {
  halfLength: 1.27,
  halfWidth: 0.635,
  ballRadius: 0.034,
  pocketRadius: 0.068,
  sidePocketRadius: 0.062,
  cornerMouth: 0.093,
  sideMouth: 0.076,
  railWidth: 0.115,
  cushionDepth: 0.05,
  cushionHeight: 0.045,
  railHeight: 0.055,
  pocketInset: 0.012,
};

export function pocketLayout(P) {
  const HL = P.halfLength;
  const HW = P.halfWidth;
  const ins = P.pocketInset ?? 0.012;
  const cr = P.pocketRadius;
  const sr = P.sidePocketRadius;
  return [
    { x: -(HL - ins), z: -(HW - ins), r: cr, corner: true },
    { x: HL - ins, z: -(HW - ins), r: cr, corner: true },
    { x: -(HL - ins), z: HW - ins, r: cr, corner: true },
    { x: HL - ins, z: HW - ins, r: cr, corner: true },
    { x: 0, z: -(HW - ins), r: sr, corner: false },
    { x: 0, z: HW - ins, r: sr, corner: false },
  ];
}

export function pocketSpots(P) {
  const HL = P.halfLength;
  const HW = P.halfWidth;
  const off = P.pocketInset + 0.03;
  const so = P.sidePocketRadius + 0.02;
  return [
    { x: -(HL + off), z: -(HW + off), r: P.pocketRadius + 0.03, corner: true },
    { x: HL + off, z: -(HW + off), r: P.pocketRadius + 0.03, corner: true },
    { x: -(HL + off), z: HW + off, r: P.pocketRadius + 0.03, corner: true },
    { x: HL + off, z: HW + off, r: P.pocketRadius + 0.03, corner: true },
    { x: 0, z: -(HW - 0.006), r: so, corner: false },
    { x: 0, z: HW - 0.006, r: so, corner: false },
  ];
}

function areaShape(pts, holes) {
  const s = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], -p[1])));
  for (const h of holes ?? []) {
    s.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], -p[1]))));
  }
  return s;
}

function circlePath(cx, cz, r, segs = 28) {
  const pts = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return pts;
}

function roundedRect(cx, cz, hx, hz, r, segs = 6) {
  const pts = [];
  const arc = (ax, az, a0, a1) => {
    for (let i = 0; i <= segs; i++) {
      const a = a0 + ((a1 - a0) * i) / segs;
      pts.push([ax + Math.cos(a) * r, az + Math.sin(a) * r]);
    }
  };
  arc(cx + hx - r, cz - hz + r, -Math.PI / 2, 0);
  arc(cx + hx - r, cz + hz - r, 0, Math.PI / 2);
  arc(cx - hx + r, cz + hz - r, Math.PI / 2, Math.PI);
  arc(cx - hx + r, cz - hz + r, Math.PI, Math.PI * 1.5);
  return pts;
}

function roundedRectAB(x0, x1, z0, z1, r, segs = 6) {
  const pts = [];
  const arc = (ax, az, a0, a1) => {
    for (let i = 0; i <= segs; i++) {
      const a = a0 + ((a1 - a0) * i) / segs;
      pts.push([ax + Math.cos(a) * r, az + Math.sin(a) * r]);
    }
  };
  arc(x1 - r, z0 + r, -Math.PI / 2, 0);
  arc(x1 - r, z1 - r, 0, Math.PI / 2);
  arc(x0 + r, z1 - r, Math.PI / 2, Math.PI);
  arc(x0 + r, z0 + r, Math.PI, Math.PI * 1.5);
  return pts;
}

function extrudeTop(shape, height, bevel = 0.006) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height - bevel,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 20,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export function buildTable(theme, params = {}) {
  const P = { ...TABLE_DEFAULTS, ...params };
  const { halfLength: HL, halfWidth: HW, cushionDepth: CD, railWidth: RW, railHeight: RH, cushionHeight: CH } = P;
  const group = new THREE.Group();
  group.name = "table";

  const clothW = feltTexture(theme.felt, { seed: 11, fibers: 14000 });
  clothW.repeat.set(2.2, 1.3);
  clothW.anisotropy = 8;
  const clothN = feltNormal({ seed: 11, fibers: 9000 });
  clothN.repeat.set(3.4, 2.0);
  clothN.anisotropy = 8;
  const clothRough = clothRoughness(11);
  clothRough.repeat.set(3.2, 1.9);
  clothRough.anisotropy = 8;
  const clothMat = new THREE.MeshStandardMaterial({
    map: clothW,
    normalMap: clothN,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: clothRough,
    roughness: 0.95,
    metalness: 0,
    envMapIntensity: 0.22,
  });

  const woodTex = woodTexture(theme.rail, { seed: 5, glossy: true });
  woodTex.repeat.set(0.3, 0.3);
  const woodMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    roughness: 0.42,
    metalness: 0.04,
    envMapIntensity: 0.6,
  });

  const cushTex = feltTexture(theme.cushion, { seed: 17, fibers: 7000 });
  cushTex.repeat.set(7, 0.5);
  const cushN = feltNormal({ seed: 17, fibers: 5000 });
  cushN.repeat.set(7, 0.5);
  const cushionMat = new THREE.MeshStandardMaterial({
    map: cushTex,
    normalMap: cushN,
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughness: 0.88,
    metalness: 0,
    envMapIntensity: 0.3,
  });

  const rimMat = new THREE.MeshStandardMaterial({
    color: theme.rim ?? "#c9a24a",
    roughness: 0.22,
    metalness: 0.95,
    envMapIntensity: 1.35,
  });

  const OX = HL + CD + RW;
  const OZ = HW + CD + RW;

  /* ---- ball-return trough, recessed into the +X end of the table's own rail ----
   * The end rail is extruded past the playing surface and a glass-lined trough is
   * sunk into it, so potted balls collect inside the table's frame (see Game.updateRack). */
  const R = P.ballRadius;
  const rackOuterX = OX + 0.21;
  const rackX0 = OX + 0.008;
  const rackX1 = rackOuterX - 0.052;
  const rackHalfZ = OZ - 0.225;
  const rackFloorY = -0.09;
  const rackTopY = RH;
  const rackMidX = (rackX0 + rackX1) / 2;

  const pockets = pocketLayout(P);
  const spots = pocketSpots(P);

  /* ---------------- cloth (with pocket holes) ---------------- */
  const clothShape = areaShape(
    roundedRect(0, 0, HL + CD + 0.12, HW + CD + 0.12, 0.05),
    spots.map((p) => circlePath(p.x, p.z, p.r, 36))
  );
  const cloth = new THREE.Mesh(new THREE.ShapeGeometry(clothShape), clothMat);
  cloth.rotation.x = -Math.PI / 2;
  cloth.receiveShadow = true;
  group.add(cloth);

  /* ---------------- rail contact shadow (AO) on the cloth ---------------- */
  const ao = new THREE.Mesh(
    new THREE.PlaneGeometry(HL * 2, HW * 2),
    new THREE.MeshBasicMaterial({
      map: railShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
    })
  );
  ao.rotation.x = -Math.PI / 2;
  ao.position.y = 0.00035;
  ao.renderOrder = 0;
  group.add(ao);

  /* ---------------- cloth wordmark decal ---------------- */
  const decalTex = textDecalTexture("SHOOTING BALL", {
    color: theme.rim ?? "#ffffff",
    sub: "3D BILLIARDS",
    subFont: `600 ${Math.round(256 * 0.14)}px "Baloo 2", system-ui, sans-serif`,
  });
  const decal = new THREE.Mesh(
    new THREE.PlaneGeometry(0.36, 0.09),
    new THREE.MeshBasicMaterial({
      map: decalTex,
      transparent: true,
      opacity: theme.decalOpacity ?? 0.4,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  decal.rotation.x = -Math.PI / 2;
  decal.rotation.z = Math.PI / 2;
  decal.position.set(0, 0.0007, 0);
  decal.renderOrder = 1;
  group.add(decal);

  /* ---------------- rails (the +X end is extended to house the ball return) ---------------- */
  const railShape = areaShape(roundedRectAB(-OX, rackOuterX, -OZ, OZ, 0.055, 6), [
    roundedRect(0, 0, HL + CD, HW + CD, 0.05, 6),
    roundedRectAB(rackX0, rackX1, -rackHalfZ, rackHalfZ, 0.02, 4),
  ]);
  const rail = new THREE.Mesh(extrudeTop(railShape, RH), woodMat);
  rail.castShadow = true;
  rail.receiveShadow = true;
  group.add(rail);

  /* ---------------- cushions ---------------- */
  const fc = CD;
  const fs = CD * 0.6;
  const segs = [];
  for (const s of [1, -1]) {
    const zi = HW * s;
    const zo = (HW + CD) * s;
    segs.push([
      [-HL + P.cornerMouth - fc, zo],
      [-P.sideMouth - fs, zo],
      [-P.sideMouth, zi],
      [-HL + P.cornerMouth, zi],
    ]);
    segs.push([
      [P.sideMouth + fs, zo],
      [HL - P.cornerMouth + fc, zo],
      [HL - P.cornerMouth, zi],
      [P.sideMouth, zi],
    ]);
  }
  for (const sx of [1, -1]) {
    const xi = HL * sx;
    const xo = (HL + CD) * sx;
    segs.push([
      [xi, -HW + P.cornerMouth],
      [xi, HW - P.cornerMouth],
      [xo, HW],
      [xo, -HW],
    ]);
  }
  for (const pts of segs) {
    const m = new THREE.Mesh(extrudeTop(areaShape(pts), CH, 0.007), cushionMat);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  /* ---------------- pocket cups + rims ---------------- */
  const cupMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const cupBottomMat = new THREE.MeshStandardMaterial({ color: "#0d0d12", roughness: 0.9 });
  const cupWallGeo = (inner) => {
    const g = new THREE.CylinderGeometry(inner, inner * 0.82, 0.26, 32, 8, true);
    const p = g.attributes.position;
    const col = [];
    for (let i = 0; i < p.count; i++) {
      const t = THREE.MathUtils.clamp((p.getY(i) + 0.13) / 0.26, 0, 1);
      const v = 0.015 + 0.11 * t * t;
      col.push(v, v, v * 1.06);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return g;
  };
  const pocketVisuals = [];
  for (const sp of spots) {
    const cup = new THREE.Group();
    const inner = sp.r - 0.006;
    const wall = new THREE.Mesh(cupWallGeo(inner), cupMat);
    wall.position.y = -0.128;
    cup.add(wall);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(inner * 0.84, 28), cupBottomMat);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = -0.256;
    cup.add(bottom);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(sp.r + 0.004, 0.0075, 12, 48), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.002;
    rim.castShadow = true;
    rim.receiveShadow = true;
    cup.add(rim);

    cup.position.set(sp.x, 0, sp.z);
    group.add(cup);
    pocketVisuals.push({ ...sp, group: cup });
  }

  /* ---------------- diamond sights ---------------- */
  const sightMat = new THREE.MeshStandardMaterial({
    color: theme.rim ?? "#e8e8e8",
    roughness: 0.42,
    metalness: 0.5,
    emissive: new THREE.Color(theme.rim ?? "#ffffff").multiplyScalar(0.04),
  });
  const sightGeo = new THREE.CircleGeometry(0.016, 4);
  const addSight = (x, z) => {
    const m = new THREE.Mesh(sightGeo, sightMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.PI / 4;
    m.position.set(x, RH + 0.0009, z);
    group.add(m);
  };
  for (const k of [1, 2, 3, 5, 6, 7]) {
    const x = HL * (k / 4 - 1);
    addSight(x, -OZ + RW * 0.5);
    addSight(x, OZ - RW * 0.5);
  }
  for (const f of [-0.5, 0, 0.5]) {
    addSight(-OX + RW * 0.5, HW * f);
    addSight(OX - RW * 0.5, HW * f);
  }

  /* ---------------- under-structure (frame only, so pockets stay open) ---------------- */
  const apronMat = new THREE.MeshStandardMaterial({
    color: theme.rim ? new THREE.Color(theme.rim).multiplyScalar(0.5) : "#2a2a30",
    roughness: 0.35,
    metalness: 0.55,
  });
  const apronY = -0.028;
  const apronH = 0.046;
  const apronBars = [
    { w: OX * 2 + 0.004, d: OZ - (HW + CD) + 0.004, x: 0, z: (OZ + HW + CD) / 2 },
    { w: OX * 2 + 0.004, d: OZ - (HW + CD) + 0.004, x: 0, z: -(OZ + HW + CD) / 2 },
    { w: OX - (HL + CD) + 0.004, d: (HW + CD) * 2, x: (OX + HL + CD) / 2, z: 0 },
    { w: OX - (HL + CD) + 0.004, d: (HW + CD) * 2, x: -(OX + HL + CD) / 2, z: 0 },
  ];
  for (const b of apronBars) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, apronH, b.d), apronMat);
    m.position.set(b.x, apronY, b.z);
    m.castShadow = true;
    group.add(m);
  }

  const legMat = new THREE.MeshStandardMaterial({ color: "#15151a", roughness: 0.45, metalness: 0.35 });
  const legPos = [
    [-(OX - 0.16), OZ - 0.14], [-(OX - 0.16), -(OZ - 0.14)],
    [rackOuterX - 0.16, OZ - 0.14], [rackOuterX - 0.16, -(OZ - 0.14)],
  ];
  for (const [lx, lz] of legPos) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.13), legMat);
    leg.position.set(lx, -0.26, lz);
    leg.castShadow = true;
    group.add(leg);
  }
  const underside = new THREE.Mesh(
    new THREE.BoxGeometry(OX + rackOuterX, 0.03, OZ * 1.4),
    new THREE.MeshStandardMaterial({ color: "#101014", roughness: 0.9 })
  );
  underside.position.set((rackOuterX - OX) / 2, -0.3, 0);
  group.add(underside);

  /* ---------------- glass ball-return trough, built into the +X rail ----
   * A glazed trough is recessed into the extended end rail, so the potted balls come
   * to rest inside the table's own frame and stay on show through the glass. Potted
   * object balls roll into their slot in pot order (see Game.updateRack). */
  const rackGroup = new THREE.Group();
  rackGroup.name = "ballReturn";

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: "#dcefff",
    roughness: 0.2,
    metalness: 0,
    ior: 1.45,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 0.22,
    clearcoat: 0.25,
    clearcoatRoughness: 0.25,
  });
  const bedTex = feltTexture(theme.felt, { seed: 23, fibers: 7000 });
  bedTex.repeat.set(1.4, 0.6);
  const rackBedMat = new THREE.MeshStandardMaterial({
    map: bedTex,
    roughness: 0.92,
    metalness: 0,
    emissive: new THREE.Color(theme.felt ?? "#1f7a4d").multiplyScalar(0.16),
    envMapIntensity: 0.25,
  });

  const rackW = rackX1 - rackX0;
  const rackD = rackHalfZ * 2;
  const rackH = rackTopY - rackFloorY;
  const rackMidY = (rackTopY + rackFloorY) / 2;
  const inset = 0.0008;

  const addBox = (mat, w, h, d, x, y, z, cast = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    rackGroup.add(m);
    return m;
  };
  const addGlass = (w, h, x, y, z, rotY) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat);
    m.position.set(x, y, z);
    if (rotY) m.rotation.y = rotY;
    m.renderOrder = 3;
    rackGroup.add(m);
    return m;
  };

  /* felt-lined bed and a wooden sill, tied into the table's under-frame */
  addBox(rackBedMat, rackW + 0.02, 0.014, rackD + 0.02, rackMidX, rackFloorY - 0.007, 0, false);
  addBox(woodMat, rackW + 0.04, 0.03, rackD + 0.04, rackMidX, rackFloorY - 0.029, 0, false);
  /* solid back panel behind the trough's inner glass so it never reads as a void
   * (only below the rail — above y=0 the rail's own collar wood is already there) */
  addBox(woodMat, 0.014, 0.11, rackD + 0.02, rackX0 - 0.008, -0.055, 0, false);
  /* the return track: a pair of brass rails the balls nestle between */
  const railOff = R + 0.011;
  addBox(rimMat, 0.009, 0.018, rackD - 0.01, rackMidX - railOff, rackFloorY + 0.009, 0);
  addBox(rimMat, 0.009, 0.018, rackD - 0.01, rackMidX + railOff, rackFloorY + 0.009, 0);
  /* glazing: front, back and both ends (open-topped, so the balls stay in clear view) */
  addGlass(rackD - inset * 2, rackH, rackX1 - inset, rackMidY, 0, Math.PI / 2);
  addGlass(rackD - inset * 2, rackH, rackX0 + inset, rackMidY, 0, Math.PI / 2);
  addGlass(rackW - inset * 2, rackH, rackMidX, rackMidY, rackHalfZ - inset, 0);
  addGlass(rackW - inset * 2, rackH, rackMidX, rackMidY, -(rackHalfZ - inset), 0);
  /* the rail's own end grain forms the border; a slim inlaid reveal finishes it */
  const trimMat = woodMat.clone();
  trimMat.color = new THREE.Color(theme.rail ?? "#5a3d22").multiplyScalar(0.86);
  const trimW = 0.024;
  const trimShape = areaShape(
    roundedRectAB(rackX0 - trimW, rackX1 + trimW, -(rackHalfZ + trimW), rackHalfZ + trimW, 0.016, 5),
    [roundedRectAB(rackX0 - 0.0015, rackX1 + 0.0015, -(rackHalfZ + 0.0015), rackHalfZ + 0.0015, 0.008, 5)]
  );
  const trimMesh = new THREE.Mesh(extrudeTop(trimShape, 0.006, 0), trimMat);
  trimMesh.position.y = rackTopY - 0.0022;
  trimMesh.receiveShadow = true;
  rackGroup.add(trimMesh);

  const slotGap = 2 * R + 0.006;
  const slotCount = 15;
  const slots = [];
  for (let i = 0; i < slotCount; i++) {
    slots.push({
      x: rackMidX,
      y: rackFloorY + R + 0.002,
      z: (i - (slotCount - 1) / 2) * slotGap,
    });
  }

  /* a soft lamp so the returned balls read clearly inside the recess */
  const rackLight = new THREE.PointLight(0xffe6c8, 0.6, 0.55, 2);
  rackLight.position.set(rackMidX, rackTopY - 0.05, 0);
  rackGroup.add(rackLight);

  group.add(rackGroup);

  return {
    group,
    pockets: pocketVisuals,
    layout: pockets,
    params: P,
    bounds: {
      min: [-OX, -0.3, -OZ],
      max: [rackOuterX + 0.01, RH + 0.01, OZ],
    },
    rack: {
      group: rackGroup,
      slots,
      slotCount,
      centerX: rackMidX,
      floorY: rackFloorY,
      topY: rackTopY,
      halfZ: rackHalfZ,
      frontX: rackOuterX,
    },
    cloth,
    decal,
  };
}
