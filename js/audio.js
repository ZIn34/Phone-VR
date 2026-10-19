'use strict';

// Sound for the games, made in the page: no sound files. Phones only let a
// page make sound after a tap, so unlock() is called from the Start button.
// If sound cannot be made, everything here quietly does nothing.
window.PVR = window.PVR || {};

(function (PVR) {
  let ctx = null;
  let master = null;
  let noise = null;      // a second of hiss, for swishes, splats and drums
  let song = null;       // the music playing, if any

  function unlock() {
    try {
      if (!ctx) {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return;
        ctx = new Context();
        master = ctx.createGain();
        master.gain.value = 0.55;
        master.connect(ctx.destination);
        noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
      // A moment of silence, which is what some phones need to wake sound up.
      const wake = ctx.createBufferSource();
      wake.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      wake.connect(master);
      wake.start(0);
    } catch (err) {
      ctx = null;
    }
  }

  const ready = () => ctx && ctx.state === 'running';

  // A tone that fades: shape is an oscillator type; from and to are pitches in Hz.
  function tone(at, length, from, to, shape, loud) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = shape || 'sine';
    o.frequency.setValueAtTime(from, at);
    if (to !== from) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + length);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(loud, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + length);
    o.connect(g).connect(master);
    o.start(at);
    o.stop(at + length + 0.02);
  }

  // A burst of hiss through a filter that sweeps from one pitch to another.
  function hiss(at, length, from, to, loud, kind) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = kind || 'bandpass';
    f.frequency.setValueAtTime(from, at);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + length);
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(loud, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + length);
    s.connect(f).connect(g).connect(master);
    s.start(at, Math.random() * 0.5);
    s.stop(at + length + 0.02);
  }

  const SOUNDS = {
    slice: (t) => hiss(t, 0.18, 800, 6000, 0.5),
    splat: (t) => { hiss(t, 0.22, 900, 200, 0.6, 'lowpass'); tone(t, 0.12, 300, 90, 'sine', 0.35); },
    boom: (t) => { hiss(t, 0.9, 2000, 60, 0.9, 'lowpass'); tone(t, 0.7, 120, 30, 'sine', 0.8); },
    hit: (t) => { tone(t, 0.09, 1200, 600, 'triangle', 0.35); hiss(t, 0.06, 4000, 8000, 0.2, 'highpass'); },
    perfect: (t) => { tone(t, 0.12, 1320, 1320, 'triangle', 0.3); tone(t + 0.05, 0.16, 1760, 1760, 'triangle', 0.28); },
    miss: (t) => tone(t, 0.18, 160, 90, 'sawtooth', 0.18),
    laser: (t) => tone(t, 0.16, 1800, 200, 'square', 0.12),
    ring: (t) => { tone(t, 0.25, 880, 880, 'sine', 0.3); tone(t + 0.08, 0.35, 1320, 1320, 'sine', 0.3); },
    crash: (t) => { hiss(t, 0.5, 1500, 100, 0.8, 'lowpass'); tone(t, 0.3, 90, 40, 'square', 0.25); },
    break: (t) => { hiss(t, 0.25, 3000, 400, 0.5); tone(t, 0.1, 200, 80, 'square', 0.15); },
    lose: (t) => { tone(t, 0.25, 440, 440, 'triangle', 0.3); tone(t + 0.22, 0.25, 349, 349, 'triangle', 0.3); tone(t + 0.44, 0.6, 262, 200, 'triangle', 0.3); },
    start: (t) => { tone(t, 0.12, 523, 523, 'triangle', 0.3); tone(t + 0.1, 0.12, 659, 659, 'triangle', 0.3); tone(t + 0.2, 0.25, 784, 784, 'triangle', 0.3); },
  };

  function play(name) {
    if (!ready() || !SOUNDS[name]) return;
    SOUNDS[name](ctx.currentTime + 0.005);
  }

  // Music for Beat Blocks: a beat, a bass line and a tune over four chords,
  // played at `bpm`, starting `from` beats in (to carry on after a pause). The
  // clock it keeps is songTime(), in beats from the start, so the blocks can be
  // timed to it exactly.
  const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // A minor, F, C, G
  const pitch = (note) => 440 * Math.pow(2, (note - 69) / 12);

  function startSong(bpm, seed, from) {
    from = from || 0;
    stopSong();
    const beat = 60 / bpm;
    let r = seed >>> 0;
    const random = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
    const tune = [];
    for (let i = 0; i < 32; i++) tune.push(random() < 0.55 ? Math.floor(random() * 3) : -1);
    const startAt = (ready() ? ctx.currentTime : performance.now() / 1000) + 0.1 - from * beat;
    song = { bpm, beat, startAt, next: Math.max(0, Math.ceil(from * 2)), timer: 0, audio: ready() };
    if (!song.audio) return;
    const ahead = () => {
      // Every half beat that falls in the next fifth of a second.
      while (song && song.startAt + song.next * beat / 2 < ctx.currentTime + 0.2) {
        const half = song.next++;
        const t = song.startAt + half * beat / 2;
        const bar = Math.floor(half / 8);
        const chord = CHORDS[bar % 4];
        if (half % 2 === 0) {
          tone(t, 0.18, 150, 45, 'sine', 0.9);                       // kick
          tone(t, beat * 0.9, pitch(chord[0] - 24), pitch(chord[0] - 24), 'triangle', 0.32); // bass
        } else {
          hiss(t, 0.05, 7000, 9000, 0.18, 'highpass');                 // hat
        }
        if (half % 8 === 4) hiss(t, 0.16, 1800, 900, 0.35);              // clap on beats 2 and 4
        const step = tune[half % 32];
        if (step >= 0 && bar >= 2) tone(t, beat * 0.45, pitch(chord[step] + 12), pitch(chord[step] + 12), 'square', 0.07);
      }
    };
    ahead();
    song.timer = setInterval(ahead, 40);
  }

  function stopSong() {
    if (song && song.timer) clearInterval(song.timer);
    song = null;
  }

  // Beats since the song started (negative just before), or null if none is playing.
  function songTime() {
    if (!song) return null;
    const now = song.audio && ctx ? ctx.currentTime : performance.now() / 1000;
    return (now - song.startAt) / song.beat;
  }

  PVR.audio = { unlock, play, startSong, stopSong, songTime };
})(window.PVR);
