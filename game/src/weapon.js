import { WEAPONS } from './config.js';
import * as THREE from 'three';

const TRACER_POOL = 24;
const TRACER_LIFE = 0.06;
const HEAD_RADIUS = 0.18;
const BODY_HEIGHT = 1.7;
const BODY_WIDTH = 0.6;

function rayAABB(origin, dir, min, max) {
  let tmin = 0;
  let tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const o = origin.getComponent(i);
    const d = dir.getComponent(i);
    const mn = min.getComponent(i);
    const mx = max.getComponent(i);
    if (Math.abs(d) < 1e-8) {
      if (o < mn || o > mx) return null;
    } else {
      let t1 = (mn - o) / d;
      let t2 = (mx - o) / d;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

function raySphere(origin, dir, center, radius) {
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const oz = origin.z - center.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}

export class Weapon {
  constructor(name, camera, scene, combatantsGetter) {
    this.def = WEAPONS[name];
    this.def = Object.assign({}, this.def, {mag:this.def.magSize, reserve:this.def.reserveAmmo, spreadBase:this.def.spread, spreadMove:this.def.spread*2.5, spreadAir:this.def.spread*4, fireDelay:this.def.fireRate, reloadTime:2.2, headMult:this.def.headshotMultiplier, range:120});
    this.camera = camera;
    this.scene = scene;
    this.getCombatants = combatantsGetter;
    this.mag = this.def.mag;
    this.reserve = this.def.reserve;
    this.reloading = false;
    this.reloadTimer = 0;
    this.fireCooldown = 0;
    this.spread = this.def.spreadBase;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.owner = null;
    this.tracers = [];
    this.flashTime = 0;
    this.buildViewmodel();
  }

  buildViewmodel() {
    this.group = new THREE.Group();
    this.group.position.set(0.22, -0.2, -0.45);
    this.camera.add(this.group);

    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2b2b30 });
    const gripMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1e });
    const metalMat = new THREE.MeshLambertMaterial({ color: 0x55555c });

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.42), bodyMat);
    receiver.position.set(0, 0, -0.1);
    this.group.add(receiver);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.34, 10), metalMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.01, -0.44);
    this.group.add(barrel);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.08), gripMat);
    grip.position.set(0, -0.11, 0.03);
    grip.rotation.x = -0.25;
    this.group.add(grip);

    const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.08), gripMat);
    magazine.position.set(0, -0.13, -0.08);
    this.group.add(magazine);

    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.08), metalMat);
    sight.position.set(0, 0.08, -0.06);
    this.group.add(sight);

    this.muzzleLocal = new THREE.Vector3(0, 0.01, -0.61);
    this.muzzleLight = new THREE.PointLight(0xffcc66, 0, 6);
    this.muzzleLight.position.copy(this.muzzleLocal);
    this.group.add(this.muzzleLight);

    for (let i = 0; i < TRACER_POOL; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
      const mat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0 });
      const line = new THREE.Line(geo, mat);
      line.visible = false;
      line.frustumCulled = false;
      this.scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
  }

  switchTo(name) {
    this.def = WEAPONS[name];
    this.def = Object.assign({}, this.def, {mag:this.def.magSize, reserve:this.def.reserveAmmo, spreadBase:this.def.spread, spreadMove:this.def.spread*2.5, spreadAir:this.def.spread*4, fireDelay:this.def.fireRate, reloadTime:2.2, headMult:this.def.headshotMultiplier, range:120});
    this.mag = this.def.mag;
    this.reserve = this.def.reserve;
    this.reloading = false;
    this.reloadTimer = 0;
    this.fireCooldown = 0;
    this.spread = this.def.spreadBase;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
  }

  startReload() {
    if (this.reloading) return;
    if (this.mag >= this.def.mag) return;
    if (this.reserve <= 0) return;
    this.reloading = true;
    this.reloadTimer = this.def.reloadTime;
  }

  update(dt, input) {
    const { firing, reloadPressed, movingSpeed, onGround, crouching } = input;
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.flashTime > 0) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) this.muzzleLight.intensity = 0;
    }

    if (reloadPressed) this.startReload();
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const need = this.def.mag - this.mag;
        const take = Math.min(need, this.reserve);
        this.mag += take;
        this.reserve -= take;
        this.reloading = false;
      }
    }

    let target = this.def.spreadBase;
    if (movingSpeed > 0.5) target += this.def.spreadMove * Math.min(1, movingSpeed / 6);
    if (!onGround) target += this.def.spreadAir;
    if (crouching) target *= 0.6;
    this.spread += (target - this.spread) * (1 - Math.exp(-dt * 10));

    this.updateTracers(dt);

    const recovery = Math.exp(-dt * 8);
    this.recoilPitch *= recovery;
    this.recoilYaw *= recovery;
  }

  fire() {
    if (this.reloading || this.fireCooldown > 0) return;
    if (this.mag <= 0) { this.startReload(); return; }
    this.mag--;
    this.fireCooldown = this.def.fireDelay;
    this.recoilPitch += this.def.recoil;
    this.recoilYaw += (Math.random() - 0.5) * this.def.recoil * 0.4;

    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    if (this.spread > 0) {
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * this.spread;
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(dir, up).normalize();
      const upv = new THREE.Vector3().crossVectors(right, dir).normalize();
      dir.addScaledVector(right, Math.cos(ang) * rad).addScaledVector(upv, Math.sin(ang) * rad).normalize();
    }

    let bestT = this.def.range;
    let hitTarget = null;
    let hitHead = false;

    const world = this.scene.world;
    const colliders = world && Array.isArray(world.colliders) ? world.colliders : [];
    for (const c of colliders) {
      if (!c || !c.min || !c.max) continue;
      const t = rayAABB(origin, dir, c.min, c.max);
      if (t !== null && t < bestT) { bestT = t; hitTarget = null; hitHead = false; }
    }

    const combatants = this.getCombatants ? this.getCombatants() : [];
    for (const e of combatants) {
      if (!e || !e.alive || e === this.owner) continue;
      if (this.owner && e.team === this.owner.team) continue;
      const headCenter = new THREE.Vector3(e.pos.x, e.pos.y + e.eyeHeight, e.pos.z);
      const th = raySphere(origin, dir, headCenter, HEAD_RADIUS);
      if (th !== null && th < bestT) { bestT = th; hitTarget = e; hitHead = true; }
      const half = BODY_WIDTH / 2;
      const bodyMin = new THREE.Vector3(e.pos.x - half, e.pos.y, e.pos.z - half);
      const bodyMax = new THREE.Vector3(e.pos.x + half, e.pos.y + BODY_HEIGHT, e.pos.z + half);
      const tb = rayAABB(origin, dir, bodyMin, bodyMax);
      if (tb !== null && tb < bestT) { bestT = tb; hitTarget = e; hitHead = false; }
    }

    const hitPoint = origin.clone().addScaledVector(dir, bestT);
    if (hitTarget) hitTarget.takeDamage(this.def.damage * (hitHead ? this.def.headMult : 1), hitHead);

    const mWorld = this.group.localToWorld(this.muzzleLocal.clone());
    this.spawnTracer(mWorld, hitPoint);
    this.muzzleLight.intensity = 2;
    this.flashTime = TRACER_LIFE;
  }

  spawnTracer(from, to) {
    const slot = this.tracers.find((t) => t.life <= 0) || this.tracers[0];
    const pos = slot.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    slot.line.material.opacity = 0.9;
    slot.line.visible = true;
    slot.life = TRACER_LIFE;
  }

  updateTracers(dt) {
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / TRACER_LIFE) * 0.9;
        if (t.life <= 0) t.line.visible = false;
      }
    }
  }
}

export default Weapon;

