class RockMusicEngine {
  private ctx: AudioContext | null = null;
  private isPlaying = false;
  private timerId: number | null = null;
  private step = 0;
  private targetIntensity = 0;
  private smoothIntensity = 0;
  private baseBpm = 130;
  private currentIntervalMs = (60 / 130 / 4) * 1000;

  // Rock chord progressions in D minor (D5, Bb5, F5, C5, G5, A5)
  private chordFreqs: number[][] = [
    [73.42, 110.0, 146.83], // D5 (D, A, D)
    [58.27, 87.31, 116.54], // Bb5 (Bb, F, Bb)
    [87.31, 130.81, 174.61], // F5 (F, C, F)
    [65.41, 98.0, 130.81], // C5 (C, G, C)
    [98.0, 146.83, 196.0], // G5 (G, D, G)
    [110.0, 164.81, 220.0], // A5 (A, E, A)
  ];

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private createDistortionCurve(amount = 25): Float32Array {
    const k = typeof amount === 'number' ? amount : 25;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  updateIntensity(val: number): void {
    this.targetIntensity = Math.max(0, Math.min(1, val));
  }

  togglePlay(): boolean {
    const ctx = this.ensureContext();
    if (!ctx) return false;

    if (this.isPlaying) {
      this.stop();
      return false;
    } else {
      this.start();
      return true;
    }
  }

  getPlaying(): boolean {
    return this.isPlaying;
  }

  start(): void {
    const ctx = this.ensureContext();
    if (!ctx || this.isPlaying) return;
    this.isPlaying = true;
    this.step = 0;
    this.smoothIntensity = this.targetIntensity;

    this.scheduleNextTick();
  }

  stop(): void {
    this.isPlaying = false;
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private scheduleNextTick(): void {
    if (!this.isPlaying) return;
    // Smooth intensity interpolation towards target
    this.smoothIntensity += (this.targetIntensity - this.smoothIntensity) * 0.18;

    // Dynamic tempo ramping: 130 BPM (calm) up to 158 BPM (heavy combat / boss)
    const currentBpm = this.baseBpm + this.smoothIntensity * 28;
    const stepInterval = (60 / currentBpm / 4) * 1000;

    this.timerId = window.setTimeout(() => {
      this.tick();
      this.scheduleNextTick();
    }, stepInterval);
  }

  private tick(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.isPlaying) return;
    const now = ctx.currentTime;
    const barStep = this.step % 64; // 4-bar loop (16 steps per bar)
    const chordIdx = Math.floor(barStep / 16);
    const sixteenth = barStep % 16;

    // Intensity factors
    const intensity = this.smoothIntensity;
    const driveAmount = 14 + intensity * 24;
    const masterVol = 0.18 + intensity * 0.12;

    // Master Rock Bus (Cabinet Filter + Tube Overdrive + Presence Boost)
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(masterVol, now);

    const cabinetFilter = ctx.createBiquadFilter();
    cabinetFilter.type = 'lowpass';
    cabinetFilter.frequency.setValueAtTime(2800 + intensity * 1200, now);
    cabinetFilter.Q.setValueAtTime(1.4, now);

    const midBoost = ctx.createBiquadFilter();
    midBoost.type = 'peaking';
    midBoost.frequency.setValueAtTime(1200, now);
    midBoost.gain.setValueAtTime(4.0 + intensity * 3.5, now);
    midBoost.Q.setValueAtTime(1.6, now);

    const waveShaper = ctx.createWaveShaper();
    waveShaper.curve = this.createDistortionCurve(driveAmount) as any;

    masterGain.connect(waveShaper);
    waveShaper.connect(midBoost);
    midBoost.connect(cabinetFilter);
    cabinetFilter.connect(ctx.destination);

    // 1. Rock Drums (Intense fills and double-time when action heats up)
    if (sixteenth % 4 === 0 || (intensity > 0.55 && sixteenth % 2 === 1)) {
      const kickOsc = ctx.createOscillator();
      const kickGain = ctx.createGain();
      kickOsc.type = 'sine';
      kickOsc.frequency.setValueAtTime(140 + intensity * 20, now);
      kickOsc.frequency.exponentialRampToValueAtTime(38, now + 0.08);
      kickGain.gain.setValueAtTime(0.3 + intensity * 0.15, now);
      kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      kickOsc.connect(kickGain).connect(ctx.destination);
      kickOsc.start(now);
      kickOsc.stop(now + 0.13);
    }

    if (sixteenth === 4 || sixteenth === 12 || (intensity > 0.65 && (sixteenth === 7 || sixteenth === 15))) {
      const bufferSize = ctx.sampleRate * 0.11;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const snareFilter = ctx.createBiquadFilter();
      snareFilter.type = 'bandpass';
      snareFilter.frequency.setValueAtTime(1900, now);
      snareFilter.Q.setValueAtTime(0.9, now);

      const snareGain = ctx.createGain();
      snareGain.gain.setValueAtTime(0.25 + intensity * 0.15, now);
      snareGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      noise.connect(snareFilter).connect(snareGain).connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 0.11);
    }

    // Hi-Hat on 16ths (faster double-time hi-hats during high intensity)
    const hhBufSize = ctx.sampleRate * 0.035;
    const hhBuf = ctx.createBuffer(1, hhBufSize, ctx.sampleRate);
    const hhData = hhBuf.getChannelData(0);
    for (let i = 0; i < hhBufSize; i++) {
      hhData[i] = (Math.random() * 2 - 1) * (sixteenth % 2 === 0 ? 0.6 : 0.3);
    }
    const hhSource = ctx.createBufferSource();
    hhSource.buffer = hhBuf;
    const hhFilter = ctx.createBiquadFilter();
    hhFilter.type = 'highpass';
    hhFilter.frequency.setValueAtTime(7500, now);
    const hhGain = ctx.createGain();
    hhGain.gain.setValueAtTime(0.06 + intensity * 0.06, now);
    hhGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    hhSource.connect(hhFilter).connect(hhGain).connect(ctx.destination);
    hhSource.start(now);
    hhSource.stop(now + 0.035);

    // 2. Rhythm Power Chords (Chugging faster when intensity is high)
    const strumCondition =
      intensity > 0.5 ? sixteenth % 2 === 0 : sixteenth === 0 || sixteenth === 4 || sixteenth === 8 || sixteenth === 12;

    if (strumCondition) {
      const freqs = this.chordFreqs[chordIdx % this.chordFreqs.length];
      for (const f of freqs) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, now);
        g.gain.setValueAtTime(0.1 + intensity * 0.06, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(g).connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.24);
      }

