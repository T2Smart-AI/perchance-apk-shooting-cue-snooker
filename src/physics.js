export const BALL_RADIUS = 0.034;
export const BALL_MASS = 0.17;
export const TABLE_HALF_LENGTH = 1.27;
export const TABLE_HALF_WIDTH = 0.635;

/* Table geometry as the game plays it. Single source of truth: the gameplay
 * sim (physics.js defaults), the headless tooling and the level generator all
 * read it, and main.pjs `table` overrides it at runtime. */
export const TABLE_PARAMS = {
  halfLength: TABLE_HALF_LENGTH,
  halfWidth: TABLE_HALF_WIDTH,
  ballRadius: BALL_RADIUS,
  pocketRadius: 0.068,
  sidePocketRadius: 0.062,
  pocketInset: 0.012,
  cornerMouth: 0.093,
  sideMouth: 0.076,
};

export function defaultPockets(halfLength = TABLE_HALF_LENGTH, halfWidth = TABLE_HALF_WIDTH, opts = {}) {
  const cr = opts.cornerRadius ?? 0.068;
  const sr = opts.sideRadius ?? 0.062;
  const ins = opts.inset ?? 0.012;
  return [
    { x: -(halfLength - ins), z: -(halfWidth - ins), r: cr, corner: true },
    { x: halfLength - ins, z: -(halfWidth - ins), r: cr, corner: true },
    { x: -(halfLength - ins), z: halfWidth - ins, r: cr, corner: true },
    { x: halfLength - ins, z: halfWidth - ins, r: cr, corner: true },
    { x: 0, z: -(halfWidth - ins), r: sr, corner: false },
    { x: 0, z: halfWidth - ins, r: sr, corner: false },
  ];
}

const EPS = 1e-9;

export class PoolSim {
  constructor(opts = {}) {
    this.R = opts.ballRadius ?? BALL_RADIUS;
    this.g = opts.gravity ?? 9.8;
    this.muSlide = opts.muSlide ?? 0.28;
    this.muRoll = opts.muRoll ?? 0.09;
    this.kDrag = opts.kDrag ?? 0.24;
    this.muSpin = opts.spinDecay ?? 0.8;
    this.muSpinStop = opts.spinStop ?? 7.0;
    this.muBall = opts.muBall ?? 0.06;
    this.eBall = opts.eBall ?? 0.95;
    this.eCushion = opts.eCushion ?? 0.8;
    this.muCushion = opts.muCushion ?? 0.22;
    this.halfLength = opts.halfLength ?? TABLE_HALF_LENGTH;
    this.halfWidth = opts.halfWidth ?? TABLE_HALF_WIDTH;
    this.pockets = opts.pockets ?? defaultPockets(this.halfLength, this.halfWidth, {
      cornerRadius: opts.cornerRadius,
      sideRadius: opts.sideRadius,
      inset: opts.pocketInset,
    });
    this.cornerMouth = opts.cornerMouth ?? 0.093;
    this.sideMouth = opts.sideMouth ?? 0.076;
    this.maxSpeed = opts.maxSpeed ?? 13;
    this.restSpeed = opts.restSpeed ?? 0.012;
    this.restSpin = opts.restSpin ?? 0.35;
    this.balls = [];
    this.nextId = 1;
    /* static circular bumpers (bonus "bumper" tables) */
    this.posts = (opts.posts ?? []).map((p) => ({ r: 0.05, e: 1.04, ...p }));
    /* bonus modes can seal the pockets or drag a force field over the cloth */
    this.pocketsEnabled = opts.pocketsEnabled !== false;
    this.field = opts.field ?? null;
    /* keep the original options so a shadow copy can be rebuilt for prediction */
    this._opts = opts;
  }

  addBall(x, z, opts = {}) {
    const b = {
      id: opts.id ?? this.nextId++,
      x,
      z,
      vx: 0,
      vz: 0,
      wx: 0,
      wy: 0,
      wz: 0,
      r: opts.r ?? this.R,
      m: opts.m ?? BALL_MASS,
      data: opts.data ?? null,
      potted: false,
      pocket: null,
      alive: true,
    };
    this.balls.push(b);
    return b;
  }

