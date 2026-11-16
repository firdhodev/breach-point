// Breach Point: ties together world, player, weapons, bots, match and economy into one
// rendered game loop. three.js draws the scene; all logic lives in the src/ modules.

import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { Bot, BOT_NAMES, assignRoutes } from './bots.js';
import { Weapon, Grenade, makeRng, fireHitscan } from './weapon.js';
import { Match } from './match.js';
import { Economy, BUY_ITEMS } from './economy.js';
import { createHud } from './hud.js';
import { Input } from './input.js';
import { audio } from './audio.js';
import { WEAPONS, GRENADES, CONFIG, SIM_DT, PLANT_TIME, DEFUSE_TIME, BOMB_TIME } from './config.js';

// ---------------------------------------------------------------- three.js setup
const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#14161a');
scene.fog = new THREE.Fog('#14161a', 40, 90);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);
window.__dbg = { camera, scene, renderer };

const sun = new THREE.DirectionalLight('#fff4e0', 1.6);
sun.position.set(24, 40, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 120;
sun.shadow.camera.left = -50;
sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50;
sun.shadow.camera.bottom = -50;
scene.add(sun);
scene.add(new THREE.HemisphereLight('#c9d4e0', '#2a2620', 0.9));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- world
const world = buildWorld(THREE);
scene.add(world.group);

// bomb site marker so the objective reads from spawn
const siteMesh = new THREE.Mesh(
  new THREE.CircleGeometry(world.site.radius, 48),
  new THREE.MeshBasicMaterial({ color: '#e0603a', transparent: true, opacity: 0.16 })
);
siteMesh.rotation.x = -Math.PI / 2;
siteMesh.position.set(world.site.x, 0.02, world.site.z);
scene.add(siteMesh);
const siteRing = new THREE.Mesh(
  new THREE.RingGeometry(world.site.radius - 0.08, world.site.radius, 64),
  new THREE.MeshBasicMaterial({ color: '#f0a830' })
);
siteRing.rotation.x = -Math.PI / 2;
siteRing.position.set(world.site.x, 0.03, world.site.z);
scene.add(siteRing);

// ---------------------------------------------------------------- entities
const hud = createHud();
const canvas = renderer.domElement;
const input = new Input(canvas);
// Player reads input.mouseDX/mouseDY, input.move.{x,z} and input.jump; Input exposes
// move.{forward,back,left,right,jump} and mouse.{dx,dy}. Adapt once here.
const playerInput = {
  get mouseDX() { return input.mouse.dx; },
  get mouseDY() { return input.mouse.dy; },
  move: { x: 0, z: 0 },
  get jump() { return input.move.jump; },
  get crouch() { return input.move.crouch; },
};
function syncPlayerInput() {
  const m = input.move;
  const x = (m.right ? 1 : 0) - (m.left ? 1 : 0);
  const z = (m.forward ? 1 : 0) - (m.back ? 1 : 0);
  playerInput.move.x = x;
  playerInput.move.z = z;
}
const match = new Match();
const player = new Player(CONFIG, world);
const playerEconomy = new Economy();
player.team = 'ATK';

const rng = makeRng(1337);
const bots = [];
for (const t of ['ATK', 'DEF']) {
  for (let i = 0; i < 3; i++) {
    bots.push(new Bot(t, i, world, rng, BOT_NAMES[t === 'ATK' ? i : i + 3]));
  }
}

// character meshes
const bodyGeo = new THREE.CapsuleGeometry(0.35, 1.0, 6, 12);
const headGeo = new THREE.SphereGeometry(0.2, 12, 10);
const atkMat = new THREE.MeshLambertMaterial({ color: '#e0603a' });
const defMat = new THREE.MeshLambertMaterial({ color: '#4aa3df' });
for (const b of bots) {
  const mat = b.team === 'ATK' ? atkMat : defMat;
  const body = new THREE.Mesh(bodyGeo, mat);
  body.castShadow = true;
  const head = new THREE.Mesh(headGeo, mat);
  head.castShadow = true;
  scene.add(body);
  scene.add(head);
  b.mesh = body;
  b.headMesh = head;
}

// player loadout: [secondary pistol, primary gun]
player.weapons = [new Weapon('pistol', WEAPONS.pistol), new Weapon('rifle', WEAPONS.rifle)];
let activeSlot = 0;
function activeWeapon() { return player.weapons[activeSlot]; }
function buildLoadout() {
  const primary = playerEconomy.loadout.primary || 'rifle';
  const def = WEAPONS[primary] || WEAPONS.rifle;
  player.weapons = [new Weapon('pistol', WEAPONS.pistol), new Weapon(primary, def)];
  activeSlot = playerEconomy.loadout.primary ? 1 : 0;
  hud.setWeapon(activeWeapon().def.name);
}

// grenades in flight
const grenades = [];
const grenadeGeo = new THREE.SphereGeometry(0.12, 8, 6);
const grenadeMat = new THREE.MeshLambertMaterial({ color: '#3a3d40' });

// bullet tracers and impact puffs
const tracers = [];
const tracerMat = new THREE.MeshBasicMaterial({ color: '#f0a830' });
const impacts = [];
const impactGeo = new THREE.SphereGeometry(0.06, 6, 5);
const impactMat = new THREE.MeshBasicMaterial({ color: '#e9e6df' });
const fromPoint = new THREE.Vector3();
const toPoint = new THREE.Vector3();
function addTracer(from, to) {
  if (from.distanceTo(to) < 0.4) return;
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const line = new THREE.Line(geo, tracerMat);
  scene.add(line);
  tracers.push({ line, life: 0.06 });
}
function addImpact(p) {
  const m = new THREE.Mesh(impactGeo, impactMat);
  m.position.set(p.x, p.y, p.z);
  scene.add(m);
  impacts.push({ mesh: m, life: 0.12 });
}

// ---------------------------------------------------------------- helpers
let running = false;
let started = false;
let phaseShown = '';
let last = performance.now();
let acc = 0;
let buyOpen = false;
const eye = { x: 0, y: 0, z: 0 };
const view = { x: 0, y: 0, z: 0 };

function active() {
  return running && match.phase !== 'matchEnd';
}
function livingEntities(team) {
  const list = [];
  if (player.team === team && player.alive) list.push(player);
  for (const b of bots) if (b.alive && b.team === team) list.push(b);
  return list;
}
function aliveCount(team) {
  return livingEntities(team).length;
}
function enemiesOf(entity) {
  const list = [];
  if (player.team !== entity.team && player.alive) list.push(player);
  for (const b of bots) if (b.team !== entity.team && b.alive) list.push(b);
  return list;
}
function nameOf(entity) {
  return entity === player ? 'You' : entity.name;
}

// ---------------------------------------------------------------- player combat
function playerShoot() {
  const w = activeWeapon();
  if (!w.triggerFire()) return;
  player.eyePos(eye);
  player.viewDir(view);
  const moveFactor = Math.min(1, Math.hypot(player.vel.x, player.vel.z) / 6);
  const spread = w.spread(moveFactor, !player.onGround, player.crouching);
  const res = fireHitscan(eye, view, spread, 80, world, enemiesOf(player), rng, player, w.def.dmg);
  const kick = w.recoilKick(rng);
  player.pitch += kick.pitch;
  player.yaw += kick.yaw;
  fromPoint.set(eye.x, eye.y, eye.z);
  toPoint.set(res.point.x, res.point.y, res.point.z);
  addTracer(fromPoint, toPoint);
  addImpact(res.point);
  if (res.hit && res.target) {
    audio.hit(res.part === 'head');
    const killed = res.target.takeDamage(res.damage, res.part, player);
    if (killed) {
      playerEconomy.addKill();
      player.money = playerEconomy.money;
      hud.killFeed('You', res.target.name, w.def.name, res.part === 'head');
    }
    hud.hitmarker(res.part === 'head', killed);
  }
}

function switchWeapon(slot) {
  if (slot < 0 || slot >= player.weapons.length || slot === activeSlot) return;
  activeSlot = slot;
  activeWeapon().reloading = false;
  hud.setWeapon(activeWeapon().def.name);
}

function throwGrenade() {
  if (playerEconomy.loadout.grenades <= 0) return;
  playerEconomy.loadout.grenades -= 1;
  player.eyePos(eye);
  player.viewDir(view);
  const g = new Grenade(GRENADES.frag, player, eye, view);
  g.mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  scene.add(g.mesh);
  grenades.push(g);
}

// ---------------------------------------------------------------- bot shots -> hitscan
function onBotShoot(bot, aim, def) {
  eye.x = bot.pos.x;
  eye.y = bot.eyeY();
  eye.z = bot.pos.z;
  view.x = aim.x; view.y = aim.y; view.z = aim.z;
  const res = fireHitscan(eye, view, 0.015, 80, world, enemiesOf(bot), rng, bot, def.dmg);
  fromPoint.set(eye.x, eye.y, eye.z);
  toPoint.set(res.point.x, res.point.y, res.point.z);
  addTracer(fromPoint, toPoint);
  addImpact(res.point);
  if (res.hit && res.target) {
    const killed = res.target.takeDamage(res.damage, res.part, bot);
    if (killed) {
      bot.kills += 1;
      hud.killFeed(bot.name, nameOf(res.target), def.name, res.part === 'head');
    }
  }
}

// ---------------------------------------------------------------- round / match flow
function startRound() {
  match.startRound();
  player.respawn(world.spawns.ATK[0]);
  buildLoadout();
  let ai = 0;
  let di = 0;
  for (const b of bots) {
    const idx = b.team === 'ATK' ? ai++ : di++;
    const spawnList = world.spawns[b.team];
    const spawn = spawnList[Math.min(idx, spawnList.length - 1)];
    if (!b.economy) b.economy = new Economy();
    b.economy.newRound(b.alive);
    if (b.alive) b.economy.autoBuy();
    b.respawn(spawn, b.economy.bestWeapon());
  }
  const attackers = livingEntities('ATK');
  if (attackers.length > 0) {
    const carrier = attackers[Math.floor(rng() * attackers.length)];
    match.bomb.carrier = carrier;
    carrier.hasBomb = true;
  }
  assignRoutes(world, bots);
  phaseShown = '';
  hud.centerMessage(`Round ${match.round}`, 'Buy phase - press B to buy');
}

function resolveRound(winner, reason) {
  const won = winner === player.team;
  playerEconomy.addRoundResult(won, won && match.bomb.planted);
  player.money = playerEconomy.money;
  for (const b of bots) {
    if (!b.economy) b.economy = new Economy();
    b.economy.addRoundResult(b.team === winner, b.team === 'ATK' && match.bomb.planted);
  }
  audio.roundEnd(won);
  const label = winner === 'ATK' ? 'Attackers win' : 'Defenders win';
  const sub = { bomb: 'Bomb detonated', defuse: 'Bomb defused', time: 'Time ran out', elimination: 'Team eliminated' }[reason] || '';
  hud.centerMessage(label, sub, 3500);
}

function startMatch() {
  match.playerTeam = 'ATK';
  match.round = 1;
  match.score.ATK = 0;
  match.score.DEF = 0;
  match.phase = 'warmup';
  playerEconomy.resetForNewMatch();
  player.money = playerEconomy.money;
  for (const b of bots) b.economy = new Economy();
  startRound();
}

// ---------------------------------------------------------------- input actions
function handleActions(pressed) {
  if (!active()) return;
  if (pressed.has('KeyR')) activeWeapon().startReload();
  if (pressed.has('Digit1')) switchWeapon(0);
  if (pressed.has('Digit2')) switchWeapon(1);
  if (pressed.has('KeyG')) throwGrenade();
  if (pressed.has('KeyB') && match.phase === 'buy' && player.alive) {
    buyOpen = !buyOpen;
    hud.showBuy(buyOpen);
  }
  if (pressed.has('Escape') && buyOpen) {
    buyOpen = false;
    hud.showBuy(false);
  }
}

function tryObjective(dt) {
  if (!active() || match.phase !== 'live' || !player.alive) {
    hud.setProgress({ visible: false });
    return;
  }
  const bomb = match.bomb;
  if (player.team === 'ATK' && !bomb.planted && match.inSite(player.pos)) {
    if (input.use) match.tryPlant('ATK', player, true, dt);
    hud.setProgress({
      visible: bomb.plantProgress > 0,
      text: 'Planting...',
      fraction: bomb.plantProgress,
    });
  } else if (player.team === 'DEF' && bomb.planted && !bomb.defused) {
    const d = Math.hypot(player.pos.x - bomb.pos.x, player.pos.z - bomb.pos.z);
    if (d < 1.6 && input.use) match.tryDefuse(player, dt);
    hud.setProgress({
      visible: bomb.defuseProgress > 0,
      text: 'Defusing...',
      fraction: bomb.defuseProgress,
    });
  } else {
    hud.setProgress({ visible: false });
  }
}

// ---------------------------------------------------------------- simulation step
function step(dt) {
  const pressed = input.consumePressed();
  handleActions(pressed);

  const frozen = !active() || match.phase === 'buy';
  syncPlayerInput();
  player.update(dt, playerInput, active());
  if (frozen) {
    player.vel.x = 0;
    player.vel.z = 0;
  }
  activeWeapon().update(dt);
  if (!frozen && input.mouseDown && player.alive) {
    const w = activeWeapon();
    if (w.canFire) playerShoot();
  }

  const ctx = {
    player,
    bots,
    roundState: match.phase,
    site: world.site,
    bomb: match.bomb,
    onShoot: onBotShoot,
    onPlant: (who) => {
      match.bomb.carrier = null;
      who.hasBomb = false;
      match.tryPlant('ATK', who, true, PLANT_TIME);
      hud.centerMessage('Bomb planted', '', 1500);
    },
    onDefuse: (who) => {
      match.tryDefuse(who, DEFUSE_TIME);
    },
  };
  if (!frozen) {
    for (const b of bots) b.update(dt, ctx);
  }

  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    const targets = [...bots, player];
    const r = g.update(dt, world, targets);
    if (g.mesh) g.mesh.position.set(g.pos.x, g.pos.y, g.pos.z);
    if (r.exploded) {
      if (g.mesh) scene.remove(g.mesh);
      grenades.splice(i, 1);
      for (const h of r.hits) {
        const killed = h.target.takeDamage(h.damage, 'body', g.owner);
        if (killed) {
          if (g.owner === player) {
            playerEconomy.addKill();
            player.money = playerEconomy.money;
          } else {
            g.owner.kills += 1;
          }
          hud.killFeed(nameOf(g.owner), nameOf(h.target), 'Frag', false);
        }
      }
    }
  }

  if (active()) {
    match.update(dt, {
      atkAliveCount: aliveCount('ATK'),
      defAliveCount: aliveCount('DEF'),
      playerTeam: player.team,
    });
    if (match.roundWinner && match.phase === 'roundEnd' && phaseShown !== `end-${match.round}`) {
      phaseShown = `end-${match.round}`;
      resolveRound(match.roundWinner, match.winReason);
    }
    tryObjective(dt);
  }

  for (let i = tracers.length - 1; i >= 0; i--) {
    tracers[i].life -= dt;
    if (tracers[i].life <= 0) { scene.remove(tracers[i].line); tracers.splice(i, 1); }
  }
  for (let i = impacts.length - 1; i >= 0; i--) {
    impacts[i].life -= dt;
    if (impacts[i].life <= 0) { scene.remove(impacts[i].mesh); impacts.splice(i, 1); }
  }
}

