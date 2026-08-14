/**
 * CIRCLE SURVIVAL - HIGH-IMPACT PROCEDURAL WEB AUDIO SYNTHESIZER
 * Sub-bass punch, dynamic noise bursts, randomized pitch crunch, and melodic chimes.
 */

class SurvivalAudio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.isMuted = false;
    this.volume = 0.75;
    this.initialized = false;
    this.noiseBuffer = null;
  }

  init() {
    if (this.initialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      // Create 1-second white noise buffer for crisp explosion crunches
      const bufferSize = this.ctx.sampleRate * 1.0;
      this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      this.initialized = true;
    } catch (e) {
      console.warn("SurvivalAudio init failed:", e);
    }
  }

  resume() {
    if (!this.initialized) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playFireBlast() {
    if (!this.initialized || this.isMuted) return;
    this.resume();
    const t = this.ctx.currentTime;

    // 1. Roaring Low Flame Sub
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sawtooth';
    subOsc.frequency.setValueAtTime(200, t);
    subOsc.frequency.exponentialRampToValueAtTime(32, t + 0.5);

    subGain.gain.setValueAtTime(0.6, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);

    subOsc.connect(subGain);
    subGain.connect(this.sfxGain);
    subOsc.start(t);
    subOsc.stop(t + 0.56);

    // 2. High Noise Rush
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(600, t);
      noiseFilter.frequency.exponentialRampToValueAtTime(120, t + 0.4);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.4, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.sfxGain);
      noise.start(t);
      noise.stop(t + 0.45);
    }
  }

  playBlastReady() {
    if (!this.initialized || this.isMuted) return;
    this.resume();
    const t = this.ctx.currentTime;
    [440, 659.25, 880].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const st = t + idx * 0.04;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, st);
      gain.gain.setValueAtTime(0.2, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.18);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(st);
      osc.stop(st + 0.2);
    });
  }

  playDashReady() {
    if (!this.initialized || this.isMuted) return;
    this.resume();
    const t = this.ctx.currentTime;
    [783.99, 1318.51].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const st = t + idx * 0.04;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, st);
      gain.gain.setValueAtTime(0.2, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.18);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(st);
      osc.stop(st + 0.2);
    });
  }

  playDash() {
    if (!this.initialized || this.isMuted) return;
    this.resume();
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(700, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.16);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.17);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  playGraze() {
    if (!this.initialized || this.isMuted) return;
    this.resume();
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1174.66, t); // D6
    osc.frequency.exponentialRampToValueAtTime(1760.0, t + 0.05);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  playCollect() {
    if (!this.initialized || this.isMuted) return;
    this.resume();
    const t = this.ctx.currentTime;
    [587.33, 739.99, 880.0].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const st = t + idx * 0.04;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, st);
      gain.gain.setValueAtTime(0.2, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.16);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(st);
      osc.stop(st + 0.18);
    });
  }

  /**
   * Rising orb pitch. `step` is 1..total within the current charge cycle, and
   * the pitch climbs a major scale so the tenth pickup lands an octave up -
   * the ear tracks the charge without needing to read the counter.
   */
  playOrbPitch(step, total) {
    if (!this.initialized || this.isMuted) return;
    this.resume();
    const t = this.ctx.currentTime;

    // Major scale degrees in semitones, then the octave on the last step.
    const scale = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];
    const idx = Math.min(scale.length - 1, Math.max(0, step - 1));
    const root = 523.25; // C5
    const freq = root * Math.pow(2, scale[idx] / 12);
    // Tension: the closer to full, the brighter and longer the note.
    const pct = step / total;

    [1, 2].forEach((mult, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const st = t + i * 0.012;
      osc.type = i === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq * mult, st);
      gain.gain.setValueAtTime(0.22 * (i === 0 ? 1 : 0.35 + pct * 0.4), st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.14 + pct * 0.12);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(st);
      osc.stop(st + 0.30);
    });
  }

  /** The release when the charge completes: a bright major chord swell. */
  playStormRelease() {
    if (!this.initialized || this.isMuted) return;
    this.resume();
    const t = this.ctx.currentTime;

    // C major triad, two octaves, rung out long.
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const st = t + idx * 0.03;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, st);
      gain.gain.setValueAtTime(0.0001, st);
      gain.gain.exponentialRampToValueAtTime(0.30, st + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 1.4);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(st);
      osc.stop(st + 1.5);
    });

    // Sub drop underneath so the release has weight, not just sparkle.
    const sub = this.ctx.createOscillator();
    const sg = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(160, t);
    sub.frequency.exponentialRampToValueAtTime(40, t + 0.9);
    sg.gain.setValueAtTime(0.5, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    sub.connect(sg);
    sg.connect(this.sfxGain);
    sub.start(t);
    sub.stop(t + 1.05);
  }

  /**
   * One chain hop. Pitch climbs across the chain so a 20-hop storm is an
   * audible ascending run rather than twenty identical zaps.
   */
  playChainHop(index, total) {
    if (!this.initialized || this.isMuted) return;
    this.resume();
    const t = this.ctx.currentTime;
    const pct = total > 1 ? index / (total - 1) : 1;

    // Crack: fast noise burst through a rising bandpass.
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.setValueAtTime(6, t);
      filter.frequency.setValueAtTime(900 + pct * 4200, t);
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.30, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.sfxGain);
      noise.start(t);
      noise.stop(t + 0.18);
    }

    // Tone climbing a pentatonic run.
    const penta = [0, 3, 5, 7, 10];
    const semi = penta[index % penta.length] + 12 * Math.floor(index / penta.length);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(392 * Math.pow(2, semi / 12), t);
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  playExplosion(isMajor = false) {
    if (!this.initialized || this.isMuted) return;
    this.resume();
    const t = this.ctx.currentTime;

    // Pitch randomization for game juice
    const pitchMod = 0.85 + Math.random() * 0.3;
    const startFreq = (isMajor ? 160 : 130) * pitchMod;
    const duration = isMajor ? 0.5 : 0.35;

    // Sub Boom
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(25, t + duration);

    gain.gain.setValueAtTime(isMajor ? 0.65 : 0.45, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration + 0.05);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + duration + 0.06);

    // Noise crackle crunch
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200 * pitchMod, t);
      filter.frequency.exponentialRampToValueAtTime(80, t + 0.25);

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(isMajor ? 0.4 : 0.25, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.sfxGain);
      noise.start(t);
      noise.stop(t + 0.3);
    }
  }
}

window.survivalAudio = new SurvivalAudio();
