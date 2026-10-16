'use strict';

// Blaster arena: what the player sees. The robots, their bolts and the
// blasters lying about are boxes handed to the 3D drawing; the health bar,
// the blaster in your hand and the words are painted on top.
window.PVR = window.PVR || {};

(function (PVR) {
  const math = PVR.math;
  const S = PVR.shooter;
  const COLOURS = [[1.0, 0.82, 0.2], [0.2, 0.9, 1.0], [1.0, 0.35, 0.9]]; // one for each blaster

  // The boxes to draw this frame. time is in seconds, for things that bob or flash.
  PVR.arenaBoxes = function (game, time, you) {
    const boxes = [];
    const box = (x, y, z, w, h, d, colour) => boxes.push({ low: [x - w / 2, y, z - d / 2], high: [x + w / 2, y + h, z + d / 2], colour });
    for (const robot of game.robots) {
      if (robot.state === 'down') continue;
      const [x, y, z] = robot.at;
      const flash = robot.hitAgo < 0.12;
      box(x, y, z, 0.7, 1.05, 0.5, flash ? [1, 1, 1] : [0.34, 0.38, 0.46]);          // body
      box(x, y + 1.1, z, 0.5, 0.55, 0.5, flash ? [1, 1, 1] : [0.52, 0.57, 0.66]);    // head
      // An eye on the side facing you, bright while it is about to fire.
      const dx = you[0] - x, dz = you[2] - z;
      const far = Math.hypot(dx, dz) || 1;
      const ready = robot.state === 'out' && !robot.fired;
      box(x + dx / far * 0.26, y + 1.28, z + dz / far * 0.26, 0.3, 0.14, 0.3, ready ? [1, 0.25, 0.15] : [0.9, 0.75, 0.2]);
    }
    for (const bolt of game.bolts) box(bolt.at[0], bolt.at[1] - 0.14, bolt.at[2], 0.28, 0.28, 0.28, [1, 0.5, 0.1]);
    for (const pickup of game.pickups) {
      box(pickup.at[0], pickup.at[1] + 0.15 * Math.sin(time * 2.5), pickup.at[2], 0.5, 0.3, 0.5, COLOURS[pickup.blaster]);
    }
    return boxes;
  };

  // The three blasters, each built from boxes. Each box is [from, to] along
  // the barrel, below and above its line, half its width, and what it is made
  // of: 'body', 'dark', 'trim' (the blaster's own colour) or 'glow'. Sizes are
  // in metres, as if held about 45 cm from your eyes.
  const SHAPES = [
    [ // Blaster: short and neat.
      [-0.05, 0.08, -0.025, 0.028, 0.022, 'body'],
      [0.08, 0.16, -0.012, 0.018, 0.013, 'dark'],
      [0.16, 0.18, -0.014, 0.020, 0.015, 'glow'],
      [-0.05, -0.005, -0.11, -0.025, 0.018, 'dark'],
      [0.0, 0.035, -0.06, -0.025, 0.005, 'body'],
      [-0.02, 0.06, 0.028, 0.036, 0.008, 'trim'],
    ],
    [ // Rapid: long, with two barrels and a magazine.
      [-0.06, 0.10, -0.022, 0.024, 0.02, 'body'],
      [0.10, 0.22, 0.002, 0.016, 0.007, 'dark'],
      [0.10, 0.22, -0.016, -0.002, 0.007, 'dark'],
      [0.22, 0.235, -0.018, 0.018, 0.012, 'glow'],
      [-0.05, -0.01, -0.10, -0.022, 0.016, 'dark'],
      [0.03, 0.07, -0.09, -0.022, 0.012, 'trim'],
      [-0.06, 0.10, 0.024, 0.03, 0.01, 'trim'],
    ],
    [ // Heavy: short and fat, with a wide muzzle.
      [-0.06, 0.07, -0.035, 0.04, 0.034, 'body'],
      [0.07, 0.14, -0.026, 0.032, 0.028, 'dark'],
      [0.14, 0.165, -0.034, 0.04, 0.036, 'glow'],
      [-0.055, -0.005, -0.12, -0.035, 0.02, 'dark'],
      [-0.03, 0.05, 0.04, 0.05, 0.02, 'trim'],
      [0.07, 0.14, -0.034, -0.026, 0.03, 'trim'],
    ],
  ];
  const DARK = [0.16, 0.18, 0.22], BODY = [0.3, 0.33, 0.4];
  const LIGHT = (() => { const l = [-0.35, 0.8, 0.5]; const n = Math.hypot(...l); return l.map((v) => v / n); })();
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const unitOf = (a) => scale(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));

  // Draws the blaster held at one point of the picture and pointing at
  // another, in perspective and lit from above. Places here are from the eye:
  // x right, y up, z back. Returns where its end is on the canvas, for shots.
  function paintBlaster(ctx, width, height, focal, held, aim, kind, kick, colour) {
    const unit = height / 2;
    const ray = (p) => [(p[0] - width / 2) / (focal * unit), -(p[1] - height / 2) / (focal * unit), -1];
    const toCanvas = (p) => [width / 2 + focal * p[0] / -p[2] * unit, height / 2 - focal * p[1] / -p[2] * unit];
    let origin = scale(ray(held), 0.45);
    let ahead = unitOf(add(scale(ray(aim), 5), scale(origin, -1)));
    let right = unitOf(cross(ahead, [0, 1, 0]));
    let up = cross(right, ahead);
    // Firing jumps it back and tips it up.
    origin = add(origin, scale(ahead, -0.035 * kick));
    ahead = unitOf(add(ahead, scale(up, 0.35 * kick)));
    up = cross(right, ahead);
    const at = (a, u, r) => add(add(add(origin, scale(ahead, a)), scale(up, u)), scale(right, r));
    const trim = colour.map((v) => v);
    const faces = [];
    for (const [a0, a1, u0, u1, half, made] of SHAPES[kind] || SHAPES[0]) {
      const c = [];
      for (const a of [a0, a1]) for (const u of [u0, u1]) for (const r of [-half, half]) c.push(at(a, u, r));
      // The six sides, each with its outward direction.
      const sides = [
        [[0, 1, 3, 2], scale(ahead, -1)], [[4, 6, 7, 5], ahead],
        [[0, 4, 5, 1], scale(up, -1)], [[2, 3, 7, 6], up],
        [[0, 2, 6, 4], scale(right, -1)], [[1, 5, 7, 3], right],
      ];
      const base = made === 'glow' ? trim : made === 'trim' ? trim : made === 'dark' ? DARK : BODY;
      for (const [corners, out] of sides) {
        const points = corners.map((i) => c[i]);
        const middle = scale(points.reduce(add, [0, 0, 0]), 0.25);
        if (dot(out, middle) >= 0) continue;                    // turned away from the eye
        if (points.some((p) => p[2] > -0.05)) continue;
        const light = made === 'glow' ? 1 : 0.35 + 0.65 * Math.max(0, dot(out, LIGHT));
        faces.push({ far: middle[2], points: points.map(toCanvas), shade: base.map((v) => Math.round(Math.min(1, v * light) * 255)), glow: made === 'glow' });
      }
    }
    faces.sort((one, two) => one.far - two.far); // furthest first
    ctx.lineJoin = 'round';
    for (const face of faces) {
      ctx.beginPath();
      face.points.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.fillStyle = `rgb(${face.shade.join(', ')})`;
      ctx.fill();
      ctx.strokeStyle = face.glow ? 'rgba(255, 255, 255, .7)' : 'rgba(0, 0, 0, .45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    const shape = SHAPES[kind] || SHAPES[0];
    const end = toCanvas(at(Math.max(...shape.map((b) => b[1])), 0.004, 0));
    if (kick > 0.4) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(end[0], end[1], 16 * kick, 0, Math.PI * 2);
      ctx.fill();
    }
    return end;
  }

  function text(ctx, words, x, y, size, colour, align) {
    ctx.font = `bold ${size}px sans-serif`;
    ctx.textAlign = align || 'center';
    ctx.lineWidth = Math.max(4, size / 6);
    ctx.strokeStyle = 'rgba(0, 0, 0, .75)';
    ctx.strokeText(words, x, y);
    ctx.fillStyle = colour || '#fff';
    ctx.fillText(words, x, y);
  }

  // hud: {
  //   handsOn, eye: where your eyes are, aim: [x, y] on the canvas where the blaster points,
  //   hand: { palm: [x, y], curl } when a hand is holding the blaster, else null,
  //   kick: 1 just after firing, falling to 0,
  //   flashes: [{ to: [x, y, z], life: 0 to 1 }] shots just fired, best: best score, sign }
  PVR.paintArena = function (ctx, width, height, focal, orientation, game, hud) {
    const unit = height / 2;
    const cx = width / 2;
    const cy = height / 2;
    ctx.lineCap = 'round';
    ctx.textBaseline = 'middle';
    const colour = `rgb(${COLOURS[game.blaster].map((v) => Math.round(v * 255)).join(', ')})`;

    // Where a place in the world is on the canvas.
    const spot = (p) => {
      const d = math.rotate(math.conjugate(orientation), [p[0] - hud.eye[0], p[1] - hud.eye[1], p[2] - hud.eye[2]]);
      return d[2] > -0.05 ? null : [cx + focal * d[0] / -d[2] * unit, cy - focal * d[1] / -d[2] * unit];
    };

    // The blaster: a solid shape in front of you, held where your hand is
    // (else low at the bottom right), pointing at where it will hit.
    // With a hand, the sight is where the hand points, so the blaster sits a
    // little below and to the right of it, as if gripped there.
    const held = hud.hand ? hud.hand.palm : [width * 0.8, height * 0.88];
    const grip = hud.hand ? [Math.min(width * 0.9, held[0] + 0.5 * unit), Math.min(height * 0.86, held[1] + 0.55 * unit)] : held;
    const muzzle = paintBlaster(ctx, width, height, focal, grip, hud.aim || [cx, cy], game.blaster, hud.kick || 0, COLOURS[game.blaster]);
    // The trigger meter beside the hand: how far the finger is curled; full means fired.
    if (hud.hand && !game.over) {
      const m = { x: grip[0] - 70, y: grip[1] - 30, w: 12, h: 60 };
      ctx.fillStyle = 'rgba(0, 0, 0, .55)';
      ctx.fillRect(m.x - 2, m.y - 2, m.w + 4, m.h + 4);
      const curl = hud.hand.curl || 0;
      ctx.fillStyle = curl >= 1 ? '#3dffb0' : '#fff';
      ctx.fillRect(m.x, m.y + m.h * (1 - curl), m.w, m.h * curl);
    }

    // Shots just fired: a streak from the blaster to where it hit.
    for (const flash of hud.flashes) {
      const to = spot(flash.to);
      if (!to) continue;
      ctx.beginPath();
      ctx.moveTo(muzzle[0], muzzle[1]);
      ctx.lineTo(to[0], to[1]);
      ctx.strokeStyle = colour;
      ctx.globalAlpha = flash.life;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(to[0], to[1], 10 + 14 * (1 - flash.life), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Where the blaster is pointing.
    if (hud.aim && !game.over) {
      ctx.beginPath();
      ctx.arc(hud.aim[0], hud.aim[1], 12, 0, Math.PI * 2);
      ctx.moveTo(hud.aim[0] - 22, hud.aim[1]); ctx.lineTo(hud.aim[0] - 6, hud.aim[1]);
      ctx.moveTo(hud.aim[0] + 6, hud.aim[1]); ctx.lineTo(hud.aim[0] + 22, hud.aim[1]);
      ctx.moveTo(hud.aim[0], hud.aim[1] - 22); ctx.lineTo(hud.aim[0], hud.aim[1] - 6);
      ctx.moveTo(hud.aim[0], hud.aim[1] + 6); ctx.lineTo(hud.aim[0], hud.aim[1] + 22);
      ctx.strokeStyle = 'rgba(0, 0, 0, .7)';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // A red flash round the edge when a bolt reaches you.
    if (game.hurtAgo < 0.4) {
      const edge = ctx.createRadialGradient(cx, cy, height * 0.35, cx, cy, width * 0.6);
      edge.addColorStop(0, 'rgba(255, 0, 0, 0)');
      edge.addColorStop(1, `rgba(255, 0, 0, ${0.6 * (1 - game.hurtAgo / 0.4)})`);
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, width, height);
    }

    // Health bar, top left.
    const share = game.health / S.rules.health;
    ctx.fillStyle = 'rgba(0, 0, 0, .6)';
    ctx.fillRect(90, 22, 268, 30);
    ctx.fillStyle = share > 0.5 ? '#3dffb0' : (share > 0.25 ? '#ffb454' : '#ff4d4d');
    ctx.fillRect(94, 26, 260 * share, 22);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(90, 22, 268, 30);
    text(ctx, 'HEALTH ' + Math.ceil(game.health), 224, 38, 17);
    const run = hud.run || { room: 0, cleared: 0 };
    text(ctx, 'Room ' + run.room + '   Knocked out: ' + game.score, 90, 74, 20, '#fff', 'left');
    text(ctx, S.BLASTERS[game.blaster].name + (game.owned.length > 1 ? '  (' + game.owned.length + ' blasters)' : ''), 90, 100, 18, colour, 'left');

    if (game.over) {
      ctx.fillStyle = 'rgba(0, 0, 0, .6)';
      ctx.fillRect(0, 0, width, height);
      text(ctx, 'Game over', cx, cy - 70, 44, '#ff4d4d');
      text(ctx, 'Rooms cleared: ' + run.cleared + '   Robots knocked out: ' + game.score, cx, cy - 16, 28);
      text(ctx, game.score > hud.best ? 'New best score!' : 'Best ' + hud.best, cx, cy + 26, 24, game.score > hud.best ? '#ffb454' : '#fff');
      text(ctx, hud.handsOn ? 'Pull the trigger to play again' : 'Tap FIRE to play again', cx, cy + 76, 22, '#3dffb0');
    } else if (run.state === 'cleared') {
      text(ctx, 'Room cleared!', cx, cy - 60, 40, '#3dffb0');
    } else if (run.state === 'moving') {
      text(ctx, 'On to room ' + (run.room + 1), cx, cy - 60, 32, '#fff');
    } else {
      // Behind your wall: how to lean out. Out: how to fire.
      const how = hud.handsOn
        ? (hud.sign === 3 ? 'Three fingers: next blaster' : (run.hidden ? 'Raise your gun hand to lean out' : 'Curl your finger: fire    Lower your hand: hide    3 fingers: next blaster'))
        : (run.hidden ? 'Hold LEAN to lean out and shoot' : 'FIRE to shoot    Let go of LEAN to hide');
      text(ctx, how, cx, height * 0.94, 17, run.hidden ? '#ffb454' : '#fff');
      if (run.hidden) text(ctx, 'HIDDEN', cx, 130, 22, '#ffb454');
    }
  };
})(window.PVR);
