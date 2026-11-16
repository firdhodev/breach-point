import { PLAYER, MAP, GRAVITY } from './config.js';
import { audio } from './audio.js';

const SENSITIVITY = 0.0022;
const HALF = PLAYER.radius;

export class Player {
  constructor(config, world) {
    this.config = config;
    this.world = world;
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.crouching = false;
    this.onGround = false;
    this.height = PLAYER.height;
    this.health = 100;
    this.armor = 0;
    this.alive = true;
    this.team = 'ATK';
    this.money = 800;
    this.weapons = [];
    this.footstepTimer = 0;
    this.respawn(world.spawns.ATK[0]);
  }

  respawn(spawn) {
    this.pos.x = spawn.x; this.pos.y = 0; this.pos.z = spawn.z;
    this.vel.x = 0; this.vel.y = 0; this.vel.z = 0;
    this.yaw = spawn.yaw || 0;
    this.pitch = 0;
    this.health = 100;
    this.armor = 0;
    this.alive = true;
    this.crouching = false;
    this.height = PLAYER.height;
    this.footstepTimer = 0;
  }

  update(dt, input, active) {
    if (active) {
      this.yaw -= input.mouseDX * SENSITIVITY;
      this.pitch -= input.mouseDY * SENSITIVITY;
      if (this.pitch > 1.5) this.pitch = 1.5;
      if (this.pitch < -1.5) this.pitch = -1.5;
    }
    if (typeof input.crouch === 'boolean') this.crouching = input.crouch;

    const targetH = this.crouching ? PLAYER.crouchHeight : PLAYER.height;
    this.height += (targetH - this.height) * Math.min(1, dt * 12);

    if (!this.alive) {
      this.vel.x = 0; this.vel.z = 0;
      this.vel.y -= GRAVITY * dt;
      this.pos.y += this.vel.y * dt;
      if (this.pos.y < 0) { this.pos.y = 0; this.vel.y = 0; }
      return;
    }

    // wish direction relative to yaw
    let wx = 0, wz = 0;
    if (active) {
      const m = input.move;
      const len = Math.hypot(m.x, m.z);
      if (len > 0) {
        const nx = m.x / len, nz = m.z / len;
        const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
        // forward is -z rotated by yaw
        wx = nx * cy - nz * sy;
        wz = -nx * sy - nz * cy;
      }
    }

    const speed = this.crouching ? PLAYER.crouchSpeed : PLAYER.speed;
    const wishX = wx * speed, wishZ = wz * speed;
    const accel = this.onGround ? PLAYER.accel : PLAYER.accel * 0.25;
    const friction = this.onGround ? PLAYER.friction : 0;

    // friction
    if (friction > 0) {
      const sp = Math.hypot(this.vel.x, this.vel.z);
      if (sp > 0) {
        const drop = sp * friction * dt;
        const ns = Math.max(0, sp - drop) / sp;
        this.vel.x *= ns; this.vel.z *= ns;
      }
    }
    // accelerate
    this.vel.x += (wishX - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wishZ - this.vel.z) * Math.min(1, accel * dt);

    // jump
    if (active && input.jump && this.onGround) {
      this.vel.y = PLAYER.jumpSpeed;
      this.onGround = false;
    }

    this.vel.y -= GRAVITY * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    this.collide();

    // footsteps
    const hsp = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hsp > 1.5) {
      this.footstepTimer -= dt * hsp;
      if (this.footstepTimer <= 0) {
        this.footstepTimer = 3.0;
        audio.footstep();
      }
    } else {
      this.footstepTimer = Math.min(this.footstepTimer, 1.2);
    }
  }

  collide() {
    const p = this.pos;
    const halfX = MAP.halfX - 1, halfZ = MAP.halfZ - 1;
    if (p.x > halfX) { p.x = halfX; this.vel.x = 0; }
    if (p.x < -halfX) { p.x = -halfX; this.vel.x = 0; }
    if (p.z > halfZ) { p.z = halfZ; this.vel.z = 0; }
    if (p.z < -halfZ) { p.z = -halfZ; this.vel.z = 0; }

    if (p.y <= 0) { p.y = 0; if (this.vel.y < 0) this.vel.y = 0; this.onGround = true; }
    else this.onGround = false;

    const top = p.y + this.height;
    const boxes = this.world.boxes;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const bminX = b.min.x, bmaxX = b.max.x, bminZ = b.min.z, bmaxZ = b.max.z, bminY = b.min.y, bmaxY = b.max.y;
      if (top <= bminY || p.y >= bmaxY) continue;
      // closest point on box to player center
      const cx = Math.max(bminX, Math.min(p.x, bmaxX));
      const cz = Math.max(bminZ, Math.min(p.z, bmaxZ));
      const dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= HALF * HALF) continue;

      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = HALF - d;
        p.x += (dx / d) * push;
        p.z += (dz / d) * push;
        const vn = (this.vel.x * dx + this.vel.z * dz) / d;
        if (vn < 0) { this.vel.x -= vn * dx / d; this.vel.z -= vn * dz / d; }
      } else {
        // center inside box: push along smallest axis
        const pxMin = p.x - bminX + HALF, pxMax = bmaxX - p.x + HALF;
        const pzMin = p.z - bminZ + HALF, pzMax = bmaxZ - p.z + HALF;
        const m = Math.min(pxMin, pxMax, pzMin, pzMax);
        if (m === pxMin) { p.x = bminX - HALF; this.vel.x = 0; }
        else if (m === pxMax) { p.x = bmaxX + HALF; this.vel.x = 0; }
        else if (m === pzMin) { p.z = bminZ - HALF; this.vel.z = 0; }
        else { p.z = bmaxZ + HALF; this.vel.z = 0; }
      }
    }

    // ground on top of box
    if (!this.onGround && this.vel.y <= 0) {
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (p.x + HALF <= b.min.x || p.x - HALF >= b.max.x) continue;
        if (p.z + HALF <= b.min.z || p.z - HALF >= b.max.z) continue;
        if (p.y >= b.max.y - 0.05 && p.y <= b.max.y + 0.3) {
          p.y = b.max.y;
          this.vel.y = 0;
          this.onGround = true;
          break;
        }
      }
    }
  }

  // Hit volumes used by the hitscan code.
  radius() { return PLAYER.radius; }
  bodyHeight() { return this.crouching ? PLAYER.crouchHeight : PLAYER.height; }
  headRadius() { return 0.2; }

  eyePos(out) {
    out.x = this.pos.x;
    out.y = this.pos.y + this.height - 0.15;
    out.z = this.pos.z;
    return out;
  }

  viewDir(out) {
    const cp = Math.cos(this.pitch);
    out.x = -Math.sin(this.yaw) * cp;
    out.y = Math.sin(this.pitch);
    out.z = -Math.cos(this.yaw) * cp;
    return out;
  }

  takeDamage(amount, headshot) {
    if (!this.alive) return false;
    let dmg = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, dmg * 0.5);
      this.armor -= absorbed;
      dmg -= absorbed;
    }
    this.health -= dmg;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      return true;
    }
    return false;
  }
}
