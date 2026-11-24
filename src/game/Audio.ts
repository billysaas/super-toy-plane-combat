const MUSIC_TRACK = "/music/Valor on the Front Line_Audio.mp3";

export class AudioManager {
  private ctx?: AudioContext;
  private master?: GainNode;
  private engineGain?: GainNode;
  private engineFilter?: BiquadFilterNode;
  private engineOsc?: OscillatorNode;
  private engineOsc2?: OscillatorNode;
  private engineRunning = false;
  private volume = 0.75;
  private noiseBuffer?: AudioBuffer;
  private muted = false;
  private music?: HTMLAudioElement;
  private musicUserEnabled = true;
  private menuMusicActive = false;

  init(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 18;
    limiter.ratio.value = 7;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.28;
    this.master.connect(limiter);
    limiter.connect(this.ctx.destination);
    this.noiseBuffer = this.createNoise(1.2);
  }

  private createNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.04);
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.setVolume(muted ? 0 : this.volume);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get isMusicEnabled(): boolean {
    return this.musicUserEnabled;
  }

  setMenuMusic(active: boolean): void {
    this.menuMusicActive = active;
    this.syncMusic();
  }

  toggleMusic(): boolean {
    this.musicUserEnabled = !this.musicUserEnabled;
    this.syncMusic();
    return this.musicUserEnabled;
  }

  private ensureMusic(): HTMLAudioElement | undefined {
    if (this.music) return this.music;
    if (!this.ctx || !this.master) return undefined;
    const audio = new Audio(MUSIC_TRACK);
    audio.loop = true;
    audio.preload = "auto";
    const source = this.ctx.createMediaElementSource(audio);
    const gain = this.ctx.createGain();
    gain.gain.value = 0.38;
    source.connect(gain);
    gain.connect(this.master);
    this.music = audio;
    return audio;
  }

  private syncMusic(): void {
    if (!this.musicUserEnabled || !this.menuMusicActive) {
      this.music?.pause();
      return;
    }
    const music = this.ensureMusic();
    if (!music) return;
    if (this.ctx?.state === "suspended") void this.ctx.resume();
    void music.play().catch(() => undefined);
  }

  startEngine(): void {
    if (!this.ctx || !this.master || this.engineRunning) return;
    this.engineRunning = true;
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc.type = "sawtooth";
    this.engineOsc2.type = "triangle";
    this.engineOsc.frequency.value = 75;
    this.engineOsc2.frequency.value = 37;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = 380;
    this.engineFilter.Q.value = 1.2;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
    this.engineGain.gain.setTargetAtTime(0.05, ctx.currentTime, 0.4);
  }

  stopEngine(): void {
    if (!this.ctx || !this.engineRunning) return;
    this.engineRunning = false;
    const now = this.ctx.currentTime;
    this.engineGain?.gain.setTargetAtTime(0, now, 0.12);
    setTimeout(() => {
      try {
        this.engineOsc?.stop();
        this.engineOsc2?.stop();
      } catch {
        return;
      }
      this.engineOsc?.disconnect();
      this.engineOsc2?.disconnect();
      this.engineFilter?.disconnect();
      this.engineGain?.disconnect();
      this.engineOsc = undefined;
      this.engineOsc2 = undefined;
    }, 400);
  }

  setEngine(speed: number, boost: boolean, alive: boolean): void {
    if (!this.ctx || !this.engineOsc || !this.engineOsc2 || !this.engineFilter || !this.engineGain) return;
    const now = this.ctx.currentTime;
    const target = alive ? 0.045 + Math.min(0.07, speed / 900) + (boost ? 0.035 : 0) : 0;
    this.engineGain.gain.setTargetAtTime(target, now, 0.12);
    this.engineOsc.frequency.setTargetAtTime(58 + speed * 1.7 + (boost ? 38 : 0), now, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(29 + speed * 0.9, now, 0.12);
    this.engineFilter.frequency.setTargetAtTime(280 + speed * 13 + (boost ? 500 : 0), now, 0.1);
  }

  gun(team = false): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = team ? 820 : 1240;
    filter.Q.value = 0.9;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
    const pan = ctx.createStereoPanner();
    pan.pan.value = team ? 0.22 : -0.15;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(this.master);
    src.start(now);
    src.stop(now + 0.09);
  }

  hit(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(820, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.06);
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  rocket(): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(240, now);
    filter.frequency.exponentialRampToValueAtTime(1900, now + 0.5);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.13, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(now);
    src.stop(now + 0.6);
  }

  explosion(distance = 0, big = false): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const falloff = 1 / (1 + distance * 0.022);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(big ? 650 : 950, now);
    filter.frequency.exponentialRampToValueAtTime(110, now + 0.6);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime((big ? 0.42 : 0.24) * falloff, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (big ? 1.1 : 0.75));
    const boom = ctx.createOscillator();
    boom.type = "sine";
    boom.frequency.setValueAtTime(70, now);
    boom.frequency.exponentialRampToValueAtTime(36, now + 0.55);
    const boomGain = ctx.createGain();
    boomGain.gain.setValueAtTime(0.18 * falloff, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    boom.connect(boomGain);
    boomGain.connect(this.master);
    src.start(now);
    src.stop(now + 1.15);
    boom.start(now);
    boom.stop(now + 1.2);
  }

  pickup(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    [660, 880, 1174].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      const t = now + i * 0.055;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.04, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(gain);
      gain.connect(this.master!);
      osc.start(t);
      osc.stop(t + 0.18);
    });
  }

  collision(): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 240;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(now);
    src.stop(now + 0.3);
  }

  click(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(760, now);
    osc.frequency.setValueAtTime(1020, now + 0.025);
    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  fanfare(win: boolean): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const notes = win ? [523, 659, 784, 1047] : [392, 349, 294, 220];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      const t = now + i * 0.16;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.055, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(gain);
      gain.connect(this.master!);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }
}
