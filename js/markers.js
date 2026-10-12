'use strict';

// Things fixed in the room, painted over the camera picture: a horizon line
// with labelled posts, and a ring of markers above and below it.
window.PVR = window.PVR || {};

(function (PVR) {
  const math = PVR.math;
  const RAD = Math.PI / 180;
  const COLOUR = '#3dffb0';
  const NAMES = { 0: 'FRONT', 90: 'RIGHT', 180: 'BACK', '-90': 'LEFT' };

  // Paints onto a canvas of width x height pixels that covers one eye's picture.
  PVR.paintMarkers = function (ctx, width, height, focal, orientation, frontYaw) {
    const unit = height / 2;
    const reach = width / unit; // skip anything far outside the picture

    function place(yawDegrees, pitchDegrees) {
      const p = math.project(orientation, math.direction(frontYaw + yawDegrees * RAD, pitchDegrees * RAD), focal);
      if (!p || Math.abs(p[0]) > reach * 2 || Math.abs(p[1]) > 4) return null;
      return [width / 2 + p[0] * unit, height / 2 - p[1] * unit];
    }

    function line(from, to) {
      if (!from || !to) return;
      ctx.moveTo(from[0], from[1]);
      ctx.lineTo(to[0], to[1]);
    }

    function label(text, at, size) {
      if (!at) return;
      ctx.font = `bold ${size}px sans-serif`;
      ctx.strokeText(text, at[0], at[1]);
      ctx.fillText(text, at[0], at[1]);
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLOUR;

    // Horizon, and a post every 15 degrees.
    ctx.beginPath();
    for (let yaw = -180; yaw < 180; yaw += 3) line(place(yaw, 0), place(yaw + 3, 0));
    for (let yaw = -180; yaw < 180; yaw += 15) line(place(yaw, -1.5), place(yaw, 1.5));
    // Dark edge first so the lines show against a bright room.
    ctx.strokeStyle = 'rgba(0, 0, 0, .6)';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = COLOUR;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 0, 0, .7)';
    ctx.lineWidth = 5;
    for (let yaw = -180; yaw < 180; yaw += 15) {
      label(NAMES[yaw] || Math.abs(yaw) + '°', place(yaw, 4), NAMES[yaw] ? 30 : 24);
    }

    // Markers above and below the horizon.
    for (const [pitch, name] of [[25, 'UP'], [-25, 'DOWN']]) {
      for (let yaw = -180; yaw < 180; yaw += 45) {
        const at = place(yaw, pitch);
        if (!at) continue;
        ctx.beginPath();
        ctx.arc(at[0], at[1], 16, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 0, 0, .6)';
        ctx.lineWidth = 7;
        ctx.stroke();
        ctx.strokeStyle = COLOUR;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0, 0, 0, .7)';
        ctx.lineWidth = 5;
        label(name, [at[0], at[1] - 34], 22);
      }
    }
    label('CEILING', place(0, 90), 26);
    label('FLOOR', place(0, -90), 26);

    // A small cross in the middle of the view, to line things up with.
    ctx.beginPath();
    ctx.moveTo(width / 2 - 12, height / 2);
    ctx.lineTo(width / 2 + 12, height / 2);
    ctx.moveTo(width / 2, height / 2 - 12);
    ctx.lineTo(width / 2, height / 2 + 12);
    ctx.strokeStyle = 'rgba(255, 255, 255, .85)';
    ctx.lineWidth = 2;
    ctx.stroke();
  };
})(window.PVR);
