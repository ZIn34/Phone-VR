'use strict';

// Block world: the rules of the world, with no drawing in it, so it is also
// run by tests/blocks.test.js.
//
// The world goes on for ever in every direction, HEIGHT tall. It is kept in
// square pieces CHUNK wide, each made the first time something looks at it, so
// only the land near you is ever made. The first SIZE by SIZE of land is the
// same as before the world had no edge, so builds from then still sit right.
// An arena is the one world with an edge: SIZE wide. A flat world has no land
// of its own: just a floor you cannot see, to build on. x is east, y is up, z is
// south. Each cube is one unit across. The player's place is where their feet are.
(function (root) {
  const inNode = typeof module !== 'undefined' && module.exports;

  const SIZE = 96;     // the first land, and the size of an arena
  const HEIGHT = 24;
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
    edge: 1.5,       // how close to the edge of an arena you can walk
    keep: 6,         // pieces of land further than this many pieces away are forgotten, and made again if you come back
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

  // A smooth bumpy surface: a number from 0 to 1 that changes slowly with x and z.
  function noiseFrom(seed) {
    const corner = (ix, iz, layer) => {
      let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed + layer * 1013, 1274126177);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    return function (x, z, layer) {
      const ix = Math.floor(x), iz = Math.floor(z);
      let fx = x - ix, fz = z - iz;
      fx = fx * fx * (3 - 2 * fx);
      fz = fz * fz * (3 - 2 * fz);
      const a = corner(ix, iz, layer), b = corner(ix + 1, iz, layer), c = corner(ix, iz + 1, layer), d = corner(ix + 1, iz + 1, layer);
      return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
    };
  }

  // flat: no land, just a floor you cannot see. arena: a level floor with walls
  // to hide behind, for Blaster arena (flat as well: the floor cannot be seen).
  function createWorld(seed, flat, arena) {
    const bounded = arena === true; // a 'rooms' arena goes on for ever, room after room
    const pieces = new Map();   // "cx,cz" -> the blocks of that piece of land
    const edits = {};           // every block the player has changed: "x,y,z" -> kind
    const editsIn = new Map();  // "cx,cz" -> the edits in that piece, to put back when it is made again
    const world = {
      seed,
      size: SIZE,
      bounded,
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
    const FIRST = SIZE / CHUNK; // the first land is this many pieces across
    const firstLand = (cx, cz) => cx >= 0 && cz >= 0 && cx < FIRST && cz < FIRST;
    const markAll = () => { for (const key of pieces.keys()) world.dirty.add(key); };
    const pieceKey = (cx, cz) => cx + ',' + cz;
    // Where a block is within its piece. (x & 15 is x's place in a piece 16 wide, below zero too.)
    const at = (x, y, z) => (y * CHUNK + (z & (CHUNK - 1))) * CHUNK + (x & (CHUNK - 1));
    const outside = (x, z) => bounded && (x < 0 || z < 0 || x >= SIZE || z >= SIZE);
    const inside = (x, y, z) => y >= 0 && y < HEIGHT && !outside(x, z);
    // Whether a piece of land exists to be drawn.
    world.hasPiece = (cx, cz) => !bounded || firstLand(cx, cz);

    // The blocks of the piece of land that holds x, z, made if it is not yet.
    let lastCx = NaN, lastCz = NaN, lastPiece = null; // the last piece looked at, as most looks are at the same one
    function pieceAt(x, z) {
      const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
      if (cx === lastCx && cz === lastCz) return lastPiece;
      const key = pieceKey(cx, cz);
      const piece = pieces.get(key) || makePiece(cx, cz, key);
      lastCx = cx; lastCz = cz;
      lastPiece = piece;
      return piece;
    }

    world.get = function (x, y, z) {
      if (y < 0) return STONE;                 // solid all the way down
      x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
      if (!inside(x, y, z)) return AIR;
      return pieceAt(x, z)[at(x, y, z)];
    };
    world.solid = (x, y, z) => world.get(x, y, z) !== AIR;
    const put = (x, y, z, kind) => { pieceAt(x, z)[at(x, y, z)] = kind; };

    // The shape of the land. The first land is gentle rolling ground, as it always
    // was; further out it grows into plains and hills that never repeat.
    const random = randomFrom(seed);
    const a = random() * 6.28, b = random() * 6.28, c = random() * 6.28;
    const noise = noiseFrom(seed);
    function ground(x, z) {
      let h = 4.5 + 1.6 * Math.sin(x * 0.21 + a) + 1.4 * Math.sin(z * 0.17 + b) + 0.9 * Math.sin((x + z) * 0.33 + c);
      const out = Math.max(-x, x - (SIZE - 1), -z, z - (SIZE - 1), 0); // how far beyond the first land
      if (out > 0) {
        const blend = Math.min(1, out / 24);
        const hilly = noise(x / 90, z / 90, 1);           // some places are plains, some hills
        const hills = (noise(x / 30, z / 30, 2) - 0.5) * (4 + 16 * hilly) + (noise(x / 9, z / 9, 3) - 0.5) * 2.5;
        h += blend * blend * (3 - 2 * blend) * hills;
      }
      return Math.max(1, Math.min(HEIGHT - 8, Math.round(h)));
    }

    function makePiece(cx, cz, key) {
      const cells = new Uint8Array(CHUNK * CHUNK * HEIGHT);
      pieces.set(key, cells);
      for (let x = cx * CHUNK; x < (cx + 1) * CHUNK; x++) {
        for (let z = cz * CHUNK; z < (cz + 1) * CHUNK; z++) {
          if (flat || arena) { cells[at(x, 0, z)] = flat ? FLOOR : STONE; continue; }
          const top = ground(x, z);
          for (let y = 0; y <= top; y++) cells[at(x, y, z)] = y === top ? GRASS : (y >= top - 2 ? DIRT : STONE);
        }
      }
      lastCx = cx; lastCz = cz;
      lastPiece = cells;
      if (!flat && !arena && !firstLand(cx, cz)) plantTrees(cx, cz);
      for (const place of editsIn.get(key) || []) {
        const [x, y, z] = place.split(',').map(Number);
        cells[at(x, y, z)] = edits[place];
      }
      return cells;
    }

    function tree(x, z, trunk) {
      const base = world.top(x, z);
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          for (let dy = 0; dy <= 2; dy++) {
            const far = Math.abs(dx) + Math.abs(dz) + dy * 1.5;
            const y = base + trunk + dy;
            if (far <= 3.5 && inside(x + dx, y, z + dz)) put(x + dx, y, z + dz, LEAVES);
          }
        }
      }
      for (let dy = 1; dy <= trunk; dy++) if (inside(x, base + dy, z)) put(x, base + dy, z, WOOD);
    }

    // Trees beyond the first land: each piece has its own, always the same,
    // kept away from its sides so a tree never reaches into the next piece.
    // Some places are woods, some are open.
    function plantTrees(cx, cz) {
      const random = randomFrom(Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ seed);
      const count = Math.floor(random() * (0.5 + 4 * noise(cx / 5, cz / 5, 4)));
      for (let n = 0; n < count; n++) {
        const x = cx * CHUNK + 2 + Math.floor(random() * (CHUNK - 4));
        const z = cz * CHUNK + 2 + Math.floor(random() * (CHUNK - 4));
        tree(x, z, 3 + Math.floor(random() * 2));
      }
    }

    function generate() {
      if ((flat && !arena) || arena === 'rooms') return; // made as you go
      for (let cx = 0; cx < FIRST; cx++) for (let cz = 0; cz < FIRST; cz++) pieceAt(cx * CHUNK, cz * CHUNK);
      if (arena) { buildArena(); return; }
      // The first land's trees, made just as they always were, kept away from the middle where the player starts.
      for (let n = 0; n < Math.round(SIZE * SIZE / 200); n++) {
        const x = 3 + Math.floor(random() * (SIZE - 6));
        const z = 3 + Math.floor(random() * (SIZE - 6));
        if (Math.abs(x - SIZE / 2) < 3 && Math.abs(z - SIZE / 2) < 3) continue;
        tree(x, z, 3 + Math.floor(random() * 2));
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
        for (let i = -1; i <= 1; i++) for (let y = 1; y <= 2; y++) put(alongX ? x + i : x, y, alongX ? z : z + i, n % 2 ? BRICK : PLANKS);
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

    // Keeps a change, so it is saved and put back if its piece is forgotten and made again.
    function remember(x, y, z, kind) {
      const place = x + ',' + y + ',' + z;
      const key = pieceKey(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
      if (!(place in edits)) {
        if (!editsIn.has(key)) editsIn.set(key, []);
        editsIn.get(key).push(place);
      }
      edits[place] = kind;
    }

    function set(x, y, z, kind) {
      put(x, y, z, kind);
      remember(x, y, z, kind);
      world.changed++;
      // A block on the edge of a piece also changes how its neighbour looks.
      for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) {
        if (inside(x + dx, y, z + dz)) world.dirty.add(pieceKey(Math.floor((x + dx) / CHUNK), Math.floor((z + dz) / CHUNK)));
      }
    }

    // Lets go of land far behind you, so walking a long way does not fill the
    // phone's memory. It is made again, with your changes, if you come back.
    function forgetFarLand() {
      const pcx = Math.floor(world.player.x / CHUNK), pcz = Math.floor(world.player.z / CHUNK);
      for (const key of pieces.keys()) {
        const [cx, cz] = key.split(',').map(Number);
        if (firstLand(cx, cz) && !flat) continue; // its trees were made with the whole first land at once
        if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > rules.keep) pieces.delete(key);
      }
      lastCx = NaN;
    }
    let forgetIn = 0;

    // Puts a block anywhere, as the game itself does (rooms are built this way).
    world.place = function (x, y, z, kind) {
      if (inside(x, y, z)) set(x, y, z, kind);
    };

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
      put(x, y, z, BUILD_WITH[world.kind]);
      const inTheWay = blocked(world.player.x, world.player.y, world.player.z);
      put(x, y, z, AIR);
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
      forgetIn -= dt;
      if (forgetIn <= 0) { forgetIn = 2; forgetFarLand(); }
      const way = walk ? (walk.length === 2 ? [walk[0], 0, walk[1]] : walk) : null;
      if (way) {
        const length = (world.flying ? Math.hypot(way[0], way[1], way[2]) : Math.hypot(way[0], way[2])) || 1;
        const speed = world.flying ? rules.fly : world.body.speed;
        const dx = way[0] / length * speed * dt;
        const dz = way[2] / length * speed * dt;
        const low = rules.edge, high = SIZE - rules.edge;
        const go = (x, z) => {
          if (bounded) {
            x = Math.max(low, Math.min(high, x));
            z = Math.max(low, Math.min(high, z));
          }
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
        let place = key.split(',').map(Number);
        // Saved before the world had no edge: a number counting through the first land.
        if (place.length === 1) place = [place[0] % SIZE, Math.floor(place[0] / (SIZE * SIZE)), Math.floor(place[0] / SIZE) % SIZE];
        const [x, y, z] = place;
        const kind = saved.edits[key];
        if (place.length === 3 && place.every(Number.isInteger) && inside(x, y, z) && Number.isInteger(kind) && kind >= 0 && kind < NAMES.length) {
          put(x, y, z, kind);
          remember(x, y, z, kind);
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
