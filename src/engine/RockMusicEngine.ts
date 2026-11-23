export type MusicMode = 'TITLE' | 'HUB' | 'SANCTUARY' | 'EXPLORE' | 'COMBAT' | 'BOSS';
export type MusicAccentType = 'COLLAPSE' | 'BOSS_STING' | 'CHAIN_REACTION' | 'KILL';

export interface MusicActionState {
  mode: MusicMode;
  stratum: 1 | 2 | 3;
  intensity: number; // 0..1 computed from nearby threats, weapon heat, boss presence
  lowHealth?: boolean;
  enraged?: boolean;
}

interface PhraseNote {
  degree: number; // semitones from D4 (293.66 Hz) or -1 for rest, -2 for sustain tie
  slide?: boolean;
  accent?: boolean;
}

class RockMusicEngine {
  private ctx: AudioContext | null = null;
  private isPlaying = false;
  private isMuted = false;
  private schedulerTimer: number | null = null;

  // Lookahead scheduling state (Chris Wilson pattern for zero-jitter timing)
  private nextNoteTime = 0;
  private currentStep = 0; // Continuous 16th-note counter
  private currentBpm = 126;

  // Action & adaptive musical state
  private actionState: MusicActionState = {
    mode: 'TITLE',
    stratum: 1,
    intensity: 0,
    lowHealth: false,
    enraged: false,
  };
  private smoothIntensity = 0;
  private barIntensity = 0; // Sampled on 4-step boundaries so patterns don't chop mid-beat
  private pendingAccent: MusicAccentType | null = null;

  // Persistent Audio Graph Nodes (allocated once to eliminate GC chop & clicks)
  private masterGain: GainNode | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;

  private rhythmDrive: WaveShaperNode | null = null;
  private rhythmCabinet: BiquadFilterNode | null = null;
  private rhythmPresence: BiquadFilterNode | null = null;
  private rhythmBusGain: GainNode | null = null;

  private leadDrive: WaveShaperNode | null = null;
  private leadFilter: BiquadFilterNode | null = null;
  private leadBusGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayFilter: BiquadFilterNode | null = null;
  private delayWetGain: GainNode | null = null;

  private bassFilter: BiquadFilterNode | null = null;
  private bassBusGain: GainNode | null = null;

  private drumBusGain: GainNode | null = null;

  // Cached noise buffers (zero per-tick buffer allocations)
  private snareBuffer: AudioBuffer | null = null;
  private hiHatBuffer: AudioBuffer | null = null;
  private crashBuffer: AudioBuffer | null = null;

  // Persistent legato lead voice for smooth slides & sustain
  private activeLeadOsc: OscillatorNode | null = null;
  private activeLeadSubOsc: OscillatorNode | null = null;
  private activeLeadEnv: GainNode | null = null;
  private activeLeadStopTime = 0;

  // Root frequencies for 4-bar progressions per Stratum & Mode (Key of D Minor / Dorian / Phrygian)
  // Each entry is [rootHz, fifthHz, octaveHz] in bass/rhythm range
  private readonly progressions: Record<string, number[][][]> = {
    HUB: [
      [
        [73.42, 110.0, 146.83], // Dm
        [58.27, 87.31, 116.54], // Bb
        [98.0, 146.83, 196.0],  // Gm
        [110.0, 164.81, 220.0], // Asus
      ],
    ],
    STRATUM_1: [
      // Drowned Masonry: Moody D Aeolian / Phrygian drive
      [
        [73.42, 110.0, 146.83], // D5
        [73.42, 110.0, 146.83], // D5
        [58.27, 87.31, 116.54], // Bb5
        [65.41, 98.0, 130.81],  // C5
      ],
      [
        [73.42, 110.0, 146.83], // D5
        [77.78, 116.54, 155.56], // Eb5 (Phrygian tension)
        [65.41, 98.0, 130.81],  // C5
        [73.42, 110.0, 146.83], // D5
      ],
    ],
    STRATUM_2: [
      // Slag-Foundry: Heavy chromatic industrial riff
      [
        [73.42, 110.0, 146.83], // D5
        [87.31, 130.81, 174.61], // F5
        [98.0, 146.83, 196.0],  // G5
        [103.83, 155.56, 207.65], // G#5 (Tritone industrial bite)
      ],
    ],
    STRATUM_3: [
      // Gilded Vaults: Regal harmonic minor urgency
      [
        [73.42, 110.0, 146.83], // D5
        [58.27, 87.31, 116.54], // Bb5
        [98.0, 146.83, 196.0],  // G5
        [110.0, 164.81, 220.0], // A5
      ],
    ],
  };