// ---------------------------------------------------------------- rendering
function syncMeshes() {
  for (const b of bots) {
    const visible = b.alive;
    b.mesh.visible = visible;
    b.headMesh.visible = visible;
    if (!visible) continue;
    const h = b.bodyHeight();
    b.mesh.scale.set(1, h / 1.7, 1);
    b.mesh.position.set(b.pos.x, b.pos.y + h / 2, b.pos.z);
    b.mesh.rotation.y = b.yaw;
    b.headMesh.position.set(b.pos.x, b.pos.y + h - 0.18, b.pos.z);
  }
  if (match.bomb.planted) siteMesh.material.color.set('#f0a830');
}

function updateHud() {
  const w = activeWeapon();
  hud.setHealth(player.health, player.armor);
  hud.setAmmo(w.mag, w.reserve);
  hud.setWeapon(w.def.name);
  hud.setMoney(playerEconomy.money);
  const moveFactor = Math.min(1, Math.hypot(player.vel.x, player.vel.z) / 6);
  hud.setCrosshair(w.spread(moveFactor, !player.onGround, player.crouching));
  hud.setRound({
    atkScore: match.score.ATK,
    defScore: match.score.DEF,
    timer: match.phaseTimer,
    round: match.round,
    teamLabel: player.team === 'ATK' ? 'Attacking' : 'Defending',
  });

  const bomb = match.bomb;
  if (bomb.planted && !bomb.defused) {
    hud.setBomb({
      visible: true,
      text: `BOMB ${bomb.timer.toFixed(1)}s`,
      fraction: 1 - bomb.timer / BOMB_TIME,
    });
  } else {
    hud.setBomb({ visible: false });
  }

  if (buyOpen && match.phase === 'buy') {
    hud.refreshBuy(playerEconomy, BUY_ITEMS, (id) => {
      const res = playerEconomy.buy(id);
      if (!res.ok) hud.centerMessage('Cannot buy', res.reason, 1200);
      else hud.setMoney(playerEconomy.money);
    });
  }

  if (match.phase === 'matchEnd') {
    running = false;
    const won = match.matchWinner === player.team;
    hud.showOverlay({
      title: won ? 'Victory' : 'Defeat',
      copy: `Final score ${match.score.ATK} - ${match.score.DEF}.`,
      action: 'Play again',
    });
  }
}

