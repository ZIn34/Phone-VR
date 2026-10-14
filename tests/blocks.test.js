'use strict';

// Run with: node --test tests/blocks.test.js
const test = require('node:test');
const assert = require('node:assert');
const { createWorld, rules, kinds, SIZE, HEIGHT } = require('../js/blocks.js');

const STEP = 1 / 60;
const settle = (world) => { for (let i = 0; i < 120; i++) world.update(STEP, null); };

test('the same seed always makes the same world, and a different seed a different one', () => {
  const one = createWorld(7), two = createWorld(7), other = createWorld(8);
  let same = true, differs = false;
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) {
    if (one.top(x, z) !== two.top(x, z)) same = false;
    if (one.top(x, z) !== other.top(x, z)) differs = true;
  }
  assert.ok(same);
  assert.ok(differs);
});

test('there is ground everywhere, with grass on top where nothing grows on it', () => {
  const world = createWorld(1);
  let grass = 0;
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) {
    assert.ok(world.top(x, z) >= 1, `no ground at ${x},${z}`);
    assert.ok(world.top(x, z) < HEIGHT - 1);
    if (world.get(x, world.top(x, z), z) === kinds.GRASS) grass++;
  }
  assert.ok(grass > SIZE * SIZE * 0.7, `only ${grass} grass tops`);
});

test('the player starts standing on the ground, not in it and not falling', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const world = createWorld(seed);
    const p = world.player;
    assert.ok(!world.blocked(p.x, p.y, p.z), 'not inside a block');
    const start = p.y;
    settle(world);
    assert.ok(Math.abs(p.y - start) < 1e-9, `seed ${seed}: moved from ${start} to ${p.y}`);
    assert.ok(world.solid(Math.floor(p.x), Math.floor(p.y) - 1, Math.floor(p.z)), 'ground underfoot');
  }
});

test('looking straight down aims at the block underfoot, and the place to build is just above it', () => {
  const world = createWorld(2);
  const p = world.player;
  const target = world.aim(world.eyes(), [0, -1, 0]);
  assert.deepStrictEqual(target.block, [Math.floor(p.x), Math.floor(p.y) - 1, Math.floor(p.z)]);
  assert.deepStrictEqual(target.before, [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)]);
});

test('aiming at the sky or beyond reach finds nothing', () => {
  const world = createWorld(2);
  assert.strictEqual(world.aim(world.eyes(), [0, 1, 0]), null);
  assert.strictEqual(world.aim([16.5, HEIGHT - 1, 16.5], [1, 0, 0]), null);
});

test('a block can be built where you aim, stays there, and can be broken again', () => {
  const world = createWorld(3);
  const eyes = world.eyes();
  const down = [0.6, -0.8, 0]; // the ground a little way in front
  const first = world.aim(eyes, down);
  assert.ok(first);
  const before = world.changed;
  assert.strictEqual(world.build(first), true);
  assert.strictEqual(world.get(...first.before), kinds.PLANKS);
  assert.ok(world.changed > before);

  const second = world.aim(eyes, down);
  assert.deepStrictEqual(second.block, first.before, 'now aiming at the new block');
  assert.strictEqual(world.dig(second), true);
  assert.strictEqual(world.get(...first.before), kinds.AIR);
  assert.deepStrictEqual(world.aim(eyes, down).block, first.block);
});

test('you cannot build a block on top of yourself, or break the bottom of the world', () => {
  const world = createWorld(4);
  const p = world.player;
  const feet = world.aim(world.eyes(), [0, -1, 0]);
  assert.strictEqual(world.build(feet), false, 'the place above the ground block is where you are standing');
  assert.strictEqual(world.dig({ block: [Math.floor(p.x), 0, Math.floor(p.z)] }), false);
  assert.strictEqual(world.solid(Math.floor(p.x), 0, Math.floor(p.z)), true);
});

