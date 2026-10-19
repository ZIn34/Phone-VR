'use strict';

// Beat blocks: red and blue blocks fly at you in time with the music. Hit
// each one as it reaches its frame in front of you: at Level 1 tap RED for a
// red block and BLUE for a blue one; with a hand, touch it with your
// fingertip. Right on the beat is Perfect. Misses drain your energy; run out
// and the song stops. Reach the end for a grade.
//
// The rules are here with no drawing in them, so tests/beats.test.js can run
// them. Places are in metres: y up, -z ahead; your eyes are at 1.6.
(function (root) {
  const inNode = typeof module !== 'undefined' && module.exports;

  const rules = {
    eye: [0, 1.6, 0],
    bpm: 112,
    beats: 128,          // the length of the song
    hitAt: -1.8,         // how far ahead the frames are, where blocks are hit
    speed: 7,            // metres a second the blocks fly
    perfect: 0.07,       // seconds either side of the beat for a Perfect
    good: 0.16,          // and for a Good; later than this is a miss
    size: 0.4,
  };
  // Where the four frames are: two for red on the left, two for blue on the right.
  const SLOTS = [[-0.85, 1.3], [-0.32, 1.9], [0.32, 1.9], [0.85, 1.3]];
  const RED = [1.0, 0.18, 0.32], BLUE = [0.15, 0.55, 1.0];

  function randomFrom(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const audio = () => (!inNode && root.PVR && root.PVR.audio) || null;
  const sound = (name) => { const a = audio(); if (a) a.play(name); };

  function createBeats(seed) {
    let random = randomFrom(seed);
    const secondsPerBeat = 60 / rules.bpm;
    const game = {
      eye: rules.eye,
      look: { sky: [0.05, 0.01, 0.1], haze: [9, 24] },
      buttons: { left: 'RED', right: 'BLUE', colours: { left: '#e8325a', right: '#2f7ff5' } },
      score: 0, over: false, overFor: 0, overTitle: '', overLine: 'Score',
      notes: [], shards: [], words: [],
      combo: 0, best: 0, hits: 0, perfects: 0, energy: 0.7,
      beat: -4,          // where the song is, in beats (counting in before it starts)
      flash: [0, 0, 0, 0],
    };
    let paused = false;

    // The song's blocks: one on most beats, more often as it goes on, never two
    // in the same frame too close together.
    function chart() {
      const notes = [];
      let lastSlot = -1;
      for (let half = 16; half < (rules.beats - 8) * 2; half++) {
        const beat = half / 2;
        const busy = beat > 64 ? 0.55 : 0.4;
        const on = half % 2 === 0 ? random() < 0.75 : random() < busy * (beat > 32 ? 0.6 : 0);
        if (!on) continue;
        let slot = Math.floor(random() * 4);
        if (slot === lastSlot) slot = (slot + 1 + Math.floor(random() * 3)) % 4;
        lastSlot = slot;
        notes.push({ beat, slot, red: slot < 2, hit: false, missed: false });
      }
      return notes;
    }

    game.restart = function () {
      random = randomFrom(seed++);
      Object.assign(game, { score: 0, over: false, overFor: 0, overTitle: '', shards: [], words: [], combo: 0, best: 0, hits: 0, perfects: 0, energy: 0.7, beat: -4, flash: [0, 0, 0, 0] });
      game.notes = chart();
      paused = false;
      const a = audio();
      if (a) a.startSong(rules.bpm, seed, game.beat);
    };

    // The menu opened or closed: the music stops, and carries on from the same beat.
    game.pause = function (on) {
      if (on === paused) return;
      paused = on;
      const a = audio();
      if (!a) return;
      if (on) a.stopSong(); else if (!game.over) a.startSong(rules.bpm, seed, game.beat);
    };

    game.multiplier = () => Math.min(4, 1 + Math.floor(game.combo / 8));
    // Where a block is now: on its way in, reaching its frame on its beat.
    game.place = function (note) {
      const [x, y] = SLOTS[note.slot];
      return [x, y, rules.hitAt - (note.beat - game.beat) * secondsPerBeat * rules.speed];
    };

    function hit(note, early) {
      note.hit = true;
      const perfect = Math.abs(early) <= rules.perfect;
      game.combo++;
      game.best = Math.max(game.best, game.combo);
      game.hits++;
      if (perfect) game.perfects++;
      game.score += (perfect ? 100 : 60) * game.multiplier();
      game.energy = Math.min(1, game.energy + 0.03);
      game.flash[note.slot] = 1;
      const at = game.place(note);
      at[2] = rules.hitAt;
      for (let i = 0; i < 10; i++) {
        const d = [random() - 0.5, random() - 0.3, -random() * 0.6];
        game.shards.push({ at: at.slice(), going: d.map((v) => v * 6), life: 0.5, colour: note.red ? RED : BLUE });
      }
      game.words.push({ text: perfect ? 'PERFECT' : 'GOOD', at, life: 0.6, colour: perfect ? '#ffe066' : '#9df' });
      sound(perfect ? 'perfect' : 'hit');
    }

    function miss(note) {
      note.missed = true;
      game.combo = 0;
      game.energy -= 0.14;
      const at = game.place(note);
      at[2] = rules.hitAt;
      game.words.push({ text: 'MISS', at, life: 0.6, colour: '#aab' });
      sound('miss');
      if (game.energy <= 0) finish(false);
    }

    function finish(done) {
      if (game.over) return;
      game.over = true;
      game.overFor = 0;
      const a = audio();
      if (a) a.stopSong();
      const total = game.notes.length || 1;
      const share = game.hits / total;
      const grade = share >= 0.95 ? 'S' : share >= 0.85 ? 'A' : share >= 0.7 ? 'B' : 'C';
      game.overTitle = done ? 'Song complete!  Grade ' + grade : 'Out of energy';
      game.overColour = done ? '#3dffb0' : '#ff4d6d';
      sound(done ? 'start' : 'lose');
    }

    // How far off the beat a block is, in seconds: minus is early.
    const off = (note) => (game.beat - note.beat) * secondsPerBeat;

    // input.taps.left / right: RED or BLUE tapped. input.hands: [{ dir }] fingertips.
    game.update = function (dt, input) {
      for (const shard of game.shards) {
        shard.life -= dt;
        shard.going[1] -= 9 * dt;
        for (let i = 0; i < 3; i++) shard.at[i] += shard.going[i] * dt;
      }
      game.shards = game.shards.filter((shard) => shard.life > 0);
      for (const word of game.words) { word.life -= dt; word.at[1] += dt * 0.5; }
      game.words = game.words.filter((word) => word.life > 0);
      game.flash = game.flash.map((f) => Math.max(0, f - dt * 4));
      if (game.over) return;

      // The music's own clock when it is playing, so the blocks keep time with it.
      const a = audio();
      const heard = a ? a.songTime() : null;
      game.beat = heard !== null ? heard : game.beat + dt / secondsPerBeat;

      const open = game.notes.filter((note) => !note.hit && !note.missed && Math.abs(off(note)) <= rules.good);
      // A tap goes to the earliest block still waiting, as in any rhythm game.
      const nearest = (list) => list.reduce((best, note) => (!best || note.beat < best.beat ? note : best), null);
      if (input.taps.left) { const note = nearest(open.filter((n) => n.red)); if (note) hit(note, off(note)); }
      if (input.taps.right) { const note = nearest(open.filter((n) => !n.red)); if (note) hit(note, off(note)); }
      for (const hand of input.hands || []) {
        if (!hand.dir) continue;
        for (const note of open) {
          if (note.hit) continue;
          const p = game.place(note);
          const to = [p[0] - rules.eye[0], p[1] - rules.eye[1], p[2] - rules.eye[2]];
          const far = Math.hypot(to[0], to[1], to[2]);
          const angle = Math.acos(Math.max(-1, Math.min(1, (to[0] * hand.dir[0] + to[1] * hand.dir[1] + to[2] * hand.dir[2]) / far)));
          if (angle < Math.atan(rules.size * 0.8 / far) + 0.06) hit(note, off(note));
        }
      }
      for (const note of game.notes) if (!note.hit && !note.missed && off(note) > rules.good) miss(note);
      if (game.notes.length && game.beat > game.notes[game.notes.length - 1].beat + 3) finish(true);
    };

    game.boxes = function () {
      const boxes = [];
      const box = (c, w, h, d, colour) => boxes.push({ low: [c[0] - w / 2, c[1] - h / 2, c[2] - d / 2], high: [c[0] + w / 2, c[1] + h / 2, c[2] + d / 2], colour });
      const pulse = 1 - (((game.beat % 1) + 1) % 1);  // 1 on each beat, fading
      // A dark floor, rails running away from you, and bars that pass on every beat.
      boxes.push({ low: [-14, -0.1, -40], high: [14, 0, 3], colour: [0.07, 0.03, 0.14] });
      for (const [x, c] of [[-1.3, [0.1, 0.9, 1]], [1.3, [1, 0.2, 0.8]]]) box([x, 0.04, -12], 0.06, 0.06, 24, c);
      const toward = secondsPerBeat * rules.speed;
      for (let k = Math.ceil(game.beat); k < game.beat + 8; k++) {
        const z = rules.hitAt - (k - game.beat) * toward;
        box([0, 0.03, z], 2.6, 0.03, 0.05, [0.35, 0.2, 0.7]);
      }
      // Pillars either side that jump with the beat, changing colour every bar.
      const hue = Math.floor(game.beat / 4) % 3;
      const tint = [[1, 0.3, 0.6], [0.3, 0.8, 1], [0.7, 0.4, 1]][(hue + 3) % 3];
      for (let i = 0; i < 6; i++) {
        const z = -3 - i * 4;
        const h = 1.6 + 1.4 * pulse * (i % 2 ? 0.7 : 1);
        for (const x of [-2.8, 2.8]) boxes.push({ low: [x - 0.18, 0, z - 0.18], high: [x + 0.18, h, z + 0.18], colour: tint.map((v) => v * (0.5 + 0.5 * pulse)) });
      }
      // The blocks coming in.
      for (const note of game.notes) {
        if (note.hit || note.missed) continue;
        const p = game.place(note);
        if (p[2] < -22 || p[2] > 1) continue;
        const colour = note.red ? RED : BLUE;
        const near = Math.max(0, 1 - Math.abs(off(note)) / 0.4);
        box(p, rules.size, rules.size, rules.size, colour.map((v) => Math.min(1, v + 0.25 * near)));
        box([p[0], p[1], p[2] + rules.size / 2 + 0.01], 0.13, 0.13, 0.02, [1, 1, 1]);
      }
      for (const shard of game.shards) box(shard.at, 0.1, 0.1, 0.1, shard.colour);
      return boxes;
    };

    game.paint = function (ctx, screen) {
      const { width, height, project, text } = screen;
      // The frames where blocks are hit, lighting up when one is.
      SLOTS.forEach(([x, y], i) => {
        const half = rules.size * 0.62;
        const corners = [[x - half, y - half], [x + half, y - half], [x + half, y + half], [x - half, y + half]].map(([cx, cy]) => project([cx, cy, rules.hitAt]));
        if (corners.some((c) => !c)) return;
        ctx.beginPath();
        corners.forEach((c, k) => (k ? ctx.lineTo(c[0], c[1]) : ctx.moveTo(c[0], c[1])));
        ctx.closePath();
        const colour = i < 2 ? '255, 60, 100' : '60, 140, 255';
        ctx.fillStyle = `rgba(${colour}, ${0.12 + 0.5 * game.flash[i]})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(${colour}, ${0.7 + 0.3 * game.flash[i]})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      });
      for (const word of game.words) {
        const p = project(word.at);
        if (p) text(ctx, word.text, p[0], p[1] - 30, 24, word.colour);
      }
      if (game.over) return;
      text(ctx, String(game.score), 28, 40, 34, '#fff', 'left');
      text(ctx, 'Best ' + screen.best, 30, 72, 16, '#cdb8ff', 'left');
      if (game.combo >= 4) text(ctx, 'Combo ' + game.combo + (game.multiplier() > 1 ? '   x' + game.multiplier() : ''), width / 2, 70, 22, '#ffe066');
      // Energy, top middle.
      const w = 220;
      ctx.fillStyle = 'rgba(0, 0, 0, .5)';
      ctx.fillRect(width / 2 - w / 2 - 3, 24, w + 6, 16);
      ctx.fillStyle = game.energy > 0.35 ? '#3dffb0' : '#ff4d6d';
      ctx.fillRect(width / 2 - w / 2, 27, w * Math.max(0, game.energy), 10);
      if (game.beat < 6) {
        const how = screen.handsOn ? 'Touch each block with your fingertip as it reaches its frame' : 'Tap RED for red blocks and BLUE for blue ones as they reach their frames';
        text(ctx, how, width / 2, height * 0.93, 17);
        if (game.beat < 0) text(ctx, String(Math.ceil(-game.beat)), width / 2, height * 0.42, 60, '#fff');
      }
    };

    return game;
  }

  const api = { createBeats, rules, SLOTS };
  if (inNode) {
    module.exports = api;
  } else {
    root.PVR = root.PVR || {};
    root.PVR.beats = api;
    root.PVR.arcadeGames = root.PVR.arcadeGames || {};
    root.PVR.arcadeGames['beat-blocks'] = { title: 'Beat blocks', create: createBeats };
  }
})(typeof window !== 'undefined' ? window : globalThis);