function render() {
  player.eyePos(eye);
  camera.position.set(eye.x, eye.y, eye.z);
  player.viewDir(view);
  camera.lookAt(eye.x + view.x, eye.y + view.y, eye.z + view.z);
  renderer.render(scene, camera);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (running) {
    acc += dt;
    let steps = 0;
    while (acc >= SIM_DT && steps < 5) {
      step(SIM_DT);
      acc -= SIM_DT;
      steps += 1;
    }
    input.endFrame();
  }
  syncMeshes();
  updateHud();
  render();
}

// ---------------------------------------------------------------- boot
const COPY = {
  start: {
    title: 'Breach Point',
    copy: 'Round-based tactical FPS against bots. Attackers plant the bomb on the marked site; defenders stop them.',
    action: 'Click to play',
  },
  paused: {
    title: 'Breach Point',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
};

function showOverlay(mode) {
  hud.showOverlay(COPY[mode]);
}

hud.onPlay(() => {
  audio.unlock();
  if (match.phase === 'matchEnd') {
    startMatch();
  } else if (!started) {
    started = true;
    startMatch();
  } else {
    running = true;
    hud.hideOverlay();
    input.requestLock();
    return;
  }
  running = true;
  hud.hideOverlay();
  input.requestLock();
});

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (!locked && started && match.phase !== 'matchEnd') {
    running = false;
    buyOpen = false;
    hud.showBuy(false);
    showOverlay('paused');
  }
});

showOverlay('start');
requestAnimationFrame(frame);