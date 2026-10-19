'use strict';

// Run with: node --test tests/fruit.test.js
const test = require('node:test');
const assert = require('node:assert');
const { createFruit, rules } = require('../js/fruit.js');

const STEP = 1 / 60;
const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return v.map((x) => x / l); };
const toward = (p) => unit([p[0] - rules.eye[0], p[1] - rules.eye[1], p[2] - rules.eye[2]]);
const still = (look) => ({ look, hands: [], handsOn: false, held: { left: false, right: false }, taps: {} });
// A game with no waves of its own, only what the test throws.
const quiet = () => { const game = createFruit(1); game.update(0, still([0, 0, -1])); return game; };
const noWaves = (game) => { game.score = 0; };

// Sweeps the cross across a thing from left to right over `seconds`, holding SLICE.
function sweepAcross(game, thing, seconds, width = 0.6, hold = false) {
  let cut = false;
  const frames = Math.round(seconds / STEP);
  for (let i = 0; i <= frames; i++) {
    if (hold) thing.going = [0, rules.gravity * STEP, 0]; // TEST: kept hanging in the air
    const aim = toward(thing.at);
    const side = (i / frames - 0.5) * 2 * width;
    const look = unit([aim[0] + side, aim[1], aim[2]]);
    const before = game.score;
    game.update(STEP, { look, hands: [], handsOn: false, held: { left: true, right: false }, taps: {} });
    if (game.score > before) cut = true;
  }
  return cut;
}

test('a fruit tossed up rises in front of you and falls back', () => {
  const game = quiet();
  const thing = game.toss('orange', 0, 3.8, 3);
  let top = 0;
  for (let t = 0; t < 1.5; t += STEP) { game.update(STEP, still([0, -1, 0])); top = Math.max(top, thing.at[1]); }
  assert.ok(top > 3.3 && top < 4.2, `peaked at ${top.toFixed(2)}`);
  assert.ok(thing.at[2] < -2, 'in front of you');
});

test('a quick sweep of the cross while holding SLICE cuts the fruit; a slow one does not', () => {
  const fast = quiet();
  const thing = fast.toss('apple', 0, 3.8, 3);
  for (let t = 0; t < 0.7; t += STEP) fast.update(STEP, still([0, -1, 0]));
  assert.ok(sweepAcross(fast, thing, 0.25), 'a quick sweep cuts');
  assert.ok(fast.pieces.some((piece) => piece.half), 'it falls apart in two halves');

  const slow = quiet();
  const other = slow.toss('apple', 0, 3.8, 3);
  for (let t = 0; t < 0.4; t += STEP) slow.update(STEP, still([0, -1, 0]));
  assert.ok(!sweepAcross(slow, other, 2.0, 0.3, true), 'a slow sweep does not');
});

test('a quick swipe of a fingertip cuts too', () => {
  const game = quiet();
  const thing = game.toss('melon', 0, 3.8, 3);
  for (let t = 0; t < 0.7; t += STEP) game.update(STEP, still([0, -1, 0]));
  let cut = false;
  for (let i = 0; i <= 12; i++) {
    const aim = toward(thing.at);
    const dir = unit([aim[0], aim[1] + (i / 12 - 0.5) * 0.8, aim[2]]);
    game.update(STEP, { look: [0, 0, -1], hands: [{ dir }], handsOn: true, held: {}, taps: {} });
    if (game.score) cut = true;
  }
  assert.ok(cut);
});

test('three fruit dropped and the game is over', () => {
  const game = quiet();
  for (let n = 0; n < 3; n++) {
    game.toss('lemon', 0, 3.5, 3);
    for (let t = 0; t < 3 && !game.over && game.fruit.length; t += STEP) game.update(STEP, still([0, -1, 0]));
  }
  assert.strictEqual(game.lives, 0);
  assert.ok(game.over);
});

test('cutting a bomb ends the game at once; leaving it costs nothing', () => {
  const left = quiet();
  left.toss('bomb', 0, 3.5, 3);
  for (let t = 0; t < 3; t += STEP) left.update(STEP, still([0, -1, 0]));
  assert.strictEqual(left.lives, rules.lives);
  assert.ok(!left.over);

  const game = quiet();
  const bomb = game.toss('bomb', 0, 3.8, 3);
  for (let t = 0; t < 0.7; t += STEP) game.update(STEP, still([0, -1, 0]));
  sweepAcross(game, bomb, 0.25);
  assert.ok(game.over);
  assert.strictEqual(game.overTitle, 'Boom!');
});

test('three fruit in one swipe is a combo, worth a bonus', () => {
  const game = quiet();
  const row = [-0.6, 0, 0.6].map((x) => game.toss('plum', 0, 3.8, 3));
  for (let t = 0; t < 0.7; t += STEP) game.update(STEP, still([0, -1, 0]));
  // Line them up side by side, still, then sweep across all three.
  row.forEach((thing, i) => { thing.at = [-0.6 + i * 0.6, 3.6, -3]; thing.going = [0, 0.001, 0]; });
  const from = toward([-1.2, 3.6, -3]), to = toward([1.2, 3.6, -3]);
  for (let i = 0; i <= 10; i++) {
    const look = unit(from.map((v, k) => v + (to[k] - v) * i / 10));
    game.update(STEP, { look, hands: [], handsOn: false, held: { left: false, right: true }, taps: {} });
    row.forEach((thing) => { if (!thing.cut) { thing.at[1] = 3.6; thing.going = [0, 0.001, 0]; } });
  }
  assert.strictEqual(game.score, 4, 'three fruit and one bonus');
  assert.ok(game.words.some((word) => /combo/.test(word.text)));
});

test('waves of fruit keep coming by themselves, and a new go starts clean', () => {
  const game = createFruit(3);
  let most = 0;
  for (let t = 0; t < 10; t += STEP) { game.update(STEP, still([0, -1, 0])); most = Math.max(most, game.fruit.length); }
  assert.ok(most >= 1);
  game.restart();
  assert.strictEqual(game.score, 0);
  assert.strictEqual(game.fruit.length, 0);
  assert.strictEqual(game.lives, rules.lives);
});
