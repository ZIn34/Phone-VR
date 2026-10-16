'use strict';

// Run with: node --test tests/steps.test.js
const test = require('node:test');
const assert = require('node:assert');
const { createStepCounter, createStepWay } = require('../js/steps.js');

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

// Walking a made-up way: x east, y up, z south. Each step the body rises and
// falls and its speed along the way swings with it, fastest as the foot lands;
// it also sways from side to side once every two steps.
function walkWay(way, seconds, more = {}) {
  const feeler = createStepWay();
  const pace = more.pace || 1.8, w = 2 * Math.PI * pace;
  const side = [-way[1], way[0]];
  let seed = 3;
  const noise = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * 2 * (more.noise || 0.3); };
  for (let i = 0; i < seconds * 60; i++) {
    const t = i / 60;
    const up = more.still ? 0 : 1.5 * Math.cos(w * t);
    const push = more.still ? 0 : -0.15 * w * Math.sin(w * t);     // the speed along the way swings with the up-and-down
    const sway = more.still ? 0 : 0.6 * Math.sin(w * t / 2);
    let reading = [way[0] * push + side[0] * sway + 0.3 + noise(), 9.81 + up + noise(), way[1] * push + side[1] * sway + noise()];
    if (more.flipped) reading = reading.map((v) => -v);         // some phones give it the other way up
    feeler.feed(reading[0], reading[1], reading[2], t * 1000);
  }
  return feeler;
}
const QUARTER = Math.PI / 2;
const NORTH = [0, -1], EAST = [1, 0], SOUTH = [0, 1], WEST = [-1, 0];

test('the way of the steps is felt: forward, back, left and right', () => {
  assert.strictEqual(walkWay(NORTH, 4).turn(NORTH), 0, 'forward');
  assert.strictEqual(Math.abs(walkWay(SOUTH, 4).turn(NORTH)), 2 * QUARTER, 'backwards');
  assert.strictEqual(walkWay(WEST, 4).turn(NORTH), QUARTER, 'to the left');
  assert.strictEqual(walkWay(EAST, 4).turn(NORTH), -QUARTER, 'to the right');
});

test('it is the way relative to where you face that counts', () => {
  assert.strictEqual(walkWay(EAST, 4).turn(EAST), 0, 'facing east, walking east: forward');
  assert.strictEqual(Math.abs(walkWay(WEST, 4).turn(EAST)), 2 * QUARTER, 'facing east, walking west: backwards');
  assert.strictEqual(walkWay(NORTH, 4).turn(EAST), QUARTER, 'facing east, walking north: left');
  // Slightly off a straight line still comes out as the nearest of the four.
  const a = 0.3;
  assert.strictEqual(walkWay([Math.sin(a), -Math.cos(a)], 4).turn(NORTH), 0);
});

test('slower or faster walking, and a phone giving its readings the other way up, still work', () => {
  assert.strictEqual(walkWay(SOUTH, 4, { pace: 1.3 }).turn(NORTH) !== 0, true);
  assert.strictEqual(walkWay(WEST, 4, { pace: 2.3 }).turn(NORTH), QUARTER);
  assert.strictEqual(walkWay(WEST, 4, { flipped: true }).turn(NORTH), QUARTER);
});

test('just jiggling about, with no steps, comes out as forward', () => {
  assert.strictEqual(walkWay(NORTH, 6, { still: true, noise: 0.8 }).turn(NORTH), 0);
  assert.strictEqual(walkWay(EAST, 6, { still: true, noise: 0.8 }).turn(NORTH), 0);
});

test('turning round to walk the other way is felt within a couple of steps', () => {
  const feeler = walkWay(NORTH, 3);
  // Carry on with the same feeler, now walking south.
  const w = 2 * Math.PI * 1.8;
  for (let i = 0; i < 1.5 * 60; i++) {
    const t = 3 + i / 60;
    feeler.feed(0, 9.81 + 1.5 * Math.cos(w * t), -0.15 * w * Math.sin(w * t), t * 1000);
  }
  assert.strictEqual(Math.abs(feeler.turn(NORTH)), 2 * QUARTER);
});
