'use strict';

// Run with: node --test tests/steps.test.js
const test = require('node:test');
const assert = require('node:assert');
const { createStepCounter } = require('../js/steps.js');

// Feeds the counter a made-up sensor signal, 60 readings a second.
// jolt(t) is added to gravity; turn(t) is how fast the phone is turning.
function run(seconds, jolt, turn) {
  const counter = createStepCounter();
  for (let i = 0; i < seconds * 60; i++) {
    const t = i / 60;
    counter.feed(0, 9.81 + jolt(t), 0, turn ? turn(t) : 0, t * 1000);
  }
  return counter.steps;
}

// Walking: a sharp bump each time a foot lands.
const walking = (stepsPerSecond, size) => (t) => {
  const phase = (t * stepsPerSecond) % 1;
  return phase < 0.25 ? size * Math.sin(phase / 0.25 * Math.PI) : -size * 0.2;
};

test('a phone held still counts no steps', () => {
  assert.strictEqual(run(20, () => 0), 0);
  assert.strictEqual(run(20, (t) => 0.15 * Math.sin(t * 40)), 0, 'a slightly shaky hand');
});

test('walking counts about one step for each real step', () => {
  for (const pace of [1.4, 1.8, 2.2]) {
    const steps = run(20, walking(pace, 3));
    const real = 20 * pace;
    assert.ok(Math.abs(steps - real) <= real * 0.12, `pace ${pace}: counted ${steps}, really ${real}`);
  }
});

test('gentle steps, like a phone held steady in both hands, are counted', () => {
  for (const size of [0.9, 1.2]) {
    const steps = run(20, walking(1.8, size));
    assert.ok(Math.abs(steps - 36) <= 4, `jolts of ${size}: counted ${steps}, really 36`);
  }
});

test('a phone held a little shakily, or bumped once, does not keep walking', () => {
  assert.strictEqual(run(20, (t) => 0.3 * Math.sin(t * 25) + 0.2 * Math.sin(t * 7.3)), 0, 'a shakier hand');
  assert.ok(run(10, (t) => (t > 3 && t < 3.1 ? 4 : 0)) <= 1, 'one knock is one step at most');
});

test('gentle steps and heavy steps both count', () => {
  assert.ok(run(10, walking(1.8, 2)) >= 15);
  assert.ok(run(10, walking(1.8, 6)) >= 15);
  assert.ok(run(10, walking(1.8, 6)) <= 21, 'one heavy step is not counted twice');
});

test('tilting the phone slowly to look around counts no steps', () => {
  // Gravity moves between the axes but its strength stays the same.
  const counter = createStepCounter();
  for (let i = 0; i < 20 * 60; i++) {
    const t = i / 60;
    const angle = Math.sin(t * 0.8) * 1.2;
    counter.feed(9.81 * Math.sin(angle), 9.81 * Math.cos(angle), 0, 40, t * 1000);
  }
  assert.strictEqual(counter.steps, 0);
});

test('swinging the phone round fast is ignored even when it jolts', () => {
  assert.strictEqual(run(10, walking(1.8, 3), () => 250), 0);
});

test('steps start counting again after the phone stops swinging', () => {
  const steps = run(20, walking(1.8, 3), (t) => (t < 10 ? 250 : 0));
  assert.ok(steps >= 15 && steps <= 20, `counted ${steps} in the still half`);
});
