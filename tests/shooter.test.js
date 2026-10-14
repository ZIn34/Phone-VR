'use strict';

// Run with: node --test tests/shooter.test.js
const test = require('node:test');
const assert = require('node:assert');
const { createWorld, SIZE } = require('../js/blocks.js');
const { createShooter, rules, BLASTERS } = require('../js/shooter.js');

const STEP = 1 / 60;
const MID = SIZE / 2;
const start = () => {
  const world = createWorld(42, false, true);
  return { world, game: createShooter(world, 7), you: world.eyes() };
};
const unit = (from, to) => {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const length = Math.hypot(d[0], d[1], d[2]);
  return d.map((v) => v / length);
};
const middleOf = (game, robot) => { const box = game.boxOf(robot); return [0, 1, 2].map((i) => (box[0][i] + box[1][i]) / 2); };
// Runs the game until something is true, for at most `seconds`.
const until = (game, you, seconds, done) => {
  for (let t = 0; t < seconds; t += STEP) {
    game.update(STEP, you);
    if (done()) return true;
  }
  return false;
};

test('the arena has walls round the middle, and you start in the middle standing on the floor', () => {
  const { world } = start();
  assert.ok(world.cover.length >= 6);
  assert.ok(Math.abs(world.player.x - MID - 0.5) < 1 && Math.abs(world.player.z - MID - 0.5) < 1);
  assert.strictEqual(world.player.y, 1);
  for (const wall of world.cover) {
    const far = Math.hypot(wall.behind[0] - MID, wall.behind[2] - MID);
    assert.ok(far > 6 && far < 16, `a wall ${far} from the middle`);
  }
});

test('a hidden robot cannot be seen or hit from the middle: its wall is in the way', () => {
  const { game, you } = start();
  for (const robot of game.robots) {
    assert.strictEqual(robot.state, 'hidden');
    const shot = game.fire(you, unit(you, middleOf(game, robot)));
    assert.ok(shot, 'the blaster fired');
    assert.strictEqual(shot.hit, null, 'the wall took the shot');
    game.wait = 0;
  }
  assert.strictEqual(game.score, 0);
});

test('robots step out, fire one slow bolt, and go back behind their wall', () => {
  const { game, you } = start();
  const robot = game.robots[0];
  const seen = new Set();
  let most = 0;
  until(game, you, 20, () => { seen.add(robot.state); most = Math.max(most, game.bolts.length); return seen.has('going') && robot.state === 'hidden'; });
  for (const state of ['hidden', 'coming', 'out', 'going']) assert.ok(seen.has(state), `was ${state} at some point`);
  assert.ok(most >= 1, 'a bolt was fired');
});

test('a robot that is out can be hit, and three hits from the first blaster knock it out', () => {
  const { game, you } = start();
  const robot = game.robots[0];
  assert.ok(until(game, you, 20, () => robot.state === 'out'));
  for (let hits = 1; hits <= 3; hits++) {
    game.wait = 0;
    const shot = game.fire(you, unit(you, middleOf(game, robot)));
    assert.strictEqual(shot.hit, robot, `hit ${hits} landed`);
  }
  assert.strictEqual(robot.state, 'down');
  assert.strictEqual(game.score, 1);
  game.wait = 0;
  assert.strictEqual(game.fire(you, unit(you, middleOf(game, robot))).hit, null, 'a knocked-out robot is not there to hit');
});

test('a knocked-out robot is replaced after a while', () => {
  const { game, you } = start();
  const robot = game.robots[0];
  robot.state = 'down';
  robot.time = rules.backAfter;
  assert.ok(until(game, you, rules.backAfter + 1, () => robot.state === 'hidden'));
  assert.strictEqual(robot.health, rules.robotHealth);
});

test('the blaster cannot fire again until it is ready', () => {
  const { game, you } = start();
  assert.ok(game.fire(you, [1, 0, 0]));
  assert.strictEqual(game.fire(you, [1, 0, 0]), null);
  until(game, you, BLASTERS[0].wait + 0.05, () => false);
  assert.ok(game.fire(you, [1, 0, 0]));
});

test('standing still, bolts reach you and take health off; you can see them coming for over a second', () => {
  const { game, you } = start();
  let longest = 0;
  const born = new Map();
  let clock = 0;
  until(game, you, 60, () => {
    clock += STEP;
    for (const bolt of game.bolts) if (!born.has(bolt)) born.set(bolt, clock);
    for (const [bolt, t] of born) if (!game.bolts.includes(bolt)) { longest = Math.max(longest, clock - t); born.delete(bolt); }
    return game.health < rules.health;
  });
  assert.ok(game.health < rules.health, 'was hit');
  assert.strictEqual(game.health, rules.health - rules.hurt);
  assert.ok(longest > 1, `a bolt was in the air for ${longest.toFixed(2)} s`);
  assert.ok(game.hurtAgo < 0.1);
});

test('stepping aside after a bolt is fired makes it miss', () => {
  const { game, you } = start();
  assert.ok(until(game, you, 30, () => game.bolts.length > 0));
  const aside = [you[0] + 3, you[1], you[2] + 3];
  until(game, aside, 3, () => false); // only long enough for that one bolt to arrive
  assert.strictEqual(game.health, rules.health);
});

test('when health runs out the game is over, the score is handed over once, and nothing more happens', () => {
  const { game, you } = start();
  const scores = [];
  game.onOver = (score) => scores.push(score);
  assert.ok(until(game, you, 400, () => game.over), 'the game ended');
  assert.strictEqual(game.health, 0);
  until(game, you, 5, () => false);
  assert.deepStrictEqual(scores, [game.score]);
  assert.strictEqual(game.fire(you, [1, 0, 0]), null);
  game.restart();
  assert.strictEqual(game.health, rules.health);
  assert.strictEqual(game.over, false);
});

test('walking onto a blaster picks it up, and you can change between the ones you have', () => {
  const { game, world } = start();
  assert.deepStrictEqual(game.owned, [0]);
  assert.ok(game.pickups.length >= 2);
  const spot = game.pickups[0].at;
  game.update(STEP, [spot[0], world.eyes()[1], spot[2]]);
  assert.strictEqual(game.owned.length, 2);
  assert.strictEqual(game.blaster, game.owned[1], 'the new one is in hand');
  game.nextBlaster();
  assert.strictEqual(game.blaster, 0);
  game.nextBlaster();
  assert.strictEqual(game.blaster, game.owned[1]);
});

test('the three blasters behave differently', () => {
  const { game, you } = start();
  const robot = game.robots[0];
  assert.ok(until(game, you, 20, () => robot.state === 'out'));
  const aim = unit(you, middleOf(game, robot));
  // Heavy: one hit is enough.
  game.owned = [0, 1, 2];
  game.blaster = 2;
  game.wait = 0;
  game.fire(you, aim);
  assert.strictEqual(robot.state, 'down');
  assert.ok(game.wait > 0.9, 'and it is slow to be ready again');
  // Rapid: ready again much sooner, but each hit does less.
  assert.ok(BLASTERS[1].wait < BLASTERS[0].wait / 2);
  assert.ok(BLASTERS[1].damage < BLASTERS[0].damage);
  assert.strictEqual(BLASTERS[1].auto, true);
});
