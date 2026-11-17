// TAMAYURA's sound: a pocket WebAudio synth. Every effect is an oscillator or a
// puff of filtered noise shaped by an envelope — no audio files, nothing to
// load, so the game stays fully offline. The context is created lazily on the
// first user gesture (browsers refuse it earlier) and every call is guarded,
// so audio can never break the game.

const MASTER = 0.42;

export function makeAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;
  let shootFlip = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER;
      master.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 0.5);
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  /** One oscillator blip with an exponential decay envelope. */
  function tone({ type = 'sine', from = 440, to = from, at = 0, dur = 0.12, vol = 0.2 }) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(30, from), t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** One burst of band-passed noise. */
  function noise({ at = 0, dur = 0.15, vol = 0.2, freq = 1200, q = 0.8 }) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0, Math.random() * 0.3);
    src.stop(t0 + dur + 0.02);
  }

  return {
    unlock: ensure,
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.01);
      return muted;
    },
    shoot(phase) {
      shootFlip = !shootFlip;
      const base = [660, 520, 590][phase] * (shootFlip ? 1 : 1.06);
      tone({ type: 'square', from: base, to: base * 0.45, dur: 0.07, vol: 0.055 });
    },
    wrongHit() {
      tone({ type: 'triangle', from: 190, to: 120, dur: 0.06, vol: 0.1 });
      noise({ dur: 0.05, vol: 0.05, freq: 2400, q: 1.4 });
    },
    kill() {
      noise({ dur: 0.16, vol: 0.16, freq: 900, q: 0.6 });
      tone({ type: 'sine', from: 320, to: 58, dur: 0.18, vol: 0.16 });
    },
    hurt() {
      tone({ type: 'sawtooth', from: 240, to: 46, dur: 0.3, vol: 0.2 });
      noise({ dur: 0.22, vol: 0.14, freq: 500, q: 0.7 });
    },
    nova() {
      tone({ type: 'sine', from: 180, to: 1250, dur: 0.42, vol: 0.2 });
      tone({ type: 'triangle', from: 90, to: 700, dur: 0.42, vol: 0.12 });
      noise({ dur: 0.45, vol: 0.12, freq: 1600, q: 0.5 });
    },
    pickup() {
      tone({ type: 'sine', from: 880, to: 1318, dur: 0.09, vol: 0.1 });
    },
    switchPhase() {
      tone({ type: 'sine', from: 740, to: 990, dur: 0.05, vol: 0.06 });
    },
    wave() {
      tone({ type: 'sine', from: 523, to: 523, dur: 0.12, vol: 0.12 });
      tone({ type: 'sine', from: 784, to: 784, at: 0.1, dur: 0.18, vol: 0.12 });
    },
    start() {
      tone({ type: 'sine', from: 392, to: 392, dur: 0.1, vol: 0.1 });
      tone({ type: 'sine', from: 587, to: 587, at: 0.08, dur: 0.16, vol: 0.1 });
    },
    over() {
      tone({ type: 'triangle', from: 392, to: 392, dur: 0.22, vol: 0.14 });
      tone({ type: 'triangle', from: 311, to: 311, at: 0.2, dur: 0.22, vol: 0.14 });
      tone({ type: 'triangle', from: 233, to: 220, at: 0.4, dur: 0.42, vol: 0.14 });
    },
  };
}