  // Coherent 16-step rhythm chug patterns (0 = rest, 1 = palm-mute chug, 2 = open power chord, 3 = accented stab)
  private readonly rhythmPatterns = {
    explore: [2, 0, 0, 1, 0, 0, 1, 0, 2, 0, 0, 1, 0, 1, 0, 0],
    skirmish: [2, 0, 1, 1, 3, 0, 1, 1, 2, 0, 1, 1, 3, 0, 2, 0],
    combat: [3, 1, 1, 2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1, 2, 1],
    boss: [3, 1, 1, 3, 1, 1, 3, 1, 3, 1, 1, 3, 2, 2, 3, 2],
  };

  // Coherent, musical 16-step lead guitar phrases with rests (-1) and sustained ties (-2)
  // Degrees are semitones from D4 (293.66 Hz): 0=D, 3=F, 5=G, 7=A, 8=Bb, 10=C, 12=D5, 15=F5
  private readonly leadPhrases: PhraseNote[][] = [
    // Phrase A: Call motif with breathing room & bend
    [
      { degree: 0, accent: true },
      { degree: -2 },
      { degree: 3 },
      { degree: 5, slide: true },
      { degree: 7, accent: true },
      { degree: -2 },
      { degree: -2 },
      { degree: 5 },
      { degree: 3 },
      { degree: -2 },
      { degree: 0 },
      { degree: -2 },
      { degree: -1 },
      { degree: -1 },
      { degree: -1 },
      { degree: -1 },
    ],
    // Phrase B: Answering climb to high octave
    [
      { degree: 7, accent: true },
      { degree: -2 },
      { degree: 8 },
      { degree: 7 },
      { degree: 5 },
      { degree: -2 },
      { degree: 10, slide: true },
      { degree: 12, accent: true },
      { degree: -2 },
      { degree: -2 },
      { degree: -2 },
      { degree: 10 },
      { degree: 7 },
      { degree: -2 },
      { degree: -1 },
      { degree: -1 },
    ],
    // Phrase C: High-intensity boss hook
    [
      { degree: 12, accent: true },
      { degree: -2 },
      { degree: 15, slide: true },
      { degree: 12 },
      { degree: 10 },
      { degree: 12, slide: true },
      { degree: 7, accent: true },
      { degree: -2 },
      { degree: 8 },
      { degree: 7 },
      { degree: 5 },
      { degree: 3 },
      { degree: 5, slide: true },
      { degree: 7, accent: true },
      { degree: -2 },
      { degree: -2 },
    ],
    // Phrase D: Turnaround cadence resolution
    [
      { degree: 3, accent: true },
      { degree: 5, slide: true },
      { degree: 7 },
      { degree: -2 },
      { degree: 5 },
      { degree: 3 },
      { degree: 2 },
      { degree: -2 },
      { degree: 0, accent: true },
      { degree: -2 },
      { degree: -2 },
      { degree: -2 },
      { degree: -1 },
      { degree: -1 },
      { degree: -1 },
      { degree: -1 },
    ],
  ];

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.initAudioGraph(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private createDistortionCurve(amount: number): Float32Array {
    const nSamples = 8192;
    const curve = new Float32Array(nSamples);
    const k = amount;
    for (let i = 0; i < nSamples; ++i) {
      const x = (i * 2) / nSamples - 1;
      // Smooth asymmetric soft-clipping tube curve
      curve[i] = Math.tanh(x * (1 + k * 0.12));
    }
    return curve;
  }

  private initAudioGraph(ctx: AudioContext): void {
    // 1. Master Bus with Glue Compressor
    this.masterCompressor = ctx.createDynamicsCompressor();
    this.masterCompressor.threshold.setValueAtTime(-16, ctx.currentTime);
    this.masterCompressor.knee.setValueAtTime(12, ctx.currentTime);
    this.masterCompressor.ratio.setValueAtTime(4, ctx.currentTime);
    this.masterCompressor.attack.setValueAtTime(0.005, ctx.currentTime);
    this.masterCompressor.release.setValueAtTime(0.16, ctx.currentTime);

    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.72, ctx.currentTime);

    this.masterCompressor.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);

    // 2. Rhythm Guitar Amp Bus
    this.rhythmDrive = ctx.createWaveShaper();
    this.rhythmDrive.curve = this.createDistortionCurve(24) as unknown as Float32Array<ArrayBuffer>;
    this.rhythmDrive.oversample = '2x';

