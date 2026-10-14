'use strict';

// Block world: the rules of the world, with no drawing in it, so it is also
// run by tests/blocks.test.js.
//
// The world is a box of cubes, SIZE wide and deep and HEIGHT tall. A flat
// world has no land of its own: just a floor you cannot see, to build on. x is east,
// y is up, z is south. Each cube is one unit across. The player's place is
// where their feet are.
(function (root) {
  const inNode = typeof module !== 'undefined' && module.exports;

  const SIZE = 96;
  const HEIGHT = 16;
  const CHUNK = 16;   // the world is drawn in square pieces this wide, so one changed block does not mean redrawing everything
  const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, WOOD = 4, LEAVES = 5, PLANKS = 6, BRICK = 7, FLOOR = 8;
  const NAMES = ['Air', 'Grass', 'Dirt', 'Stone', 'Wood', 'Leaves', 'Planks', 'Brick', 'Floor'];
  const BUILD_WITH = [PLANKS, BRICK, STONE, WOOD, LEAVES, DIRT, GRASS]; // what you can place, in the order you cycle through

  const rules = {
    eye: 1.6,        // how high the eyes are above the feet
    tall: 1.8,       // how tall the player is
    wide: 0.3,       // half the player's width
    reach: 6,        // how far away a block can be built or broken
    speed: 3,        // blocks walked per second
    gravity: 22,
    edge: 1.5,       // how close to the edge of the world you can walk
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

  function createWorld(seed, flat) {
    const cells = new Uint8Array(SIZE * SIZE * HEIGHT);
    const edits = {}; // every block the player has changed: place in the list -> kind
    const world = {
      seed,
      size: SIZE,
      height: HEIGHT,
      player: { x: SIZE / 2 + 0.5, y: HEIGHT, z: SIZE / 2 + 0.5, fall: 0 },
      kind: 0,       // which of BUILD_WITH is in hand
      changed: 0,    // goes up every time a block changes
      chunk: CHUNK,
      flat: !!flat,
      // In a flat world the blocks stand in your room, so they are small (about
      // 30 cm) and you are tall beside them. Elsewhere a block is about a metre.
      body: flat
        ? { eye: 5, tall: 5.2, reach: 14, speed: 5, stride: 2.3 }
        : { eye: rules.eye, tall: rules.tall, reach: rules.reach, speed: rules.speed, stride: 0.8 },
      dirty: new Set(), // the pieces of the world whose drawing is out of date: "cx,cz"
    };
    const markAll = () => { for (let cx = 0; cx < SIZE / CHUNK; cx++) for (let cz = 0; cz < SIZE / CHUNK; cz++) world.dirty.add(cx + ',' + cz); };
    const at = (x, y, z) => (y * SIZE + z) * SIZE + x;
    const inside = (x, y, z) => x >= 0 && x < SIZE && z >= 0 && z < SIZE && y >= 0 && y < HEIGHT;

    world.get = function (x, y, z) {
      if (y < 0) return STONE;                 // solid all the way down
      if (!inside(x, y, z)) return AIR;
      return cells[at(x, y, z)];
    };
    world.solid = (x, y, z) => world.get(x, y, z) !== AIR;

    function generate() {
      if (flat) {
        for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) cells[at(x, 0, z)] = FLOOR;
        return;
      }
      const random = randomFrom(seed);
      const a = random() * 6.28, b = random() * 6.28, c = random() * 6.28;
      const ground = (x, z) => Math.round(4.5 + 1.6 * Math.sin(x * 0.21 + a) + 1.4 * Math.sin(z * 0.17 + b) + 0.9 * Math.sin((x + z) * 0.33 + c));
      for (let x = 0; x < SIZE; x++) {
        for (let z = 0; z < SIZE; z++) {
          const top = Math.max(1, Math.min(HEIGHT - 8, ground(x, z)));
          for (let y = 0; y <= top; y++) cells[at(x, y, z)] = y === top ? GRASS : (y >= top - 2 ? DIRT : STONE);
        }
      }
      // A few trees, kept away from the middle where the player starts.
      for (let n = 0; n < Math.round(SIZE * SIZE / 200); n++) {
        const x = 3 + Math.floor(random() * (SIZE - 6));
        const z = 3 + Math.floor(random() * (SIZE - 6));
        if (Math.abs(x - SIZE / 2) < 3 && Math.abs(z - SIZE / 2) < 3) continue;
        const base = world.top(x, z);
        const trunk = 3 + Math.floor(random() * 2);
        for (let dx = -2; dx <= 2; dx++) {
          for (let dz = -2; dz <= 2; dz++) {
            for (let dy = 0; dy <= 2; dy++) {
              const far = Math.abs(dx) + Math.abs(dz) + dy * 1.5;
              const y = base + trunk + dy;
              if (far <= 3.5 && inside(x + dx, y, z + dz)) cells[at(x + dx, y, z + dz)] = LEAVES;
            }
          }
        }
        for (let dy = 1; dy <= trunk; dy++) if (inside(x, base + dy, z)) cells[at(x, base + dy, z)] = WOOD;
      }
    }

    // The height of the highest block in a column, or -1 if it is empty.
    world.top = function (x, z) {
      for (let y = HEIGHT - 1; y >= 0; y--) if (world.get(x, y, z) !== AIR) return y;
      return -1;
    };

    function set(x, y, z, kind) {
      cells[at(x, y, z)] = kind;
      edits[at(x, y, z)] = kind;
      world.changed++;
      // A block on the edge of a piece also changes how its neighbour looks.
      for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) {
        if (inside(x + dx, y, z + dz)) world.dirty.add(Math.floor((x + dx) / CHUNK) + ',' + Math.floor((z + dz) / CHUNK));
      }
    }

    // Whether the player's body would be inside a block if their feet were here.
    function blocked(x, y, z) {
      const w = rules.wide;
      for (const px of [x - w, x + w]) {
        for (const pz of [z - w, z + w]) {
          for (let py = Math.floor(y + 0.001); py <= Math.floor(y + world.body.tall - 0.001); py++) {
            if (world.solid(Math.floor(px), py, Math.floor(pz))) return true;
          }
        }
      }
      return false;
    }
    world.blocked = blocked;

    // Follows a line from a point until it meets a block. Returns the block it
    // met and the empty place just before it, or null if nothing is in reach.
    world.aim = function (from, direction, reach) {
      const far = reach || world.body.reach;
      let x = Math.floor(from[0]), y = Math.floor(from[1]), z = Math.floor(from[2]);
      const step = direction.map((d) => (d > 0 ? 1 : -1));
      const each = direction.map((d) => (d === 0 ? Infinity : Math.abs(1 / d)));          // distance between grid lines along the ray
      const next = direction.map((d, i) => {
        if (d === 0) return Infinity;
        const cell = Math.floor(from[i]);
        return (d > 0 ? cell + 1 - from[i] : from[i] - cell) * each[i];
      });
      let before = null;
      let travelled = 0;
      while (travelled <= far) {
        if (world.solid(x, y, z) && y >= 0) return { block: [x, y, z], before, distance: travelled };
        before = [x, y, z];
        const axis = next[0] < next[1] ? (next[0] < next[2] ? 0 : 2) : (next[1] < next[2] ? 1 : 2);
        travelled = next[axis];
        next[axis] += each[axis];
        if (axis === 0) x += step[0]; else if (axis === 1) y += step[1]; else z += step[2];
        if (y < -1 || y > HEIGHT + 2) return null;
      }
      return null;
    };

    // Puts the block in hand in the empty place in front of what is aimed at.
    world.build = function (target) {
      if (!target || !target.before) return false;
      const [x, y, z] = target.before;
      if (!inside(x, y, z) || world.solid(x, y, z)) return false;
      cells[at(x, y, z)] = BUILD_WITH[world.kind];
      const inTheWay = blocked(world.player.x, world.player.y, world.player.z);
      cells[at(x, y, z)] = AIR;
      if (inTheWay) return false; // not where you are standing
      set(x, y, z, BUILD_WITH[world.kind]);
      return true;
    };

    // Takes away the block aimed at. The bottom layer cannot be broken, so there is always ground.
    world.dig = function (target) {
      if (!target) return false;
      const [x, y, z] = target.block;
      if (!inside(x, y, z) || y === 0) return false;
      set(x, y, z, AIR);
      return true;
    };

    world.nextKind = function () {
      world.kind = (world.kind + 1) % BUILD_WITH.length;
    };
    world.setKind = function (kind) {
      if (kind >= 0 && kind < BUILD_WITH.length) world.kind = kind;
    };
    world.kindName = () => NAMES[BUILD_WITH[world.kind]];

    // Moves the world on by dt seconds. walk is [x, z]: the way to walk, or null to stand still.
    world.update = function (dt, walk) {
      const p = world.player;
      if (walk) {
        const length = Math.hypot(walk[0], walk[1]) || 1;
        const dx = walk[0] / length * world.body.speed * dt;
        const dz = walk[1] / length * world.body.speed * dt;
        const low = rules.edge, high = SIZE - rules.edge;
        const go = (x, z) => {
          x = Math.max(low, Math.min(high, x));
          z = Math.max(low, Math.min(high, z));
          if (!blocked(x, p.y, z)) { p.x = x; p.z = z; return true; }
          // One block high and room above it: step up.
          const standingOnGround = blocked(p.x, p.y - 0.05, p.z);
          if (standingOnGround && !blocked(x, p.y + 1.001, z) && !blocked(p.x, p.y + 1.001, p.z)) {
            p.x = x; p.z = z; p.y = Math.floor(p.y + 0.001) + 1; p.fall = 0;
            return true;
          }
          return false;
        };
        // Blocked straight on: slide along whichever way is free.
        if (!go(p.x + dx, p.z + dz)) { if (!go(p.x + dx, p.z)) go(p.x, p.z + dz); }
      }
      // Fall until standing on something.
      p.fall -= rules.gravity * dt;
      let y = p.y + Math.max(-0.9, p.fall * dt);
      if (blocked(p.x, y, p.z)) {
        y = Math.floor(p.y + 0.001);          // the top of the block underfoot
        if (blocked(p.x, y, p.z)) y = p.y;    // already resting
        p.fall = 0;
      }
      p.y = y;
    };

    world.eyes = () => [world.player.x, world.player.y + world.body.eye, world.player.z];

    // What to keep between visits: only what the player changed, and where they are.
    world.save = function () {
      const p = world.player;
      return JSON.stringify({ seed, edits, kind: world.kind, player: [p.x, p.y, p.z].map((v) => Math.round(v * 100) / 100) });
    };

    world.load = function (text) {
      let saved = null;
      try { saved = JSON.parse(text); } catch (err) { saved = null; }
      if (!saved || saved.seed !== seed || typeof saved.edits !== 'object') return false;
      for (const key in saved.edits) {
        const index = Number(key);
        const kind = saved.edits[key];
        if (Number.isInteger(index) && index >= 0 && index < cells.length && kind >= 0 && kind < NAMES.length) {
          cells[index] = kind;
          edits[index] = kind;
        }
      }
      if (Array.isArray(saved.player) && saved.player.every((v) => typeof v === 'number' && isFinite(v))) {
        const [x, y, z] = saved.player;
        if (!blocked(x, y, z)) Object.assign(world.player, { x, y, z, fall: 0 });
      }
      if (saved.kind >= 0 && saved.kind < BUILD_WITH.length) world.kind = saved.kind;
      world.changed++;
      markAll();
      return true;
    };

    generate();
    markAll();
    // Start standing on the ground in the middle.
    world.player.y = world.top(Math.floor(world.player.x), Math.floor(world.player.z)) + 1;
    return world;
  }

  const api = { createWorld, rules, kinds: { AIR, GRASS, DIRT, STONE, WOOD, LEAVES, PLANKS, BRICK, FLOOR }, NAMES, BUILD_WITH, SIZE, HEIGHT, CHUNK };
  if (inNode) {
    module.exports = api;
  } else {
    root.PVR = root.PVR || {};
    root.PVR.blocks = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
