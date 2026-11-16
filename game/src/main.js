import * as THREE from 'three';
import { createInput } from './input.js';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { Bot } from './bots.js';
import { Weapon } from './weapon.js';
const FIXED_STEP_SECONDS = 1/60, MAX_FRAME_DELTA_SECONDS = 0.1, MAX_SIMULATION_STEPS = 5;
const mount = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2)); renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
mount.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, innerWidth/innerHeight, 0.1, 160); scene.add(camera);
const world = buildWorld(scene);
scene.world = world; // weapon.js raycasts and bots.js navigation read scene.world
const localPlayer = new Player({camera, position: world.spawns.A[1]});
localPlayer.pos = localPlayer.position; // pos alias expected by weapon.js/bots.js
const combatants = [localPlayer];
// short patrol waypoints near each bot's spawn and the nearest objective zone
const zoneA = world.objectiveZones.A, zoneB = world.objectiveZones.B;
function patrolNear(spawn, zone){ const c=new THREE.Vector3().addVectors(zone.min,zone.max).multiplyScalar(0.5); return [spawn.clone(), c.clone().add(new THREE.Vector3(2,0,2)), c.clone().add(new THREE.Vector3(-2,0,2))]; }
// 3 bot teammates on team A (spawn index 1 belongs to the local player)
const mateSpawns = [0,2,3];
for(let i=0;i<3;i++){ const sp=world.spawns.A[mateSpawns[i]]; const bot=new Bot({position:sp,team:'A',waypoints:patrolNear(sp,zoneA),camera,scene,combatantsGetter:()=>combatants}); bot.pos=bot.position; combatants.push(bot); }
// 4 bot enemies on team B
for(let i=0;i<4;i++){ const sp=world.spawns.B[i]; const bot=new Bot({position:sp,team:'B',waypoints:patrolNear(sp,zoneB),camera,scene,combatantsGetter:()=>combatants}); bot.pos=bot.position; combatants.push(bot); }
// local player weapon; weapon.fire() reads scene.world.colliders via combatants/scene
const localWeapon = new Weapon('rifle', camera, scene, ()=>combatants);
localWeapon.owner = localPlayer;
camera.position.set(localPlayer.position.x, localPlayer.position.y+localPlayer.eyeHeight, localPlayer.position.z);
camera.rotation.order='YXZ';
let selectedWeaponSlot=0;
const input = createInput(renderer.domElement,(d)=>{selectedWeaponSlot=(selectedWeaponSlot+d+4)%4;});
const clock=new THREE.Clock(); let accumulator=0, started=false;
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}
addEventListener('resize',resize);
function start(){ if(started)return; started=true; document.getElementById('start-overlay').hidden=true; input.requestPointerLock(); }
document.getElementById('start-button').addEventListener('click',start);
function simulateStep(ds){
  const fi=input.consumeFrame(); // consumed exactly once per fixed sim step
  localPlayer.update(ds,fi,world.colliders);
  // movement state for weapon sway/recoil
  const vel = localPlayer.velocity||localPlayer.pos.velocity||{x:0,z:0};
  const movingSpeed = Math.hypot(vel.x||0, vel.z||0);
  const onGround = localPlayer.onGround===undefined ? true : localPlayer.onGround;
  const crouching = !!fi.move.crouch;
  localWeapon.update(ds,{firing:fi.firing, reloadPressed:fi.reloadPressed, movingSpeed, onGround, crouching});
  // update every bot
  for(const c of combatants){ if(c!==localPlayer) c.update(ds, world, combatants); }
  // camera at local player eye plus weapon recoil offsets
  camera.position.set(localPlayer.position.x, localPlayer.position.y+localPlayer.eyeHeight, localPlayer.position.z);
  camera.rotation.set(localPlayer.pitch, localPlayer.yaw, 0);
  const rec = localWeapon.recoil;
  if(rec){ camera.position.y += rec.y||0; camera.rotation.x += rec.pitch||0; camera.rotation.y += rec.yaw||0; }
}
function frame(){ requestAnimationFrame(frame); const ds=Math.min(clock.getDelta(),MAX_FRAME_DELTA_SECONDS); accumulator+=ds; let steps=0; while(accumulator>=FIXED_STEP_SECONDS&&steps<MAX_SIMULATION_STEPS){simulateStep(FIXED_STEP_SECONDS);accumulator-=FIXED_STEP_SECONDS;steps++;} if(steps===MAX_SIMULATION_STEPS&&accumulator>FIXED_STEP_SECONDS*MAX_SIMULATION_STEPS)accumulator=0; renderer.render(scene,camera);} frame();
// Screenshot capture hook: ?autostart deploys at once (headless renders need no pointer lock).
if (new URLSearchParams(location.search).has('autostart')) start();
