import * as THREE from 'three';
import { CONFIG } from './config.js';

const UP = new THREE.Vector3(0, 1, 0);

export class Player {
  constructor({ camera, position = new THREE.Vector3(), team = CONFIG.teams.player, config = CONFIG.movement } = {}) {
    this.camera = camera;
    this.position = position.clone ? position.clone() : new THREE.Vector3(position.x, position.y, position.z);
    this.velocity = new THREE.Vector3();
    this.eyeHeight = 1.65;
    this.targetEyeHeight = this.eyeHeight;
    this.standingHeight = 1.82;
    this.crouchedHeight = 1.16;
    this.radius = config.bodyRadius;
    this.config = config;
    this.team = team;
    this.health = 100;
    this.armor = 0;
    this.alive = true;
    this.onGround = true;
    this.yaw = 0;
    this.pitch = 0;
    this.lookSensitivity = 0.0022;
    this.forward = new THREE.Vector3(0, 0, -1);
    this.right = new THREE.Vector3(1, 0, 0);
  }

  update(deltaSeconds, input, colliders) {
    if (!this.alive) return;
    const dt = Math.min(deltaSeconds, 0.05);
    const keys = input?.keys || new Set();
    const pressedKeys = input?.pressedKeys || new Set();
    const mouseDelta = input?.mouseDelta || { x: 0, y: 0 };

    if (input?.pointerLocked) {
      this.yaw -= mouseDelta.x * this.lookSensitivity;
      this.pitch = THREE.MathUtils.clamp(this.pitch - mouseDelta.y * this.lookSensitivity, -Math.PI / 2 + 0.025, Math.PI / 2 - 0.025);
    }
    this.updateDirections();

    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    this.targetEyeHeight = crouching ? 1.08 : 1.65;
    this.eyeHeight = THREE.MathUtils.damp(this.eyeHeight, this.targetEyeHeight, 14, dt);
    const bodyHeight = this.eyeHeight + 0.17;

    const forwardInput = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
    const sideInput = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
    const moveInput = new THREE.Vector3(this.forward.x * forwardInput + this.right.x * sideInput, 0, this.forward.z * forwardInput + this.right.z * sideInput);
    if (moveInput.lengthSq() > 1) moveInput.normalize();

    const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = (sprinting ? this.config.runSpeed : this.config.walkSpeed) * (crouching ? this.config.crouchFactor : 1);
    if (moveInput.lengthSq() > 0) {
      const targetX = moveInput.x * speed;
      const targetZ = moveInput.z * speed;
      const blend = Math.min(1, this.config.acceleration * dt);
      this.velocity.x += (targetX - this.velocity.x) * blend;
      this.velocity.z += (targetZ - this.velocity.z) * blend;
    } else {
      const friction = Math.max(0, 1 - this.config.friction * dt);
      this.velocity.x *= friction;
      this.velocity.z *= friction;
    }

    if (pressedKeys.has('Space') && this.onGround) {
      this.velocity.y = this.config.jumpSpeed;
      this.onGround = false;
    }
    this.onGround = false;
    this.velocity.y -= 18 * dt;

    this.moveAndCollide(this.velocity.x * dt, 0, 0, bodyHeight, colliders);
    this.moveAndCollide(0, 0, this.velocity.z * dt, bodyHeight, colliders);
    this.moveAndCollide(0, this.velocity.y * dt, 0, bodyHeight, colliders);
    if (this.position.y <= 0) {
      this.position.y = 0;
      this.velocity.y = Math.max(0, this.velocity.y);
      this.onGround = true;
    }

    if (this.camera) {
      this.camera.position.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(this.pitch, this.yaw, 0);
    }
  }

  updateDirections() {
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    this.right.crossVectors(UP, this.forward).negate().normalize();
  }

  moveAndCollide(dx, dy, dz, bodyHeight, colliders) {
    this.position.x += dx;
    this.position.y += dy;
    this.position.z += dz;
    if (!colliders) return;

    const bodyMinY = this.position.y + 0.08;
    const bodyMaxY = this.position.y + bodyHeight;
    for (const collider of colliders) {
      const overlaps = this.position.x + this.radius > collider.min.x && this.position.x - this.radius < collider.max.x
        && bodyMaxY > collider.min.y && bodyMinY < collider.max.y
        && this.position.z + this.radius > collider.min.z && this.position.z - this.radius < collider.max.z;
      if (!overlaps) continue;

      if (dx !== 0) {
        this.position.x = dx > 0 ? collider.min.x - this.radius : collider.max.x + this.radius;
        this.velocity.x = 0;
      } else if (dz !== 0) {
        this.position.z = dz > 0 ? collider.min.z - this.radius : collider.max.z + this.radius;
        this.velocity.z = 0;
      } else if (dy !== 0) {
        if (dy < 0) {
          this.position.y = collider.max.y;
          this.onGround = true;
        } else {
          this.position.y = collider.min.y - bodyHeight;
        }
        this.velocity.y = 0;
      }
    }
  }

  getForward(target = new THREE.Vector3()) {
    return target.copy(this.forward);
  }

  getRight(target = new THREE.Vector3()) {
    return target.copy(this.right);
  }

  takeDamage(amount, isHead = false) {
    if (!this.alive || amount <= 0) return false;
    let damage = amount * (isHead ? 1.5 : 1);
    const absorbed = Math.min(this.armor, damage * 0.5);
    this.armor -= absorbed;
    damage -= absorbed;
    this.health = Math.max(0, this.health - damage);
    if (this.health === 0) this.alive = false;
    return !this.alive;
  }
}
