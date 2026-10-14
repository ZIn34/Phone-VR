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
  const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, WOOD = 4, LEAVES = 5, PLANKS = 6, BRICK = 7, FLOOR = 8, GLASS = 9, LAMP = 10;
  const NAMES = ['Air', 'Grass', 'Dirt', 'Stone', 'Wood', 'Leaves', 'Planks', 'Brick', 'Floor', 'Glass', 'Lamp'];
  const BUILD_WITH = [PLANKS, BRICK, STONE, WOOD, LEAVES, DIRT, GRASS, GLASS, LAMP]; // what you can place, in the order you cycle through
  // What you start with. Breaking a block gives you that block; building uses one up.
  const START_WITH = { [PLANKS]: 16, [BRICK]: 8, [STONE]: 8 };
  // Crafting: what goes in, and what comes out.
  const RECIPES = [
    { name: 'Planks', makes: PLANKS, count: 4, from: { [WOOD]: 1 } },
    { name: 'Brick', makes: BRICK, count: 2, from: { [STONE]: 2 } },
    { name: 'Glass', makes: GLASS, count: 2, from: { [STONE]: 1, [DIRT]: 1 } },
    { name: 'Lamp', makes: LAMP, count: 1, from: { [PLANKS]: 1, [LEAVES]: 2 } },
  ];

  const rules = {
    eye: 1.6,        // how high the eyes are above the feet
    tall: 1.8,       // how tall the player is
    wide: 0.3,       // half the player's width
    reach: 6,        // how far away a block can be built or broken
    speed: 3,        // blocks walked per second
    gravity: 22,
    jump: 7.6,       // how fast a jump leaves the ground: enough to clear one block
    hop: 7.3,        // the smaller jump that carries you up a step you walk into
    fly: 5,          // blocks a second while flying
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

  // flat: no land, just a floor you cannot see. arena: a level floor with walls
  // to hide behind, for Blaster arena (flat as well: the floor cannot be seen).
  function createWorld(seed, flat, arena) {
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
      flying: false,
      landed: 0,        // on the frame you land: how many blocks you fell
      // How many of each kind of block you have. In a flat world or an arena there is nothing to gather, so there is no limit.
      unlimited: !!flat || !!arena,
      have: NAMES.map((name, kind) => START_WITH[kind] || 0),
      cover: [],        // in an arena: the walls, each with a place behind it and a place beside it
      pickupSpots: [],  // in an arena: where blasters lie waiting
      body: flat && !arena
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
      if (flat || arena) {
        for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) cells[at(x, 0, z)] = flat ? FLOOR : STONE;
        if (arena) buildArena();
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

    // Walls three wide and two high in a ring round the middle, each side-on
    // to the middle so a robot can stand hidden behind it and step out beside it.
    function buildArena() {
      const random = randomFrom(seed);
      const mid = SIZE / 2;
      const walls = 8;
      for (let n = 0; n < walls; n++) {
        const angle = (n + 0.5 * random()) / walls * Math.PI * 2;
        const far = 8 + random() * 5;
        const x = Math.round(mid + Math.sin(angle) * far);
        const z = Math.round(mid - Math.cos(angle) * far);
        // Run the wall across the line of sight from the middle.
        const alongX = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle));
        for (let i = -1; i <= 1; i++) for (let y = 1; y <= 2; y++) cells[at(alongX ? x + i : x, y, alongX ? z : z + i)] = n % 2 ? BRICK : PLANKS;
        const awayX = Math.sign(Math.round(Math.sin(angle) * 10)) || 1;
        const awayZ = Math.sign(Math.round(-Math.cos(angle) * 10)) || 1;
        const behind = alongX ? [x + 0.5, 1, z + awayZ + 0.5] : [x + awayX + 0.5, 1, z + 0.5];
        const side = n % 2 ? 2.2 : -2.2;
        const beside = alongX ? [behind[0] + side, 1, behind[2]] : [behind[0], 1, behind[2] + side];
        world.cover.push({ behind, beside });
      }
      world.pickupSpots = [[mid + 4.5, 1.2, mid + 4.5], [mid - 5.5, 1.2, mid - 3.5]];
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
      if (!world.unlimited && world.have[BUILD_WITH[world.kind]] <= 0) return false; // none left
      cells[at(x, y, z)] = BUILD_WITH[world.kind];
      const inTheWay = blocked(world.player.x, world.player.y, world.player.z);
      cells[at(x, y, z)] = AIR;
      if (inTheWay) return false; // not where you are standing
      set(x, y, z, BUILD_WITH[world.kind]);
      if (!world.unlimited) world.have[BUILD_WITH[world.kind]]--;
      return true;
    };

    // Takes away the block aimed at. The bottom layer cannot be broken, so there is always ground.
    world.dig = function (target) {
      if (!target) return false;
      const [x, y, z] = target.block;
      if (!inside(x, y, z) || y === 0) return false;
      const kind = world.get(x, y, z);
      set(x, y, z, AIR);
      if (kind !== FLOOR) world.have[kind]++;
      return true;
    };

    // Whether you have what a recipe needs.
    world.canCraft = function (recipe) {
      return Object.keys(recipe.from).every((kind) => world.have[kind] >= recipe.from[kind]);
    };
    world.craft = function (recipe) {
      if (!world.canCraft(recipe)) return false;
      for (const kind in recipe.from) world.have[kind] -= recipe.from[kind];
      world.have[recipe.makes] += recipe.count;
      world.changed++;
      return true;
    };

    world.nextKind = function () {
      world.kind = (world.kind + 1) % BUILD_WITH.length;
    };
    world.setKind = function (kind) {
      if (kind >= 0 && kind < BUILD_WITH.length) world.kind = kind;
    };
    world.kindName = () => NAMES[BUILD_WITH[world.kind]];

    const onGround = () => blocked(world.player.x, world.player.y - 0.05, world.player.z);
    let fallFrom = 0;     // the highest you have been since you last stood on something
    let softLanding = false;

    world.onGround = onGround;
    world.jump = function () {
      if (world.flying || !onGround()) return false;
      world.player.fall = rules.jump;
      return true;
    };
    world.setFlying = function (on) {
      world.flying = !!on;
      world.player.fall = 0;
      softLanding = true; // coming down from flying does not count as a fall
    };

    // Moves the world on by dt seconds. walk is the way to go, or null to stand
    // still: [x, z] on foot, or [x, y, z] so that flying can also go up and down.
    world.update = function (dt, walk) {
      const p = world.player;
      world.landed = 0;
      const way = walk ? (walk.length === 2 ? [walk[0], 0, walk[1]] : walk) : null;
      if (way) {
        const length = (world.flying ? Math.hypot(way[0], way[1], way[2]) : Math.hypot(way[0], way[2])) || 1;
        const speed = world.flying ? rules.fly : world.body.speed;
        const dx = way[0] / length * speed * dt;
        const dz = way[2] / length * speed * dt;
        const low = rules.edge, high = SIZE - rules.edge;
        const go = (x, z) => {
          x = Math.max(low, Math.min(high, x));
          z = Math.max(low, Math.min(high, z));
          if (!blocked(x, p.y, z)) { p.x = x; p.z = z; return true; }
          // A step one block high with room above it: hop up it, rather than being put on top.
          if (!world.flying && onGround() && !blocked(x, p.y + 1.001, z) && !blocked(p.x, p.y + 1.001, p.z)) p.fall = rules.hop;
          return false;
        };
        // Blocked straight on: slide along whichever way is free.
        if (!go(p.x + dx, p.z + dz)) { if (!go(p.x + dx, p.z)) go(p.x, p.z + dz); }
        if (world.flying) {
          const y = p.y + way[1] / length * speed * dt;
          if (!blocked(p.x, y, p.z) && y < HEIGHT + 6) p.y = y;
        }
      }
      if (world.flying) {
        fallFrom = p.y;
        return;
      }
      // Rise or fall until standing on something.
      p.fall -= rules.gravity * dt;
      const y = p.y + Math.max(-0.9, Math.min(0.9, p.fall * dt));
      if (!blocked(p.x, y, p.z)) {
        p.y = y;
        fallFrom = Math.max(fallFrom, p.y);
        return;
      }
      if (p.fall < 0) {
        const top = Math.floor(p.y + 0.001);                 // the top of the block underfoot
        if (!blocked(p.x, top, p.z)) p.y = top;
        if (!softLanding) world.landed = Math.max(0, fallFrom - p.y);
        softLanding = false;
        fallFrom = p.y;
      }
      p.fall = 0; // landed, or bumped your head
    };

    world.eyes = () => [world.player.x, world.player.y + world.body.eye, world.player.z];

    // What to keep between visits: only what the player changed, and where they are.
    world.save = function () {
      const p = world.player;
      return JSON.stringify({ seed, edits, kind: world.kind, have: world.have, player: [p.x, p.y, p.z].map((v) => Math.round(v * 100) / 100) });
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
      if (Array.isArray(saved.have)) {
        saved.have.forEach((count, kind) => { if (kind < NAMES.length && Number.isInteger(count) && count >= 0) world.have[kind] = count; });
      }
      fallFrom = world.player.y;
      world.changed++;
      markAll();
      return true;
    };

    generate();
    markAll();
    // Start standing on the ground in the middle.
    world.player.y = world.top(Math.floor(world.player.x), Math.floor(world.player.z)) + 1;
    world.start = [world.player.x, world.player.y, world.player.z];
    fallFrom = world.player.y;
    return world;
  }

  const api = { createWorld, rules, kinds: { AIR, GRASS, DIRT, STONE, WOOD, LEAVES, PLANKS, BRICK, FLOOR, GLASS, LAMP }, NAMES, BUILD_WITH, RECIPES, SIZE, HEIGHT, CHUNK };
  if (inNode) {
    module.exports = api;
  } else {
    root.PVR = root.PVR || {};
    root.PVR.blocks = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
