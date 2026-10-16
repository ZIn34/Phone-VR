'use strict';

// Run with: node --test tests/math.test.js
const test = require('node:test');
const assert = require('node:assert');
const m = require('../js/math.js');

const RAD = Math.PI / 180;
const FOCAL = 2.8;
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: got ${actual}, expected ${expected}`);
const front = m.direction(0, 0);

// A phone held sideways and upright (top of the phone to the left), looking at
// the horizon, reads alpha 0, beta 0, gamma -90 with the screen turned 90.
const level = () => m.fromDeviceOrientation(0, 0, -90, 90);

test('a phone lying flat on a table has its camera pointing at the floor', () => {
  const forward = m.rotate(m.fromDeviceOrientation(0, 0, 0, 0), [0, 0, -1]);
  near(forward[1], -1, 'camera points down');
});

test('a phone held sideways and upright looks at the horizon with the picture the right way up', () => {
  const q = level();
  near(m.pitchOf(q), 0, 'looking level');
  const up = m.rotate(q, [0, 1, 0]);
  near(up[1], 1, 'top of the picture is up');
});

test('the same pose with the phone turned the other way round is also the right way up', () => {
  const q = m.fromDeviceOrientation(0, 0, 90, -90);
  near(m.pitchOf(q), 0, 'looking level');
  near(m.rotate(q, [0, 1, 0])[1], 1, 'top of the picture is up');
});

test('turning the head left slides a marker to the right, and right slides it left', () => {
  const start = level();
  const marker = m.direction(m.yawOf(start), 0);
  near(m.project(start, marker, FOCAL)[0], 0, 'marker starts in the middle');

  const left = m.fromDeviceOrientation(10, 0, -90, 90);
  near(m.yawOf(left) - m.yawOf(start), -10 * RAD, 'head turned 10 degrees left');
  const afterLeft = m.project(left, marker, FOCAL);
  near(afterLeft[0], FOCAL * Math.tan(10 * RAD), 'marker moved right by 10 degrees');
  near(afterLeft[1], 0, 'marker stayed on the horizon');

  const right = m.fromDeviceOrientation(-10, 0, -90, 90);
  near(m.project(right, marker, FOCAL)[0], -FOCAL * Math.tan(10 * RAD), 'marker moved left by 10 degrees');
});

test('looking up moves the horizon down, and looking down moves it up', () => {
  const start = level();
  const marker = m.direction(m.yawOf(start), 0);

  // Tipping past upright: the sensor reports it as alpha 180, beta 180, gamma 80.
  const up = m.fromDeviceOrientation(180, 180, 80, 90);
  near(m.pitchOf(up), 10 * RAD, 'looking 10 degrees up');
  near(m.project(up, marker, FOCAL)[1], -FOCAL * Math.tan(10 * RAD), 'horizon moved down');

  const down = m.fromDeviceOrientation(0, 0, -80, 90);
  near(m.pitchOf(down), -10 * RAD, 'looking 10 degrees down');
  near(m.project(down, marker, FOCAL)[1], FOCAL * Math.tan(10 * RAD), 'horizon moved up');
});

test('a full turn brings every marker back to where it started (no built-in drift)', () => {
  const before = m.project(m.fromDeviceOrientation(0, 0, -90, 90), m.direction(m.yawOf(level()) + 0.1, 0.1), FOCAL);
  const after = m.project(m.fromDeviceOrientation(360, 0, -90, 90), m.direction(m.yawOf(level()) + 0.1, 0.1), FOCAL);
  near(after[0], before[0], 'same x after a full turn');
  near(after[1], before[1], 'same y after a full turn');
});

test('things behind the viewer are not drawn', () => {
  assert.strictEqual(m.project(level(), m.direction(m.yawOf(level()) + Math.PI, 0), FOCAL), null);
});

test('the pretend head used on a computer moves the same way as the real sensor', () => {
  near(m.yawOf(m.fromYawPitch(0.4, 0)), 0.4, 'yaw to the right');
  near(m.pitchOf(m.fromYawPitch(0, 0.3)), 0.3, 'pitch up');
  near(m.project(m.fromYawPitch(-10 * RAD, 0), front, FOCAL)[0], FOCAL * Math.tan(10 * RAD), 'turn left, marker goes right');
  near(m.project(m.fromYawPitch(0, 10 * RAD), front, FOCAL)[1], -FOCAL * Math.tan(10 * RAD), 'look up, horizon goes down');
});

test('a phone movement reading comes out the right way round in the world', () => {
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
  // Flat on a table, top pointing north: gravity's reading (out of the screen) is up.
  assert.ok(near(m.phoneToWorld(m.phoneFrame(0, 0, 0), [0, 0, 9.81]), [0, 9.81, 0]));
  // Held up, facing north: its top is up, and moving it to its right is moving east.
  const upright = m.phoneFrame(0, 90, 0);
  assert.ok(near(m.phoneToWorld(upright, [0, 9.81, 0]), [0, 9.81, 0]));
  assert.ok(near(m.phoneToWorld(upright, [1, 0, 0]), [1, 0, 0]));
  assert.ok(near(m.phoneToWorld(upright, [0, 0, 1]), [0, 0, 1]), 'out of the screen, towards you: south');
  // Worked back from the camera: the same as read straight from the sensor, upright or sideways.
  for (const [alpha, beta, gamma, screen] of [[30, 80, 5, 0], [200, 10, -70, 90], [90, -20, 60, -90]]) {
    const camera = m.fromDeviceOrientation(alpha, beta, gamma, screen);
    const back = m.phoneFrameOf(camera, screen), direct = m.phoneFrame(alpha, beta, gamma);
    const same = near(back, direct) || near(back, direct.map((v) => -v));
    assert.ok(same, `${alpha},${beta},${gamma},${screen}`);
  }
});
