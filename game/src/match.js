export class Match {
  constructor({ combatants, spawns, onRoundEnd }) {
    this.combatants = combatants;
    this.spawns = spawns;
    this.onRoundEnd = onRoundEnd;
    this.phase = 'buy';
    this.phaseTimer = 12;
    this.round = 1;
    this.scores = { A: 0, B: 0 };
    this.killFeed = [];
    this.local = combatants[0];
  }

  update(dt) {
    if (this.phase === 'match') return;
    this.phaseTimer -= dt;

    if (this.phase === 'buy') {
      if (this.phaseTimer <= 0) {
        this.phase = 'live';
        this.phaseTimer = 90;
      }
      return;
    }

    if (this.phase === 'live') {
      const aliveA = this.combatants.filter(c => c.team === 'A' && c.alive).length;
      const aliveB = this.combatants.filter(c => c.team === 'B' && c.alive).length;
      if (aliveA === 0 || aliveB === 0) {
        this.endRound(aliveA === 0 && aliveB === 0 ? null : aliveA > 0 ? 'A' : 'B');
      } else if (this.phaseTimer <= 0) {
        this.endRound(aliveA === aliveB ? null : aliveA > aliveB ? 'A' : 'B');
      }
      return;
    }

    if (this.phase === 'finish' && this.phaseTimer <= 0) {
      if (this.scores.A >= 5 || this.scores.B >= 5) {
        this.phase = 'match';
        return;
      }
      this.round += 1;
      this.combatants.forEach((c, i) => {
        c.alive = true;
        if (c.health !== undefined) c.health = 100;
        if (this.spawns && this.spawns[i]) c.position = { ...this.spawns[i] };
      });
      this.phase = 'buy';
      this.phaseTimer = 12;
    }
  }

  endRound(winner) {
    if (this.phase !== 'live') return;
    if (winner) this.scores[winner] += 1;
    this.phase = 'finish';
    this.phaseTimer = 4;
    if (this.onRoundEnd) this.onRoundEnd(winner, this.round, this.scores);
  }

  registerKill(killer, victim, isHead) {
    if (killer) killer.money = (killer.money || 0) + 300;
    this.killFeed.push({
      killer: killer && killer.name,
      victim: victim && victim.name,
      isHead: !!isHead
    });
  }

  buy(actor, name) {
    if (this.phase !== 'buy' || !actor || actor.money < 1000) return false;
    actor.money -= 1000;
    actor.weapon = name;
    return true;
  }

  getHudState() {
    return {
      phase: this.phase,
      phaseTimer: Math.max(0, this.phaseTimer),
      round: this.round,
      scores: { ...this.scores },
      killFeed: this.killFeed.slice(),
      local: this.local
    };
  }
}
