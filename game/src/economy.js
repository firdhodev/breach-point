// Between-round money and buy-menu logic. One Economy instance per entity
// (the player and each bot own their own money and loadout).
import { ECON, WEAPONS, GRENADES } from './config.js';

// Buy menu entries, in display order.
export const BUY_ITEMS = [
  { id: 'pistol', slot: 'secondary' },
  { id: 'smg', slot: 'primary' },
  { id: 'rifle', slot: 'primary' },
  { id: 'sniper', slot: 'primary' },
  { id: 'frag', slot: 'grenade' },
];

const DEFAULT_LOADOUT = () => ({ primary: null, secondary: 'pistol', grenades: 0 });

function priceOf(id) {
  if (id === 'frag') return GRENADES.frag.price;
  return WEAPONS[id] ? WEAPONS[id].price : null;
}

function clampMoney(v) {
  return Math.max(0, Math.min(ECON.max, Math.round(v)));
}

export class Economy {
  constructor(config = {}) {
    this.config = config;
    this.ECON = config.ECON || ECON;
    this.WEAPONS = config.WEAPONS || WEAPONS;
    this.GRENADES = config.GRENADES || GRENADES;
    this.money = this.ECON.start;
    this.loadout = DEFAULT_LOADOUT();
    // Buy menu is only usable while the match reports a buy phase.
    this.buyPhase = false;
  }

  resetForNewMatch() {
    this.money = this.ECON.start;
    this.loadout = DEFAULT_LOADOUT();
    this.buyPhase = false;
    return this.money;
  }

  setBuyPhase(active) {
    this.buyPhase = !!active;
  }

  // Called at the start of every round: top up grenades to the carry limit and
  // refill the magazine. Money and owned guns carry over untouched.
  newRound(survived = true) {
    if (!survived) this.loadout = DEFAULT_LOADOUT();
    this.loadout.grenades = 0;
    return this.money;
  }

  // Bot helper: spend money sensibly for the current round.
  autoBuy() {
    const order = ['rifle', 'smg', 'sniper'];
    for (const id of order) {
      if (!this.canBuy(id).ok) continue;
      // keep some cash reserve; only buy primary if we can still afford a frag
      const price = priceOf(id);
      if (this.money - price >= 0 && !this.loadout.primary) {
        this.buy(id);
        break;
      }
    }
    if (!this.loadout.grenades && this.canBuy('frag').ok) this.buy('frag');
    return { ...this.loadout };
  }

  // Best owned weapon id (primary if present, else pistol).
  bestWeapon() {
    return this.loadout.primary || this.loadout.secondary || 'pistol';
  }

  addKill() {
    this.money = clampMoney(this.money + this.ECON.kill);
    return this.money;
  }

  addRoundResult(won, plantedOrDefused) {
    let delta = won ? this.ECON.win : this.ECON.lose;
    if (plantedOrDefused) {
      delta += won ? this.ECON.plant : this.ECON.defuse;
    }
    this.money = clampMoney(this.money + delta);
    return this.money;
  }

  canBuy(id) {
    if (!this.buyPhase) return { ok: false, reason: 'Buy phase is over' };
    const known = id === 'frag' || !!this.WEAPONS[id];
    if (!known) return { ok: false, reason: 'Unknown item' };
    const price = priceOf(id);
    if (price === null) return { ok: false, reason: 'Unknown item' };
    if (price > this.money) {
      return { ok: false, reason: 'Not enough money', price, money: this.money };
    }
    // Frag is capped at one per round.
    if (id === 'frag' && this.loadout.grenades >= 1) {
      return { ok: false, reason: 'Already carrying a frag', price, money: this.money };
    }
    return { ok: true, reason: null, price, money: this.money };
  }

  buy(id) {
    const check = this.canBuy(id);
    if (!check.ok) {
      return { ok: false, reason: check.reason, money: this.money, loadout: { ...this.loadout } };
    }
    const price = check.price;
    this.money = clampMoney(this.money - price);
    if (id === 'frag') {
      this.loadout.grenades = Math.min(1, this.loadout.grenades + 1);
    } else if (this.WEAPONS[id].slot === 'secondary' || id === 'pistol') {
      this.loadout.secondary = id;
    } else {
      this.loadout.primary = id;
    }
    return { ok: true, reason: null, money: this.money, loadout: { ...this.loadout } };
  }

  carryOver(survived) {
    if (survived) {
      // Survivors keep what they bought (magazines get refilled elsewhere).
      return { ...this.loadout };
    }
    // Losing the round means losing bought gear back to pistol-only default.
    this.loadout = DEFAULT_LOADOUT();
    return this.loadout;
  }
}

export default Economy;
