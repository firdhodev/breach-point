// AI bots for both teams. Each bot is a state machine driven by the match context
// that main.js supplies every fixed step (player, other bots, bomb, round phase).

import { BOT, TEAM, WEAPONS, PLANT_TIME, DEFUSE_TIME } from './config.js';
import { audio } from './audio.js';

// Original codenames - invented for this map, not taken from any existing game.
export const BOT_NAMES = [
  'Vex', 'Marrow', 'Kite', 'Onyx', 'Sable', 'Rook', 'Wren', 'Talon',
  'Moss', 'Flint', 'Juno', 'Haze', 'Corvid', 'Slate', 'Iris', 'Drift',
];

// Shortest path over the waypoint graph with BFS (unweighted).
export function bfsPath(world, startIdx, goalIdx) {
  const n = world.waypoints.length;
  if (startIdx < 0 || goalIdx < 0) return [];
  const prev = new Array(n).fill(-1);
  prev[startIdx] = startIdx;
  const adj = world.adj || buildAdj(world);
  world.adj = adj;
  const q = [startIdx];
  while (q.length) {
    const x = q.shift();
    if (x === goalIdx) break;
    for (const y of adj[x]) {
      if (prev[y] < 0) { prev[y] = x; q.push(y); }
    }
  }
  if (prev[goalIdx] < 0) return [goalIdx];
  const path = [];
  let c = goalIdx;
  while (c !== startIdx) { path.push(c); c = prev[c]; }
  path.push(startIdx);
  return path.reverse();
}

function buildAdj(world) {
  const n = world.waypoints.length;
  const adj = Array.from({ length: n }, () => []);
  for (const [i, j] of world.links) { adj[i].push(j); adj[j].push(i); }
  return adj;
}

// Give every bot a route: attackers head for the plant site, defenders hold nearby.
export function assignRoutes(world, bots) {
  const wps = world.waypoints;
  const siteIdx = nearestWp(world, world.site.x, world.site.z);
  let atkCount = 0;
  let defCount = 0;
  for (const b of bots) {
    const spawnIdx = nearestWp(world, b.pos.x, b.pos.z);
    if (b.team === TEAM.ATK) {
      const lane = atkCount % 3;
      const mid = [17, 18, 1][lane]; // mid / north doors
      const via = bfsPath(world, spawnIdx, mid);
      const rest = bfsPath(world, mid, siteIdx);
      b.route = via.concat(rest.slice(1));
      atkCount += 1;
    } else {
      // defenders spread around the site ring
      const ring = [23, 24, 25, 26];
      const goal = ring[defCount % ring.length];
      b.route = bfsPath(world, spawnIdx, goal);
      defCount += 1;
    }
    b.routeI = 0;
  }
  void wps;
}

