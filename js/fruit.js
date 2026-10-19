'use strict';

// Fruit slice: fruit is tossed up in front of you; slice it before it falls.
// With a hand, swipe your fingertip through it. At Level 1, hold SLICE and
// sweep the cross through it by turning the phone. Three fruit dropped and the
// game is over; slice a bomb and it is over at once. Several fruit in one
// swipe is a combo, worth extra.
//
// The rules are here with no drawing in them, so tests/fruit.test.js can run
// them. Places are in metres: y up, -z ahead. You stand on a floor whose top
// is at y = 1, so your eyes are at 2.6.
(function (root) {
  const inNode = typeof module !== 'undefined' && module.exports;

  const KINDS = {
    melon: { size: 0.5, skin: [0.22, 0.62, 0.22], inside: [0.95, 0.25, 0.32], extra: 'stripes' },
    orange: { size: 0.32, skin: [1.0, 0.56, 0.1], inside: [1.0, 0.78, 0.35] },
    apple: { size: 0.3, skin: [0.86, 0.1, 0.13], inside: [1.0, 0.95, 0.78], extra: 'stem' },
    lemon: { size: 0.28, skin: [1.0, 0.9, 0.18], inside: [1.0, 1.0, 0.62] },
    plum: { size: 0.27, skin: [0.48, 0.16, 0.62], inside: [0.98, 0.72, 0.32], extra: 'stem' },
    bomb: { size: 0.38, skin: [0.13, 0.13, 0.16], inside: [1.0, 0.5, 0.1], bomb: true },
  };
  const FRUIT = ['melon', 'orange', 'apple', 'lemon', 'plum'];

  const rules = {
    eye: [0, 2.6, 0],
    gravity: 7,          // metres a second each second: floaty, so there is time
    lives: 3,
    from: 1.0,           // fruit is thrown up from this height, and missed once it falls back below it
    swipe: 1.6,          // radians a second the blade must sweep to cut
    combo: 0.3,          // seconds: cuts closer together than this in one swipe are a combo
  };

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
  const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  function createFruit(seed) {
    let random = randomFrom(seed);
    const game = {
      eye: rules.eye,
      look: { sky: [0.98, 0.64, 0.46], haze: [16, 34] },
      buttons: { left: 'SLICE', right: 'SLICE' },
      score: 0, lives: rules.lives, over: false, overFor: 0,
      overTitle: 'Game over', overLine: 'Fruit sliced',
      fruit: [],       // { kind, at, going, cut: false }
      pieces: [],      // halves and juice: { at, going, size, colour, life }
      words: [],       // pop-up words: { text, at, life, colour }
      trails: [],      // recent blade directions, for drawing the swipe: { blade, dir, time }
      flash: 0,
      time: 0,
    };
    let nextWave = 1.2;
    const blades = {};   // blade name -> { dir, comboCount, comboTime }

    game.restart = function () {
      random = randomFrom(seed++);
      Object.assign(game, { score: 0, lives: rules.lives, over: false, overFor: 0, fruit: [], pieces: [], words: [], trails: [], flash: 0, time: 0, overTitle: 'Game over' });
      nextWave = 1.2;
      for (const k in blades) delete blades[k];
    };

    // Throws one thing up so that it peaks in front of you.
    game.toss = function (kind, across, peak, far) {
      const from = [across + (random() - 0.5) * 1.2, rules.from - 0.3, -far];
      const up = Math.sqrt(2 * rules.gravity * (peak - from[1]));
      const flight = 2 * up / rules.gravity;
      const to = across * 0.4 + (random() - 0.5) * 0.8;
      const thing = { kind, at: from, going: [(to - from[0]) / flight, up, 0], cut: false, spin: random() * 6 };
      game.fruit.push(thing);
      return thing;
    };

    function wave() {
      const many = 1 + Math.floor(random() * Math.min(4, 1 + game.score / 6));
      for (let i = 0; i < many; i++) {
        const bomb = game.score >= 4 && random() < 0.13;
        game.toss(bomb ? 'bomb' : FRUIT[Math.floor(random() * FRUIT.length)], (random() - 0.5) * 3.4, 3.4 + random() * 1.1, 2.8 + random() * 1.0);
      }
      nextWave = Math.max(0.85, 2.3 - game.score * 0.03) * (0.8 + random() * 0.4);
    }

    // Cuts what a blade swept through since the last frame: from the way it
    // pointed then to the way it points now, both seen from your eyes.
    function sweep(name, dir, dt) {
      const blade = blades[name] || (blades[name] = { dir: null, comboCount: 0, comboTime: -9 });
      const before = blade.dir;
      blade.dir = dir;
      if (!dir) return;
      game.trails.push({ blade: name, dir, time: game.time });
      if (!before || dt <= 0) return;
      const turn = Math.acos(Math.max(-1, Math.min(1, dot(before, dir))));
      if (turn / dt < rules.swipe) return;
      for (const thing of game.fruit) {
        if (thing.cut) continue;
        const to = [thing.at[0] - rules.eye[0], thing.at[1] - rules.eye[1], thing.at[2] - rules.eye[2]];
        const far = Math.hypot(to[0], to[1], to[2]);
        const toward = unit(to);
        const reach = Math.atan(KINDS[thing.kind].size * 0.75 / far) + 0.03;
        let closest = Math.PI;
        for (let i = 0; i <= 8; i++) {
          const t = i / 8;
          const on = unit([before[0] + (dir[0] - before[0]) * t, before[1] + (dir[1] - before[1]) * t, before[2] + (dir[2] - before[2]) * t]);
          closest = Math.min(closest, Math.acos(Math.max(-1, Math.min(1, dot(on, toward)))));
        }
        if (closest < reach) cut(thing, blade, [dir[0] - before[0], dir[1] - before[1], dir[2] - before[2]]);
      }
    }

    function cut(thing, blade, motion) {
      thing.cut = true;
      const kind = KINDS[thing.kind];
      if (kind.bomb) {
        game.flash = 1;
        for (let i = 0; i < 24; i++) spray(thing.at, [1, 0.4 + random() * 0.5, 0.05], 0.12 + random() * 0.12, 6);
        end('Boom!');
        sound('boom');
        return;
      }
      // Two halves flying apart across the cut, and a spray of juice.
      const apart = unit([-motion[1], motion[0], 0.0001]);
      for (const side of [-1, 1]) {
        game.pieces.push({
          at: thing.at.slice(), size: kind.size, half: true, skin: kind.skin, inside: kind.inside, side,
          going: [thing.going[0] + apart[0] * 1.6 * side, thing.going[1] * 0.4 + apart[1] * 1.6 * side + 1, thing.going[2]], life: 2.2,
        });
      }
      for (let i = 0; i < 10; i++) spray(thing.at, kind.inside, 0.05 + random() * 0.05, 3.5);
      game.score++;
      sound('slice');
      sound('splat');
      if (game.time - blade.comboTime < rules.combo) blade.comboCount++; else blade.comboCount = 1;
      blade.comboTime = game.time;
      if (blade.comboCount >= 3) {
        game.score++;
        game.words.push({ text: blade.comboCount + ' fruit combo! +' + (blade.comboCount - 2), at: thing.at.slice(), life: 1.2, colour: '#ffd166' });
      }
    }

    function spray(at, colour, size, speed) {
      const d = unit([random() - 0.5, random() - 0.2, random() - 0.5]);
      game.pieces.push({ at: at.slice(), size, colour, going: d.map((v) => v * speed * (0.4 + random() * 0.6)), life: 0.6 + random() * 0.5 });
    }

    function end(title) {
      if (game.over) return;
      game.over = true;
      game.overFor = 0;
      if (title) game.overTitle = title;
      if (!title) sound('lose');
    }

    function sound(name) {
      if (!inNode && root.PVR && root.PVR.audio) root.PVR.audio.play(name);
    }

    // input.hands: [{ dir }] fingertips as directions from your eyes. input.look:
    // the direction of the cross. input.held.left / right: SLICE held.
    game.update = function (dt, input) {
      game.time += dt;
      game.flash = Math.max(0, game.flash - dt * 2);
      for (const piece of game.pieces) {
        piece.life -= dt;
        piece.going[1] -= rules.gravity * dt;
        for (let i = 0; i < 3; i++) piece.at[i] += piece.going[i] * dt;
      }
      game.pieces = game.pieces.filter((piece) => piece.life > 0 && piece.at[1] > -1);
      for (const word of game.words) { word.life -= dt; word.at[1] += dt * 0.6; }
      game.words = game.words.filter((word) => word.life > 0);
      game.trails = game.trails.filter((trail) => game.time - trail.time < 0.16);
      if (game.over) return;

      nextWave -= dt;
      if (nextWave <= 0) wave();
      for (const thing of game.fruit) {
        thing.going[1] -= rules.gravity * dt;
        for (let i = 0; i < 3; i++) thing.at[i] += thing.going[i] * dt;
      }
      // Blades: each fingertip, or the cross while SLICE is held.
      if (input.handsOn) {
        input.hands.forEach((hand, i) => sweep('hand' + i, hand.dir, dt));
        for (let i = input.hands.length; i < 2; i++) sweep('hand' + i, null, dt);
      } else {
        sweep('cross', input.held.left || input.held.right ? input.look : null, dt);
      }
      // Fruit that fell back down unsliced is dropped.
      for (const thing of game.fruit) {
        if (!thing.cut && thing.going[1] < 0 && thing.at[1] < rules.from - 0.4) {
          thing.cut = true;
          if (!KINDS[thing.kind].bomb) {
            game.lives--;
            game.words.push({ text: 'Dropped!', at: [thing.at[0], rules.from + 0.6, thing.at[2]], life: 1, colour: '#ff6b6b' });
            sound('miss');
            if (game.lives <= 0) end(null);
          }
        }
      }
      game.fruit = game.fruit.filter((thing) => !thing.cut);
    };

    // What to draw: whole fruit, halves, juice.
    game.boxes = function (time) {
      const boxes = [];
      const box = (c, w, h, d, colour) => boxes.push({ low: [c[0] - w / 2, c[1] - h / 2, c[2] - d / 2], high: [c[0] + w / 2, c[1] + h / 2, c[2] + d / 2], colour });
      for (const thing of game.fruit) {
        const kind = KINDS[thing.kind];
        const s = kind.size;
        const wobble = 0.04 * s * Math.sin(time * 9 + thing.spin);
        box(thing.at, s + wobble, s - wobble, s, kind.skin);
        if (kind.extra === 'stripes') {
          for (const dx of [-0.25, 0.25]) box([thing.at[0] + dx * s, thing.at[1], thing.at[2]], s * 0.12, s * 1.02, s * 1.02, [0.1, 0.36, 0.12]);
        }
        if (kind.extra === 'stem') {
          box([thing.at[0], thing.at[1] + s * 0.6, thing.at[2]], s * 0.1, s * 0.25, s * 0.1, [0.4, 0.25, 0.1]);
          box([thing.at[0] + s * 0.15, thing.at[1] + s * 0.62, thing.at[2]], s * 0.25, s * 0.08, s * 0.15, [0.3, 0.75, 0.2]);
        }
        if (kind.bomb) {
          box([thing.at[0], thing.at[1] + s * 0.6, thing.at[2]], s * 0.12, s * 0.3, s * 0.12, [0.5, 0.42, 0.3]);
          const spark = Math.sin(time * 30) > 0 ? [1, 0.9, 0.3] : [1, 0.25, 0.1];
          box([thing.at[0], thing.at[1] + s * 0.8, thing.at[2]], s * 0.16, s * 0.16, s * 0.16, spark);
          box([thing.at[0], thing.at[1], thing.at[2] + s * 0.5], s * 0.5, s * 0.12, s * 0.04, [0.8, 0.1, 0.1]);
        }
      }
      for (const piece of game.pieces) {
        if (piece.half) {
          // A half: skin on the outside, the inside showing where it was cut.
          const s = piece.size;
          const c = piece.at;
          box([c[0] + piece.side * s * 0.2, c[1], c[2]], s * 0.4, s, s, piece.skin);
          box([c[0] - piece.side * s * 0.02, c[1], c[2]], s * 0.06, s * 0.9, s * 0.9, piece.inside);
        } else {
          box(piece.at, piece.size, piece.size, piece.size, piece.colour);
        }
      }
      return boxes;
    };

    // Words and effects on top of the picture.
    game.paint = function (ctx, screen) {
      const { width, height, project, text } = screen;
      // The swipe: a bright streak along where each blade has just been.
      const byBlade = {};
      for (const trail of game.trails) (byBlade[trail.blade] = byBlade[trail.blade] || []).push(trail);
      ctx.lineCap = 'round';
      for (const name in byBlade) {
        const points = byBlade[name].map((trail) => project([rules.eye[0] + trail.dir[0] * 3, rules.eye[1] + trail.dir[1] * 3, rules.eye[2] + trail.dir[2] * 3])).filter(Boolean);
        for (let i = 1; i < points.length; i++) {
          const t = i / points.length;
          ctx.beginPath();
          ctx.moveTo(points[i - 1][0], points[i - 1][1]);
          ctx.lineTo(points[i][0], points[i][1]);
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.25 + 0.7 * t})`;
          ctx.lineWidth = 2 + 10 * t;
          ctx.stroke();
        }
      }
      for (const word of game.words) {
        const p = project(word.at);
        if (p) text(ctx, word.text, p[0], p[1], 26, word.colour);
      }
      if (game.flash > 0) {
        ctx.fillStyle = `rgba(255, 240, 200, ${game.flash})`;
        ctx.fillRect(0, 0, width, height);
      }
      if (game.over) return;
      // Score top left, lives top right as three fruit.
      text(ctx, String(game.score), 28, 40, 40, '#fff', 'left');
      text(ctx, 'Best ' + screen.best, 30, 76, 16, '#ffe9d6', 'left');
      for (let i = 0; i < rules.lives; i++) {
        const x = width - 40 - i * 40;
        ctx.fillStyle = i < game.lives ? '#ff4d6d' : 'rgba(0, 0, 0, .35)';
        ctx.fillRect(x - 13, 26, 26, 26);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 13, 26, 26, 26);
      }
      const how = screen.handsOn ? 'Swipe your fingertip through the fruit. Not the bombs!' : 'Hold SLICE and sweep the cross through the fruit. Not the bombs!';
      if (game.time < 6) text(ctx, how, width / 2, height * 0.93, 17);
      if (!screen.handsOn) {
        // The cross, which is the blade at Level 1.
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(width / 2 - 14, height / 2); ctx.lineTo(width / 2 + 14, height / 2);
        ctx.moveTo(width / 2, height / 2 - 14); ctx.lineTo(width / 2, height / 2 + 14);
        ctx.stroke();
      }
    };

    // The dojo round you, in Simulation: a wooden floor, posts and lamps.
    game.scenery = function (place) {
      const { PLANKS, WOOD, LAMP, BRICK, STONE } = (inNode ? require('./blocks.js') : root.PVR.blocks).kinds;
      for (let x = -9; x <= 9; x++) for (let z = -12; z <= 6; z++) place(x, 0, z, (x + z) % 2 ? PLANKS : WOOD);
      for (let x = -9; x <= 9; x++) for (let y = 1; y <= 5; y++) place(x, y, -13, y === 5 ? WOOD : (x % 4 === 0 ? WOOD : PLANKS));
      for (const x of [-10, 10]) for (let z = -13; z <= 6; z++) for (let y = 1; y <= 5; y++) place(x, y, z, z % 4 === 0 || y === 5 ? WOOD : BRICK);
      for (const [x, z] of [[-9, -12], [9, -12], [-9, 5], [9, 5]]) { place(x, 1, z, STONE); place(x, 2, z, LAMP); }
      for (let x = -3; x <= 3; x++) place(x, 4, -12, LAMP);
    };

    return game;
  }

  const api = { createFruit, rules, KINDS };
  if (inNode) {
    module.exports = api;
  } else {
    root.PVR = root.PVR || {};
    root.PVR.fruit = api;
    root.PVR.arcadeGames = root.PVR.arcadeGames || {};
    root.PVR.arcadeGames['fruit-slice'] = { title: 'Fruit slice', create: createFruit };
  }
})(typeof window !== 'undefined' ? window : globalThis);
