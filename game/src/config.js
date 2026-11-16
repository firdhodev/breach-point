// Round-based tactical FPS tuning constants
export const SIM_DT = 1 / 60;

export const TEAM = { ATK: 0, DEF: 1 };

export const TEAM_SIZE = 4;

export const ROUND_TIME = 100;
export const BUY_TIME = 8;
export const BOMB_TIME = 40;
export const DEFUSE_TIME = 5;
export const PLANT_TIME = 3;
export const ROUNDS_TO_WIN = 8;

export const ECON = {
  start: 800,
  kill: 300,
  win: 3250,
  lose: 1900,
  plant: 300,
  defuse: 300,
  max: 16000,
};

export const WEAPONS = {
  pistol: {
    name: 'Pistol', price: 500, dmg: 26, headMult: 4,
    fireDelay: 0.16, mag: 12, reserve: 48, reload: 1.4,
    spreadBase: 0.004, spreadMove: 0.05, spreadJump: 0.12,
    recoil: 0.012, auto: false, range: 60,
  },
  smg: {
    name: 'SMG', price: 1250, dmg: 20, headMult: 3.5,
    fireDelay: 0.075, mag: 30, reserve: 120, reload: 2.0,
    spreadBase: 0.012, spreadMove: 0.06, spreadJump: 0.12,
    recoil: 0.014, auto: true, range: 45,
  },
  rifle: {
    name: 'Rifle', price: 2700, dmg: 33, headMult: 4,
    fireDelay: 0.1, mag: 30, reserve: 90, reload: 2.4,
    spreadBase: 0.006, spreadMove: 0.08, spreadJump: 0.15,
    recoil: 0.02, auto: true, range: 90,
  },
  sniper: {
    name: 'Sniper', price: 4750, dmg: 105, headMult: 4,
    fireDelay: 1.4, mag: 5, reserve: 25, reload: 3.2,
    spreadBase: 0.001, spreadMove: 0.15, spreadJump: 0.25,
    recoil: 0.06, auto: false, range: 200,
  },
};

export const GRENADES = {
  frag: { name: 'Frag', price: 300, dmg: 120, radius: 7, fuse: 1.6 },
};

export const PLAYER = {
  height: 1.7,
  crouchHeight: 1.15,
  radius: 0.35,
  speed: 6.2,
  crouchSpeed: 2.8,
  accel: 60,
  friction: 9,
  gravity: 20,
  jumpVel: 7.2,
  jumpSpeed: 7.2,
};

export const GRAVITY = 20;

export const MAP = { halfX: 30, halfZ: 40 };

export const HIT = { body: 1, limb: 0.75 };

export const BOT = {
  visionDeg: 110,
  visionRange: 45,
  hearingRange: 30,
  reactionMin: 0.18,
  reactionMax: 0.4,
  aimError: 0.06,
  burst: 3,
};

export const SHOT_QUERIES = ['start', 'play', 'buy', 'end'];

// Aggregated handle passed to subsystem constructors.
export const CONFIG = {
  simDt: SIM_DT,
  team: TEAM,
  teamSize: TEAM_SIZE,
  roundTime: ROUND_TIME,
  buyTime: BUY_TIME,
  bombTime: BOMB_TIME,
  defuseTime: DEFUSE_TIME,
  plantTime: PLANT_TIME,
  roundsToWin: ROUNDS_TO_WIN,
  econ: ECON,
  weapons: WEAPONS,
  grenades: GRENADES,
  player: PLAYER,
  map: MAP,
  hit: HIT,
  bot: BOT,
};