function nearestWp(world, x, z) {
  let best = 0;
  let bd = Infinity;
  world.waypoints.forEach((p, i) => {
    const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

export class Bot {
  constructor(team, index, world, rng, name) {
    this.team = team;
    this.index = index;
    this.world = world;
    this.rng = rng;
    this.name = name || `Bot ${index}`;
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.health = 100;
    this.armor = 0;
    this.alive = true;
    this.radius = 0.35;
    this.state = 'move';
    this.target = null;
    this.route = [];
    this.routeI = 0;
    this.holdTimer = 0;
    this.reactionTimer = 0;
    this.fireTimer = 0;
    this.burstLeft = 0;
    this.strafeTimer = 0;
    this.strafeDir = 1;
    this.lastSeen = null;
    this.aimError = 0;
    this.crouching = false;
    this.weaponId = 'pistol';
    this.mag = WEAPONS.pistol.mag;
    this.reserve = WEAPONS.pistol.reserve;
    this.reloadTimer = 0;
    this.reloading = false;
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.hasBomb = false;
    this.currentDamage = WEAPONS.pistol.dmg;
    this.isBot = true;
    this.kills = 0;
    this.money = 800;
  }

  eyeY() {
    return this.pos.y + 1.55;
  }
  bodyHeight() {
    return this.crouching ? 1.2 : 1.7;
  }
  headRadius() {
    return 0.2;
  }

  giveWeapon(id) {
    const def = WEAPONS[id] || WEAPONS.pistol;
    this.weaponId = id;
    this.currentDamage = def.dmg;
    this.mag = def.mag;
    this.reserve = def.reserve;
    this.reloading = false;
    this.reloadTimer = 0;
  }

  respawn(spawn, loadoutId) {
    this.pos.x = spawn.x;
    this.pos.y = 0;
    this.pos.z = spawn.z;
    this.vel.x = 0; this.vel.y = 0; this.vel.z = 0;
    this.yaw = spawn.yaw || 0;
    this.health = 100;
    this.alive = true;
    this.target = null;
    this.state = 'move';
    this.lastSeen = null;
    this.reactionTimer = 0;
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.hasBomb = false;
    this.routeI = 0;
    this.giveWeapon(loadoutId || 'pistol');
    this.crouching = false;
  }

  takeDamage(amount, part, from) {
    if (!this.alive) return false;
    let dmg = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, dmg * 0.5);
      this.armor -= absorbed;
      dmg -= absorbed;
    }
    this.health -= dmg;
    // getting shot turns us toward the shooter
    if (from && from.pos) {
      this.yaw = Math.atan2(from.pos.x - this.pos.x, from.pos.z - this.pos.z);
      this.lastSeen = { x: from.pos.x, z: from.pos.z, t: 0 };
      if (!this.target) this.reactionTimer = Math.min(this.reactionTimer, BOT.reactionMin);
    }
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.state = 'dead';
      return true;
    }
    return false;
  }

  // --- vision ---
  canSee(ctx, ent) {
    if (!ent || !ent.alive) return false;
    const dx = ent.pos.x - this.pos.x;
    const dz = ent.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > BOT.visionRange) return false;
    const ang = Math.atan2(dx, dz);
    let diff = Math.abs(normAngle(ang - this.yaw));
    if (diff > (BOT.visionDeg * Math.PI) / 360 && dist > 4) return false;
    // line of sight at chest height
    const oy = this.eyeY();
    const ty = ent.pos.y + (ent.bodyHeight ? ent.bodyHeight() * 0.6 : 1);
    return losClear(this.world, this.pos.x, oy, this.pos.z, ent.pos.x, ty, ent.pos.z);
  }

  update(dt, ctx) {
    if (!this.alive) return;
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const def = WEAPONS[this.weaponId];
        const need = def.mag - this.mag;
        const take = Math.min(need, this.reserve);
        this.mag += take; this.reserve -= take;
        this.reloading = false;
      }
    }

    if (ctx.roundState === 'buy') {
      // hold at spawn during buy time
      this.state = 'hold';
      this.holdTimer = 0.5;
      return;
    }

    // --- acquire target ---
    const enemies = [];
    if (ctx.player && ctx.player.alive && ctx.player.team !== this.team) enemies.push(ctx.player);
    for (const b of ctx.bots) {
      if (b !== this && b.alive && b.team !== this.team) enemies.push(b);
    }
    let visible = null;
    let bestD = Infinity;
    for (const e of enemies) {
      if (!this.canSee(ctx, e)) continue;
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (d < bestD) { bestD = d; visible = e; }
    }
    if (visible) {
      if (this.target !== visible) {
        this.target = visible;
        this.reactionTimer = BOT.reactionMin + this.rng() * (BOT.reactionMax - BOT.reactionMin);
      }
      this.lastSeen = { x: visible.pos.x, z: visible.pos.z, t: 0 };
    } else {
      this.target = null;
    }
    if (this.lastSeen) this.lastSeen.t += dt;

    // --- hearing ---
    if (ctx.noise && !visible) {
      const nd = Math.hypot(ctx.noise.x - this.pos.x, ctx.noise.z - this.pos.z);
      if (nd < BOT.hearingRange && this.state === 'hold') {
        this.yaw = Math.atan2(ctx.noise.x - this.pos.x, ctx.noise.z - this.pos.z);
      }
    }

    // --- state behaviour ---
    if (this.reactionTimer > 0) this.reactionTimer -= dt;

    if (visible) {
      this.state = 'engage';
      this.engage(dt, ctx, visible);
      return;
    }

    // objective behaviours
    if (this.handleObjective(dt, ctx)) return;

    // no enemy: follow route or investigate last known position
    if (this.lastSeen && this.lastSeen.t < 3) {
      this.state = 'move';
      this.moveToward(this.lastSeen.x, this.lastSeen.z, dt, 1);
      return;
    }
    this.followRoute(dt);
  }

  engage(dt, ctx, target) {
    const dx = target.pos.x - this.pos.x;
    const dz = target.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const wantYaw = Math.atan2(dx, dz);
    this.yaw = turnToward(this.yaw, wantYaw, dt * 9);
    // strafe sideways while shooting
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = 0.4 + this.rng() * 0.8;
      this.strafeDir = this.rng() < 0.5 ? -1 : 1;
      this.crouching = this.rng() < 0.25 && dist > 10;
    }
    const speed = this.crouching ? 2.8 : 4.2;
    const sx = Math.cos(this.yaw) * this.strafeDir * speed;
    const sz = -Math.sin(this.yaw) * this.strafeDir * speed;
    this.moveWithCollision(sx * dt, sz * dt);
    if (this.reactionTimer > 0) return;
    this.tryShoot(dt, target, dist);
  }

  tryShoot(dt, target, dist) {
    if (this.fireTimer > 0 || this.reloading) return;
    if (this.mag <= 0) {
      if (this.reserve > 0) { this.reloading = true; this.reloadTimer = WEAPONS[this.weaponId].reload; }
      else this.giveWeapon('pistol');
      return;
    }
    if (this.burstLeft <= 0) {
      this.burstLeft = WEAPONS[this.weaponId].auto ? BOT.burst : 1;
    }
    // aim with error that grows with distance and shrinks while tracking
    const def = WEAPONS[this.weaponId];
    const err = BOT.aimError * (0.4 + dist / 30) * (0.6 + this.rng() * 0.8);
    const lead = 0;
    void lead;
    const ty = target.pos.y + (target.bodyHeight ? target.bodyHeight() * 0.65 : 1.1);
    const dx = target.pos.x - this.pos.x;
    const dz = target.pos.z - this.pos.z;
    const dl = Math.hypot(dx, dz) || 1;
    const aim = {
      x: dx / dl + (this.rng() - 0.5) * err,
      y: (ty - this.eyeY()) / dl + (this.rng() - 0.5) * err * 0.5,
      z: dz / dl + (this.rng() - 0.5) * err,
    };
    const al = Math.hypot(aim.x, aim.y, aim.z);
    aim.x /= al; aim.y /= al; aim.z /= al;
    this.mag -= 1;
    this.fireTimer = def.fireDelay * (def.auto ? 1 : 1.15);
    this.burstLeft -= 1;
    if (this.burstLeft <= 0) this.fireTimer += 0.25 + this.rng() * 0.3;
    audio.shot(this.weaponId);
    if (ctx.onShoot) ctx.onShoot(this, aim, def);
  }

  handleObjective(dt, ctx) {
    const bomb = ctx.bomb;
    if (!bomb) return false;
    if (this.team === TEAM.ATK && !bomb.planted && bomb.carrier === this) {
      const d = Math.hypot(this.pos.x - ctx.site.x, this.pos.z - ctx.site.z);
      if (d < ctx.site.radius) {
        this.state = 'plant';
        this.plantProgress += dt / PLANT_TIME;
        if (this.plantProgress >= 1) {
          if (ctx.onPlant) ctx.onPlant(this);
          this.plantProgress = 0;
        }
        return true;
      }
      // walk to the site
      this.moveToward(ctx.site.x, ctx.site.z, dt, 1);
      return true;
    }
    if (this.team === TEAM.DEF && bomb.planted && !bomb.defused) {
      const d = Math.hypot(this.pos.x - bomb.pos.x, this.pos.z - bomb.pos.z);
      if (d < 1.6) {
        this.state = 'defuse';
        this.defuseProgress += dt / DEFUSE_TIME;
        if (this.defuseProgress >= 1) {
          if (ctx.onDefuse) ctx.onDefuse(this);
          this.defuseProgress = 0;
        }
        return true;
      }
      if (d < 14) {
        this.moveToward(bomb.pos.x, bomb.pos.z, dt, 1);
        return true;
      }
    }
    return false;
  }

  followRoute(dt) {
    if (!this.route || this.route.length === 0) { this.state = 'hold'; this.holdTimer = 0.5; return; }
    if (this.holdTimer > 0) {
      this.holdTimer -= dt;
      this.state = 'hold';
      return;
    }
    const wp = this.world.waypoints;
    const node = wp[this.route[Math.min(this.routeI, this.route.length - 1)]];
    const dx = node.x - this.pos.x;
    const dz = node.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.2) {
      this.routeI += 1;
      if (this.routeI >= this.route.length) {
        this.routeI = 0;
        this.holdTimer = 1.5 + this.rng() * 2.5; // pause at the end, then loop
      }
      return;
    }
    this.moveToward(node.x, node.z, dt, 0.85);
  }

  moveToward(x, z, dt, speedScale) {
    const dx = x - this.pos.x;
    const dz = z - this.pos.z;
    const wantYaw = Math.atan2(dx, dz);
    this.yaw = turnToward(this.yaw, wantYaw, dt * 6);
    const speed = 5.2 * speedScale;
    this.moveWithCollision((dx / (Math.hypot(dx, dz) || 1)) * speed * dt, (dz / (Math.hypot(dx, dz) || 1)) * speed * dt);
    this.state = 'move';
  }

  moveWithCollision(mx, mz) {
    const R = this.radius;
    let nx = this.pos.x + mx;
    let nz = this.pos.z + mz;
    for (const b of this.world.boxes) {
      if (b.max.y < 0.5) continue; // low crates can be walked beside but not through; treat as solid anyway
      if (nx + R > b.min.x && nx - R < b.max.x && nz + R > b.min.z && nz - R < b.max.z && this.pos.y < b.max.y) {
        // push out on the shallowest axis
        const penX = mx > 0 ? nx + R - b.min.x : b.max.x - (nx - R);
        const penZ = mz > 0 ? nz + R - b.min.z : b.max.z - (nz - R);
        if (penX < penZ) nx = mx > 0 ? b.min.x - R : b.max.x + R;
        else nz = mz > 0 ? b.min.z - R : b.max.z + R;
      }
    }
    nx = clamp(nx, -29, 29);
    nz = clamp(nz, -39, 39);
    this.pos.x = nx;
    this.pos.z = nz;
  }
}

function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function turnToward(from, to, rate) {
  const diff = normAngle(to - from);
  const step = Math.min(Math.abs(diff), rate);
  return from + Math.sign(diff) * step;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Segment vs AABB in the xz plane at a given height band, for line of sight.
function losClear(world, x0, y0, z0, x1, y1, z1) {
  const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.5));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    const z = z0 + (z1 - z0) * t;
    for (const b of world.boxes) {
      if (b.max.y < 0.6) continue;
      if (x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z && y < b.max.y && y > b.min.y) return false;
    }
  }
  return true;
}