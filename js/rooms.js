'use strict';

// Blaster arena as a run through rooms: the rules, with no drawing in it, so
// it is also run by tests/rooms.test.js.
//
// Each room has walls all round, a doorway in, and a closed door out. You
// start each room hidden at the side of a wall near the way in. Robots hide
// behind walls further in, step out to fire, and step back (see shooter.js).
// You lean out from your wall to shoot, and duck back where their bolts cannot
// reach you. When every robot in the room is down, the door opens and you walk
// through to the next room, made at random as you get there.
//
// Rooms are laid out in a line, the way you were facing when the run started.
// Inside a room, places are given as (across, ahead) from the middle of its
// way in: across to the right, ahead into the room. One unit is one block.
(function (root) {
  const inNode = typeof module !== 'undefined' && module.exports;
  const blocks = inNode ? require('./blocks.js') : root.PVR.blocks;
  const { AIR, BRICK, PLANKS, STONE, WOOD, GLASS } = blocks.kinds;

  const rules = {
    tall: 3,          // how high the room walls are
    cover: 2,         // how high a wall to hide behind is: taller than your eyes
    lean: 0.25,       // seconds to lean out or duck back
    walk: 4,          // blocks a second, walking to the next room
    pause: 1.2,       // seconds between clearing a room and the door opening
    robotsFirst: 2,   // robots in the first room
    robotsMost: 5,
  };

  function randomFrom(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // world: a block world with no edge (blocks.js, made with arena 'rooms').
  // game: the shooter (shooter.js) that runs the robots and bolts.
  function createRun(world, game, seed) {
    const random = randomFrom(seed);
    const run = {
      room: 0,          // which room you are in, from 1
      cleared: 0,       // rooms cleared
      state: 'fight',   // 'fight' | 'cleared' (door about to open) | 'moving' (walking to the next room)
      lean: 0,          // 0 hidden behind your wall, 1 leaned right out
      time: 0,
      rooms: [],
    };
    let ox = 0, oz = 0;            // the block where the first way in is
    let ahead = [0, -1], across = [1, 0];
    let path = [];                 // places still to walk to, when moving
    let current = null;

    // The middle of a block, from (across, ahead).
    const point = (u, v) => [ox + 0.5 + across[0] * u + ahead[0] * v, oz + 0.5 + across[1] * u + ahead[1] * v];
    const put = (u, y, v, kind) => {
      const [x, z] = point(u, v);
      world.place(Math.floor(x), y, Math.floor(z), kind);
    };
    const at = (u, v) => { const [x, z] = point(u, v); return [x, 1, z]; };

    // Makes a room whose way in is `from` blocks ahead of the start.
    function makeRoom(number, from) {
      const half = 6 + Math.floor(random() * 3);        // walls this far either side of the middle
      const deep = 16 + Math.floor(random() * 6);
      const to = from + deep;
      const wall = number % 2 ? BRICK : STONE;
      for (let u = -half; u <= half; u++) {
        for (let y = 1; y <= rules.tall; y++) {
          // The way in: open, except for the very first room, which has a wall behind you.
          if (number === 1 || Math.abs(u) > 1 || y > 2) put(u, y, from, wall);
          // The way out: a closed door until the room is cleared.
          put(u, y, to, Math.abs(u) <= 1 && y <= 2 ? WOOD : wall);
        }
      }
      for (let v = from; v <= to; v++) for (let y = 1; y <= rules.tall; y++) { put(-half, y, v, wall); put(half, y, v, wall); }

      // Your wall, just inside the way in. You hide behind it and lean out past its side.
      const side = random() < 0.5 ? 1 : -1;
      for (const u of [0, -side]) for (let y = 1; y <= rules.cover; y++) put(u, y, from + 3, PLANKS);
      const room = {
        number, from, to, half, side,
        hide: at(-side * 0.5, from + 1.7),
        peek: at(side * 1.45, from + 2.0),
        cover: [],
      };

      // The robots' walls, further in, side-on to you, not too close together.
      const robots = Math.min(rules.robotsMost, rules.robotsFirst + Math.floor((number - 1) / 2));
      // A robot that steps out must be in plain view from where you lean out,
      // and a new wall must not hide one already placed.
      const eye = [room.peek[0], 1 + blocks.rules.eye, room.peek[2]];
      const sees = (p) => {
        const to = [p[0], 1.9, p[2]];
        const d = [to[0] - eye[0], to[1] - eye[1], to[2] - eye[2]];
        const far = Math.hypot(d[0], d[1], d[2]);
        const hit = world.aim(eye, d.map((v) => v / far), far);
        return !hit || hit.distance > far - 0.4;
      };
      const taken = [];
      for (let tries = 0; room.cover.length < robots && tries < 300; tries++) {
        const u = Math.round((random() * 2 - 1) * (half - 4));
        const v = from + 8 + Math.floor(random() * (deep - 11));
        if (taken.some(([tu, tv]) => Math.abs(tu - u) < 4 && Math.abs(tv - v) < 3)) continue;
        // Behind it, out of your sight, and beside it, where it steps out to fire.
        const out = u + 2.4 * (u > 0 || (u === 0 && random() < 0.5) ? -1 : 1);
        const wall = { behind: at(u, v + 1.2), beside: at(out, v + 1.2) };
        if (!sees(wall.beside)) continue;
        const kind = random() < 0.5 ? BRICK : GLASS;
        for (let i = -1; i <= 1; i++) for (let y = 1; y <= rules.cover; y++) put(u + i, y, v, kind);
        if (room.cover.some((other) => !sees(other.beside)) || sees(wall.behind)) {
          // It would hide another robot, or not hide its own: take it down again.
          for (let i = -1; i <= 1; i++) for (let y = 1; y <= rules.cover; y++) put(u + i, y, v, AIR);
          continue;
        }
        taken.push([u, v]);
        room.cover.push(wall);
      }
      run.rooms.push(room);
      return room;
    }

    function enter(room) {
      current = room;
      run.room = room.number;
      run.state = 'fight';
      run.lean = 0;
      place(room.hide);
      game.setRoom(room.cover);
    }

    function place(p) {
      Object.assign(world.player, { x: p[0], y: 1, z: p[2], fall: 0 });
    }

    // Starts a new run with its first room where you stand, going the way you face.
    // facing: [x, z], the way you are looking, flat.
    run.start = function (facing) {
      // The nearest straight way: rooms are lined up with the blocks.
      ahead = Math.abs(facing[0]) > Math.abs(facing[1]) ? [Math.sign(facing[0]), 0] : [0, Math.sign(facing[1]) || -1];
      across = [-ahead[1], ahead[0]];
      ox = Math.floor(world.player.x);
      oz = Math.floor(world.player.z);
      run.rooms = [];
      run.cleared = 0;
      path = [];
      enter(makeRoom(1, 0));
    };

    // The room you are in.
    run.current = () => current;
    run.hidden = () => run.state === 'fight' && run.lean < 0.35;

    // Moves the run on by dt seconds. out: whether you want to be leaned out.
    run.update = function (dt, out) {
      if (!current || game.over) return;
      run.time += dt;
      if (run.state === 'fight') {
        const goal = out ? 1 : 0;
        const step = dt / rules.lean;
        run.lean = goal > run.lean ? Math.min(goal, run.lean + step) : Math.max(goal, run.lean - step);
        const t = run.lean * run.lean * (3 - 2 * run.lean);
        const h = current.hide, k = current.peek;
        place([h[0] + (k[0] - h[0]) * t, 1, h[2] + (k[2] - h[2]) * t]);
        if (game.robots.length && game.robots.every((robot) => robot.state === 'down')) {
          run.state = 'cleared';
          run.time = 0;
          run.cleared++;
        }
      } else if (run.state === 'cleared') {
        if (run.time >= rules.pause) {
          // Open the door, make the next room beyond it, and set off.
          for (let u = -1; u <= 1; u++) for (let y = 1; y <= 2; y++) put(u, y, current.to, AIR);
          const next = makeRoom(current.number + 1, current.to);
          // A spare blaster waits in your way in the second and fourth rooms.
          if (next.number === 2 || next.number === 4) game.pickups.push({ at: [next.hide[0], 1.2, next.hide[2]], blaster: next.number === 2 ? 1 : 2 });
          // Out past your wall, up the side of the room clear of the robots' walls, and through the door.
          const edge = current.side * (current.half - 1.5);
          path = [current.peek, at(edge, current.from + 2), at(edge, current.to - 1.5), at(0, current.to - 1.5), at(0, current.to + 1.5), next.hide];
          run.state = 'moving';
          run.next = next;
        }
      } else if (run.state === 'moving') {
        let left = rules.walk * dt;
        while (left > 0 && path.length) {
          const p = world.player, goal = path[0];
          const dx = goal[0] - p.x, dz = goal[2] - p.z;
          const far = Math.hypot(dx, dz);
          if (far <= left) { place(goal); path.shift(); left -= far; } else { place([p.x + dx / far * left, 1, p.z + dz / far * left]); left = 0; }
        }
        if (!path.length) enter(run.next);
      }
    };

    return run;
  }

  const api = { createRun, rules };
  if (inNode) {
    module.exports = api;
  } else {
    root.PVR = root.PVR || {};
    root.PVR.rooms = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
