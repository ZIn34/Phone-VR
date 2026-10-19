'use strict';

// The arcade games (Fruit slice, Beat blocks, Space run) and what they share:
// a 3D place to play in, the way you face when a game starts as its front,
// fingertips and the cross turned into lines of aim, the two side buttons at
// Level 1, best scores kept on this phone, and the score and game-over screens.
//
// Each game registers itself in PVR.arcadeGames as { title, create(seed) }.
// create returns a game with:
//   eye: [x, y, z]               where your eyes are (y up, -z is front)
//   look: { sky, haze }          the sky colour and how far the haze starts and ends
//   buttons: { left, right }     the side button words at Level 1
//   score, over, overFor         the score; whether it has ended, and how long ago
//   restart()
//   scenery(place)               optional: builds the still things round you with place(x, y, z, kind)
//   update(dt, input)            input: see frame() below
//   boxes(time)                  the moving things to draw this frame
//   paint(ctx, screen)           words and effects on top; screen: see frame() below
window.PVR = window.PVR || {};
PVR.arcadeGames = PVR.arcadeGames || {};

(function (PVR) {
  const math = PVR.math;

  PVR.createArcade = function (scene, tracking) {
    const games = {};
    const bests = {};
    const pinching = [];
    let front = 0;        // the yaw that is "ahead" in the game
    let lastKey = null;

    const bestKey = (key) => 'phone-vr.' + key + '.best.v1';
    function bestOf(key) {
      if (bests[key] === undefined) {
        try { bests[key] = Math.max(0, parseInt(localStorage.getItem(bestKey(key)), 10) || 0); } catch (err) { bests[key] = 0; }
      }
      return bests[key];
    }

    function entry(key) {
      if (!games[key]) {
        const game = PVR.arcadeGames[key].create(Date.now());
        // Its own places to play: one with its scenery for Simulation, and a
        // bare one for Real life, where the game happens in your room.
        const sim = PVR.blocks.createWorld(7, true, 'rooms');
        if (game.scenery) game.scenery((x, y, z, kind) => sim.place(x, y, z, kind));
        games[key] = { game, sim, real: PVR.blocks.createWorld(7, true, 'rooms'), shownBest: bestOf(key), handed: false };
      }
      return games[key];
    }

    const arcade = {
      has: (key) => !!PVR.arcadeGames[key],
      game: (key) => entry(key).game,
      buttons: (key) => entry(key).game.buttons,

      // A new go, ahead being wherever you are looking now.
      start(key) {
        const e = entry(key);
        if (lastKey !== key) arcade.leave();
        lastKey = key;
        e.paused = false;
        front = math.yawOf(tracking.orientation());
        e.game.restart();
        e.shownBest = bestOf(key);
        e.handed = false;
        if (PVR.audio) PVR.audio.play('start');
      },

      // One frame. held/taps: { left, right } for the side buttons. seen: the
      // hands, as places on the canvas. lookThrough(orientation, point) is the
      // way a point of the picture looks, out in the world.
      frame(key, ctx, width, height, focal, orientation, dt, opts) {
        const e = entry(key);
        const game = e.game;
        if (key !== lastKey) { arcade.leave(); lastKey = key; pinching.length = 0; }
        // Pausing (the menu open) and carrying on, for games with music.
        if (game.pause && !!opts.paused !== !!e.paused) game.pause(!!opts.paused);
        e.paused = !!opts.paused;
        // Turned so that the game's front is straight ahead (-z).
        const turned = math.multiply(math.axisAngle([0, 1, 0], front), orientation);
        const world = opts.real ? e.real : e.sim;
        scene.world = world;
        scene.orientation = turned;
        scene.sky = game.look.sky;
        scene.haze = game.look.haze;
        Object.assign(world.player, { x: game.eye[0], y: game.eye[1] - world.body.eye, z: game.eye[2], fall: 0 });

        const hands = opts.handsOn ? opts.seen.map((hand, i) => {
          // A pinch counts once, as finger and thumb meet.
          const was = !!pinching[i];
          pinching[i] = hand.pinch < 0.32 || (was && hand.pinch < 0.45);
          return {
            dir: opts.lookThrough(turned, hand.tip),
            tip: hand.tip,
            palmDir: hand.palm ? opts.lookThrough(turned, hand.palm) : null,
            straight: hand.straight,
            pinched: pinching[i] && !was,
            right: hand.right,
          };
        }) : [];
        const input = {
          time: performance.now() / 1000,
          look: math.rotate(turned, [0, 0, -1]),
          hands,
          handsOn: opts.handsOn,
          held: opts.held,
          taps: opts.taps,
        };
        if (!opts.paused) {
          game.update(dt, input);
          if (game.over) {
            game.overFor = (game.overFor || 0) + dt;
            if (!e.handed) {
              e.handed = true;
              if (game.score > bestOf(key)) {
                bests[key] = game.score;
                try { localStorage.setItem(bestKey(key), String(game.score)); } catch (err) { /* kept until the page closes */ }
              }
            }
            // Play again: a button at Level 1, a pinch with a hand.
            const again = opts.taps.left || opts.taps.right || hands.some((hand) => hand.pinched);
            if (again && game.overFor > 1.2) arcade.start(key);
          }
        }
        scene.boxes = game.boxes(input.time);

        // Where a place in the game is on the canvas, or null if behind you.
        const project = (p) => {
          const d = math.rotate(math.conjugate(turned), [p[0] - game.eye[0], p[1] - game.eye[1], p[2] - game.eye[2]]);
          return d[2] > -0.05 ? null : [width / 2 + focal * d[0] / -d[2] * height / 2, height / 2 - focal * d[1] / -d[2] * height / 2];
        };
        const screen = { width, height, focal, project, handsOn: opts.handsOn, best: e.shownBest, text: PVR.arcadeText };
        game.paint(ctx, screen);
        if (game.over) arcade.paintOver(ctx, screen, game, e.shownBest);
      },

      // Leaving the arcade games: stop any music, and pause the game left.
      leave() {
        if (lastKey && games[lastKey]) {
          const e = games[lastKey];
          if (e.game.pause) e.game.pause(true);
          e.paused = true;
        }
        lastKey = null;
        if (PVR.audio) PVR.audio.stopSong();
      },

      paintOver(ctx, screen, game, best) {
        const { width, height } = screen;
        const cx = width / 2, cy = height / 2;
        const fade = Math.min(1, (game.overFor || 0) / 0.5);
        ctx.fillStyle = `rgba(5, 8, 20, ${0.65 * fade})`;
        ctx.fillRect(0, 0, width, height);
        if (fade < 1) return;
        const text = PVR.arcadeText;
        text(ctx, game.overTitle || 'Game over', cx, cy - 78, 44, game.overColour || '#ff4d6d');
        text(ctx, (game.overLine || 'Score') + ': ' + game.score, cx, cy - 22, 32);
        text(ctx, game.score > best ? 'New best score!' : 'Best ' + best, cx, cy + 22, 24, game.score > best ? '#ffd166' : '#cfd6e4');
        if (game.overFor > 1.2) text(ctx, screen.handsOn ? 'Pinch to play again' : 'Tap a button to play again', cx, cy + 72, 22, '#3dffb0');
      },
    };
    return arcade;
  };

  // Words with a dark outline, so they read over anything.
  PVR.arcadeText = function (ctx, words, x, y, size, colour, align) {
    ctx.font = `bold ${size}px sans-serif`;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(4, size / 5);
    ctx.strokeStyle = 'rgba(0, 0, 0, .7)';
    ctx.strokeText(words, x, y);
    ctx.fillStyle = colour || '#fff';
    ctx.fillText(words, x, y);
  };
})(window.PVR);
