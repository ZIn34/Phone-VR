'use strict';

// The head-tracking maths. No browser needed, so it is also run by tests/math.test.js.
//
// World: x to the right, y up, and "front" is the -z direction.
// Quaternions are [x, y, z, w]. Angles are in radians unless a name says degrees.
(function (root) {
  const RAD = Math.PI / 180;

  function multiply(a, b) {
    return [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ];
  }

  function conjugate(q) {
    return [-q[0], -q[1], -q[2], q[3]];
  }

  function axisAngle(axis, angle) {
    const s = Math.sin(angle / 2);
    return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
  }

  // Turns vector v by quaternion q.
  function rotate(q, v) {
    const tx = 2 * (q[1] * v[2] - q[2] * v[1]);
    const ty = 2 * (q[2] * v[0] - q[0] * v[2]);
    const tz = 2 * (q[0] * v[1] - q[1] * v[0]);
    return [
      v[0] + q[3] * tx + (q[1] * tz - q[2] * ty),
      v[1] + q[3] * ty + (q[2] * tx - q[0] * tz),
      v[2] + q[3] * tz + (q[0] * ty - q[1] * tx),
    ];
  }

  // Which way the back camera points, from the phone's motion sensor reading
  // (alpha, beta, gamma in degrees) and how the screen is turned (0, 90, -90, 180).
  function fromDeviceOrientation(alphaDegrees, betaDegrees, gammaDegrees, screenDegrees) {
    const x = betaDegrees * RAD, y = alphaDegrees * RAD, z = -gammaDegrees * RAD;
    const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
    const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
    const device = [
      s1 * c2 * c3 + c1 * s2 * s3,
      c1 * s2 * c3 - s1 * c2 * s3,
      c1 * c2 * s3 - s1 * s2 * c3,
      c1 * c2 * c3 + s1 * s2 * s3,
    ];
    // The camera looks out of the back of the phone, not out of the top.
    const backOfPhone = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];
    const screen = axisAngle([0, 0, 1], -screenDegrees * RAD);
    return multiply(multiply(device, backOfPhone), screen);
  }

  // A pretend head: yaw to the right, pitch up. Used when there are no sensors.
  function fromYawPitch(yaw, pitch) {
    return multiply(axisAngle([0, 1, 0], -yaw), axisAngle([1, 0, 0], pitch));
  }

  // The direction of a point in the room: yaw to the right of front, pitch above the horizon.
  function direction(yaw, pitch) {
    return [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  }

  function yawOf(q) {
    const forward = rotate(q, [0, 0, -1]);
    return Math.atan2(forward[0], -forward[2]);
  }

  function pitchOf(q) {
    const forward = rotate(q, [0, 0, -1]);
    return Math.asin(Math.max(-1, Math.min(1, forward[1])));
  }

  // Where a room direction lands in the picture: x to the right, y up, in
  // scene units. Returns null when it is behind the viewer.
  function project(q, worldDirection, focal) {
    const d = rotate(conjugate(q), worldDirection);
    if (d[2] > -0.05) return null;
    return [focal * d[0] / -d[2], focal * d[1] / -d[2]];
  }

  const api = { multiply, conjugate, axisAngle, rotate, fromDeviceOrientation, fromYawPitch, direction, yawOf, pitchOf, project };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.PVR = root.PVR || {};
    root.PVR.math = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