    this.rhythmPresence = ctx.createBiquadFilter();
    this.rhythmPresence.type = 'peaking';
    this.rhythmPresence.frequency.setValueAtTime(1150, ctx.currentTime);
    this.rhythmPresence.Q.setValueAtTime(1.2, ctx.currentTime);
    this.rhythmPresence.gain.setValueAtTime(3.5, ctx.currentTime);

    this.rhythmCabinet = ctx.createBiquadFilter();
    this.rhythmCabinet.type = 'lowpass';
    this.rhythmCabinet.frequency.setValueAtTime(2400, ctx.currentTime);
    this.rhythmCabinet.Q.setValueAtTime(0.85, ctx.currentTime);

    this.rhythmBusGain = ctx.createGain();
    this.rhythmBusGain.gain.setValueAtTime(0.32, ctx.currentTime);

    this.rhythmDrive.connect(this.rhythmPresence);
    this.rhythmPresence.connect(this.rhythmCabinet);
    this.rhythmCabinet.connect(this.rhythmBusGain);
    this.rhythmBusGain.connect(this.masterCompressor);

    // 3. Lead Guitar Amp + Tape Echo Delay Bus
    this.leadDrive = ctx.createWaveShaper();
    this.leadDrive.curve = this.createDistortionCurve(32) as unknown as Float32Array<ArrayBuffer>;
    this.leadDrive.oversample = '2x';

    this.leadFilter = ctx.createBiquadFilter();
    this.leadFilter.type = 'lowpass';
    this.leadFilter.frequency.setValueAtTime(3100, ctx.currentTime);
    this.leadFilter.Q.setValueAtTime(1.1, ctx.currentTime);

    this.leadBusGain = ctx.createGain();
    this.leadBusGain.gain.setValueAtTime(0.28, ctx.currentTime);

    this.delayNode = ctx.createDelay(1.0);
    this.delayNode.delayTime.setValueAtTime(0.35, ctx.currentTime); // Dotted-8th echo

    this.delayFilter = ctx.createBiquadFilter();
    this.delayFilter.type = 'lowpass';
    this.delayFilter.frequency.setValueAtTime(2100, ctx.currentTime);

    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.setValueAtTime(0.34, ctx.currentTime);

    this.delayWetGain = ctx.createGain();
    this.delayWetGain.gain.setValueAtTime(0.22, ctx.currentTime);

    this.leadDrive.connect(this.leadFilter);
    this.leadFilter.connect(this.leadBusGain);
    this.leadBusGain.connect(this.masterCompressor);

    // Echo loop
    this.leadFilter.connect(this.delayNode);
    this.delayNode.connect(this.delayFilter);
    this.delayFilter.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayFilter.connect(this.delayWetGain);
    this.delayWetGain.connect(this.masterCompressor);

    // 4. Bass Bus
    this.bassFilter = ctx.createBiquadFilter();
    this.bassFilter.type = 'lowpass';
    this.bassFilter.frequency.setValueAtTime(460, ctx.currentTime);
    this.bassFilter.Q.setValueAtTime(1.1, ctx.currentTime);

    this.bassBusGain = ctx.createGain();
    this.bassBusGain.gain.setValueAtTime(0.45, ctx.currentTime);

    this.bassFilter.connect(this.bassBusGain);
    this.bassBusGain.connect(this.masterCompressor);

    // 5. Drum Bus
    this.drumBusGain = ctx.createGain();
    this.drumBusGain.gain.setValueAtTime(0.55, ctx.currentTime);
    this.drumBusGain.connect(this.masterCompressor);

