// Procedural SFX via Web Audio API (no assets, no network).
export const audio = {
  ctx: null,
  master: null,

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },

  shot(id) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime;
    const P = {
      pistol: { freq: 1800, q: 0.9, dur: 0.12, thump: 180, vol: 0.55 },
      smg:    { freq: 2400, q: 1.2, dur: 0.07, thump: 200, vol: 0.45 },
      rifle:  { freq: 1200, q: 0.7, dur: 0.18, thump: 120, vol: 0.7 },
      sniper: { freq: 700,  q: 0.6, dur: 0.38, thump: 80,  vol: 0.85 },
    }[id] || { freq: 1500, q: 1, dur: 0.12, thump: 160, vol: 0.55 };

    const buf = makeNoiseBuffer(c, P.dur + 0.05);
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = P.freq; bp.Q.value = P.q;
    const g = c.createGain();
    g.gain.setValueAtTime(P.vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + P.dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t); src.stop(t + P.dur + 0.05);

    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(P.thump, t);
    o.frequency.exponentialRampToValueAtTime(40, t + P.dur);
    const og = c.createGain();
    og.gain.setValueAtTime(P.vol * 0.9, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + P.dur * 0.9);
    o.connect(og).connect(this.master);
    o.start(t); o.stop(t + P.dur);
  },

  reload() {
    const c = this.ctx; if (!c) return;
    const click = (dt) => {
      const t = c.currentTime + dt;
      const src = c.createBufferSource();
      src.buffer = makeNoiseBuffer(c, 0.06);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 4;
      const g = c.createGain();
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      src.connect(bp).connect(g).connect(this.master);
      src.start(t); src.stop(t + 0.08);
    };
    click(0); click(0.15);
  },

  hit(headshot) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'square';
    const f = headshot ? 1400 : 700;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.09);
    const g = c.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.12);
  },

  explosion() {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = makeNoiseBuffer(c, 1);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 0.8);
    const g = c.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t); src.stop(t + 1);

    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.7);
    const og = c.createGain();
    og.gain.setValueAtTime(0.8, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    o.connect(og).connect(this.master);
    o.start(t); o.stop(t + 0.85);
  },

  footstep() {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = makeNoiseBuffer(c, 0.06);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 1.5;
    const g = c.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t); src.stop(t + 0.08);
  },

  click() {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(2200, t);
    const g = c.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.04);
  },

  roundEnd(win) {
    const c = this.ctx; if (!c) return;
    const notes = win ? [523, 784] : [392, 262];
    notes.forEach((f, i) => {
      const t = c.currentTime + i * 0.18;
      const o = c.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + 0.35);
    });
  },
};

function makeNoiseBuffer(ctx, seconds) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
