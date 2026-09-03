// All sound effects are synthesized with WebAudio — no audio files.

const MATERIAL_PARAMS = {
  stone:    { freq: 170, type: 'triangle', noise: 0.5, dur: 0.09 },
  gravel:   { freq: 130, type: 'triangle', noise: 0.8, dur: 0.11 },
  grass:    { freq: 300, type: 'sine', noise: 0.55, dur: 0.08 },
  leaves:   { freq: 520, type: 'sine', noise: 0.75, dur: 0.07 },
  sand:     { freq: 250, type: 'sine', noise: 0.85, dur: 0.1 },
  snow:     { freq: 320, type: 'sine', noise: 0.7, dur: 0.09 },
  wood:     { freq: 210, type: 'square', noise: 0.25, dur: 0.08 },
  wool:     { freq: 160, type: 'sine', noise: 0.3, dur: 0.1 },
  glass:    { freq: 900, type: 'triangle', noise: 0.15, dur: 0.14 },
};

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.muted = false;
    this.masterVol = 0.8;
    this.sfxVol = 1.0;
  }

  ensure() {
    if (this.ctx) return true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.master);
      this.applyVolumes();
    } catch {
      return false;
    }
    return true;
  }

  resume() {
    if (this.ensure() && this.ctx.state === 'suspended') this.ctx.resume();
  }

  applyVolumes() {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.masterVol;
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVol;
  }

  setMuted(m) { this.muted = m; this.applyVolumes(); }
  setVolumes(master, sfx) { this.masterVol = master; this.sfxVol = sfx; this.applyVolumes(); }

  tone(freq, type, dur, volume = 1, slide = 0) {
    if (!this.ensure() || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noiseBurst(dur, filterFreq, volume = 1) {
    if (!this.ensure() || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt).connect(gain).connect(this.sfxGain);
    src.start(t);
  }

  materialParams(mat) { return MATERIAL_PARAMS[mat] ?? MATERIAL_PARAMS.stone; }

  place(mat = 'stone') {
    const p = this.materialParams(mat);
    this.tone(p.freq * 1.6, p.type, p.dur, 0.5, -p.freq * 0.4);
    this.noiseBurst(p.dur * 0.7, 2200, 0.18 * p.noise);
  }

  break_(mat = 'stone') {
    const p = this.materialParams(mat);
    this.noiseBurst(p.dur * 1.6, 1600 + p.freq * 4, 0.4 * (0.4 + p.noise));
    this.tone(p.freq, p.type, p.dur, 0.32, -p.freq * 0.5);
  }

  hit(mat = 'stone') { // partial mining tick
    const p = this.materialParams(mat);
    this.noiseBurst(0.05, 1400 + p.freq * 3, 0.12 * (0.4 + p.noise));
  }

  step(mat = 'grass') {
    const p = this.materialParams(mat);
    this.noiseBurst(0.045, 900 + p.freq * 2, 0.1 * (0.5 + p.noise));
  }

  chatPing() {
    this.tone(660, 'sine', 0.08, 0.35);
    setTimeout(() => this.tone(880, 'sine', 0.1, 0.35), 70);
  }

  joinChime() {
    this.tone(392, 'sine', 0.12, 0.4);
    setTimeout(() => this.tone(523, 'sine', 0.12, 0.4), 90);
    setTimeout(() => this.tone(659, 'sine', 0.18, 0.4), 180);
  }

  leaveChime() {
    this.tone(523, 'sine', 0.12, 0.35);
    setTimeout(() => this.tone(392, 'sine', 0.16, 0.35), 100);
  }

  splash() {
    this.noiseBurst(0.3, 700, 0.4);
    this.tone(180, 'sine', 0.2, 0.25, -80);
  }

  flyWhoosh() {
    this.tone(240, 'sine', 0.18, 0.3, 220);
  }

  pop() { // item pickup
    this.tone(520, 'sine', 0.05, 0.35, 340);
  }

  eat() {
    this.noiseBurst(0.07, 500, 0.3);
    setTimeout(() => this.noiseBurst(0.07, 450, 0.3), 120);
    setTimeout(() => this.noiseBurst(0.07, 480, 0.3), 240);
    setTimeout(() => this.tone(680, 'sine', 0.1, 0.25, 120), 380);
  }

  hurt() {
    this.tone(190, 'square', 0.12, 0.4, -70);
    this.noiseBurst(0.08, 800, 0.2);
  }

  death() {
    this.tone(300, 'sawtooth', 0.25, 0.4, -180);
    setTimeout(() => this.tone(220, 'sawtooth', 0.3, 0.4, -140), 200);
    setTimeout(() => this.tone(160, 'sawtooth', 0.5, 0.4, -100), 420);
  }

  mobHurt(kind = 'gloomer') {
    if (kind === 'gloomer') this.tone(120, 'sawtooth', 0.2, 0.3, -30);
    else this.tone(420, 'square', 0.12, 0.25, -120);
  }

  mobDeath(kind = 'gloomer') {
    if (kind === 'gloomer') this.tone(140, 'sawtooth', 0.4, 0.35, -100);
    else this.tone(380, 'square', 0.3, 0.3, -220);
  }

  groan() {
    this.tone(95 + Math.random() * 30, 'sawtooth', 0.5, 0.18, -20);
  }

  swing() {
    this.noiseBurst(0.06, 3000, 0.08);
  }

  toolBreak() {
    this.tone(700, 'square', 0.08, 0.4, -300);
    setTimeout(() => this.noiseBurst(0.15, 1200, 0.3), 60);
  }

  levelTool() {
    this.tone(880, 'sine', 0.1, 0.3);
  }
}