    // 6. Pre-build cached noise buffers once
    this.snareBuffer = this.buildNoiseBuffer(ctx, 0.16, (t) => Math.pow(1 - t, 1.8));
    this.hiHatBuffer = this.buildNoiseBuffer(ctx, 0.055, (t) => Math.pow(1 - t, 2.6));
    this.crashBuffer = this.buildNoiseBuffer(ctx, 0.75, (t) => Math.pow(1 - t, 1.45));
  }

  private buildNoiseBuffer(
    ctx: AudioContext,
    durationSec: number,
    envelopeFn: (normT: number) => number
  ): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * durationSec);
    const buf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const norm = i / length;
      data[i] = (Math.random() * 2 - 1) * envelopeFn(norm);
    }
    return buf;
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.72, this.ctx.currentTime, 0.04);
    }
  }

  updateIntensity(val: number): void {
    const clamped = Math.max(0, Math.min(1, val));
    this.actionState.intensity = clamped;
  }

  updateActionState(state: Partial<MusicActionState>): void {
    if (state.mode !== undefined) this.actionState.mode = state.mode;
    if (state.stratum !== undefined) this.actionState.stratum = state.stratum;
    if (state.intensity !== undefined) {
      this.actionState.intensity = Math.max(0, Math.min(1, state.intensity));
    }
    if (state.lowHealth !== undefined) this.actionState.lowHealth = state.lowHealth;
    if (state.enraged !== undefined) this.actionState.enraged = state.enraged;
  }

  triggerCombatAccent(type: MusicAccentType): void {
    if (!this.isPlaying) return;
    // Prioritize larger stingers
    if (type === 'BOSS_STING' || type === 'COLLAPSE' || !this.pendingAccent) {
      this.pendingAccent = type;
    }
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
    this.currentStep = 0;
    this.smoothIntensity = this.actionState.intensity;
    this.barIntensity = this.smoothIntensity;
    this.nextNoteTime = ctx.currentTime + 0.04;

    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer);
    }
    this.schedulerTimer = window.setInterval(() => this.schedulerTick(), 25);
  }

  stop(): void {
    this.isPlaying = false;
    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    this.stopActiveLead(this.ctx?.currentTime ?? 0);
  }

  private stopActiveLead(time: number): void {
    try {
      if (this.activeLeadEnv && this.ctx) {
        this.activeLeadEnv.gain.cancelScheduledValues(time);
        this.activeLeadEnv.gain.setTargetAtTime(0.0001, time, 0.02);
      }
      if (this.activeLeadOsc) {
        this.activeLeadOsc.stop(time + 0.06);
        this.activeLeadOsc = null;
      }
      if (this.activeLeadSubOsc) {
        this.activeLeadSubOsc.stop(time + 0.06);
        this.activeLeadSubOsc = null;
      }
    } catch {}
  }

  private schedulerTick(): void {
    const ctx = this.ctx;
    if (!ctx || !this.isPlaying) return;

    // Schedule all 16th notes falling within the next 110ms lookahead window
    const lookaheadSec = 0.11;
    while (this.nextNoteTime < ctx.currentTime + lookaheadSec) {
      this.scheduleStep(this.currentStep, this.nextNoteTime);
      this.advanceStep();
    }
  }

  private advanceStep(): void {
    // Smooth intensity evolution; rise faster when action spikes, decay gradually so music stays coherent
    const target = this.actionState.intensity;
    const rate = target > this.smoothIntensity ? 0.14 : 0.045;
    this.smoothIntensity += (target - this.smoothIntensity) * rate;

    // Update pattern intensity & tempo only on beat/bar boundaries so the groove never lurches
    if (this.currentStep % 4 === 0) {
      this.barIntensity = this.smoothIntensity;

      let targetBpm = 126;
      if (this.actionState.mode === 'HUB' || this.actionState.mode === 'SANCTUARY') {
        targetBpm = 110;
      } else if (this.actionState.mode === 'BOSS') {
        targetBpm = 138;
      } else {
        // Steady 124 -> 134 BPM across exploration to heavy combat
        targetBpm = 124 + Math.round(this.barIntensity * 10);
      }
      // Slew BPM gently by at most 2 BPM per beat
      if (this.currentBpm < targetBpm) this.currentBpm = Math.min(targetBpm, this.currentBpm + 2);
      else if (this.currentBpm > targetBpm) this.currentBpm = Math.max(targetBpm, this.currentBpm - 2);
    }

    const secondsPerBeat = 60.0 / this.currentBpm;
    const sixteenthDuration = secondsPerBeat * 0.25;
    this.nextNoteTime += sixteenthDuration;
    this.currentStep++;
  }

  private getChordForStep(step: number): number[] {
    const isCalmMode =
      this.actionState.mode === 'HUB' ||
      this.actionState.mode === 'SANCTUARY' ||
      this.actionState.mode === 'TITLE';

    const key = isCalmMode ? 'HUB' : `STRATUM_${this.actionState.stratum}`;
    const variants = this.progressions[key] ?? this.progressions.STRATUM_1;

    const sectionIdx = Math.floor(step / 64) % variants.length;
    const progression = variants[sectionIdx];
    const barInPhrase = Math.floor((step % 64) / 16);
    return progression[barInPhrase % progression.length];
  }

  private scheduleStep(step: number, time: number): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const sixteenth = step % 16;
    const barInPhrase = Math.floor((step % 64) / 16);
    const chord = this.getChordForStep(step);
    const sixteenthDur = 60.0 / this.currentBpm / 4;
    const intensity = this.barIntensity;
    const isCalmMode =
      this.actionState.mode === 'HUB' ||
      this.actionState.mode === 'SANCTUARY' ||
      this.actionState.mode === 'TITLE';

    // Smoothly open/close guitar cabinet & bass filters based on intensity
    if (sixteenth === 0 && this.rhythmCabinet && this.bassFilter && this.delayNode) {
      const cutoff = isCalmMode ? 1750 : 2000 + intensity * 1650;
      this.rhythmCabinet.frequency.setTargetAtTime(cutoff, time, 0.12);
      this.bassFilter.frequency.setTargetAtTime(340 + intensity * 260, time, 0.12);
      // Sync tape delay to dotted-8th of current BPM
      this.delayNode.delayTime.setTargetAtTime(sixteenthDur * 3, time, 0.08);
    }

    // Check for queued reactive gameplay stingers (collapse, boss sting, chain reaction)
    if (this.pendingAccent && sixteenth % 2 === 0) {
      const accent = this.pendingAccent;
      this.pendingAccent = null;
      this.scheduleCrash(time, accent === 'BOSS_STING' ? 0.36 : 0.25);
      if (accent === 'COLLAPSE' || accent === 'BOSS_STING') {
        this.schedulePowerChord(chord, time, sixteenthDur * 3.5, 3, intensity);
        this.scheduleSubDrop(time, chord[0] * 0.5);
      }
    }

    // --- CALM / BASTION HUB / SANCTUARY ARRANGEMENT ---
    if (isCalmMode) {
      this.scheduleHubStep(step, sixteenth, chord, time, sixteenthDur);
      return;
    }

    // --- 1. DRUM KIT (Locked groove with bar-4 fills) ---
    const isFillBar = barInPhrase === 3 && sixteenth >= 12;
    this.scheduleDrums(sixteenth, time, intensity, isFillBar);

    // Crash cymbal on bar 1 downbeat during combat or boss mode
    if (sixteenth === 0 && barInPhrase === 0 && intensity >= 0.45) {
      this.scheduleCrash(time, 0.18 + intensity * 0.12);
    }

    // --- 2. BASS GUITAR (Coherent locking groove with octave movement) ---
    this.scheduleBass(sixteenth, chord, time, sixteenthDur, intensity);

    // --- 3. RHYTHM GUITAR (Palm-muted chugs & sustained power chords) ---
    const pattern =
      this.actionState.mode === 'BOSS' || intensity >= 0.8
        ? this.rhythmPatterns.boss
        : intensity >= 0.5
          ? this.rhythmPatterns.combat
          : intensity >= 0.22
            ? this.rhythmPatterns.skirmish
            : this.rhythmPatterns.explore;

    const hitType = pattern[sixteenth];
    if (hitType > 0) {
      // Find how many steps until the next rhythm hit so chords sustain smoothly without gaps
      let sustainSteps = 1;
      for (let look = 1; look <= 4; look++) {
        if (pattern[(sixteenth + look) % 16] === 0) sustainSteps++;
        else break;
      }
      const dur =
        hitType === 1
          ? sixteenthDur * 0.82 // Tight palm-muted chug
          : sixteenthDur * Math.min(3.6, sustainSteps * 0.96); // Full sustained power chord
      this.schedulePowerChord(chord, time, dur, hitType, intensity);
    }

    // --- 4. LEAD GUITAR (Phrased melodic hooks during active combat / boss) ---
    if (intensity >= 0.38 || this.actionState.mode === 'BOSS') {
      const phraseIdx =
        this.actionState.mode === 'BOSS' && barInPhrase % 2 === 1
          ? 2
          : barInPhrase % this.leadPhrases.length;
      const phrase = this.leadPhrases[phraseIdx];
      this.scheduleLeadNote(phrase, sixteenth, chord[0], time, sixteenthDur, intensity);
    } else if (sixteenth === 0) {
      this.stopActiveLead(time);
    }
  }

  private scheduleHubStep(
    step: number,
    sixteenth: number,
    chord: number[],
    time: number,
    sixteenthDur: number
  ): void {
    // Soft sub-kick on beat 1 and beat 3-and
    if (sixteenth === 0 || sixteenth === 10) {
      this.scheduleKick(time, 0.22);
    }
    // Gentle rim-click on beat 3
    if (sixteenth === 8) {
      this.scheduleSnare(time, 0.1);
    }
    // Brushed hi-hat on 8th notes
    if (sixteenth % 2 === 0) {
      this.scheduleHiHat(time, sixteenth % 4 === 0 ? 0.045 : 0.025, false);
    }
    // Warm sustained bass root on beat 1 and fifth on beat 3
    if (sixteenth === 0 || sixteenth === 8) {
      const bassFreq = sixteenth === 0 ? chord[0] * 0.5 : chord[1] * 0.5;
      this.scheduleBassNote(bassFreq, time, sixteenthDur * 7.2, 0.24);
    }
    // Atmospheric clean delayed arpeggio pluck
    const arpOrder = [0, 1, 2, 1, 0, 2, 1, 2];
    if (sixteenth % 2 === 0 && this.leadFilter && this.ctx) {
      const idx = arpOrder[(sixteenth / 2 + Math.floor(step / 16)) % arpOrder.length];
      const freq = chord[idx] * 2;
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);
      env.gain.setValueAtTime(0.001, time);
      env.gain.linearRampToValueAtTime(0.09, time + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0008, time + sixteenthDur * 3.2);
      osc.connect(env);
      env.connect(this.leadFilter); // Clean pluck into stereo tape delay!
      osc.start(time);
      osc.stop(time + sixteenthDur * 3.4);
    }
  }

  private scheduleDrums(
    sixteenth: number,
    time: number,
    intensity: number,
    isFillBar: boolean
  ): void {
    if (isFillBar && intensity >= 0.35) {
      // Bar-4 tom & snare fill leading into the next phrase
      this.scheduleSnare(time, 0.22 + (sixteenth - 12) * 0.04);
      if (sixteenth === 12 || sixteenth === 14) {
        this.scheduleKick(time, 0.32);
      }
      return;
    }

    // Kick drum pattern
    const isDownbeatKick = sixteenth === 0 || sixteenth === 8;
    const isSyncopatedKick =
      intensity >= 0.25 && (sixteenth === 3 || sixteenth === 6 || sixteenth === 10);
    const isDoubleKick =
      (intensity >= 0.78 || this.actionState.mode === 'BOSS') && sixteenth % 2 === 1 && sixteenth >= 11;

    if (isDownbeatKick || isSyncopatedKick || isDoubleKick) {
      const vel = isDownbeatKick ? 0.38 + intensity * 0.12 : 0.28 + intensity * 0.1;
      this.scheduleKick(time, vel);
    }

    // Snare drum backbeat on 4 & 12 (beats 2 and 4), plus ghost note on 15 in heavy combat
    if (sixteenth === 4 || sixteenth === 12) {
      this.scheduleSnare(time, 0.26 + intensity * 0.14);
    } else if (intensity >= 0.6 && sixteenth === 15) {
      this.scheduleSnare(time, 0.13);
    }

    // Hi-Hat / Ride pattern
    if (sixteenth % 2 === 0 || intensity >= 0.45) {
      const isAccent = sixteenth % 4 === 0;
      const isOpen = intensity >= 0.55 && (sixteenth === 2 || sixteenth === 10);
      const vel = isAccent ? 0.075 + intensity * 0.04 : 0.04 + intensity * 0.025;
      this.scheduleHiHat(time, vel, isOpen);
    }
  }

  private scheduleKick(time: number, velocity: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.drumBusGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(135, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.065);
    osc.frequency.exponentialRampToValueAtTime(31, time + 0.14);

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(velocity, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    osc.connect(gain);
    gain.connect(this.drumBusGain);
    osc.start(time);
    osc.stop(time + 0.16);
  }

  private scheduleSubDrop(time: number, rootFreq: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.drumBusGain) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(Math.max(48, rootFreq), time);
    osc.frequency.exponentialRampToValueAtTime(28, time + 0.38);

    gain.gain.setValueAtTime(0.32, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);

    osc.connect(gain);
    gain.connect(this.drumBusGain);
    osc.start(time);
    osc.stop(time + 0.42);
  }

  private scheduleSnare(time: number, velocity: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.drumBusGain || !this.snareBuffer) return;

    // Noise snap
    const noise = ctx.createBufferSource();
    noise.buffer = this.snareBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1850, time);
    filter.Q.setValueAtTime(0.75, time);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(velocity, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.drumBusGain);
    noise.start(time);
    noise.stop(time + 0.15);

    // Tonal drum body punch
    const bodyOsc = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(195, time);
    bodyOsc.frequency.exponentialRampToValueAtTime(110, time + 0.05);

    bodyGain.gain.setValueAtTime(velocity * 0.55, time);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(this.drumBusGain);
    bodyOsc.start(time);
    bodyOsc.stop(time + 0.08);
  }

  private scheduleHiHat(time: number, velocity: number, open: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.drumBusGain || !this.hiHatBuffer || !this.crashBuffer) return;

    const src = ctx.createBufferSource();
    src.buffer = open ? this.crashBuffer : this.hiHatBuffer;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(open ? 5800 : 7200, time);

    const gain = ctx.createGain();
    const dur = open ? 0.14 : 0.045;
    gain.gain.setValueAtTime(velocity, time);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + dur);

    src.connect(hp);
    hp.connect(gain);
    gain.connect(this.drumBusGain);
    src.start(time);
    src.stop(time + dur + 0.01);
  }

  private scheduleCrash(time: number, velocity: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.drumBusGain || !this.crashBuffer) return;

    const src = ctx.createBufferSource();
    src.buffer = this.crashBuffer;

    const bp = ctx.createBiquadFilter();
    bp.type = 'highpass';
    bp.frequency.setValueAtTime(4200, time);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(velocity, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.68);

    src.connect(bp);
    bp.connect(gain);
    gain.connect(this.drumBusGain);
    src.start(time);
    src.stop(time + 0.72);
  }

  private scheduleBass(
    sixteenth: number,
    chord: number[],
    time: number,
    sixteenthDur: number,
    intensity: number
  ): void {
    const root = chord[0] * 0.5;
    const fifth = chord[1] * 0.5;
    const octave = chord[0];

    if (intensity < 0.25) {
      // Deep atmospheric 8th-note pulse with connected sustain
      if (sixteenth % 4 === 0) {
        this.scheduleBassNote(root, time, sixteenthDur * 3.7, 0.28);
      } else if (sixteenth % 4 === 2) {
        this.scheduleBassNote(fifth, time, sixteenthDur * 1.8, 0.2);
      }
    } else {
      // Driving 8th/16th rock bassline locked with the kick drum
      if (sixteenth % 2 === 0) {
        const freq = sixteenth === 6 || sixteenth === 14 ? octave : root;
        this.scheduleBassNote(freq, time, sixteenthDur * 1.85, 0.3 + intensity * 0.08);
      } else if (intensity >= 0.65 && (sixteenth === 3 || sixteenth === 11 || sixteenth === 15)) {
        this.scheduleBassNote(fifth, time, sixteenthDur * 0.9, 0.24);
      }
    }
  }

  private scheduleBassNote(freq: number, time: number, duration: number, velocity: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.bassFilter) return;

    const osc = ctx.createOscillator();
    const subOsc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(freq, time);

    // Smooth attack & connected decay so bass notes never click or sound choppy
    env.gain.setValueAtTime(0.001, time);
    env.gain.linearRampToValueAtTime(velocity, time + 0.01);
    env.gain.setTargetAtTime(velocity * 0.65, time + 0.03, Math.max(0.04, duration * 0.45));
    env.gain.linearRampToValueAtTime(0.0008, time + duration);

    osc.connect(env);
    subOsc.connect(env);
    env.connect(this.bassFilter);

    osc.start(time);
    subOsc.start(time);
    osc.stop(time + duration + 0.02);
    subOsc.stop(time + duration + 0.02);
  }

  private schedulePowerChord(
    chord: number[],
    time: number,
    duration: number,
    hitType: number, // 1 = palm-mute chug, 2 = open power chord, 3 = accented power chord
    intensity: number
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.rhythmDrive) return;

    // For palm-muted chugs, play root + fifth tightly; for open chords, play full triad [root, fifth, octave]
    const notes = hitType === 1 ? [chord[0], chord[1]] : chord;
    const baseGain =
      hitType === 3
        ? 0.14 + intensity * 0.06
        : hitType === 2
          ? 0.11 + intensity * 0.05
          : 0.08 + intensity * 0.04;

    const chordGain = ctx.createGain();
    chordGain.gain.setValueAtTime(0.001, time);
    chordGain.gain.linearRampToValueAtTime(baseGain, time + 0.008);
    if (hitType === 1) {
      // Palm-mute tight thump envelope
      chordGain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    } else {
      // Sustained ringing power chord
      chordGain.gain.setValueAtTime(baseGain * 0.85, time + duration * 0.65);
      chordGain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    }
    chordGain.connect(this.rhythmDrive);

    for (let i = 0; i < notes.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      // Slight stereo/chorus detune across strings for thick, smooth guitar wall-of-sound
      const detuneCents = (i - 1) * 4.5;
      osc.frequency.setValueAtTime(notes[i], time);
      osc.detune.setValueAtTime(detuneCents, time);
      osc.connect(chordGain);
      osc.start(time);
      osc.stop(time + duration + 0.02);
    }
  }

  private scheduleLeadNote(
    phrase: PhraseNote[],
    sixteenth: number,
    chordRoot: number,
    time: number,
    sixteenthDur: number,
    intensity: number
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.leadDrive) return;

    const note = phrase[sixteenth];
    if (!note || note.degree === -1) {
      // Rest: gently release any active lead note
      if (this.activeLeadEnv && time >= this.activeLeadStopTime - 0.01) {
        this.activeLeadEnv.gain.setTargetAtTime(0.0001, time, 0.025);
      }
      return;
    }

    if (note.degree === -2) {
      // Sustain tie: keep the current lead oscillator ringing smoothly!
      return;
    }

    // Count how many tied steps follow this note so we know its full legato duration
    let tieSteps = 1;
    for (let i = sixteenth + 1; i < phrase.length; i++) {
      if (phrase[i].degree === -2) tieSteps++;
      else break;
    }
    const noteDuration = sixteenthDur * tieSteps * 1.05;

    // Anchor lead melody in the D4 (293.66 Hz) register, shifting subtly with harmonic tension
    const baseD4 = 293.66;
    const harmonicShift = Math.abs(chordRoot - 77.78) < 1 ? 1 : 0; // Follow Eb5 Phrygian half-step
    const targetFreq = baseD4 * Math.pow(2, (note.degree + harmonicShift) / 12);

    // If an active lead voice is still alive and this note is marked `slide`, glide frequency smoothly!
    if (
      note.slide &&
      this.activeLeadOsc &&
      this.activeLeadSubOsc &&
      this.activeLeadEnv &&
      time < this.activeLeadStopTime
    ) {
      this.activeLeadOsc.frequency.exponentialRampToValueAtTime(targetFreq, time + sixteenthDur * 0.45);
      this.activeLeadSubOsc.frequency.exponentialRampToValueAtTime(
        targetFreq * 0.5,
        time + sixteenthDur * 0.45
      );
      const boostVel = (note.accent ? 0.16 : 0.13) + intensity * 0.05;
      this.activeLeadEnv.gain.setTargetAtTime(boostVel, time, 0.015);
      this.activeLeadEnv.gain.setTargetAtTime(0.0008, time + noteDuration * 0.85, 0.04);
      this.activeLeadStopTime = Math.max(this.activeLeadStopTime, time + noteDuration + 0.15);
      return;
    }

    // Otherwise start a fresh dual-oscillator legato lead voice
    this.stopActiveLead(time);

    const osc = ctx.createOscillator();
    const subOsc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(targetFreq, time);
    osc.detune.setValueAtTime(5, time);

    subOsc.type = 'square';
    subOsc.frequency.setValueAtTime(targetFreq * 0.5, time);
    subOsc.detune.setValueAtTime(-5, time);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.35, time);

    // Expressive vibrato that swells in on sustained notes
    const vibOsc = ctx.createOscillator();
    const vibGain = ctx.createGain();
    vibOsc.type = 'sine';
    vibOsc.frequency.setValueAtTime(5.6, time);
    vibGain.gain.setValueAtTime(0.5, time);
    vibGain.gain.linearRampToValueAtTime(4.5 + intensity * 2.5, time + Math.min(0.22, noteDuration));
    vibOsc.connect(vibGain);
    vibGain.connect(osc.frequency);

    const peakVel = (note.accent ? 0.15 : 0.12) + intensity * 0.05;
    env.gain.setValueAtTime(0.001, time);
    env.gain.linearRampToValueAtTime(peakVel, time + 0.012);
    env.gain.setTargetAtTime(peakVel * 0.78, time + 0.04, Math.max(0.06, noteDuration * 0.5));
    env.gain.setTargetAtTime(0.0005, time + noteDuration * 0.9, 0.035);

    osc.connect(env);
    subOsc.connect(subGain);
    subGain.connect(env);
    env.connect(this.leadDrive);

    const stopAt = time + noteDuration + sixteenthDur * 2.5;
    osc.start(time);
    subOsc.start(time);
    vibOsc.start(time);
    osc.stop(stopAt);
    subOsc.stop(stopAt);
    vibOsc.stop(stopAt);

    this.activeLeadOsc = osc;
    this.activeLeadSubOsc = subOsc;
    this.activeLeadEnv = env;
    this.activeLeadStopTime = stopAt;
  }
}

export const rockMusic = new RockMusicEngine();
