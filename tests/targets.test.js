'use strict';

// Run with: node --test tests/targets.test.js
const test = require('node:test');
const assert = require('node:assert');
const m = require('../js/math.js');
const { createTargets, rules } = require('../js/targets.js');

const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));

test('targets start in front of the player, in reach and not on top of each other', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const targets = createTargets(seed);
    assert.strictEqual(targets.list.length, rules.count);
    targets.list.forEach((target, i) => {
      assert.ok(Math.abs(target.yaw) <= rules.reachYaw);
      assert.ok(target.pitch >= rules.lowest && target.pitch <= rules.highest);
      for (let j = 0; j < i; j++) {
        assert.ok(angle(targets.direction(i, 0), targets.direction(j, 0)) >= rules.apart - 1e-9, `seed ${seed}: ${i} and ${j} overlap`);
      }
    });
  }
});

test('aiming the middle of the view at a target finds it, and aiming at nothing finds none', () => {
  const targets = createTargets(3);
  targets.list.forEach((target, i) => {
    assert.strictEqual(targets.aimedAt(m.fromYawPitch(target.yaw, target.pitch), 0), i);
  });
  assert.strictEqual(targets.aimedAt(m.fromYawPitch(Math.PI, 0), 0), -1); // looking behind
});

test('aiming follows where front is', () => {
  const targets = createTargets(4);
  const first = targets.list[0];
  assert.strictEqual(targets.aimedAt(m.fromYawPitch(first.yaw + 1, first.pitch), 1), 0);
});

test('popping counts once, hides the target, and it comes back somewhere after a moment', () => {
  const targets = createTargets(5);
  const first = targets.list[0];
  assert.strictEqual(targets.pop(0), true);
  assert.strictEqual(targets.pop(0), false);
  assert.strictEqual(targets.popped, 1);
  assert.strictEqual(targets.aimedAt(m.fromYawPitch(first.yaw, first.pitch), 0), -1);

  targets.update(rules.comeBack / 2);
  assert.ok(first.away > 0, 'still away half way through');
  targets.update(rules.comeBack);
  assert.strictEqual(first.away, 0);
  assert.strictEqual(targets.pop(0), true);
  assert.strictEqual(targets.popped, 2);
});
