'use strict';

// Run with: node --test tests/game.test.js
const test = require('node:test');
const assert = require('node:assert');
const m = require('../js/math.js');
const { createGame, rules } = require('../js/game.js');

const STEP = 1 / 60;
const lookAt = (yaw, pitch) => m.fromYawPitch(yaw, pitch);
const angleBetween = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));

// Plays one whole game. aim(game, seconds) says where the player looks each moment.
function play(game, aim, watch) {
  let seconds = 0;
  while (game.phase !== 'done' && seconds < 120) {
    const before = game.direction(0);
    const look = aim(game, seconds);
    game.update(STEP, lookAt(look[0], look[1]), 0);
    seconds += STEP;
    if (watch) watch(game, seconds, angleBetween(before, game.direction(0)) / STEP);
  }
  return seconds;
}
const perfect = (game) => [game.yaw, game.pitch];

test('the game does not begin until the crosshair has rested on the circle', () => {
  const game = createGame(1);
  for (let i = 0; i < 300; i++) game.update(STEP, lookAt(0.5, 0), 0); // five seconds looking away
  assert.strictEqual(game.phase, 'waiting');
  assert.strictEqual(game.timeLeft, rules.length);
  for (let i = 0; i < 60; i++) game.update(STEP, lookAt(0, 0), 0);    // one second on it: not long enough
  assert.strictEqual(game.phase, 'waiting');
  for (let i = 0; i < 40; i++) game.update(STEP, lookAt(0, 0), 0);
  assert.strictEqual(game.phase, 'playing');
});

test('following perfectly for the whole minute scores full points, and the game lasts one minute', () => {
  const game = createGame(2);
  const seconds = play(game, perfect);
  assert.strictEqual(game.phase, 'done');
  assert.ok(Math.abs(seconds - (rules.holdToStart + rules.length)) < 0.1, `lasted ${seconds}`);
  assert.ok(Math.abs(game.score - rules.length * rules.pointsPerSecond) <= 5, `scored ${game.score}`);
});

test('looking away scores nothing', () => {
  const game = createGame(3);
  play(game, (g) => (g.phase === 'waiting' ? [0, 0] : [g.yaw + 0.5, g.pitch]));
  assert.strictEqual(game.score, 0);
});

test('following for only the first half scores about half', () => {
  const game = createGame(4);
  play(game, (g) => (g.timeLeft > 30 ? [g.yaw, g.pitch] : [g.yaw + 0.5, g.pitch]));
  assert.ok(Math.abs(game.score - 3000) < 60, `scored ${game.score}`);
});

test('the circle is clearly faster near the end than at the start', () => {
  for (let seed = 10; seed < 20; seed++) {
    const speeds = { early: [], late: [] };
    play(createGame(seed), perfect, (g, seconds, speed) => {
      if (g.phase !== 'playing' || g.stopped) return;
      if (g.timeLeft > 50) speeds.early.push(speed);
      if (g.timeLeft < 10) speeds.late.push(speed);
    });
    const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;
    assert.ok(mean(speeds.late) > 2.5 * mean(speeds.early), `seed ${seed}: early ${mean(speeds.early)}, late ${mean(speeds.late)}`);
  }
});

test('the circle stops and stays planted several times in a game', () => {
  const game = createGame(5);
  let stops = 0;
  let wasStopped = false;
  let movedWhileStopped = 0;
  play(game, perfect, (g, seconds, speed) => {
    if (g.stopped && !wasStopped) stops++;
    if (g.stopped && wasStopped) movedWhileStopped = Math.max(movedWhileStopped, speed);
    wasStopped = g.stopped;
  });
  assert.ok(stops >= 4 && stops <= 12, `stopped ${stops} times`);
  // Not exactly zero only because of rounding when measuring a tiny angle.
  assert.ok(movedWhileStopped < 1e-4, `moved at ${movedWhileStopped} rad/s while stopped`);
});

test('the circle stays in a comfortable area in front of the player and never jumps', () => {
  for (let seed = 20; seed < 30; seed++) {
    play(createGame(seed), perfect, (g, seconds, speed) => {
      assert.ok(Math.abs(g.yaw) <= rules.reachYaw + 1e-9);
      assert.ok(Math.abs(g.pitch) <= rules.reachPitch + 1e-9);
      if (g.phase === 'playing') assert.ok(speed < 40 * Math.PI / 180, `moved at ${speed} rad/s`);
    });
  }
});

test('the final score is handed over once, and looking at the circle afterwards starts another go', () => {
  const game = createGame(6);
  const finished = [];
  game.onFinish = (score) => finished.push(score);
  play(game, perfect);
  assert.deepStrictEqual(finished, [game.score]);
  assert.strictEqual(game.yaw, 0);

  for (let i = 0; i < 60; i++) game.update(STEP, lookAt(0, 0), 0); // results still showing
  assert.strictEqual(game.phase, 'done');
  for (let i = 0; i < 240; i++) game.update(STEP, lookAt(0, 0), 0);
  assert.strictEqual(game.phase, 'playing');
  assert.ok(game.score < 200, 'score started again');
});
