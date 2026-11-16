import { Player } from './player.js';
import { WEAPONS } from './config.js';
import { Weapon } from './weapon.js';

const BOT_EYE = 1.6;
const PICK_INTERVAL = 0.2;
const VISION_DOT = Math.cos(50 * Math.PI / 180);
const VISION_RANGE = 60;
const AIM_GROW = 1.6;
const AIM_SHRINK = 1.4;
const AIM_MIN = 0.008;
const AIM_STILL_BONUS = 2.0;
const AIM_THRESHOLD = 0.05;

class Bot extends Player {
  static bots = [];

  constructor({ position, team, waypoints = [], camera, scene, combatantsGetter }) {
    super({ position, team, isBot: true });
    this.waypoints = waypoints;
    this.wpIndex = 0;
    this.camera = camera;
    this.scene = scene;
    this.combatantsGetter = combatantsGetter;

    this.weapon = new Weapon('rifle', camera, scene, combatantsGetter);
    this.weapon.owner = this;

    this.state = 'patrol';
    this.stateTimer = 0;
    this.target = null;
    this.aimError = AIM_GROW;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.reactTimer = 0;
    this.visibleTime = 0;
    this.pickTimer = 0;
    this.strafeTimer = 0;
    this.scanAngle = Math.random() * Math.PI * 2;
    this.investigatePos = null;
    this.lastKnownPos = null;
    this.moveIntent = { x: 0, z: 0, run: false, crouch: false, jump: false };

    Bot.bots.push(this);
  }

  get eyePos() {
    return {
      x: this.pos.x,
      y: this.pos.y + (typeof this.eyeHeight === 'number' ? this.eyeHeight : BOT_EYE),
      z: this.pos.z,
    };
  }

  static alert(pos, radius) {
    for (const bot of Bot.bots) {
      if (!bot.alive) continue;
      const dx = bot.pos.x - pos.x;
      const dz = bot.pos.z - pos.z;
      if (dx * dx + dz * dz <= radius * radius) {
        bot.state = 'investigate';
        bot.stateTimer = 10;
        bot.investigatePos = { x: pos.x, z: pos.z };
        bot.target = null;
        bot.visibleTime = 0;
      }
    }
  }

  respawn(pos) {
    super.respawn(pos);
    if (this.weapon && this.weapon.def && typeof this.weapon.def.magSize === 'number') {
      this.weapon.mag = this.weapon.def.magSize;
    }
    this.weapon.owner = this;
    this.state = 'patrol';
    this.stateTimer = 0;
    this.target = null;
    this.aimError = AIM_GROW;
    this.visibleTime = 0;
    this.reactTimer = 0;
    this.investigatePos = null;
    this.lastKnownPos = null;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.waypoints.length; i++) {
      const wp = this.waypoints[i];
      const dx = wp.x - this.pos.x;
      const dz = wp.z - this.pos.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    this.wpIndex = best;
  }

