'use strict';

// Simulation mode, for activities that have no world of their own: a plain
// made-up sky and ground painted in place of the camera picture, with the
// horizon in the right place as the phone turns and tilts.
window.PVR = window.PVR || {};

(function (PVR) {
  const math = PVR.math;
  const RAD = Math.PI / 180;

  PVR.paintBackdrop = function (ctx, width, height, focal, orientation) {
    const unit = height / 2;
    const yaw = math.yawOf(orientation);
    const spot = (dYaw, pitch) => {
      const p = math.project(orientation, math.direction(yaw + dYaw, pitch), focal);
      return p ? [width / 2 + p[0] * unit, height / 2 - p[1] * unit] : null;
    };
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#1d3b6e');
    sky.addColorStop(1, '#6fa3d8');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const left = spot(-50 * RAD, 0);
    const right = spot(50 * RAD, 0);
    const below = spot(0, -20 * RAD);
    const level = spot(0, 0);
    if (!left || !right || !below || !level) {
      // Looking almost straight up or down: all sky, or all ground.
      if (math.pitchOf(orientation) < 0) {
        ctx.fillStyle = '#2f5d3a';
        ctx.fillRect(0, 0, width, height);
      }
      return;
    }
    // The ground is everything on the far side of the horizon line, in the direction of "down".
    const dx = below[0] - level[0];
    const dy = below[1] - level[1];
    const far = 4000 / (Math.hypot(dx, dy) || 1);
    const along = [(right[0] - left[0]) * 20, (right[1] - left[1]) * 20];
    const a = [left[0] - along[0], left[1] - along[1]];
    const b = [right[0] + along[0], right[1] + along[1]];
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(b[0] + dx * far, b[1] + dy * far);
    ctx.lineTo(a[0] + dx * far, a[1] + dy * far);
    ctx.closePath();
    ctx.fillStyle = '#2f5d3a';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.strokeStyle = 'rgba(255, 255, 255, .5)';
    ctx.lineWidth = 2;
    ctx.stroke();
  };
})(window.PVR);