  removeBall(ball) {
    const i = this.balls.indexOf(ball);
    if (i >= 0) this.balls.splice(i, 1);
  }

  clear() {
    this.balls.length = 0;
  }

  strike(ball, dirX, dirZ, speed, spin = {}) {
    const len = Math.hypot(dirX, dirZ) || 1;
    const dx = dirX / len;
    const dz = dirZ / len;
    const v = Math.min(speed, this.maxSpeed);
    ball.vx = dx * v;
    ball.vz = dz * v;
    const top = spin.top ?? 0;
    const side = spin.side ?? 0;
    const k = (2.5 * v) / ball.r;
    ball.wx = k * top * dz;
    ball.wz = -k * top * dx;
    ball.wy = -k * side;
    return ball;
  }

  isMoving() {
    for (const b of this.balls) {
      if (b.potted) continue;
      if (Math.hypot(b.vx, b.vz) > this.restSpeed) return true;
      if (Math.abs(b.wy) > this.restSpin) return true;
    }
    return false;
  }

  allStopped() {
    return !this.isMoving();
  }

  step(dt) {
    const events = [];
    if (dt <= 0) return events;
    let maxV = 0;
    for (const b of this.balls) {
      if (b.potted) continue;
      const s = Math.hypot(b.vx, b.vz);
      if (s > maxV) maxV = s;
    }
    const maxDisp = 0.42 * this.R;
    let n = Math.ceil((maxV * dt) / maxDisp);
    if (!isFinite(n) || n < 1) n = 1;
    if (n > 96) n = 96;
    const h = dt / n;
    for (let i = 0; i < n; i++) this.substep(h, events);
    return events;
  }

