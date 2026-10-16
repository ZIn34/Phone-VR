'use strict';

// Run with: node --test tests/blocks.test.js
const test = require('node:test');
const assert = require('node:assert');
const { createWorld, rules, kinds, RECIPES, SIZE, HEIGHT } = require('../js/blocks.js');

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
  world.unlimited = true; // this test is about walking, not about running out of blocks
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

test('Block world has no edge: walking one way for a long time keeps finding new land', () => {
  const world = createWorld(6);
  world.setFlying(true); // up above the hills and trees, so they do not stop the walk
  for (let i = 0; i < 60 * 5; i++) world.update(STEP, [0, 1, 0]);
  for (let i = 0; i < 60 * 120; i++) world.update(STEP, [1, 0, 0]);
  assert.ok(world.player.x > SIZE + 500, `only got to x ${world.player.x.toFixed(0)}`);
  const x = Math.floor(world.player.x), z = Math.floor(world.player.z);
  assert.ok(world.top(x + 20, z) >= 1, 'ground further ahead');
  for (let i = 0; i < 60 * 60; i++) world.update(STEP, [0, 0, -1]);
  assert.ok(world.player.z < -150, 'and north, below zero');
  assert.ok(world.top(Math.floor(world.player.x), Math.floor(world.player.z)) >= 1);
});

test('an arena still has an edge', () => {
  const world = createWorld(6, false, true);
  for (let i = 0; i < 60 * 30; i++) world.update(STEP, [1, 0]);
  assert.ok(world.player.x <= SIZE - rules.edge + 1e-9);
  for (let i = 0; i < 60 * 30; i++) world.update(STEP, [0, -1]);
  assert.ok(world.player.z >= rules.edge - 1e-9);
});

test('the first land is exactly as it was before the world had no edge', () => {
  const old = require('./old-blocks.js');
  for (const seed of [20261013, 3]) {
    const before = old.createWorld(seed), now = createWorld(seed);
    for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) for (let y = 0; y < old.HEIGHT; y++) {
      if (before.get(x, y, z) !== now.get(x, y, z)) assert.fail(`seed ${seed}: differs at ${x},${y},${z}`);
    }
    assert.deepStrictEqual(now.start, before.start);
  }
});

test('a save from before the world had no edge loads, with builds in the same places', () => {
  const old = require('./old-blocks.js');
  const before = old.createWorld(20261013);
  before.unlimited = true;
  const p = before.player;
  const spot = [Math.floor(p.x) + 2, Math.floor(p.y) + 3, Math.floor(p.z)];
  before.build({ before: spot });
  const dug = [5, before.top(5, 90), 90];
  before.dig({ block: dug });
  const now = createWorld(20261013);
  assert.strictEqual(now.load(before.save()), true);
  assert.strictEqual(now.get(...spot), kinds.PLANKS);
  assert.strictEqual(now.get(...dug), kinds.AIR);
});

test('far from the start, the land has hills and plains and trees, and does not repeat', () => {
  const world = createWorld(20261013);
  const tops = [];
  let trees = 0;
  for (let x = 400; x < 700; x++) {
    for (let z = -300; z < 0; z += 3) {
      const top = world.top(x, z);
      assert.ok(top >= 1 && top < HEIGHT, `ground at ${x},${z}`);
      if (world.get(x, top, z) === kinds.LEAVES) trees++;
      if (z === -150) tops.push(top);
    }
  }
  assert.ok(Math.max(...tops) - Math.min(...tops) >= 6, `heights only ${Math.min(...tops)} to ${Math.max(...tops)}`);
  assert.ok(trees > 200, `only ${trees} tree tops`);
  // Two stretches of land a long way apart are not the same.
  let same = 0;
  for (let i = 0; i < 200; i++) if (world.top(1000 + i, 50) === world.top(5000 + i, 50)) same++;
  assert.ok(same < 120, `${same} of 200 the same`);
});

