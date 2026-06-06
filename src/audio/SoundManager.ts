/**
 * Procedural sound effects via Web Audio API.
 * No external files — all sounds are generated.
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Music
  private musicOscs: OscillatorNode[] = [];
  private musicGain: GainNode | null = null;
  private musicActive = false;

  // Engine sound
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineNoise: AudioBufferSourceNode | null = null;
  private engineGain: GainNode | null = null;
  private engineNoiseGain: GainNode | null = null;
  private engineActive = false;

  private init() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.3;
    this.masterGain.connect(this.ctx.destination);
  }

  /** Start engine loop — call once */
  startEngine() {
    this.init();
    if (this.engineActive) return;
    this.engineActive = true;
    const ctx = this.ctx!;

    // Low rumble oscillators
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineGain.connect(this.masterGain!);

    this.engineOsc1 = ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc1.frequency.value = 55;
    this.engineOsc1.connect(this.engineGain);
    this.engineOsc1.start();

    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'sawtooth';
    this.engineOsc2.frequency.value = 82;
    this.engineOsc2.connect(this.engineGain);
    this.engineOsc2.start();

    // Noise layer (hiss)
    this.engineNoiseGain = ctx.createGain();
    this.engineNoiseGain.gain.value = 0;
    this.engineNoiseGain.connect(this.masterGain!);
    this.startNoiseLoop();
  }

  private startNoiseLoop() {
    const ctx = this.ctx!;
    const bufSize = 4096;
    const noiseBuffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    src.connect(filter);
    filter.connect(this.engineNoiseGain!);
    src.start();
    this.engineNoise = src;
  }

  /** Update engine sound based on throttle (0..1) */
  updateEngine(throttle: number, boost: boolean) {
    if (!this.engineActive || !this.engineGain || !this.engineNoiseGain) return;
    const t = Math.max(0, Math.min(1, throttle));

    // Oscillator gain — louder with throttle
    this.engineGain.gain.value = t * 0.024 + (boost ? 0.08 : 0);

    // Noise gain
    this.engineNoiseGain.gain.value = t * 0.008 + (boost ? 0.06 : 0);

    // Pitch shift with throttle
    if (this.engineOsc1) this.engineOsc1.frequency.value = 55 + t * 80 + (boost ? 40 : 0);
    if (this.engineOsc2) this.engineOsc2.frequency.value = 82 + t * 60 + (boost ? 30 : 0);
  }

  stopEngine() {
    if (!this.engineActive) return;
    this.engineActive = false;
    this.engineOsc1?.stop();
    this.engineOsc2?.stop();
    this.engineNoise?.stop();
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineNoise = null;
    this.engineGain = null;
    this.engineNoiseGain = null;
  }

  /** Laser whistle — high sweep, stretched */
  playLaser() {
    this.init();
    const ctx = this.ctx!;
    const dur = 0.35;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc2.type = 'sine';
    // High whistle sweep
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + dur);
    // Harmonic for richness
    osc2.frequency.setValueAtTime(1200, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(250, ctx.currentTime + dur);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.setValueAtTime(0.06, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(ctx.currentTime);
    osc2.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur);
    osc2.stop(ctx.currentTime + dur);
  }

  /** Explosion boom */
  playExplosion() {
    this.init();
    const ctx = this.ctx!;
    const duration = 1.2;
    const bufSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      const t = i / bufSize;
      // Noise with slow decay + low-frequency thump
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 3) * 0.8
              + Math.sin(t * 50 * Math.PI) * Math.exp(-t * 5) * 0.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(1.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.8);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);
    src.start(ctx.currentTime);
  }

  /** Space ambient — unique preset per star system */
  startMusic(systemIndex: number = 0) {
    this.stopMusic();
    this.init();
    this.musicActive = true;
    const ctx = this.ctx!;

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.06;
    this.musicGain.connect(this.masterGain!);

    const oscs: OscillatorNode[] = [];
    let filter: BiquadFilterNode | null = null;

    const preset = systemIndex % 5;

    if (preset === 0) {
      // 🌌 Deep Space — низкие дроны, медленный фильтр
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 200;
      filter.Q.value = 1;
      filter.connect(this.musicGain);
      const lfo = ctx.createOscillator();
      lfo.type = 'sine'; lfo.frequency.value = 0.04;
      const lfoG = ctx.createGain(); lfoG.gain.value = 150;
      lfo.connect(lfoG); lfoG.connect(filter.frequency);
      lfo.start(); oscs.push(lfo);
      for (const f of [41.2, 55, 65.4]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        o.connect(filter); o.start(); oscs.push(o);
      }
    } else if (preset === 1) {
      // ✨ Bright Nebula — высокие частоты, переливы
      filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 800;
      filter.Q.value = 0.5;
      filter.connect(this.musicGain);
      const lfo = ctx.createOscillator();
      lfo.type = 'triangle'; lfo.frequency.value = 0.08;
      const lfoG = ctx.createGain(); lfoG.gain.value = 400;
      lfo.connect(lfoG); lfoG.connect(filter.frequency);
      lfo.start(); oscs.push(lfo);
      const lfo2 = ctx.createOscillator();
      lfo2.type = 'sine'; lfo2.frequency.value = 0.12;
      const lfo2G = ctx.createGain(); lfo2G.gain.value = 3;
      lfo2.start(); oscs.push(lfo2);
      for (const f of [196, 246.9, 293.7, 329.6]) {
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
        lfo2.connect(lfo2G); lfo2G.connect(o.frequency);
        o.connect(filter); o.start(); oscs.push(o);
      }
    } else if (preset === 2) {
      // 🌑 Dark System — минор, напряжение, низкий пульс
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      filter.Q.value = 3;
      filter.connect(this.musicGain);
      const lfo = ctx.createOscillator();
      lfo.type = 'sawtooth'; lfo.frequency.value = 0.06;
      const lfoG = ctx.createGain(); lfoG.gain.value = 200;
      lfo.connect(lfoG); lfoG.connect(filter.frequency);
      lfo.start(); oscs.push(lfo);
      // Pulse LFO for tension
      const pulseLfo = ctx.createOscillator();
      pulseLfo.type = 'square'; pulseLfo.frequency.value = 1.5;
      const pulseG = ctx.createGain(); pulseG.gain.value = 0.02;
      pulseLfo.connect(pulseG); pulseG.connect(this.musicGain.gain);
      pulseLfo.start(); oscs.push(pulseLfo);
      for (const f of [58.3, 73.4, 87.3]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
        o.connect(filter); o.start(); oscs.push(o);
      }
    } else if (preset === 3) {
      // 🏭 Industrial — ритмичный, металлический
      this.musicGain.gain.value = 0.04;
      filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 120;
      filter.Q.value = 0.7;
      filter.connect(this.musicGain);
      const lfo = ctx.createOscillator();
      lfo.type = 'square'; lfo.frequency.value = 0.15;
      const lfoG = ctx.createGain(); lfoG.gain.value = 300;
      lfo.connect(lfoG); lfoG.connect(filter.frequency);
      lfo.start(); oscs.push(lfo);
      // Rhythmic pulse on gain
      const rhyLfo = ctx.createOscillator();
      rhyLfo.type = 'square'; rhyLfo.frequency.value = 2.0;
      const rhyG = ctx.createGain(); rhyG.gain.value = 0.015;
      rhyLfo.connect(rhyG); rhyG.connect(this.musicGain.gain);
      rhyLfo.start(); oscs.push(rhyLfo);
      for (const f of [110, 138.6, 164.8, 220]) {
        const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
        o.connect(filter); o.start(); oscs.push(o);
      }
    } else {
      // 🌫️ Ethereal — воздушный, широкий, реверберация
      this.musicGain.gain.value = 0.05;
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600;
      filter.Q.value = 0.3;
      filter.connect(this.musicGain);
      const lfo = ctx.createOscillator();
      lfo.type = 'sine'; lfo.frequency.value = 0.03;
      const lfoG = ctx.createGain(); lfoG.gain.value = 250;
      lfo.connect(lfoG); lfoG.connect(filter.frequency);
      lfo.start(); oscs.push(lfo);
      // Slow pan/fade LFO
      const fadeLfo = ctx.createOscillator();
      fadeLfo.type = 'sine'; fadeLfo.frequency.value = 0.06;
      const fadeG = ctx.createGain(); fadeG.gain.value = 0.015;
      fadeLfo.connect(fadeG); fadeG.connect(this.musicGain.gain);
      fadeLfo.start(); oscs.push(fadeLfo);
      for (const f of [130.8, 164.8, 196, 261.6, 329.6]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        o.connect(filter); o.start(); oscs.push(o);
      }
    }

    this.musicOscs = oscs;
  }

  setMusicIntensity(intensity: number) {
    if (this.musicGain) {
      this.musicGain.gain.value = 0.04 + intensity * 0.04;
    }
  }

  toggleMusic() {
    if (this.musicActive) {
      this.stopMusic();
    } else {
      this.startMusic(0);
    }
  }

  stopMusic() {
    this.musicOscs.forEach(o => o.stop());
    this.musicOscs = [];
    this.musicGain = null;
    this.musicActive = false;
  }

  /** Resume audio context (must be called from user gesture) */
  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }
}

/** Global singleton for easy access */
export const soundManager = new SoundManager();