      // Slap Bass Note
      const bassOsc = ctx.createOscillator();
      const bassGain = ctx.createGain();
      bassOsc.type = 'triangle';
      bassOsc.frequency.setValueAtTime(freqs[0] * 0.5, now);
      bassGain.gain.setValueAtTime(0.18 + intensity * 0.1, now);
      bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      bassOsc.connect(bassGain).connect(ctx.destination);
      bassOsc.start(now);
      bassOsc.stop(now + 0.2);
    }

    // 3. Lead Guitar Rock Riffs & Arpeggios (Ramping up in frequency density during combat)
    const leadPattern = [0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 5, 7, 9];
    const noteOffset = leadPattern[sixteenth % leadPattern.length];
    if (noteOffset !== undefined && (sixteenth % 2 === 0 || intensity > 0.4)) {
      const baseRoot = this.chordFreqs[chordIdx % this.chordFreqs.length][0] * 2;
      const noteFreq = baseRoot * Math.pow(2, noteOffset / 12);

      const leadOsc = ctx.createOscillator();
      const leadGain = ctx.createGain();
      const vibrato = ctx.createOscillator();
      const vibGain = ctx.createGain();

      leadOsc.type = 'sawtooth';
      leadOsc.frequency.setValueAtTime(noteFreq, now);

      vibrato.type = 'sine';
      vibrato.frequency.setValueAtTime(6.0, now);
      vibGain.gain.setValueAtTime(5.0 + intensity * 3.0, now);

      vibrato.connect(vibGain);
      vibGain.connect(leadOsc.frequency);
      vibrato.start(now);
      vibrato.stop(now + 0.18);

      leadGain.gain.setValueAtTime(0.09 + intensity * 0.08, now);
      leadGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      leadOsc.connect(leadGain).connect(masterGain);
      leadOsc.start(now);
      leadOsc.stop(now + 0.18);
    }

    this.step++;
  }
}

export const rockMusic = new RockMusicEngine();
