export class AudioSys {
  ctx = null;

  async resume() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  tone(freq, duration = 0.12, type = 'sine', endFreq = freq, volume = 0.12) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), this.ctx.currentTime + duration);
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain).connect(this.ctx.destination); osc.start(); osc.stop(this.ctx.currentTime + duration);
  }

  noise(duration = 0.09) {
    if (!this.ctx) return;
    const n = Math.floor(this.ctx.sampleRate * duration), buffer = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(), gain = this.ctx.createGain();
    src.buffer = buffer; gain.gain.value = 0.22; src.connect(gain).connect(this.ctx.destination); src.start();
  }

  shoot() { this.noise(0.11); this.tone(900, 0.035, 'square', 220, 0.07); }
  hit() { this.tone(1250, 0.045, 'square', 700, 0.09); }
  reload() { this.tone(520, 0.06, 'square', 280, 0.08); this.tone(360, 0.07, 'square', 620, 0.07); }
  headshot() { this.tone(880, 0.22, 'sine', 1500, 0.13); }
  roundStart() { this.tone(440, 0.24, 'triangle', 880, 0.12); }
  roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.32), i * 100)); }
  roundLose() { [392, 311, 233].forEach((f, i) => setTimeout(() => this.tone(f, 0.38, 'triangle'), i * 110)); }
}