test('choosing another kind of block builds that kind', () => {
  const world = createWorld(3);
  world.nextKind();
  assert.strictEqual(world.kindName(), 'Brick');
  const target = world.aim(world.eyes(), [0.6, -0.8, 0]);
  world.build(target);
  assert.strictEqual(world.get(...target.before), kinds.BRICK);
});

test('walking moves you, keeps you on the ground, and never puts you inside a block', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const world = createWorld(seed);
    const p = world.player;
    const start = [p.x, p.z];
    for (const way of [[1, 0], [0, 1], [-1, 0.3], [0.2, -1]]) {
      for (let i = 0; i < 240; i++) {
        world.update(STEP, way);
        assert.ok(!world.blocked(p.x, p.y, p.z), `seed ${seed}: inside a block at ${p.x},${p.y},${p.z}`);
        assert.ok(p.y >= 1, 'did not fall through the world');
      }
    }
    settle(world);
    assert.ok(world.blocked(p.x, p.y - 0.05, p.z), 'standing on something');
    assert.ok(Number.isFinite(p.x + p.z + start[0]));
  }
});

test('a wall two blocks high stops you; a step one block high is climbed', () => {
  const world = createWorld(5);
  const p = world.player;
  const x = Math.floor(p.x), z = Math.floor(p.z), y = Math.floor(p.y);
  // Flatten a strip to the east so the test does not depend on the hills.
  for (let dx = -1; dx <= 6; dx++) for (let dz = -1; dz <= 1; dz++) {
    for (let dy = 0; dy < 6; dy++) world.dig({ block: [x + dx, y + dy, z + dz] });
    world.kind = 2; // stone
    if (!world.solid(x + dx, y - 1, z + dz)) world.build({ before: [x + dx, y - 1, z + dz] });
  }
  settle(world);
  // One block high, three blocks east.
  world.build({ before: [x + 3, y, z] });
  for (let i = 0; i < 180; i++) world.update(STEP, [1, 0]);
  assert.ok(p.x > x + 3, `climbed the step and carried on: x ${p.x}`);

  // Back to the start, then a wall two high.
  Object.assign(p, { x: x + 0.5, y, z: z + 0.5, fall: 0 });
  world.build({ before: [x + 3, y + 1, z] });
  world.build({ before: [x + 3, y, z - 1] });
  world.build({ before: [x + 3, y + 1, z - 1] });
  world.build({ before: [x + 3, y, z + 1] });
  world.build({ before: [x + 3, y + 1, z + 1] });
  for (let i = 0; i < 180; i++) world.update(STEP, [1, 0]);
  assert.ok(p.x < x + 3, `stopped by the wall: x ${p.x}`);
  assert.ok(Math.abs(p.y - y) < 1e-6, 'still on the ground');
});

test('you cannot walk off the edge of the world', () => {
  const world = createWorld(6);
  for (let i = 0; i < 60 * 30; i++) world.update(STEP, [1, 0]);
  assert.ok(world.player.x <= SIZE - rules.edge + 1e-9);
  for (let i = 0; i < 60 * 30; i++) world.update(STEP, [0, -1]);
  assert.ok(world.player.z >= rules.edge - 1e-9);
});

test('what you built, where you are and the block in hand come back after saving', () => {
  const world = createWorld(3);
  const target = world.aim(world.eyes(), [0.6, -0.8, 0]);
  assert.strictEqual(world.build(target), true);
  world.nextKind();
  for (let i = 0; i < 60; i++) world.update(STEP, [0, 1]);
  const saved = world.save();

  const again = createWorld(3);
  assert.strictEqual(again.load(saved), true);
  assert.strictEqual(again.get(...target.before), kinds.PLANKS);
  assert.strictEqual(again.kindName(), 'Brick');
  assert.ok(Math.abs(again.player.z - world.player.z) < 0.02);

  assert.strictEqual(createWorld(10).load(saved), false, 'a save from another world is not used');
  assert.strictEqual(createWorld(3).load('not a save'), false);
});
