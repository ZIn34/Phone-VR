'use strict';

// Run with: node --test tests/space.test.js
const test = require('node:test');
const assert = require('node:assert');
const { createSpace, rules } = require('../js/space.js');

const STEP = 1 / 60;
const AHEAD = [0, 0, -1];
const fly = (look, more = {}) => Object.assign({ look, hands: [], handsOn: false, held: { left: false, right: false }, taps: { left: false, right: false } }, more);
const start = () => { const game = createSpace(2); game.restart(); return game; };
const run = (game, seconds, input) => { for (let t = 0; t < seconds && !game.over; t += STEP) game.update(STEP, input || fly(AHEAD)); };
const unit = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };

test('looking to one side or up steers the ship that way, and it stays within bounds', () => {
  const game = start();
  run(game, 1, fly(unit([0.5, 0, -1])));
  assert.ok(game.eye[0] > 3, `moved right to ${game.eye[0].toFixed(1)}`);
  run(game, 5, fly(unit([0.8, 0, -1])));
  assert.strictEqual(game.eye[0], rules.across);
  const before = game.eye[1];
  run(game, 0.5, fly(unit([0, 0.5, -1])));
  assert.ok(game.eye[1] > before, 'climbed');
  run(game, 0.5, fly(AHEAD));
  const held = game.eye.slice();
  run(game, 0.5, fly(AHEAD));
  assert.deepStrictEqual(game.eye, held, 'looking straight ahead holds the line');
});

test('it goes faster as time goes on, up to a top speed, and the score counts distance', () => {
  const game = start();
  game.rocks = [];
  const first = game.speed;
  game.time = 200;
  run(game, 0.1);
  assert.ok(game.speed > first);
  assert.strictEqual(game.speed, rules.fastest);
  assert.ok(game.score > 0);
});

test('a rock in your path knocks a shield off; three knocks and the ship is done', () => {
  const game = start();
  for (let n = 0; n < 3; n++) {
    const rock = game.addRock([game.eye[0], game.eye[1], -20], 1.5);
    const before = game.shields;
    // TEST: only this rock, none of the ones that come by themselves.
    for (let t = 0; t < 3 && !game.over; t += STEP) { game.rocks = game.rocks.filter((r) => r === rock); game.update(STEP, fly(AHEAD)); }
    assert.strictEqual(game.shields, before - 1, `knock ${n + 1}`);
    game.safe = 0;
  }
  assert.ok(game.over);
});

test('a rock off to the side goes past without touching you', () => {
  const game = start();
  const rock = game.addRock([game.eye[0] + 4, game.eye[1], -20], 1.5);
  for (let t = 0; t < 3; t += STEP) { game.rocks = game.rocks.filter((r) => r === rock); game.update(STEP, fly(AHEAD)); }
  assert.strictEqual(game.shields, rules.shields);
});

test('flying through a ring scores, more for each ring in a row; missing one breaks the run', () => {
  const game = start();
  game.addRing([game.eye[0], game.eye[1], -15]);
  run(game, 2);
  const one = game.score;
  assert.ok(one > rules.ringScore, 'ring scored');
  game.addRing([game.eye[0], game.eye[1], -15]);
  run(game, 2);
  assert.strictEqual(game.streak, 2);
  game.addRing([game.eye[0] + 5, game.eye[1], -15]);
  run(game, 2);
  assert.strictEqual(game.streak, 0);
});

test('FIRE blasts a rock ahead to bits, and a big one takes two shots', () => {
  const game = start();
  const small = game.addRock([game.eye[0], game.eye[1], -30], 1.4);
  game.update(STEP, fly(AHEAD, { taps: { left: true, right: false } }));
  assert.ok(small.gone);
  assert.ok(game.bits.length > 0);
  const big = game.addRock([game.eye[0], game.eye[1], -40], 2.6);
  run(game, 0.3);
  game.update(STEP, fly(AHEAD, { taps: { left: true } }));
  assert.ok(!big.gone, 'still there after one shot');
  run(game, 0.3);
  game.update(STEP, fly(AHEAD, { taps: { left: true } }));
  assert.ok(big.gone);
});

test('with a hand, a pinch fires where the fingertip points', () => {
  const game = start();
  const rock = game.addRock([game.eye[0] + 6, game.eye[1], -30], 1.4);
  const dir = unit([6, 0, -30]);
  game.update(STEP, fly(AHEAD, { handsOn: true, hands: [{ dir, pinched: true }] }));
  assert.ok(rock.gone);
});

test('rocks and rings keep coming by themselves', () => {
  const game = start();
  let rocks = 0, rings = 0;
  for (let t = 0; t < 20; t += STEP) {
    game.update(STEP, fly(AHEAD));
    game.safe = 9; game.shields = 3; // TEST: cannot be knocked out
    rocks = Math.max(rocks, game.rocks.length);
    rings = Math.max(rings, game.rings.length);
  }
  assert.ok(rocks >= 2 && rings >= 1, `rocks ${rocks}, rings ${rings}`);
});