test('what you build far away is still there after walking away and back, and after saving', () => {
  const world = createWorld(4);
  world.unlimited = true;
  const spot = [-300, world.top(-300, 700) + 1, 700];
  world.build({ before: spot });
  assert.strictEqual(world.get(...spot), kinds.PLANKS);
  world.setFlying(true);
  for (let i = 0; i < 60 * 5; i++) world.update(STEP, [0, 1, 0]);
  for (let i = 0; i < 60 * 10; i++) world.update(STEP, [1, 0, 0]); // far enough that the land there is forgotten
  assert.strictEqual(world.get(...spot), kinds.PLANKS, 'made again with the build in it');
  const again = createWorld(4);
  assert.strictEqual(again.load(world.save()), true);
  assert.strictEqual(again.get(...spot), kinds.PLANKS);
});

test('the Real life world has a floor everywhere and no edge', () => {
  const world = createWorld(5, true);
  for (const [x, z] of [[48, 48], [-500, 20], [3000, -3000]]) assert.strictEqual(world.get(x, 0, z), kinds.FLOOR);
  for (let i = 0; i < 60 * 30; i++) world.update(STEP, [-1, 0]);
  assert.ok(world.player.x < -50);
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

// A flat strip of stone to the east of the player, so these do not depend on the hills.
function flatStrip(world) {
  world.unlimited = true;
  const p = world.player;
  const x = Math.floor(p.x), z = Math.floor(p.z), y = Math.floor(p.y);
  world.kind = 2; // stone
  for (let dx = -1; dx <= 8; dx++) for (let dz = -1; dz <= 1; dz++) {
    for (let dy = 0; dy < 8; dy++) world.dig({ block: [x + dx, y + dy, z + dz] });
    if (!world.solid(x + dx, y - 1, z + dz)) world.build({ before: [x + dx, y - 1, z + dz] });
  }
  settle(world);
  return { x, y, z };
}

test('walking into a step lifts you up it a little at a time, not all at once', () => {
  const world = createWorld(5);
  const { x, y, z } = flatStrip(world);
  world.build({ before: [x + 3, y, z] });
  const p = world.player;
  let biggestRise = 0;
  let last = p.y;
  for (let i = 0; i < 240; i++) {
    world.update(STEP, [1, 0]);
    biggestRise = Math.max(biggestRise, p.y - last);
    last = p.y;
  }
  assert.ok(p.x > x + 3, 'got up the step');
  assert.ok(biggestRise < 0.2, `rose at most ${biggestRise.toFixed(3)} blocks in one frame (it used to jump a whole block)`);
});

test('a jump takes you up more than one block and brings you back down; you cannot jump in mid-air', () => {
  const world = createWorld(5);
  const { y } = flatStrip(world);
  const p = world.player;
  assert.strictEqual(world.jump(), true);
  let highest = y;
  let jumpedAgain = false;
  for (let i = 0; i < 120; i++) {
    world.update(STEP, null);
    highest = Math.max(highest, p.y);
    if (i === 10) jumpedAgain = world.jump();
  }
  assert.ok(highest > y + 1.05 && highest < y + 1.8, `rose ${(highest - y).toFixed(2)} blocks`);
  assert.strictEqual(jumpedAgain, false);
  assert.ok(Math.abs(p.y - y) < 1e-6, 'back on the ground');
});

test('flying: you do not fall, you go where you look, and you come back down when it is switched off', () => {
  const world = createWorld(5);
  const { y } = flatStrip(world);
  const p = world.player;
  world.setFlying(true);
  for (let i = 0; i < 60; i++) world.update(STEP, null);
  assert.ok(Math.abs(p.y - y) < 1e-6, 'hovering, not falling');
  for (let i = 0; i < 60; i++) world.update(STEP, [0.6, 0.8, 0]); // looking up and east
  assert.ok(p.y > y + 3, `flew up to ${(p.y - y).toFixed(1)} above the ground`);
  assert.ok(p.x > Math.floor(p.x) - 1 && p.x > 48, 'and forwards');
  const height = p.y;
  for (let i = 0; i < 60; i++) world.update(STEP, null);
  assert.ok(Math.abs(p.y - height) < 1e-6, 'stays up when not moving');
  world.setFlying(false);
  let landed = -1;
  for (let i = 0; i < 300; i++) { world.update(STEP, null); if (world.landed) landed = world.landed; }
  assert.ok(world.onGround(), 'came back down');
  assert.ok(landed <= 0, 'and coming down from flying does not count as a fall');
});

test('falling off something tall is reported as a fall of that height', () => {
  const world = createWorld(5);
  const { x, y, z } = flatStrip(world);
  const p = world.player;
  Object.assign(p, { y: y + 6, fall: 0 });
  world.setFlying(true); world.update(STEP, null); world.setFlying(false); // put up in the air...
  world.update(STEP, [0, 1, 0]);
  let fell = 0;
  // ...then a real fall: walk off a tower.
  for (let dy = 0; dy < 5; dy++) world.build({ before: [x + 5, y + dy, z] });
  Object.assign(p, { x: x + 5.5, y: y + 5, z: z + 0.5, fall: 0 });
  for (let i = 0; i < 30; i++) world.update(STEP, null);
  for (let i = 0; i < 400; i++) { world.update(STEP, [1, 0]); if (world.landed > fell) fell = world.landed; }
  assert.ok(fell > 4.5 && fell < 5.5, `fell ${fell.toFixed(2)} blocks`);
});

test('breaking a block gives you that block, building uses one up, and you cannot build what you do not have', () => {
  const world = createWorld(3);
  const planks = world.have[kinds.PLANKS];
  const target = world.aim(world.eyes(), [0.6, -0.8, 0]);
  const ground = world.get(...target.block);
  assert.strictEqual(world.build(target), true);
  assert.strictEqual(world.have[kinds.PLANKS], planks - 1);
  world.dig(world.aim(world.eyes(), [0.6, -0.8, 0]));
  assert.strictEqual(world.have[kinds.PLANKS], planks, 'got the planks back');
  const before = world.have[ground];
  world.dig(world.aim(world.eyes(), [0.6, -0.8, 0]));
  assert.strictEqual(world.have[ground], before + 1, 'and the ground block that was dug');

  world.setKind(8); // Lamp: none to begin with
  assert.strictEqual(world.kindName(), 'Lamp');
  assert.strictEqual(world.have[kinds.LAMP], 0);
  assert.strictEqual(world.build(world.aim(world.eyes(), [0.6, -0.8, 0])), false);
});

test('crafting turns what you have into something else, and only if you have enough', () => {
  const world = createWorld(3);
  assert.ok(RECIPES.length >= 3, 'at least three things to craft');
  const planks = RECIPES.find((r) => r.name === 'Planks');
  assert.strictEqual(world.canCraft(planks), false, 'no wood yet');
  assert.strictEqual(world.craft(planks), false);
  world.have[kinds.WOOD] = 2;
  const had = world.have[kinds.PLANKS];
  assert.strictEqual(world.craft(planks), true);
  assert.strictEqual(world.have[kinds.WOOD], 1);
  assert.strictEqual(world.have[kinds.PLANKS], had + 4);

  const brick = RECIPES.find((r) => r.name === 'Brick');
  const stone = world.have[kinds.STONE];
  assert.strictEqual(world.craft(brick), true);
  assert.strictEqual(world.have[kinds.STONE], stone - 2);

  const lamp = RECIPES.find((r) => r.name === 'Lamp');
  world.have[kinds.LEAVES] = 2;
  assert.strictEqual(world.craft(lamp), true);
  assert.strictEqual(world.have[kinds.LAMP], 1);
  assert.strictEqual(world.canCraft(lamp), false, 'the leaves are used up');
});

test('what you are carrying is saved too', () => {
  const world = createWorld(3);
  world.have[kinds.WOOD] = 7;
  const again = createWorld(3);
  again.load(world.save());
  assert.strictEqual(again.have[kinds.WOOD], 7);
});
