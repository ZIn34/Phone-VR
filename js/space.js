'use strict';

// Space run: fly on through space, faster and faster. Look where you want to
// go and the ship drifts that way. Dodge the asteroids, fly through the gold
// rings, and blast rocks out of the way: FIRE at Level 1, or pinch with a
// hand to fire where your fingertip points. Three knocks and the ship is done.
//
// The rules are here with no drawing in them, so tests/space.test.js can run
// them. Places are in metres: y up, -z ahead. The ship stays at z = 0 and
// everything else comes towards it.
(function (root) {
  const inNode = typeof module !== 'undefined' && module.exports;

  const rules = {
    shields: 3,
    across: 7,          // how far the ship can go either side
    low: 1, high: 11,   // and how low and high
    start: 14,          // metres a second at the start
    fastest: 36,
    faster: 0.35,       // metres a second more, each second
    appear: -55,        // how far ahead new things appear
    ringSize: 1.7,
    ringScore: 50,
    rockScore: 20,
    reload: 0.22,       // seconds between shots
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
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sound = (name) => { if (!inNode && root.PVR && root.PVR.audio) root.PVR.audio.play(name); };

  function createSpace(seed) {
    let random = randomFrom(seed);
    const game = {
      eye: [0, 6, 0],
      look: { sky: [0.01, 0.01, 0.05], haze: [32, 58] },
      buttons: { left: 'FIRE', right: 'FIRE' },
      score: 0, over: false, overFor: 0, overTitle: 'Ship down', overLine: 'Score',
      speed: rules.start, shields: rules.shields, travelled: 0, time: 0,
      rocks: [], rings: [], bits: [], beams: [], words: [], dust: [], stars: [],
      hurt: 0, safe: 0, streak: 0,
    };
    let untilRock = 0, untilRing = 30, reload = 0;

    game.restart = function () {
      random = randomFrom(seed++);
      Object.assign(game, {
        eye: [0, 6, 0], score: 0, over: false, overFor: 0, speed: rules.start, shields: rules.shields, travelled: 0, time: 0,
        rocks: [], rings: [], bits: [], beams: [], words: [], hurt: 0, safe: 0, streak: 0,
      });
      untilRock = 25; untilRing = 40; reload = 0;
      game.dust = [];
      for (let i = 0; i < 46; i++) game.dust.push([(random() - 0.5) * 16, (random() - 0.5) * 12, -random() * 34]);
      game.stars = [];
      for (let i = 0; i < 110; i++) {
        const a = random() * Math.PI * 2, b = Math.asin(random() * 2 - 1);
        game.stars.push({ dir: [Math.cos(b) * Math.sin(a), Math.sin(b), -Math.cos(b) * Math.cos(a)], size: 0.12 + random() * 0.18, warm: random() < 0.3 });
      }
    };

    // An asteroid: a lump of blocks. aim: put it in the ship's way.
    game.addRock = function (at, size) {
      const parts = [];
      const lumps = 3 + Math.floor(random() * 4);
      const grey = 0.32 + random() * 0.2;
      for (let i = 0; i < lumps; i++) {
        const s = size * (0.45 + random() * 0.55);
        const shade = grey * (0.8 + random() * 0.4);
        parts.push({ off: [(random() - 0.5) * size * 0.8, (random() - 0.5) * size * 0.8, (random() - 0.5) * size * 0.8], size: s, colour: [shade * 1.1, shade * 0.95, shade * 0.85] });
      }
      const rock = { at: at.slice(), size, parts, hp: size > 2.2 ? 2 : 1, spin: random() * 6 };
      game.rocks.push(rock);
      return rock;
    };

    game.addRing = function (at) {
      const ring = { at: at.slice(), passed: false, glow: 0 };
      game.rings.push(ring);
      return ring;
    };

    function spawn() {
      const many = 1 + Math.floor(random() * Math.min(4, 1 + game.time / 25));
      for (let i = 0; i < many; i++) {
        const aimed = random() < 0.4;
        const x = aimed ? game.eye[0] + (random() - 0.5) * 3 : (random() * 2 - 1) * (rules.across + 1);
        const y = aimed ? game.eye[1] + (random() - 0.5) * 3 : rules.low + random() * (rules.high - rules.low);
        game.addRock([x, y, rules.appear - random() * 4], 1.2 + random() * 2);
      }
      untilRock = 14 + random() * 14;
    }

    function burst(at, colour, count, speed) {
      for (let i = 0; i < count; i++) {
        const d = [random() - 0.5, random() - 0.5, random() - 0.5];
        const l = Math.hypot(d[0], d[1], d[2]) || 1;
        game.bits.push({ at: at.slice(), going: d.map((v) => v / l * speed * (0.5 + random() * 0.5)), size: 0.15 + random() * 0.3, colour, life: 0.7 + random() * 0.4 });
      }
    }

    function breakRock(rock) {
      rock.gone = true;
      burst(rock.at, rock.parts[0].colour, 14, 7);
      burst(rock.at, [1, 0.6, 0.2], 6, 9);
    }

    // Fires along a direction from the ship; hits the nearest rock in the way.
    game.fire = function (dir) {
      if (reload > 0 || game.over) return null;
      reload = rules.reload;
      sound('laser');
      let best = null, bestT = 80;
      for (const rock of game.rocks) {
        if (rock.gone) continue;
        const to = [rock.at[0] - game.eye[0], rock.at[1] - game.eye[1], rock.at[2] - game.eye[2]];
        const t = to[0] * dir[0] + to[1] * dir[1] + to[2] * dir[2];
        if (t <= 0) continue;
        const miss = Math.hypot(to[0] - dir[0] * t, to[1] - dir[1] * t, to[2] - dir[2] * t);
        if (miss < rock.size * 0.65 + 0.3 && t < bestT) { best = rock; bestT = t; }
      }
      const to = [game.eye[0] + dir[0] * bestT, game.eye[1] + dir[1] * bestT, game.eye[2] + dir[2] * bestT];
      game.beams.push({ to, life: 1 });
      if (best) {
        best.hp--;
        if (best.hp <= 0) {
          breakRock(best);
          game.score += rules.rockScore;
          game.words.push({ text: '+' + rules.rockScore, at: best.at.slice(), life: 0.8, colour: '#ffb454' });
          sound('break');
        } else {
          burst(best.at, [1, 0.7, 0.3], 5, 5);
          sound('hit');
        }
      }
      return best;
    };

    // input.look: where you are looking; input.held / taps: FIRE; input.hands: [{ dir, pinched }].
    game.update = function (dt, input) {
      for (const bit of game.bits) {
        bit.life -= dt;
        for (let i = 0; i < 3; i++) bit.at[i] += bit.going[i] * dt;
        bit.at[2] += game.speed * dt * 0.6;
      }
      game.bits = game.bits.filter((bit) => bit.life > 0);
      for (const beam of game.beams) beam.life -= dt / 0.12;
      game.beams = game.beams.filter((beam) => beam.life > 0);
      for (const word of game.words) { word.life -= dt; word.at[2] += game.speed * dt * 0.5; word.at[1] += dt; }
      game.words = game.words.filter((word) => word.life > 0);
      game.hurt = Math.max(0, game.hurt - dt * 2);
      if (game.over) return;

      game.time += dt;
      game.safe = Math.max(0, game.safe - dt);
      reload = Math.max(0, reload - dt);
      game.speed = Math.min(rules.fastest, rules.start + game.time * rules.faster);
      const move = game.speed * dt;
      game.travelled += move;
      game.score += move / 5;

      // Steer: the ship drifts the way you look, faster the further you look.
      const look = input.look;
      const yaw = Math.atan2(look[0], -look[2]);
      const pitch = Math.asin(clamp(look[1], -1, 1));
      game.eye[0] = clamp(game.eye[0] + clamp(yaw / 0.45, -1, 1) * 9 * dt, -rules.across, rules.across);
      game.eye[1] = clamp(game.eye[1] + clamp(pitch / 0.35, -1, 1) * 7 * dt, rules.low, rules.high);

      // Firing.
      if (input.handsOn) {
        for (const hand of input.hands) if (hand.pinched && hand.dir) game.fire(hand.dir);
      } else if (input.taps.left || input.taps.right || input.held.left || input.held.right) {
        game.fire(look);
      }

      // Everything comes towards you.
      untilRock -= move;
      if (untilRock <= 0) spawn();
      untilRing -= move;
      if (untilRing <= 0) {
        game.addRing([(random() * 2 - 1) * (rules.across - 1.5), rules.low + 1.5 + random() * (rules.high - rules.low - 3), rules.appear]);
        untilRing = 45 + random() * 40;
      }
      for (const rock of game.rocks) {
        const before = rock.at[2];
        rock.at[2] += move;
        // A rock reaching the ship knocks it, unless just knocked.
        const reach = rock.size * 0.55 + 0.35;
        const crossing = before <= reach && rock.at[2] >= -reach;
        if (!rock.gone && crossing && Math.hypot(rock.at[0] - game.eye[0], rock.at[1] - game.eye[1]) < reach && game.safe <= 0) {
          breakRock(rock);
          game.shields--;
          game.hurt = 1;
          game.safe = 1.0;
          game.streak = 0;
          sound('crash');
          if (game.shields <= 0) { game.over = true; game.overFor = 0; sound('lose'); }
        }
      }
      game.rocks = game.rocks.filter((rock) => !rock.gone && rock.at[2] < 6);
      for (const ring of game.rings) {
        const before = ring.at[2];
        ring.at[2] += move;
        ring.glow = Math.max(0, ring.glow - dt * 2);
        if (!ring.passed && before < 0 && ring.at[2] >= 0) {
          ring.passed = true;
          if (Math.hypot(ring.at[0] - game.eye[0], ring.at[1] - game.eye[1]) < rules.ringSize * 0.8) {
            game.streak++;
            const points = rules.ringScore * game.streak;
            game.score += points;
            ring.glow = 1;
            game.words.push({ text: game.streak > 1 ? 'Ring x' + game.streak + '  +' + points : 'Ring  +' + points, at: [ring.at[0], ring.at[1] + 1, -4], life: 1, colour: '#ffd166' });
            sound('ring');
          } else {
            game.streak = 0;
          }
        }
      }
      game.rings = game.rings.filter((ring) => ring.at[2] < 8);
      for (const d of game.dust) {
        d[2] += move;
        if (d[2] > 2) { d[0] = (random() - 0.5) * 16; d[1] = (random() - 0.5) * 12; d[2] = -30 - random() * 4; }
      }
    };

    game.boxes = function (time) {
      const boxes = [];
      const box = (c, w, h, d, colour) => boxes.push({ low: [c[0] - w / 2, c[1] - h / 2, c[2] - d / 2], high: [c[0] + w / 2, c[1] + h / 2, c[2] + d / 2], colour });
      // Stars, far off and never getting nearer.
      for (const star of game.stars) {
        const p = [game.eye[0] + star.dir[0] * 48, game.eye[1] + star.dir[1] * 48, game.eye[2] + star.dir[2] * 48];
        box(p, star.size, star.size, star.size, star.warm ? [1, 0.85, 0.6] : [0.85, 0.9, 1]);
      }
      // Dust streaking past, to feel the speed.
      const streak = Math.min(1.6, game.speed * 0.04);
      for (const d of game.dust) box([game.eye[0] + d[0], game.eye[1] + d[1], d[2]], 0.035, 0.035, streak, [0.6, 0.75, 1]);
      for (const rock of game.rocks) {
        const bob = Math.sin(time * 1.5 + rock.spin) * 0.08;
        for (const part of rock.parts) box([rock.at[0] + part.off[0], rock.at[1] + part.off[1] + bob, rock.at[2] + part.off[2]], part.size, part.size, part.size, part.colour);
      }
      for (const ring of game.rings) {
        const r = rules.ringSize;
        const colour = ring.glow > 0 ? [0.4, 1, 0.6] : [1, 0.78, 0.2];
        for (let i = 0; i < 16; i++) {
          const a = i / 16 * Math.PI * 2;
          box([ring.at[0] + Math.cos(a) * r, ring.at[1] + Math.sin(a) * r, ring.at[2]], 0.32, 0.32, 0.32, colour);
        }
      }
      for (const bit of game.bits) box(bit.at, bit.size, bit.size, bit.size, bit.colour);
      return boxes;
    };

    game.paint = function (ctx, screen) {
      const { width, height, project, text } = screen;
      const cx = width / 2, cy = height / 2;
      // Laser shots, from just under the view to what they hit.
      for (const beam of game.beams) {
        const p = project(beam.to);
        if (!p) continue;
        ctx.strokeStyle = `rgba(90, 255, 200, ${beam.life})`;
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(cx - 60, height); ctx.lineTo(p[0], p[1]); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 60, height); ctx.lineTo(p[0], p[1]); ctx.stroke();
      }
      for (const word of game.words) {
        const p = project(word.at);
        if (p) text(ctx, word.text, p[0], p[1], 24, word.colour);
      }
      // The cockpit: a frame round the view.
      ctx.fillStyle = 'rgba(20, 28, 48, .85)';
      ctx.beginPath(); ctx.moveTo(0, height); ctx.lineTo(0, height * 0.72); ctx.lineTo(width * 0.2, height * 0.88); ctx.lineTo(width * 0.8, height * 0.88); ctx.lineTo(width, height * 0.72); ctx.lineTo(width, height); ctx.fill();
      ctx.strokeStyle = 'rgba(90, 200, 255, .6)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, height * 0.72); ctx.lineTo(width * 0.2, height * 0.88); ctx.lineTo(width * 0.8, height * 0.88); ctx.lineTo(width, height * 0.72); ctx.stroke();
      if (game.hurt > 0) {
        ctx.fillStyle = `rgba(255, 40, 40, ${game.hurt * 0.45})`;
        ctx.fillRect(0, 0, width, height);
      }
      if (game.over) return;
      if (!screen.handsOn) {
        ctx.strokeStyle = 'rgba(90, 255, 200, .9)';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 26, cy); ctx.lineTo(cx - 16, cy); ctx.moveTo(cx + 16, cy); ctx.lineTo(cx + 26, cy); ctx.stroke();
      }
      text(ctx, String(Math.floor(game.score)), 28, 40, 34, '#fff', 'left');
      text(ctx, 'Best ' + screen.best, 30, 72, 16, '#9fc4ff', 'left');
      text(ctx, 'SPEED ' + Math.round(game.speed), width / 2, height * 0.94, 18, '#9fe8ff');
      for (let i = 0; i < rules.shields; i++) {
        ctx.fillStyle = i < game.shields ? '#5ad1ff' : 'rgba(255, 255, 255, .15)';
        ctx.fillRect(width - 46 - i * 30, 28, 22, 22);
      }
      text(ctx, 'SHIELDS', width - 76, 64, 13, '#9fc4ff');
      if (game.time < 6) text(ctx, screen.handsOn ? 'Look where you want to fly. Pinch to fire where you point.' : 'Look where you want to fly. FIRE to blast rocks. Fly through the rings!', width / 2, height * 0.8, 17);
    };

    return game;
  }

  const api = { createSpace, rules };
  if (inNode) {
    module.exports = api;
  } else {
    root.PVR = root.PVR || {};
    root.PVR.space = api;
    root.PVR.arcadeGames = root.PVR.arcadeGames || {};
    root.PVR.arcadeGames['space-run'] = { title: 'Space run', create: createSpace };
  }
})(typeof window !== 'undefined' ? window : globalThis);
