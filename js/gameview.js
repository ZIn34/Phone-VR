'use strict';

// Follow the circle: what the player sees. Painted over the camera picture,
// once per frame, onto the canvas that covers one eye's picture.
window.PVR = window.PVR || {};

(function (PVR) {
  const math = PVR.math;
  const rules = PVR.game.rules;
  const OFF = '#ffb454';
  const ON = '#3dffb0';

  function text(ctx, words, x, y, size, colour) {
    ctx.font = `bold ${size}px sans-serif`;
    ctx.lineWidth = Math.max(4, size / 6);
    ctx.strokeStyle = 'rgba(0, 0, 0, .75)';
    ctx.strokeText(words, x, y);
    ctx.fillStyle = colour || '#fff';
    ctx.fillText(words, x, y);
  }

  function clock(seconds) {
    const whole = Math.ceil(seconds);
    return Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0');
  }

  PVR.paintGame = function (ctx, width, height, focal, orientation, frontYaw, game, best) {
    const unit = height / 2;
    const cx = width / 2;
    const cy = height / 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // The circle, fixed in the room.
    const colour = game.onTarget ? ON : OFF;
    const radius = focal * Math.tan(rules.circleSize) * unit;
    const direction = game.direction(frontYaw);
    const spot = math.project(orientation, direction, focal);
    const x = spot ? cx + spot[0] * unit : 0;
    const y = spot ? cy - spot[1] * unit : 0;
    const inView = spot && Math.abs(x - cx) < width / 2 - radius && Math.abs(y - cy) < height / 2 - radius;

    if (spot) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = game.onTarget ? 'rgba(61, 255, 176, .3)' : 'rgba(255, 180, 84, .12)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, .65)';
      ctx.lineWidth = 10;
      ctx.stroke();
      ctx.strokeStyle = colour;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = colour;
      ctx.fill();
      // "Keep looking": a ring that fills while the crosshair rests on the circle.
      if (game.hold > 0) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, game.hold));
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 6;
        ctx.stroke();
      }
    }

    // When the circle has left the picture, an arrow shows which way to turn.
    if (!inView) {
      const seen = math.rotate(math.conjugate(orientation), direction);
      const angle = Math.atan2(-seen[1], seen[0]);
      const reach = Math.min(width, height) / 2 - 70;
      ctx.save();
      ctx.translate(cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(22, 0);
      ctx.lineTo(-14, -20);
      ctx.lineTo(-14, 20);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(0, 0, 0, .65)';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.fillStyle = OFF;
      ctx.fill();
      ctx.restore();
    }

    // The crosshair: always the middle of the view.
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy); ctx.lineTo(cx - 6, cy);
    ctx.moveTo(cx + 6, cy); ctx.lineTo(cx + 20, cy);
    ctx.moveTo(cx, cy - 20); ctx.lineTo(cx, cy - 6);
    ctx.moveTo(cx, cy + 6); ctx.lineTo(cx, cy + 20);
    ctx.strokeStyle = 'rgba(0, 0, 0, .7)';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Words stay fixed in the view, kept near the middle where the lenses are sharpest.
    const top = cy - height * 0.27;
    const bottom = cy + height * 0.27;
    if (game.phase === 'waiting') {
      text(ctx, 'Look at the circle to start', cx, top, 30);
      if (best > 0) text(ctx, 'Best ' + best, cx, bottom, 26, ON);
    } else if (game.phase === 'playing') {
      text(ctx, clock(game.timeLeft), cx - 90, top, 38, game.timeLeft <= 10 ? OFF : '#fff');
      text(ctx, String(Math.floor(game.score)), cx + 90, top, 38, colour);
    } else {
      const newBest = game.score > best;
      text(ctx, 'Time!', cx, top - 44, 30);
      text(ctx, game.score + ' points', cx, top, 46, ON);
      text(ctx, newBest ? 'New best score!' : 'Best ' + best, cx, top + 46, 28, newBest ? OFF : '#fff');
      text(ctx, 'Look at the circle to play again', cx, bottom, 24);
    }
  };
})(window.PVR);