  substep(h, events) {
    const balls = this.balls;
    for (const b of balls) {
      if (b.potted) continue;
      this.integrate(b, h, events);
    }
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.potted) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (b.potted) continue;
        this.ballPair(a, b, events);
      }
    }
    for (const b of balls) {
      if (b.potted) continue;
      this.cushions(b, events);
    }
    if (this.posts.length) {
      for (const b of balls) {
        if (b.potted) continue;
        this.bumpers(b, events);
      }
    }
    for (const b of balls) {
      if (b.potted) continue;
      this.checkPocket(b, events);
    }
  }

  integrate(b, h, events) {
    const R = b.r;
    if (this.field) {
      const f = this.field;
      const dx = (f.x ?? 0) - b.x;
      const dz = (f.z ?? 0) - b.z;
      const d = Math.hypot(dx, dz) || 1;
      const fall = f.radius ? Math.max(0, 1 - d / f.radius) : 1;
      const a = f.strength * fall * h;
      if (a > 0) {
        if (f.type === "vortex") {
          const sw = (f.swirl ?? 1.6) * a;
          b.vx += (dx / d) * a - (dz / d) * sw;
          b.vz += (dz / d) * a + (dx / d) * sw;
        } else {
          b.vx += (dx / d) * a;
          b.vz += (dz / d) * a;
        }
      }
    }
    const vx = b.vx;
    const vz = b.vz;
    const ux = vx + R * b.wz;
    const uz = vz - R * b.wx;
    const umag = Math.hypot(ux, uz);
    const vmag = Math.hypot(vx, vz);
    if (umag > 1e-4) {
      const aGoal = this.muSlide * this.g + this.kDrag * umag;
      const a = Math.min(aGoal, umag / (3.5 * h));
      const dirx = ux / umag;
      const dirz = uz / umag;
      b.vx -= a * dirx * h;
      b.vz -= a * dirz * h;
      b.wx += (-2.5 * (-a * dirz) * h) / R;
      b.wz += (2.5 * (-a * dirx) * h) / R;
      b.wy *= Math.max(0, 1 - this.muSpin * h);
    } else if (vmag > 1e-5) {
      const a = this.muRoll * this.g + this.kDrag * vmag;
      const dec = Math.min(a * h, vmag);
      b.vx -= (dec * vx) / vmag;
      b.vz -= (dec * vz) / vmag;
      const nv = Math.hypot(b.vx, b.vz);
      if (nv > 1e-6) {
        b.wx = b.vz / R;
        b.wz = -b.vx / R;
      }
      b.wy *= Math.max(0, 1 - this.muSpin * h);
    } else {
      b.vx = 0;
      b.vz = 0;
      b.wx = 0;
      b.wz = 0;
      b.wy *= Math.max(0, 1 - this.muSpinStop * h);
      if (Math.abs(b.wy) < this.restSpin) b.wy = 0;
    }
    b.x += b.vx * h;
    b.z += b.vz * h;
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > this.maxSpeed) {
      const s = this.maxSpeed / sp;
      b.vx *= s;
      b.vz *= s;
    }
    if (sp < this.restSpeed && Math.abs(b.wy) < this.restSpin) {
      const uu = Math.hypot(b.vx + b.r * b.wz, b.vz - b.r * b.wx);
      if (uu < 1e-4) {
        b.vx = 0;
        b.vz = 0;
        b.wx = 0;
        b.wz = 0;
        b.wy = 0;
      }
    }
  }

  /* Static circular bumpers: infinite mass, near-elastic. Emits a "bumper"
   * event (bonus "Bumper Bonanza" scores off these). */
  bumpers(b, events) {
    for (const p of this.posts) {
      let nx = b.x - p.x;
      let nz = b.z - p.z;
      let d = Math.hypot(nx, nz);
      const minD = b.r + p.r;
      if (d >= minD) continue;
      if (d < EPS) {
        nx = 1;
        nz = 0;
        d = EPS;
      }
      nx /= d;
      nz /= d;
      b.x += nx * (minD - d);
      b.z += nz * (minD - d);
      const vn = b.vx * nx + b.vz * nz;
      if (vn >= 0) continue;
      const e = p.e ?? 1.04;
      b.vx -= (1 + e) * vn * nx;
      b.vz -= (1 + e) * vn * nz;
      b.wy *= 0.94;
      events.push({ type: "bumper", post: p, x: p.x, z: p.z, bx: b.x, bz: b.z, strength: Math.abs(vn), id: b.id });
    }
  }

  ballPair(a, b, events) {
    let nx = b.x - a.x;
    let nz = b.z - a.z;
    let d = Math.hypot(nx, nz);
    const minD = a.r + b.r;
    if (d >= minD || d < EPS) return;
    nx /= d;
    nz /= d;
    const pen = minD - d;
    const ma = a.m;
    const mb = b.m;
    const invA = 1 / ma;
    const invB = 1 / mb;
    const invSum = invA + invB;
    a.x -= nx * pen * (invA / invSum);
    a.z -= nz * pen * (invA / invSum);
    b.x += nx * pen * (invB / invSum);
    b.z += nz * pen * (invB / invSum);

    const rax = nx * a.r;
    const raz = nz * a.r;
    const rbx = -nx * b.r;
    const rbz = -nz * b.r;
    const avx = a.vx + a.wy * raz;
    const avz = a.vz - a.wy * rax;
    const bvx = b.vx + b.wy * rbz;
    const bvz = b.vz - b.wy * rbx;
    const relx = avx - bvx;
    const relz = avz - bvz;
    const vn = relx * nx + relz * nz;
    if (vn <= 0) return;
    const jn = ((1 + this.eBall) * vn) / invSum;
    a.vx -= jn * invA * nx;
    a.vz -= jn * invA * nz;
    b.vx += jn * invB * nx;
    b.vz += jn * invB * nz;

    const tx0 = relx - vn * nx;
    const tz0 = relz - vn * nz;
    const tmag = Math.hypot(tx0, tz0);
    if (tmag > 1e-6) {
      const tx = tx0 / tmag;
      const tz = tz0 / tmag;
      const mag = Math.min(this.muBall * jn, tmag / invSum);
      a.vx -= mag * tx * invA;
      a.vz -= mag * tz * invA;
      b.vx += mag * tx * invB;
      b.vz += mag * tz * invB;
      const Fax = -mag * tx;
      const Faz = -mag * tz;
      const tay = raz * Fax - rax * Faz;
      a.wy += tay / (0.4 * ma * a.r * a.r);
      const Fbx = mag * tx;
      const Fbz = mag * tz;
      const tby = rbz * Fbx - rbx * Fbz;
      b.wy += tby / (0.4 * mb * b.r * b.r);
    }
    events.push({ type: "ball", x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, strength: Math.abs(vn), a: a.id, b: b.id, avx: a.vx, avz: a.vz, bvx: b.vx, bvz: b.vz });
  }

  inMouth(b, axis, sign) {
    const limit = axis === "x" ? this.halfLength : this.halfWidth;
    for (const p of this.pockets) {
      const near = axis === "x" ? p.x * sign : p.z * sign;
      if (near < limit - 0.09) continue;
      const along = axis === "x" ? b.z - p.z : b.x - p.x;
      const mouth = p.corner ? this.cornerMouth : this.sideMouth;
      if (Math.abs(along) < mouth) return true;
    }
    return false;
  }

  cushions(b, events) {
    const R = b.r;
    const HL = this.halfLength - R;
    const HW = this.halfWidth - R;
    if (b.x < -HL && !this.inMouth(b, "x", -1)) {
      this.resolveCushion(b, 1, 0, -HL - b.x, events);
    } else if (b.x > HL && !this.inMouth(b, "x", 1)) {
      this.resolveCushion(b, -1, 0, b.x - HL, events);
    }
    if (b.z < -HW && !this.inMouth(b, "z", -1)) {
      this.resolveCushion(b, 0, 1, -HW - b.z, events);
    } else if (b.z > HW && !this.inMouth(b, "z", 1)) {
      this.resolveCushion(b, 0, -1, b.z - HW, events);
    }
  }

  resolveCushion(b, nx, nz, pen, events) {
    b.x += nx * pen;
    b.z += nz * pen;
    const R = b.r;
    const rax = -nx * R;
    const raz = -nz * R;
    const avx = b.vx + b.wy * raz;
    const avz = b.vz - b.wy * rax;
    const vn = avx * nx + avz * nz;
    if (vn >= 0) return;
    const jn = -(1 + this.eCushion) * vn;
    b.vx += jn * nx;
    b.vz += jn * nz;
    const tx0 = avx - vn * nx;
    const tz0 = avz - vn * nz;
    const tmag = Math.hypot(tx0, tz0);
    if (tmag > 1e-6) {
      const tx = tx0 / tmag;
      const tz = tz0 / tmag;
      const mag = Math.min(this.muCushion * jn, tmag);
      b.vx -= mag * tx;
      b.vz -= mag * tz;
      const Fax = -mag * tx;
      const Faz = -mag * tz;
      const tay = raz * Fax - rax * Faz;
      b.wy += tay / (0.4 * R * R);
    }
    events.push({ type: "cushion", x: b.x, z: b.z, strength: Math.abs(vn), nx, nz, id: b.id });
  }

  checkPocket(b, events) {
    if (!this.pocketsEnabled) return;
    for (const p of this.pockets) {
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (d < p.r) {
        this.pot(b, p, events);
        return;
      }
    }
    const outX = Math.abs(b.x) - this.halfLength;
    const outZ = Math.abs(b.z) - this.halfWidth;
    if (outX > b.r * 0.9 || outZ > b.r * 0.9) {
      let best = null;
      let bestD = Infinity;
      for (const p of this.pockets) {
        const d = Math.hypot(b.x - p.x, b.z - p.z);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      if (best) this.pot(b, best, events);
    }
  }

  pot(b, p, events) {
    b.potted = true;
    b.pocket = p;
    b.vx = 0;
    b.vz = 0;
    b.wx = 0;
    b.wy = 0;
    b.wz = 0;
    events.push({ type: "pocket", ball: b, pocket: p });
  }

  canPlace(x, z, r = this.R, ignoreId = null) {
    if (Math.abs(x) > this.halfLength - r || Math.abs(z) > this.halfWidth - r) return false;
    for (const p of this.pockets) {
      if (Math.hypot(x - p.x, z - p.z) < p.r + r) return false;
    }
    for (const b of this.balls) {
      if (b.potted) continue;
      if (ignoreId !== null && b.id === ignoreId) continue;
      if (Math.hypot(x - b.x, z - b.z) < 2 * r + 0.0005) return false;
    }
    return true;
  }

  pathClear(from, to, ignoreIds = []) {
    const r = this.R;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return true;
    const ux = dx / len;
    const uz = dz / len;
    for (const b of this.balls) {
      if (b.potted) continue;
      if (ignoreIds.includes(b.id)) continue;
      const px = b.x - from.x;
      const pz = b.z - from.z;
      const along = px * ux + pz * uz;
      if (along <= 0 || along >= len) continue;
      const perp = Math.abs(px * uz - pz * ux);
      if (perp < b.r + r * 0.92) return false;
    }
    return true;
  }

  /* A pocket is "on" if the object ball, travelling along its natural
   * post-impact direction, will pass through the pocket mouth. Returns the
   * closest such pocket (used for the green pocket-line aim hint). */
  pocketFor(ball, dir) {
    let best = null;
    let bestD = Infinity;
    for (const p of this.pockets) {
      const dx = p.x - ball.x;
      const dz = p.z - ball.z;
      const along = dx * dir.x + dz * dir.z;
      if (along <= 0) continue;
      const perp = Math.abs(dx * dir.z - dz * dir.x);
      if (perp > p.r * 0.95) continue;
      if (!this.pathClear(ball, p, [ball.id])) continue;
      const d = Math.hypot(dx, dz);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  aimPreview(x, z, dirX, dirZ, opts = {}) {
    const maxBounces = opts.maxBounces ?? 2;
    const ignoreId = opts.ignoreId ?? null;
    const r = opts.r ?? this.R;
    const HL = this.halfLength - r;
    const HW = this.halfWidth - r;
    const points = [{ x, z }];
    let px = x;
    let pz = z;
    let dx = dirX;
    let dz = dirZ;
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl;
    dz /= dl;
    let hitBall = null;
    let bounced = 0;
    for (let seg = 0; seg <= maxBounces; seg++) {
      let bestT = Infinity;
      let bestBall = null;
      for (const b of this.balls) {
        if (b.potted) continue;
        if (ignoreId !== null && b.id === ignoreId) continue;
        const ox = px - b.x;
        const oz = pz - b.z;
        const rr = r + b.r;
        const bq = dx * ox + dz * oz;
        const c = ox * ox + oz * oz - rr * rr;
        if (c < 0) continue;
        const disc = bq * bq - c;
        if (disc < 0) continue;
        const t = -bq - Math.sqrt(disc);
        if (t > 1e-6 && t < bestT) {
          bestT = t;
          bestBall = b;
        }
      }
      let railT = Infinity;
      let rnx = 0;
      let rnz = 0;
      if (dx > 1e-9) {
        const t = (HL - px) / dx;
        if (t > 1e-6 && t < railT) {
          railT = t;
          rnx = -1;
          rnz = 0;
        }
      } else if (dx < -1e-9) {
        const t = (-HL - px) / dx;
        if (t > 1e-6 && t < railT) {
          railT = t;
          rnx = 1;
          rnz = 0;
        }
      }
      if (dz > 1e-9) {
        const t = (HW - pz) / dz;
        if (t > 1e-6 && t < railT) {
          railT = t;
          rnx = 0;
          rnz = -1;
        }
      } else if (dz < -1e-9) {
        const t = (-HW - pz) / dz;
        if (t > 1e-6 && t < railT) {
          railT = t;
          rnx = 0;
          rnz = 1;
        }
      }
      if (bestBall && bestT <= railT) {
        const gx = px + dx * bestT;
        const gz = pz + dz * bestT;
        points.push({ x: gx, z: gz });
        let nx = bestBall.x - gx;
        let nz = bestBall.z - gz;
        const nd = Math.hypot(nx, nz) || 1;
        nx /= nd;
        nz /= nd;
        const dot = dx * nx + dz * nz;
        let cx = dx - dot * nx;
        let cz = dz - dot * nz;
        const cl = Math.hypot(cx, cz);
        if (cl > 1e-6) {
          cx /= cl;
          cz /= cl;
        } else {
          cx = 0;
          cz = 0;
        }
        hitBall = { ball: bestBall, ghost: { x: gx, z: gz }, objectDir: { x: nx, z: nz }, cueDir: { x: cx, z: cz } };
        hitBall.pocket = opts.pocketHint === false ? null : this.pocketFor(bestBall, { x: nx, z: nz });
        break;
      }
      if (railT === Infinity) break;
      const rx = px + dx * railT;
      const rz = pz + dz * railT;
      points.push({ x: rx, z: rz });
      if (seg === maxBounces) break;
      const dot = dx * rnx + dz * rnz;
      dx -= 2 * dot * rnx;
      dz -= 2 * dot * rnz;
      px = rx;
      pz = rz;
      bounced++;
    }
    return { points, hitBall, bounced };
  }

  /* ------------------------------------------------------------------ */
  /*  Forward-simulation prediction                                      */
  /*                                                                     */
  /*  Rather than approximating the shot with straight rays (which can   */
  /*  not reproduce ball "throw" from spin, real cushion friction, or     */
  /*  pocket capture), we run the ACTUAL physics on a shadow copy of the  */
  /*  table and read the resulting trajectories. The prediction therefore */
  /*  matches what will really happen, by construction.                  */
  /* ------------------------------------------------------------------ */

  makeGhost() {
    const o = this._opts || {};
    const g = new PoolSim({ ...o, field: this.field, pocketsEnabled: this.pocketsEnabled, posts: this.posts });
    g.maxSpeed = this.maxSpeed;
    for (const b of this.balls) {
      const nb = g.addBall(b.x, b.z, { id: b.id, r: b.r, m: b.m, data: b.data });
      nb.vx = b.vx;
      nb.vz = b.vz;
      nb.wx = b.wx;
      nb.wy = b.wy;
      nb.wz = b.wz;
      nb.potted = b.potted;
      nb.pocket = b.pocket;
    }
    return g;
  }

  /* Simulate the given strike on a shadow copy and return clean polylines
   * for the cue ball and for the first object ball it strikes.
   *
   *   { cue: { path, potted, pocket },
   *     object: null | { ballId, start, dir, ghost, cueDir, path, potted, pocket } }
   *
   * `path` is a list of vertices (bounce / contact points), not a dense trail. */
  predictShot(cueId, dirX, dirZ, speed, spin = {}, opts = {}) {
    const g = this.makeGhost();
    const cue = g.balls.find((b) => b.id === cueId);
    if (!cue) return null;
    const dt = opts.dt ?? 1 / 60;
    const maxTime = opts.maxTime ?? 6;
    const gap = opts.gap ?? 0.014;

    const start = new Map();
    const paths = new Map();
    for (const b of g.balls) {
      start.set(b.id, { x: b.x, z: b.z });
      paths.set(b.id, [{ x: b.x, z: b.z }]);
    }
    const pocketed = new Map();
    const cueVerts = paths.get(cueId);

    let objId = null;
    let objDir = null;
    let cueDir = null;
    let cueClosed = false;
    let cueCapped = false;
    let objCapped = false;
    let cueBounces = 0;
    let objBounces = 0;
    const capCue = opts.cueBounces ?? 8;
    const capObj = opts.objBounces ?? 3;

    const push = (id, x, z) => {
      const arr = paths.get(id);
      if (!arr) return;
      const last = arr[arr.length - 1];
      if (Math.hypot(x - last.x, z - last.z) < gap) return;
      arr.push({ x, z });
    };

    g.strike(cue, dirX, dirZ, speed, spin);
    let t = 0;
    while (t < maxTime && g.isMoving()) {
      const evs = g.step(dt);
      t += dt;
      for (const ev of evs) {
        if (ev.type === "ball") {
          if (ev.a === cueId || ev.b === cueId) {
            if (objId !== null) continue; /* first cue contact only */
            const oid = ev.a === cueId ? ev.b : ev.a;
            const ovx = ev.a === cueId ? ev.bvx : ev.avx;
            const ovz = ev.a === cueId ? ev.bvz : ev.avz;
            const cvx = ev.a === cueId ? ev.avx : ev.bvx;
            const cvz = ev.a === cueId ? ev.avz : ev.bvz;
            const os = Math.hypot(ovx, ovz);
            if (os < 1e-5) continue;
            objId = oid;
            objDir = { x: ovx / os, z: ovz / os };
            const cs = Math.hypot(cvx, cvz);
            cueDir = cs > 1e-5 ? { x: cvx / cs, z: cvz / cs } : null;
            const ob = g.balls.find((b) => b.id === oid);
            const s0 = start.get(oid);
            const rr = cue.r + (ob?.r ?? g.R);
            const ghost = { x: s0.x - objDir.x * rr, z: s0.z - objDir.z * rr };
            /* the cue ball's line ends where it makes contact */
            while (cueVerts.length > 1 && Math.hypot(cueVerts[cueVerts.length - 1].x - ghost.x, cueVerts[cueVerts.length - 1].z - ghost.z) < 0.08) {
              cueVerts.pop();
            }
            push(cueId, ghost.x, ghost.z);
            cueClosed = true;
          } else {
            push(ev.a, ev.x, ev.z);
            push(ev.b, ev.x, ev.z);
          }
        } else if (ev.type === "cushion" || ev.type === "bumper") {
          const vx = ev.bx ?? ev.x;
          const vz = ev.bz ?? ev.z;
          if (ev.id === cueId) {
            if (cueClosed || cueCapped) continue;
            if (cueBounces >= capCue) {
              cueCapped = true;
              continue;
            }
            cueBounces++;
            push(cueId, vx, vz);
          } else if (objId !== null && ev.id === objId) {
            if (objCapped) continue;
            if (objBounces >= capObj) {
              objCapped = true;
              continue;
            }
            objBounces++;
            push(objId, vx, vz);
          }
        } else if (ev.type === "pocket") {
          pocketed.set(ev.ball.id, { x: ev.pocket.x, z: ev.pocket.z, pocket: ev.pocket });
        }
      }
    }

    const finalize = (id, closed) => {
      const arr = paths.get(id);
      const pk = pocketed.get(id);
      if (pk) {
        const last = arr[arr.length - 1];
        if (Math.hypot(pk.x - last.x, pk.z - last.z) > 1e-4) arr.push({ x: pk.x, z: pk.z });
        return arr;
      }
      if (closed) return arr;
      const b = g.balls.find((x) => x.id === id);
      if (b) {
        const last = arr[arr.length - 1];
        if (Math.hypot(b.x - last.x, b.z - last.z) > 1e-4) arr.push({ x: b.x, z: b.z });
      }
      return arr;
    };

    const res = {
      cue: {
        path: finalize(cueId, cueClosed || cueCapped),
        potted: pocketed.has(cueId),
        pocket: pocketed.get(cueId)?.pocket ?? null,
      },
      object: null,
    };
    if (objId !== null) {
      const ob = g.balls.find((b) => b.id === objId);
      const s0 = start.get(objId);
      const rr = cue.r + (ob?.r ?? g.R);
      res.object = {
        ballId: objId,
        start: s0,
        dir: objDir,
        cueDir,
        ghost: { x: s0.x - objDir.x * rr, z: s0.z - objDir.z * rr },
        path: finalize(objId, objCapped),
        potted: pocketed.has(objId),
        pocket: pocketed.get(objId)?.pocket ?? null,
      };
    }
    return res;
  }
}
