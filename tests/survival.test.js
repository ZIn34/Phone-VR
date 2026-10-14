'use strict';

// Run with: node --test tests/survival.test.js
const test = require('node:test');
const assert = require('node:assert');
const { createWorld } = require('../js/blocks.js');
const { createSurvival, rules, KINDS } = require('../js/survival.js');

const STEP = 1 / 60;
// A flat world keeps these tests about the creatures, not the hills.
const start = () => {
  const world = createWorld(11, true);
  return { world, life: createSurvival(world, 5), p: world.player };
};
const run = (world, life, seconds, each) => {
  for (let t = 0; t < seconds; t += STEP) {
    world.update(STEP, null);
    life.update(STEP);
    if (each && each(t)) return true;
  }
  return false;
};
const towards = (world, creature) => {
  const eye = world.eyes();
  const box = [creature.x, creature.y + KINDS[creature.kind].size[1] / 2, creature.z];
  const d = [box[0] - eye[0], box[1] - eye[1], box[2] - eye[2]];
  const length = Math.hypot(d[0], d[1], d[2]);
  return d.map((v) => v / length);
};

test('animals and enemies appear around you after a while, not on top of you', () => {
  const { world, life, p } = start();
  run(world, life, 30);
  const animals = life.creatures.filter((c) => KINDS[c.kind].animal);
  assert.ok(animals.length >= 1, 'some animals');
  assert.ok(life.creatures.length <= 3, 'only a few in your room');
  for (const c of animals) assert.ok(Math.hypot(c.x - p.x, c.z - p.z) > 2, 'not on top of you');
});

test('in the full world more of them appear, standing on the ground', () => {
  const world = createWorld(11);
  const life = createSurvival(world, 5);
  life.health = 1e9; // this test is about where they stand, not about being bitten
  run(world, life, 40);
  assert.ok(life.creatures.filter((c) => KINDS[c.kind].animal).length >= 3);
  assert.ok(life.creatures.some((c) => !KINDS[c.kind].animal), 'and an enemy');
  for (const c of life.creatures) {
    assert.ok(world.solid(Math.floor(c.x), c.y - 1, Math.floor(c.z)), 'ground underfoot');
    assert.ok(!world.solid(Math.floor(c.x), c.y, Math.floor(c.z)), 'not inside a block');
  }
});

test('an animal wanders about', () => {
  const { world, life, p } = start();
  const pig = life.add('pig', p.x + 4, p.z);
  const from = [pig.x, pig.z];
  let moved = 0;
  run(world, life, 20, () => { moved = Math.max(moved, Math.hypot(pig.x - from[0], pig.z - from[1])); return false; });
  assert.ok(moved > 1, `wandered ${moved.toFixed(1)} blocks`);
});

test('an animal can be hit, is knocked back, and three hits knock it out and give health back', () => {
  const { world, life, p } = start();
  const pig = life.add('pig', p.x + 2, p.z);
  pig.walking = false; pig.think = 99;
  life.health = 50;
  const before = pig.x;
  assert.strictEqual(life.hit(world.eyes(), towards(world, pig)), pig);
  assert.ok(pig.x > before, 'knocked away from you');
  assert.strictEqual(pig.health, 2);
  life.hit(world.eyes(), towards(world, pig));
  life.hit(world.eyes(), towards(world, pig));
  assert.ok(!life.creatures.includes(pig), 'gone');
  assert.strictEqual(life.knocked.animals, 1);
  assert.strictEqual(life.health, 50 + rules.food);
});

test('you cannot hit what is out of reach, or behind a block', () => {
  const { world, life, p } = start();
  const far = life.add('pig', p.x + 20, p.z);
  far.walking = false; far.think = 99;
  assert.strictEqual(life.hit(world.eyes(), towards(world, far)), null);

  const near = life.add('sheep', p.x + 3, p.z + 0.01);
  near.walking = false; near.think = 99;
  const x = Math.floor(p.x) + 2, z = Math.floor(p.z);
  for (let y = 1; y <= 7; y++) world.build({ before: [x, y, z] }); // a pillar between you and it
  assert.strictEqual(life.hit(world.eyes(), towards(world, near)), null);
});

test('an enemy comes towards you, hurts you when it reaches you, and can be knocked out', () => {
  const { world, life, p } = start();
  const enemy = life.add('creeper', p.x + 8, p.z);
  const startedAt = Math.hypot(enemy.x - p.x, enemy.z - p.z);
  run(world, life, 2);
  assert.ok(Math.hypot(enemy.x - p.x, enemy.z - p.z) < startedAt - 2, 'closer than it was');
  assert.strictEqual(life.health, rules.health, 'not hurt yet');
  assert.ok(run(world, life, 10, () => life.health < rules.health), 'hurt once it arrived');
  assert.strictEqual(life.health, rules.health - rules.bite);
  assert.ok(life.hurtAgo < 0.1);

  for (let i = 0; i < KINDS.creeper.health; i++) life.hit(world.eyes(), towards(world, enemy));
  assert.ok(!life.creatures.includes(enemy));
  assert.strictEqual(life.knocked.enemies, 1);
});

test('when health runs out you start again where you began, with full health', () => {
  const { world, life, p } = start();
  Object.assign(p, { x: p.x + 6, z: p.z + 3 });
  life.add('creeper', p.x + 1, p.z);
  life.health = rules.bite;
  assert.ok(run(world, life, 5, () => life.fellAgo < 0.1), 'ran out of health');
  assert.strictEqual(life.health, rules.health);
  assert.ok(Math.abs(p.x - world.start[0]) < 1e-6 && Math.abs(p.z - world.start[2]) < 1e-6, 'back at the start');
  assert.strictEqual(life.creatures.length, 0);
});

test('a long fall hurts, a short one does not', () => {
  const { world, life, p } = start();
  Object.assign(p, { y: p.y + 2.5, fall: 0 });
  world.setFlying(true); world.update(STEP, null); world.flying = false; // up in the air, then a plain drop
  run(world, life, 3);
  assert.strictEqual(Math.round(life.health), rules.health, 'a 2.5 block drop is fine');

  for (let y = 1; y <= 8; y++) world.build({ before: [Math.floor(p.x) + 3, y, Math.floor(p.z)] });
  Object.assign(p, { x: Math.floor(p.x) + 3.5, y: 9, fall: 0 });
  run(world, life, 0.5);
  for (let t = 0; t < 3; t += STEP) { world.update(STEP, [1, 0]); life.update(STEP); }
  assert.ok(life.health < rules.health - 30, `an 8 block fall cost ${rules.health - Math.round(life.health)} health`);
});

test('health comes back slowly once you have been left alone', () => {
  const { world, life } = start();
  life.health = 40;
  life.hurtAgo = 0;
  life.creatures = [];
  run(world, life, rules.restAfter - 0.5, () => { life.creatures = life.creatures.filter((c) => KINDS[c.kind].animal); return false; });
  assert.ok(life.health < 41, 'not yet');
  run(world, life, 6, () => { life.creatures = life.creatures.filter((c) => KINDS[c.kind].animal); return false; });
  assert.ok(life.health > 48 && life.health < 60, `back up to ${life.health.toFixed(0)}`);
});
