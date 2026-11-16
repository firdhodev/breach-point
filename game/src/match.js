// Pure round/match state machine + bomb objective. No rendering, no DOM.
import {
  ROUND_TIME, BUY_TIME, BOMB_TIME, DEFUSE_TIME, PLANT_TIME,
  ROUNDS_TO_WIN, ECON,
} from './config.js';

const SITE_RADIUS = 8;      // radius around site center where bomb can be planted
const SITE_CENTER = { x: 0, y: 0, z: -23 };
const ROUND_END_TIME = 4;

export class Match {
  constructor(config = {}) {
    this.config = config;
    this.phase = 'warmup';
    this.phaseTimer = 0;
    this.round = 1;
    this.score = { ATK: 0, DEF: 0 };
    this.playerTeam = 'ATK';
    this.bomb = this._freshBomb();
    this.roundWinner = null;
    this.winReason = '';
    this.matchWinner = null;
  }

  _freshBomb() {
    return {
      carrier: null,
      planted: false,
      pos: { x: 0, y: 0, z: 0 },
      timer: 0,
      defuseProgress: 0,
      defuser: null,
      plantProgress: 0,
      planter: null,
      exploded: false,
      defused: false,
    };
  }

  startRound() {
    this.phase = 'buy';
    this.phaseTimer = BUY_TIME;
    this.bomb = this._freshBomb();
    this.roundWinner = null;
    this.winReason = '';
  }

  goLive() {
    this.phase = 'live';
    this.phaseTimer = ROUND_TIME;
  }

  update(dt, ctx = {}) {
    const c = ctx || {};
    switch (this.phase) {
      case 'warmup':
        break;

      case 'buy':
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) this.goLive();
        break;

      case 'live':
        this._updateLive(dt, c);
        break;

      case 'roundEnd':
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) this._advanceMatch();
        break;

      case 'matchEnd':
        break;
    }
  }

  _updateLive(dt, c) {
    const bomb = this.bomb;

    if (bomb.planted) {
      // Round timer is irrelevant once the bomb is down.
      this.phaseTimer = Math.max(this.phaseTimer, 0);
      if (!bomb.defused) {
        bomb.timer -= dt;
        if (bomb.timer <= 0) {
          bomb.timer = 0;
          bomb.exploded = true;
          this.endRound('ATK', 'bomb');
          return;
        }
      }
    } else {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.phaseTimer = 0;
        this.endRound('DEF', 'time');
        return;
      }
    }

    // Elimination check.
    const atkAlive = Number.isFinite(c.atkAliveCount) ? c.atkAliveCount : (c.playerTeamAlive && c.playerTeam === 'ATK' ? 1 : 0);
    const defAlive = Number.isFinite(c.defAliveCount) ? c.defAliveCount : (c.playerTeamAlive && c.playerTeam === 'DEF' ? 1 : 0);
    if (defAlive <= 0 && atkAlive <= 0) {
      // Mutual wipe: whoever is attacking the objective wins by default; else DEF holds.
      this.endRound(bomb.planted ? 'ATK' : 'DEF', 'elimination');
      return;
    }
    if (atkAlive <= 0) {
      this.endRound('DEF', 'elimination');
      return;
    }
    if (defAlive <= 0 && !bomb.planted) {
      this.endRound('ATK', 'elimination');
      return;
    }
    // Defs dead but bomb planted: still ticking (ATK win comes from timer/explosion).
    if (defAlive <= 0 && bomb.planted && !bomb.defused) {
      // nothing more to do; timer resolves it.
    }
  }

  _advanceMatch() {
    if (this.score.ATK >= ROUNDS_TO_WIN || this.score.DEF >= ROUNDS_TO_WIN) {
      this.phase = 'matchEnd';
      this.matchWinner = this.score.ATK > this.score.DEF ? 'ATK' : 'DEF';
      return;
    }
    this.round++;
    this.startRound();
  }

  inSite(pos) {
    if (!pos) return false;
    const dx = pos.x - SITE_CENTER.x;
    const dz = pos.z - SITE_CENTER.z;
    return (dx * dx + dz * dz) <= SITE_RADIUS * SITE_RADIUS;
  }

  // team: 'ATK'; entity: holder; nearSite: bool; progress: dt-scale delta (0..1 per tick fraction)
  tryPlant(team, entity, nearSite, progress) {
    if (this.phase !== 'live') return false;
    if (team !== 'ATK') return false;
    const bomb = this.bomb;
    if (bomb.planted || bomb.defused || bomb.exploded) return false;
    if (!nearSite) {
      bomb.plantProgress = 0;
      bomb.planter = null;
      return false;
    }
    bomb.planter = entity;
    bomb.plantProgress += progress / PLANT_TIME;
    if (bomb.plantProgress >= 1) {
      bomb.plantProgress = 1;
      bomb.planted = true;
      bomb.carrier = null;
      bomb.timer = BOMB_TIME;
      bomb.exploded = false;
      bomb.defused = false;
      return true;
    }
    return false;
  }

  tryDefuse(entity, progress) {
    if (this.phase !== 'live') return false;
    const bomb = this.bomb;
    if (!bomb.planted || bomb.defused || bomb.exploded) return false;
    bomb.defuser = entity;
    bomb.defuseProgress += progress / DEFUSE_TIME;
    if (bomb.defuseProgress >= 1) {
      bomb.defuseProgress = 1;
      bomb.defused = true;
      this.endRound('DEF', 'defuse');
      return true;
    }
    return false;
  }

  abortPlant() {
    this.bomb.plantProgress = 0;
    this.bomb.planter = null;
  }

  abortDefuse() {
    this.bomb.defuseProgress = 0;
    this.bomb.defuser = null;
  }

  endRound(winner, reason) {
    if (this.phase === 'roundEnd' || this.phase === 'matchEnd') return;
    this.phase = 'roundEnd';
    this.phaseTimer = ROUND_END_TIME;
    this.roundWinner = winner;
    this.winReason = reason || '';
    if (winner) this.score[winner] = (this.score[winner] || 0) + 1;
  }

  // Returns credit deltas. teamCredits keyed by team, playerMoneyDelta for local player.
  giveRewards(ctx = {}) {
    const winner = this.roundWinner;
    const c = ctx || {};
    const teamCredits = { ATK: 0, DEF: 0 };
    const playerTeam = c.playerTeam || this.playerTeam;
    const playerWon = winner && winner === playerTeam;

    for (const t of ['ATK', 'DEF']) {
      teamCredits[t] = (t === winner) ? ECON.win : ECON.lose;
    }

    let playerMoneyDelta = playerWon ? ECON.win : ECON.lose;

    // Objective bonus for the player.
    if (this.bomb.planted && playerTeam === 'ATK' && c.playerPlanted) {
      playerMoneyDelta += ECON.plant;
    }
    if (this.bomb.defused && playerTeam === 'DEF' && c.playerDefused) {
      playerMoneyDelta += ECON.defuse;
    }

    // Clamp against max later at the economy layer; return raw delta here.
    return { perPlayer: teamCredits, playerMoneyDelta };
  }
}
