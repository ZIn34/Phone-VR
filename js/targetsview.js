'use strict';

// Pop the targets: what the player sees, and where hands touching a target
// are noticed. Painted once per frame onto the canvas that covers one eye's picture.
window.PVR = window.PVR || {};

(function (PVR) {
  const math = PVR.math;
  const rules = PVR.targets.rules;
  const HINTS = {
    1: 'Aim the cross at a target and tap POP',
    2: 'Touch a target with your free hand',
    3: 'Touch the targets with either hand',
  };

  function text(ctx, words, x, y, size, colour) {
    ctx.font = `bold ${size}px sans-serif`;
    ctx.lineWidth = Math.max(4, size / 6);
    ctx.strokeStyle = 'rgba(0, 0, 0, .75)';
    ctx.strokeText(words, x, y);
    ctx.fillStyle = colour || '#fff';
    ctx.fillText(words, x, y);
  }

  // fingertips: where each tracked hand's index fingertip is on this canvas
  // (empty at Level 1, or while a menu is open).
  PVR.paintTargets = function (ctx, width, height, focal, orientation, frontYaw, targets, level, fingertips) {
    const unit = height / 2;
    const cx = width / 2;
    const cy = height / 2;
    const radius = focal * Math.tan(rules.size) * unit;
    const aimed = level === 1 ? targets.aimedAt(orientation, frontYaw) : -1;
    ctx.lineCap = 'round';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    targets.list.forEach((target, i) => {
      if (target.away > 0) return;
      const spot = math.project(orientation, targets.direction(i, frontYaw), focal);
      if (!spot) return;
      const x = cx + spot[0] * unit;
      const y = cy - spot[1] * unit;
      if (fingertips.some((tip) => Math.hypot(tip[0] - x, tip[1] - y) <= radius + 12)) {
        targets.pop(i);
        return;
      }
      const on = i === aimed;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = on ? 'rgba(61, 255, 176, .4)' : 'rgba(79, 140, 255, .35)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, .65)';
      ctx.lineWidth = 10;
      ctx.stroke();
      ctx.strokeStyle = on ? '#3dffb0' : '#8fb6ff';
      ctx.lineWidth = 5;
      ctx.stroke();
    });

    if (level === 1) {
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
    }

    text(ctx, 'Popped ' + targets.popped, cx, cy - height * 0.27, 36, '#3dffb0');
    text(ctx, HINTS[level], cx, cy + height * 0.27, 22);
  };
})(window.PVR);
