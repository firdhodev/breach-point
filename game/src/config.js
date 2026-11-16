// BREACH POINT's simulation and economy tuning lives here.
export const CONFIG = Object.freeze({
  teams: Object.freeze({
    player: 'VANGUARD',
    opposing: 'OUTRIDERS',
  }),
  match: Object.freeze({
    roundTimeSeconds: 105,
    buyTimeSeconds: 12,
    roundsToWin: 7,
    botCountPerTeam: 4,
  }),
  economy: Object.freeze({
    startingCredits: 800,
    killReward: 300,
    roundWinReward: 3250,
    roundLossReward: 1900,
    lossStreakBonus: 450,
    maxCredits: 12000,
  }),
  movement: Object.freeze({
    walkSpeed: 4.2,
    runSpeed: 6.3,
    acceleration: 22,
    friction: 18,
    crouchFactor: 0.58,
    jumpSpeed: 5.2,
    bodyRadius: 0.34,
  }),
  weapons: Object.freeze({
    rifle: Object.freeze({
      name: 'Morrow 5.56', kind: 'rifle', damage: 34, headshotMultiplier: 2.7,
      fireRate: 0.105, magSize: 30, reserveAmmo: 90, spread: 0.012, recoil: 0.018, price: 2700,
    }),
    carbine: Object.freeze({
      name: 'Kestrel 9', kind: 'carbine', damage: 27, headshotMultiplier: 2.4,
      fireRate: 0.082, magSize: 24, reserveAmmo: 96, spread: 0.019, recoil: 0.014, price: 2150,
    }),
    pistol: Object.freeze({
      name: 'Latch .45', kind: 'pistol', damage: 42, headshotMultiplier: 2.5,
      fireRate: 0.26, magSize: 12, reserveAmmo: 48, spread: 0.014, recoil: 0.023, price: 450,
    }),
    grenade: Object.freeze({
      name: 'Cinder grenade', kind: 'grenade', damage: 90, headshotMultiplier: 1,
      fireRate: 1.1, magSize: 1, reserveAmmo: 1, spread: 0.035, recoil: 0.04, price: 350,
      fuseSeconds: 2.4, blastRadius: 5.5,
    }),
  }),
});

// Weapon table alias used by the weapon and bot modules.
export const WEAPONS = CONFIG.weapons;
