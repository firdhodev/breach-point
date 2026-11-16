// Weapons: hitscan guns, spread/recoil, reload, and thrown grenades.
// Pure simulation - main.js feeds dt, rng and the world; audio.js is pinged on events.

import { WEAPONS, GRENADES, HIT } from './config.js';
import { audio } from './audio.js';

// Deterministic PRNG (mulberry32) so a seeded round can be replayed.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A held weapon instance. `def` is one of the config.WEAPONS entries.
export class Weapon {
  constructor(id, def) {
    this.id = id;
    this.def = def;
    this.mag = def.mag;
    this.reserve = def.reserve;
    this.fireTimer = 0;
    this.reloadTimer = 0;
    this._reloading = false;
    this.bloom = 0; // temporary spread added by sustained fire
    this.owner = null; // assigned by the holder (player or bot)
  }

  get reloading() { return this._reloading; }
  set reloading(v) { this._reloading = !!v; }

  get canFire() {
    return this.fireTimer <= 0 && !this._reloading && this.mag > 0;
  }

  // Cone half-angle (radians) for the shooter's current stance.
  // moveFactor: 0 (planted) .. 1 (full sprint).
  spread(moveFactor, airborne, crouching) {
    let s = this.def.spreadBase + this.bloom;
    if (moveFactor > 0) s += this.def.spreadMove * moveFactor;
    if (airborne) s += this.def.spreadJump;
    if (crouching && moveFactor <= 0.01) s *= 0.5;
    return s;
  }

  // Release one shot. Returns true when a bullet actually left the barrel.
  triggerFire() {
    if (!this.canFire) {
      if (this.mag <= 0 && this.reserve > 0 && !this._reloading) this.startReload();
      return false;
    }
    this.mag -= 1;
    this.fireTimer = this.def.fireDelay;
    this.bloom = Math.min(this.bloom + this.def.recoil * 1.5, this.def.spreadMove * 2);
    audio.shot(this.id);
    return true;
  }

  // Camera punch for this shot, in radians.
  recoilKick(rng) {
    const r = this.def.recoil;
    return { pitch: r * (0.7 + 0.6 * rng()), yaw: (rng() - 0.5) * r * 0.6 };
  }

  startReload() {
    if (this._reloading || this.mag >= this.def.mag || this.reserve <= 0) return false;
    this._reloading = true;
    this.reloadTimer = this.def.reload;
    audio.reload();
    return true;
  }

  update(dt) {
    if (this.fireTimer > 0) this.fireTimer -= dt;
    if (this.bloom > 0) this.bloom = Math.max(0, this.bloom - dt * this.def.recoil * 4);
    if (this._reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this._reloading = false;
        const need = this.def.mag - this.mag;
        const take = Math.min(need, this.reserve);
        this.mag += take;
        this.reserve -= take;
      }
    }
  }
}

// Ray vs axis-aligned box (slab method). Returns entry distance or -1.
function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0;
  let tmax = Infinity;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  const keys = ['x', 'y', 'z'];
  for (let i = 0; i < 3; i++) {
    const lo = b.min[keys[i]];
    const hi = b.max[keys[i]];
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < lo || o[i] > hi) return -1;
    } else {
      let t1 = (lo - o[i]) / d[i];
      let t2 = (hi - o[i]) / d[i];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

// Ray vs a character: vertical cylinder for the body, sphere for the head.
function rayTarget(ox, oy, oz, dx, dy, dz, ent) {
  const r = ent.radius || 0.35;
  const baseY = ent.pos.y;
  const topY = baseY + (ent.bodyHeight ? ent.bodyHeight() : 1.7);
  const px = ox - ent.pos.x;
  const pz = oz - ent.pos.z;
  const a = dx * dx + dz * dz;
  let bodyT = -1;
  let limbT = -1;
  if (a > 1e-9) {
    const b = 2 * (px * dx + pz * dz);
    const c = px * px + pz * pz - r * r;
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const t1 = (-b - sq) / (2 * a);
      const t2 = (-b + sq) / (2 * a);
      for (const t of [t1, t2]) {
        if (t < 0) continue;
        const y = oy + dy * t;
        if (y >= baseY && y <= topY) {
          const legTop = baseY + (topY - baseY) * 0.35;
          if (y < legTop) { if (limbT < 0) limbT = t; }
          else if (bodyT < 0) bodyT = t;
          break;
        }
      }
    }
  }
  const hy = topY - 0.18;
  const hr = ent.headRadius || 0.2;
  const hx = ox - ent.pos.x;
  const hyy = oy - hy;
  const hz = oz - ent.pos.z;
  const qa = dx * dx + dy * dy + dz * dz;
  const qb = 2 * (hx * dx + hyy * dy + hz * dz);
  const qc = hx * hx + hyy * hyy + hz * hz - hr * hr;
  const qd = qb * qb - 4 * qa * qc;
  let headT = -1;
  if (qd >= 0) {
    const t = (-qb - Math.sqrt(qd)) / (2 * qa);
    if (t >= 0) headT = t;
  }
  return { bodyT, limbT, headT };
}