  _rayBlocked(from, to, colliders) {
    if (!Array.isArray(colliders)) return false;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 1e-4) return false;
    const inv = (v) => (Math.abs(v) < 1e-8 ? (v >= 0 ? 1e8 : -1e8) : 1 / v);
    const invx = inv(dx / dist), invy = inv(dy / dist), invz = inv(dz / dist);
    for (const c of colliders) {
      const min = c.min || c;
      const max = c.max || c;
      const minX = min.x, minY = min.y, minZ = min.z;
      const maxX = max.x, maxY = max.y, maxZ = max.z;
      let t1 = (minX - from.x) * invx;
      let t2 = (maxX - from.x) * invx;
      let tmin = Math.min(t1, t2);
      let tmax = Math.max(t1, t2);
      t1 = (minY - from.y) * invy;
      t2 = (maxY - from.y) * invy;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
      t1 = (minZ - from.z) * invz;
      t2 = (maxZ - from.z) * invz;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
      if (tmax >= Math.max(tmin, 0) && tmin <= dist) return true;
    }
    return false;
  }

  _canSee(enemy, colliders) {
    const from = this.eyePos;
    const eh = typeof enemy.eyeHeight === 'number' ? enemy.eyeHeight : BOT_EYE;
    const to = { x: enemy.pos.x, y: enemy.pos.y + eh, z: enemy.pos.z };
    return !this._rayBlocked(from, to, colliders);
  }

  _pickTarget(combatants) {
    if (!Array.isArray(combatants)) return null;
    let best = null;
    let bestD = Infinity;
    for (const c of combatants) {
      if (c === this || !c.alive || c.team === this.team) continue;
      const dx = c.pos.x - this.pos.x;
      const dz = c.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > VISION_RANGE) continue;
      if (dist > 0.001 && dist > 3) {
        const fx = Math.sin(this.yaw);
        const fz = -Math.cos(this.yaw);
        const dot = (dx * fx + dz * fz) / dist;
        if (dot < VISION_DOT) continue;
      }
      if (dist < bestD && this._canSee(c, this._colliders)) {
        best = c;
        bestD = dist;
      }
    }
    return best;
  }

  _aimAt(target, dt, still, firingNow) {
    const eh = typeof target.eyeHeight === 'number' ? target.eyeHeight : BOT_EYE;
    const myEye = typeof this.eyeHeight === 'number' ? this.eyeHeight : BOT_EYE;
    const dx = target.pos.x - this.pos.x;
    const dy = (target.pos.y + eh) - (this.pos.y + myEye);
    const dz = target.pos.z - this.pos.z;
    const wantYaw = Math.atan2(dx, -dz);
    const flat = Math.hypot(dx, dz);
    const wantPitch = Math.atan2(dy, flat);
    const turn = 7 * dt;
    let dyaw = wantYaw - this.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.yaw += Math.max(-turn, Math.min(turn, dyaw));
    this.pitch += Math.max(-turn, Math.min(turn, wantPitch - this.pitch));

    const decay = (still ? AIM_STILL_BONUS : 1) * AIM_SHRINK * dt;
    this.aimError = Math.max(AIM_MIN, this.aimError - decay);

    if (firingNow) {
      this._baseYaw = this.yaw;
      this._basePitch = this.pitch;
      this.yaw += (Math.random() * 2 - 1) * this.aimError;
      this.pitch += (Math.random() * 2 - 1) * this.aimError;
    }
  }

  _restoreAim() {
    if (this._baseYaw !== undefined) {
      this.yaw = this._baseYaw;
      this.pitch = this._basePitch;
      this._baseYaw = undefined;
      this._basePitch = undefined;
    }
  }

  _angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  _inZone(zone) {
    if (!zone) return false;
    const dx = this.pos.x - zone.center.x;
    const dz = this.pos.z - zone.center.z;
    return dx * dx + dz * dz <= zone.radius * zone.radius;
  }

  _patrol(dt) {
    const wps = this.waypoints;
    if (!wps || wps.length === 0) return;
    const wp = wps[this.wpIndex % wps.length];
    const dx = wp.x - this.pos.x;
    const dz = wp.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.5) {
      this.wpIndex = (this.wpIndex + 1) % wps.length;
      return;
    }
    this.moveIntent = { x: dx / dist, z: dz / dist, run: true, crouch: false, jump: false };
  }

  _investigate(dt) {
    const tgt = this.investigatePos || this.lastKnownPos;
    if (!tgt) { this.state = 'patrol'; return; }
    const dx = tgt.x - this.pos.x;
    const dz = tgt.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2) {
      this.scanAngle += dt * 1.8;
      this.yaw = this.scanAngle;
    } else {
      this.moveIntent = { x: dx / dist, z: dz / dist, run: true, crouch: false, jump: false };
      this.yaw = Math.atan2(dx, -dz);
    }
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this.state = 'patrol';
      this.investigatePos = null;
    }
  }

  _engage(dt) {
    const target = this.target;
    if (!target || !target.alive) {
      this.target = null;
      this.visibleTime = 0;
      this.state = 'patrol';
      return;
    }
    const dx = target.pos.x - this.pos.x;
    const dz = target.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const still = Math.abs(this.moveIntent.x) < 0.01 && Math.abs(this.moveIntent.z) < 0.01;
    this.reactTimer = Math.max(0, this.reactTimer - dt);
    if (this.reactTimer > 0) return;

    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeDir *= -1;
      this.strafeTimer = 0.7 + Math.random() * 0.6;
    }
    const toT = { x: dx / dist, z: dz / dist };
    const strafe = { x: -toT.z * this.strafeDir, z: toT.x * this.strafeDir };
    let mx = strafe.x;
    let mz = strafe.z;
    if (dist > 18) { mx += toT.x * 0.6; mz += toT.z * 0.6; }
    else if (dist < 5) { mx -= toT.x * 0.5; mz -= toT.z * 0.5; }
    const mlen = Math.hypot(mx, mz) || 1;
    this.moveIntent = { x: mx / mlen, z: mz / mlen, run: true, crouch: false, jump: false };

    const canSee = this._canSee(target, this._colliders);
    this.visibleTime = canSee ? this.visibleTime + dt : 0;
    const weaponReady = !(this.weapon && this.weapon.reloading);
    const firingNow = canSee && this.visibleTime > 0.15 && weaponReady;
    this._aimAt(target, dt, still, firingNow);

    const aimDiff = Math.abs(this._angleDiff(this.yaw, Math.atan2(dx, -dz)));
    const range = (this.weapon.def && this.weapon.def.range) || 120;
    if (firingNow && aimDiff < AIM_THRESHOLD + this.aimError * 2 && dist < range && this.weapon.mag > 0) {
      this.weapon.fire();
    }
    if (!canSee) {
      this.lastKnownPos = { x: target.pos.x, z: target.pos.z };
      this.target = null;
      this.state = 'patrol';
    }
  }

  _hold(dt) {
    this.moveIntent = { x: 0, z: 0, run: false, crouch: false, jump: false };
    this.scanAngle += dt * 1.2;
    this.yaw = this.scanAngle;
    this.pitch *= 0.9;
  }

  update(dt, world, combatants) {
    if (!this.alive) return;
    this.moveIntent = { x: 0, z: 0, run: false, crouch: false, jump: false };

    this._colliders = world.colliders;
    this.pickTimer -= dt;
    if (this.pickTimer <= 0) {
      this.pickTimer = PICK_INTERVAL;
      const picked = this._pickTarget(combatants);
      if (picked) {
        if (this.target !== picked) {
          this.target = picked;
          this.aimError = Math.max(this.aimError, AIM_GROW);
          if (this.state !== 'engage') this.reactTimer = 0.25 + Math.random() * 0.2;
        }
        this.state = 'engage';
      }
    }

    switch (this.state) {
      case 'engage':
        this._engage(dt);
        break;
      case 'investigate':
        this._investigate(dt);
        break;
      case 'hold':
        this._hold(dt);
        if (this.stateTimer > 0) {
          this.stateTimer -= dt;
          if (this.stateTimer <= 0) this.state = 'patrol';
        }
        break;
      default:
        this._patrol(dt);
        if (world && world.objective && this._inZone(world.objective) && !this.target) {
          this.state = 'hold';
          this.stateTimer = 4 + Math.random() * 3;
        }
        break;
    }

    if (this.state !== 'engage') this._restoreAim();
    this.updateDirections();
    this.moveAndCollide(dt, world.colliders);
    this.weapon.update(dt, {
      firing: false,
      reloadPressed: this.weapon.mag <= 0,
      movingSpeed: Math.hypot(this.vel.x, this.vel.z),
      onGround: this.onGround !== false,
      crouching: !!this.moveIntent.crouch,
    });
  }
}

export { Bot };
