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
  //   hand: { palm: [x, y], angle } when a hand is holding the blaster, else null,
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

    // The blaster: in your hand when it can be seen, else at the bottom right as if held low.
    const held = hud.hand ? hud.hand.palm : [width * 0.78, height * 0.86];
    const angle = hud.hand ? hud.hand.angle : -0.5;
    ctx.save();
    ctx.translate(held[0], held[1]);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(0, 0, 0, .55)';
    ctx.fillRect(-26, -16, 96, 32);
    ctx.fillStyle = '#39404d';
    ctx.fillRect(-22, -12, 88, 24);   // barrel
    ctx.fillRect(-22, 8, 26, 40);     // grip
    ctx.fillStyle = colour;
    ctx.fillRect(40, -12, 26, 24);    // the glowing end
    ctx.restore();
    const muzzle = [held[0] + Math.cos(angle) * 66, held[1] + Math.sin(angle) * 66];

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
    text(ctx, 'Knocked out: ' + game.score, 90, 74, 20, '#fff', 'left');
    text(ctx, S.BLASTERS[game.blaster].name + (game.owned.length > 1 ? '  (' + game.owned.length + ' blasters)' : ''), 90, 100, 18, colour, 'left');

    if (game.over) {
      ctx.fillStyle = 'rgba(0, 0, 0, .6)';
      ctx.fillRect(0, 0, width, height);
      text(ctx, 'Game over', cx, cy - 70, 44, '#ff4d4d');
      text(ctx, 'You knocked out ' + game.score + (game.score === 1 ? ' robot' : ' robots'), cx, cy - 16, 30);
      text(ctx, game.score > hud.best ? 'New best score!' : 'Best ' + hud.best, cx, cy + 26, 24, game.score > hud.best ? '#ffb454' : '#fff');
      text(ctx, hud.handsOn ? 'Pull the trigger to play again' : 'Tap FIRE to play again', cx, cy + 76, 22, '#3dffb0');
    } else if (hud.handsOn) {
      const sign = hud.sign === 2 ? 'Two fingers: walking' : (hud.sign === 3 ? 'Three fingers: next blaster' : '');
      text(ctx, sign || 'Curl your finger: fire    2 fingers: walk    3 fingers: next blaster', cx, height * 0.94, 17, sign ? '#3dffb0' : '#fff');
    }
  };
})(window.PVR);