// Cast one bullet. Returns {hit, point, target, part, damage, distance, dir}.
export function fireHitscan(origin, dir, spreadRad, maxRange, world, targets, rng, shooter, damage) {
  let dx = dir.x, dy = dir.y, dz = dir.z;
  if (spreadRad > 0) {
    const ang = rng() * Math.PI * 2;
    const rad = spreadRad * Math.sqrt(rng());
    // perpendicular basis around the shot direction (u = cross(dir, ref))
    const ref = Math.abs(dy) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    let ux = dy * ref.z - dz * ref.y;
    let uy = dz * ref.x - dx * ref.z;
    let uz = dx * ref.y - dy * ref.x;
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    const bx = dy * uz - dz * uy;
    const by = dz * ux - dx * uz;
    const bz = dx * uy - dy * ux;
    const tx = Math.cos(ang) * rad, ty = Math.sin(ang) * rad;
    dx += ux * tx + bx * ty;
    dy += uy * tx + by * ty;
    dz += uz * tx + bz * ty;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
  }
  const ox = origin.x, oy = origin.y, oz = origin.z;
  let bestT = maxRange;
  let bestTarget = null;
  let bestPart = 'world';
  for (const b of world.boxes) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, b);
    if (t >= 0 && t < bestT) { bestT = t; bestTarget = null; bestPart = 'world'; }
  }
  for (const ent of targets) {
    if (ent === shooter || !ent.alive) continue;
    if (shooter && ent.team !== undefined && shooter.team !== undefined && ent.team === shooter.team) continue;
    const r = rayTarget(ox, oy, oz, dx, dy, dz, ent);
    if (r.headT >= 0 && r.headT < bestT) { bestT = r.headT; bestTarget = ent; bestPart = 'head'; }
    else if (r.bodyT >= 0 && r.bodyT < bestT) { bestT = r.bodyT; bestTarget = ent; bestPart = 'body'; }
    else if (r.limbT >= 0 && r.limbT < bestT) { bestT = r.limbT; bestTarget = ent; bestPart = 'limb'; }
  }
  const point = { x: ox + dx * bestT, y: oy + dy * bestT, z: oz + dz * bestT };
  if (!bestTarget || bestPart === 'world') {
    return { hit: false, point, target: null, part: 'world', damage: 0, distance: bestT, dir: { x: dx, y: dy, z: dz } };
  }
  const mult = bestPart === 'head' ? 4 : bestPart === 'limb' ? HIT.limb : HIT.body;
  return { hit: true, point, target: bestTarget, part: bestPart, damage: (damage || 0) * mult, distance: bestT, dir: { x: dx, y: dy, z: dz } };
}

// A thrown fragmentation grenade: short ballistic arc, timed fuse, radial damage.
export class Grenade {
  constructor(def, owner, pos, dir) {
    this.def = def || GRENADES.frag;
    this.owner = owner;
    this.pos = { x: pos.x, y: pos.y, z: pos.z };
    this.vel = { x: dir.x * 14, y: dir.y * 14 + 5, z: dir.z * 14 };
    this.fuse = this.def.fuse;
    this.done = false;
  }

  update(dt, world, targets) {
    if (this.done) return { exploded: false };
    this.fuse -= dt;
    this.vel.y -= 20 * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;
    if (this.pos.y <= 0.12) {
      this.pos.y = 0.12;
      this.vel.y = Math.abs(this.vel.y) * 0.35;
      this.vel.x *= 0.6;
      this.vel.z *= 0.6;
    }
    for (const b of world.boxes) {
      if (this.pos.x > b.min.x && this.pos.x < b.max.x && this.pos.z > b.min.z && this.pos.z < b.max.z && this.pos.y < b.max.y) {
        this.vel.x *= -0.4;
        this.vel.z *= -0.4;
        this.pos.x -= this.vel.x * dt;
        this.pos.z -= this.vel.z * dt;
        break;
      }
    }
    if (this.fuse <= 0) {
      this.done = true;
      audio.explosion();
      const R = this.def.radius;
      const hits = [];
      for (const ent of targets) {
        if (!ent.alive) continue;
        const d = Math.hypot(ent.pos.x - this.pos.x, ent.pos.y + 0.9 - this.pos.y, ent.pos.z - this.pos.z);
        if (d < R) hits.push({ target: ent, damage: this.def.dmg * (1 - d / R) });
      }
      return { exploded: true, point: { x: this.pos.x, y: this.pos.y, z: this.pos.z }, hits };
    }
    return { exploded: false };
  }
}