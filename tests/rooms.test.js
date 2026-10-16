'use strict';

// Run with: node --test tests/rooms.test.js
const test = require('node:test');
const assert = require('node:assert');
const { createWorld } = require('../js/blocks.js');
const { createShooter } = require('../js/shooter.js');
const { createRun, rules } = require('../js/rooms.js');

const STEP = 1 / 60;
const begin = (seed = 5, facing = [0, -1]) => {
  const world = createWorld(42, false, 'rooms');
  const game = createShooter(world, seed);
  const run = createRun(world, game, seed);
  run.start(facing);
  return { world, game, run };
};
const eyes = (world) => world.eyes();
const middleOf = (game, robot) => { const box = game.boxOf(robot); return [0, 1, 2].map((i) => (box[0][i] + box[1][i]) / 2); };
const unit = (from, to) => {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const length = Math.hypot(d[0], d[1], d[2]);
  return d.map((v) => v / length);
};
// Whether a straight line between two places is clear of blocks.
const clear = (world, from, to) => {
  const hit = world.aim(from, unit(from, to), 60);
  return !hit || hit.distance > Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) - 0.3;
};
const step = (run, game, world, seconds, out) => {
  for (let t = 0; t < seconds; t += STEP) {
    run.update(STEP, out);
    game.update(STEP, eyes(world));
  }
};
// Leans out and shoots every robot that steps out, until the room is cleared or time runs out.
const fightRoom = (run, game, world, seconds) => {
  const room = run.room;
  for (let t = 0; t < seconds && run.room === room && !game.over; t += STEP) {
    run.update(STEP, true);
    game.update(STEP, eyes(world));
    if (run.state !== 'fight') continue;
    for (const robot of game.robots) {
      if (robot.state !== 'out' && robot.state !== 'coming') continue;
      if (game.wait > 0) break;
      game.fire(eyes(world), unit(eyes(world), middleOf(game, robot)));
    }
  }
};

test('the first room has walls all round, your wall near the way in, and robots behind walls further in', () => {
  const { world, run, game } = begin();
  const room = run.current();
  assert.strictEqual(run.room, 1);
  assert.ok(room.cover.length >= 2, `${room.cover.length} robot walls`);
  assert.strictEqual(game.robots.length, room.cover.length);
  // You stand on the floor, not inside anything.
  assert.strictEqual(world.player.y, 1);
  assert.ok(!world.blocked(world.player.x, world.player.y, world.player.z));
  // A wall straight ahead of you while hidden.
  const ahead = [eyes(world)[0], eyes(world)[1], eyes(world)[2] - 3];
  assert.ok(!clear(world, eyes(world), ahead), 'your wall is in front of you');
});

test('hidden behind your wall, no robot can see you, and you take no hits', () => {
  const { world, run, game } = begin();
  for (const wall of run.current().cover) {
    const robotEye = [wall.beside[0], 2.3, wall.beside[2]];
    assert.ok(!clear(world, robotEye, eyes(world)), 'a robot stepping out cannot see you');
  }
  step(run, game, world, 30, false);
  assert.strictEqual(game.health, 100);
  assert.ok(run.hidden());
});

test('leaning out takes a moment, gives you a clear shot, and ducking back hides you again', () => {
  const { world, run, game } = begin();
  const hide = [world.player.x, world.player.z];
  step(run, game, world, rules.lean / 2, true);
  assert.ok(run.lean > 0 && run.lean < 1, 'part way out');
  step(run, game, world, 0.5, true);
  assert.strictEqual(run.lean, 1);
  assert.ok(Math.hypot(world.player.x - hide[0], world.player.z - hide[1]) > 1.5, 'moved out past the wall');
  assert.ok(!world.blocked(world.player.x, world.player.y, world.player.z));
  const seen = run.current().cover.filter((wall) => clear(world, eyes(world), [wall.beside[0], 2.3, wall.beside[2]]));
  assert.ok(seen.length >= 1, 'at least one robot can be shot when it steps out');
  step(run, game, world, 0.5, false);
  assert.ok(run.hidden());
  assert.ok(Math.hypot(world.player.x - hide[0], world.player.z - hide[1]) < 0.01, 'back where you hid');
});

test('robots stay down in a room; clearing it opens the door and walks you into a new room', () => {
  const { world, run, game } = begin();
  fightRoom(run, game, world, 90);
  assert.strictEqual(run.cleared, 1, `room not cleared: robots ${game.robots.map((r) => r.state).join(',')}, health ${game.health}`);
  assert.ok(game.score >= 2);
  const first = run.rooms[0];
  // Walk through the door.
  for (let t = 0; t < 20 && run.room === 1; t += STEP) { run.update(STEP, false); game.update(STEP, eyes(world)); }
  assert.strictEqual(run.room, 2);
  assert.strictEqual(run.state, 'fight');
  const second = run.current();
  assert.ok(second.from === first.to, 'the new room starts at the old one\'s door');
  assert.ok(run.hidden());
  assert.ok(game.robots.length >= 2 && game.robots.every((robot) => robot.state !== 'down'), 'new robots');
  assert.ok(Math.hypot(world.player.x - second.hide[0], world.player.z - second.hide[2]) < 0.01, 'hidden at your new wall');
  assert.ok(game.owned.includes(1), 'the spare blaster waiting in the second room was picked up');
});

test('every run is laid out differently, and runs follow the way you face', () => {
  const a = begin(1).run.current(), b = begin(2).run.current();
  const shape = (room) => JSON.stringify([room.half, room.to - room.from, room.side, room.cover.map((c) => c.behind)]);
  assert.notStrictEqual(shape(a), shape(b));
  const east = begin(3, [0.9, 0.2]);
  const room = east.run.current();
  assert.ok(room.cover.every((c) => c.behind[0] > east.world.player.x + 5), 'facing east, the robots are to the east');
});

test('later rooms have more robots', () => {
  const { world, run, game } = begin(9);
  game.health = 1e9; // TEST: cannot lose, to get through several rooms
  const counts = [];
  for (let n = 0; n < 4; n++) {
    counts.push(game.robots.length);
    fightRoom(run, game, world, 120);
    for (let t = 0; t < 20 && run.state !== 'fight'; t += STEP) { run.update(STEP, false); game.update(STEP, eyes(world)); }
  }
  assert.strictEqual(run.room, 5, `reached room ${run.room}`);
  assert.ok(counts[3] > counts[0], `robots per room ${counts.join(', ')}`);
});
