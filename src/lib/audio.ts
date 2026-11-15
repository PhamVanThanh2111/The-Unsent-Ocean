"use client";

/**
 * The Unsent Ocean — Balanced Procedural Web Audio API Soundscape & SFX Engine
 * - Warm, soothing Night Ocean Waves (Rolling Swell + Shore Wash Foam)
 * - 432Hz Meditative Abyssal Drone + Nocturnal Felt Piano Notes
 * - Smooth Volume Slider Control (0.0 -> 1.0) + Mute/Unmute Toggle
 */

class OceanAudioController {
  private ctx: AudioContext | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  private isPlayingAmbient = false;
  private isMuted = true;
  private userVolume = 0.5; // Default 50% comfortable volume
  private ambientNodes: AudioNode[] = [];
  private pianoTimer: ReturnType<typeof setTimeout> | null = null;

  // 432Hz-tuned A minor 9 / F major 7 contemplative scale frequencies
  private readonly PIANO_FREQS_432 = [
    216.0, // A3
    256.87, // C4
    288.33, // D4
    323.63, // E4
    342.88, // F4
    384.87, // G4
    432.0, // A4
    484.9, // B4
    513.74, // C5
    647.27, // E5
  ];

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;

      this.ctx = new AudioCtx();

      // Gentle Limiter/Compressor to keep audio smooth and never harsh
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -20;
      this.compressor.knee.value = 18;
      this.compressor.ratio.value = 2.5;
      this.compressor.attack.value = 0.02;
      this.compressor.release.value = 0.25;
      this.compressor.connect(this.ctx.destination);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.computeMasterGainValue(this.userVolume);
      this.masterGain.connect(this.compressor);

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = 0.0001;
      this.ambientGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.45;
      this.sfxGain.connect(this.masterGain);
    }

    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  private computeMasterGainValue(vol0to1: number): number {
    const clamped = Math.max(0, Math.min(1, vol0to1));
    // Smooth logarithmic-like perceptual curve, max 0.75 so even 100% is gentle on ears
    return Math.pow(clamped, 1.35) * 0.75;
  }

  /**
   * Creates a balanced 10-second stereo pink/brown noise buffer for ocean waves
   */
  private createOceanNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const duration = 10;
    const sampleRate = ctx.sampleRate;
    const bufferSize = duration * sampleRate;
    const buffer = ctx.createBuffer(2, bufferSize, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const output = buffer.getChannelData(channel);
      let b0 = 0,
        b1 = 0,
        b2 = 0,
        b3 = 0,
        b4 = 0,
        b5 = 0,
        b6 = 0;

      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        b6 = white * 0.115926;

        const fadeSamples = sampleRate * 0.35;
        let env = 1;
        if (i < fadeSamples) {
          env = i / fadeSamples;
        } else if (i > bufferSize - fadeSamples) {
          env = (bufferSize - i) / fadeSamples;
        }

        // Balanced amplitude (0.095: audible yet soft and relaxing)
        const sample = pink * 0.095 * env;
        output[i] = Math.max(-0.8, Math.min(0.8, sample));
      }
    }

    return buffer;
  }

  /**
   * Sets user volume (0.0 to 1.0). If > 0 while muted, automatically starts ambient audio.
   */
  public setVolume(volume0to1: number): boolean {
    const clamped = Math.max(0, Math.min(1, volume0to1));
    this.userVolume = clamped;

    const ctx = this.ensureContext();
    if (ctx && this.masterGain) {
      const now = ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(
        this.computeMasterGainValue(clamped),
        now,
        0.04
      );
    }

    if (clamped <= 0.005) {
      this.stopAmbient();
      return false;
    } else if (this.isMuted) {
      this.startAmbient();
      return true;
    }

    return !this.isMuted;
  }

  public getVolume(): number {
    return this.userVolume;
  }

  /**
   * Starts the ambient soundscape (Night Ocean Waves + 432Hz Drone + Sparse Lo-Fi Piano)
   */
  public startAmbient(): boolean {
    const ctx = this.ensureContext();
    if (!ctx || !this.ambientGain || !this.masterGain) return false;

    if (this.userVolume <= 0.02) {
      this.userVolume = 0.5;
    }

    this.isMuted = false;

    if (!this.isPlayingAmbient) {
      this.setupAmbientGraph(ctx);
      this.isPlayingAmbient = true;
      this.scheduleNextPianoNote();
    }

    const now = ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(
      this.computeMasterGainValue(this.userVolume),
      now,
      0.05
    );

    this.ambientGain.gain.cancelScheduledValues(now);
    this.ambientGain.gain.setValueAtTime(
      Math.max(this.ambientGain.gain.value, 0.005),
      now
    );
    this.ambientGain.gain.exponentialRampToValueAtTime(0.55, now + 1.1);

    return true;
  }

  /**
   * Mutes/pauses the ambient soundscape smoothly
   */
  public stopAmbient(): void {
    this.isMuted = true;
    if (this.pianoTimer) {
      clearTimeout(this.pianoTimer);
      this.pianoTimer = null;
    }

    if (!this.ctx || !this.ambientGain) return;
    const now = this.ctx.currentTime;
    this.ambientGain.gain.cancelScheduledValues(now);
    this.ambientGain.gain.setValueAtTime(
      Math.max(this.ambientGain.gain.value, 0.001),
      now
    );
    this.ambientGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
  }

  /**
   * Toggles ambient sound on/off and returns the new playing state
   */
  public toggleAmbient(): boolean {
    if (this.isMuted) {
      this.startAmbient();
      return true;
    } else {
      this.stopAmbient();
      return false;
    }
  }

  public getIsPlaying(): boolean {
    return !this.isMuted;
  }

  private setupAmbientGraph(ctx: AudioContext): void {
    if (!this.ambientGain) return;

    const noiseBuffer = this.createOceanNoiseBuffer(ctx);

    // 1. Primary Rolling Ocean Wave Swell
    const deepNoise = ctx.createBufferSource();
    deepNoise.buffer = noiseBuffer;
    deepNoise.loop = true;

    const deepFilter = ctx.createBiquadFilter();
    deepFilter.type = "lowpass";
    deepFilter.frequency.value = 420;
    deepFilter.Q.value = 0.95;

    const deepWaveGain = ctx.createGain();
    deepWaveGain.gain.value = 0.45;

    const waveLfo = ctx.createOscillator();
    waveLfo.type = "sine";
    waveLfo.frequency.value = 0.1;

    const waveFilterMod = ctx.createGain();
    waveFilterMod.gain.value = 260; // Sweeps 160Hz -> 680Hz gently

    const waveAmpMod = ctx.createGain();
    waveAmpMod.gain.value = 0.22;

    waveLfo.connect(waveFilterMod);
    waveFilterMod.connect(deepFilter.frequency);

    waveLfo.connect(waveAmpMod);
    waveAmpMod.connect(deepWaveGain.gain);

    deepNoise.connect(deepFilter);
    deepFilter.connect(deepWaveGain);
    deepWaveGain.connect(this.ambientGain);

    // 2. Shore Wash / Surf Shimmer
    const surfNoise = ctx.createBufferSource();
    surfNoise.buffer = noiseBuffer;
    surfNoise.loop = true;

    const surfFilter = ctx.createBiquadFilter();
    surfFilter.type = "bandpass";
    surfFilter.frequency.value = 950;
    surfFilter.Q.value = 0.7;

    const surfGain = ctx.createGain();
    surfGain.gain.value = 0.18;

    const surfLfo = ctx.createOscillator();
    surfLfo.type = "sine";
    surfLfo.frequency.value = 0.13;

    const surfFreqMod = ctx.createGain();
    surfFreqMod.gain.value = 350;

    const surfAmpMod = ctx.createGain();
    surfAmpMod.gain.value = 0.11;

    surfLfo.connect(surfFreqMod);
    surfFreqMod.connect(surfFilter.frequency);

    surfLfo.connect(surfAmpMod);
    surfAmpMod.connect(surfGain.gain);

    surfNoise.connect(surfFilter);
    surfFilter.connect(surfGain);
    surfGain.connect(this.ambientGain);

    // 3. 432Hz Meditative Warm Drone
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 480;

    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.05;

    const droneFreqs = [108, 216, 324, 432];
    const droneOscs: OscillatorNode[] = [];

    droneFreqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx % 2 === 0 ? "sine" : "triangle";
      osc.frequency.value = freq;
      osc.detune.value = (idx - 1.5) * 4;

      const oscGain = ctx.createGain();
      oscGain.gain.value = idx === 0 ? 0.4 : idx === 1 ? 0.35 : 0.15;

      osc.connect(oscGain);
      oscGain.connect(droneFilter);
      osc.start();
      droneOscs.push(osc);
    });

    droneFilter.connect(droneGain);
    droneGain.connect(this.ambientGain);

    deepNoise.start();
    surfNoise.start(ctx.currentTime + 1.2);
    waveLfo.start();
    surfLfo.start();

    this.ambientNodes.push(
      deepNoise,
      surfNoise,
      waveLfo,
      surfLfo,
      ...droneOscs
    );
  }

  /**
   * Schedules sparse, contemplative midnight piano notes over the ocean waves
   */
  private scheduleNextPianoNote(): void {
    if (this.isMuted) return;

    const delayMs = 4200 + Math.random() * 4500;
    this.pianoTimer = setTimeout(() => {
      if (this.isMuted || !this.ctx || !this.ambientGain) return;
      this.playSoftPianoNote();
      this.scheduleNextPianoNote();
    }, delayMs);
  }

  private playSoftPianoNote(): void {
    if (!this.ctx || !this.ambientGain || this.isMuted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const freq =
      this.PIANO_FREQS_432[
        Math.floor(Math.random() * this.PIANO_FREQS_432.length)
      ];

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = "sine";
    osc2.type = "triangle";
    osc1.frequency.setValueAtTime(freq, now);
    osc2.frequency.setValueAtTime(freq * 2, now);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1150, now);
    filter.frequency.exponentialRampToValueAtTime(280, now + 3.8);

    const noteGain = ctx.createGain();
    noteGain.gain.setValueAtTime(0.0001, now);
    noteGain.gain.linearRampToValueAtTime(0.065, now + 0.05);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + 4.5);

    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.15;

    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.46;
    const delayFeedback = ctx.createGain();
    delayFeedback.gain.value = 0.32;
    const delayFilter = ctx.createBiquadFilter();
    delayFilter.type = "lowpass";
    delayFilter.frequency.value = 680;

    osc1.connect(filter);
    osc2.connect(osc2Gain);
    osc2Gain.connect(filter);

    filter.connect(noteGain);
    noteGain.connect(this.ambientGain);

    noteGain.connect(delay);
    delay.connect(delayFilter);
    delayFilter.connect(delayFeedback);
    delayFeedback.connect(delay);
    delayFilter.connect(this.ambientGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 4.8);
    osc2.stop(now + 4.8);
  }

  /**
   * SFX 1: Cork "Pop" + Glass Clink when clicking a floating bottle
   */
  public playCorkPop(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    const popOsc = ctx.createOscillator();
    popOsc.type = "sine";
    popOsc.frequency.setValueAtTime(140, now);
    popOsc.frequency.exponentialRampToValueAtTime(580, now + 0.055);
    popOsc.frequency.exponentialRampToValueAtTime(190, now + 0.12);

    const popGain = ctx.createGain();
    popGain.gain.setValueAtTime(0.001, now);
    popGain.gain.linearRampToValueAtTime(0.28, now + 0.015);
    popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    popOsc.connect(popGain);
    popGain.connect(this.sfxGain);

    popOsc.start(now);
    popOsc.stop(now + 0.15);

    const glassOsc = ctx.createOscillator();
    glassOsc.type = "sine";
    glassOsc.frequency.setValueAtTime(1480, now + 0.03);
    glassOsc.frequency.exponentialRampToValueAtTime(1420, now + 0.36);

    const glassGain = ctx.createGain();
    glassGain.gain.setValueAtTime(0.0001, now + 0.03);
    glassGain.gain.linearRampToValueAtTime(0.075, now + 0.045);
    glassGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

    glassOsc.connect(glassGain);
    glassGain.connect(this.sfxGain);

    glassOsc.start(now + 0.03);
    glassOsc.stop(now + 0.4);
  }

  /**
   * SFX 2: Water "Splash" + Bubbles when casting a sealed bottle into the ocean
   */
  public playSplash(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    const duration = 0.95;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const splashBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = splashBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = splashBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(950, now);
    filter.frequency.exponentialRampToValueAtTime(240, now + duration);
    filter.Q.value = 1.5;

    const splashGain = ctx.createGain();
    splashGain.gain.setValueAtTime(0.001, now);
    splashGain.gain.linearRampToValueAtTime(0.32, now + 0.05);
    splashGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(splashGain);
    splashGain.connect(this.sfxGain);

    noise.start(now);
    noise.stop(now + duration);

    const dropletFreqs = [680, 960, 1240, 820];
    dropletFreqs.forEach((baseFreq, i) => {
      const start = now + 0.13 + i * 0.08;
      const dropOsc = ctx.createOscillator();
      dropOsc.type = "sine";
      dropOsc.frequency.setValueAtTime(baseFreq, start);
      dropOsc.frequency.exponentialRampToValueAtTime(
        baseFreq * 1.65,
        start + 0.09
      );

      const dropGain = ctx.createGain();
      dropGain.gain.setValueAtTime(0.001, start);
      dropGain.gain.linearRampToValueAtTime(0.1, start + 0.015);
      dropGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);

      dropOsc.connect(dropGain);
      dropGain.connect(this.sfxGain!);

      dropOsc.start(start);
      dropOsc.stop(start + 0.12);
    });
  }

  /**
   * SFX 3: Crystalline Wind Chime ("Chime") when lighting a candle for a message
   */
  public playCandleChime(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    const chimeNotes = [528.0, 660.0, 792.0, 1056.0, 1320.0];

    chimeNotes.forEach((freq, idx) => {
      const start = now + idx * 0.055;
      const decay = 2.5 + (chimeNotes.length - idx) * 0.35;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);

      const chimeGain = ctx.createGain();
      const peak = 0.13 / (1 + idx * 0.35);
      chimeGain.gain.setValueAtTime(0.0001, start);
      chimeGain.gain.linearRampToValueAtTime(peak, start + 0.02);
      chimeGain.gain.exponentialRampToValueAtTime(0.0001, start + decay);

      osc.connect(chimeGain);
      chimeGain.connect(this.sfxGain!);

      osc.start(start);
      osc.stop(start + decay + 0.05);
    });
  }
}

export const oceanAudio = new OceanAudioController();
export default oceanAudio;
