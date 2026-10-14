'use strict';

// Block world: health, animals and enemies. Just the rules, with no drawing,
// so it is also run by tests/survival.test.js.
//
// Animals wander about. Enemies walk towards you and hurt you when they reach
// you. Both can be knocked out by hitting them. All of them stand on the land
// of a world from blocks.js.
(function (root) {
  const inNode = typeof module !== 'undefined' && module.exports;

  const KINDS = {
    pig: { animal: true, health: 3, speed: 1.0, size: [0.9, 0.9, 0.9] },
    sheep: { animal: true, health: 3, speed: 0.9, size: [0.9, 1.0, 0.9] },
    creeper: { animal: false, health: 4, speed: 1.7, size: [0.6, 1.7, 0.6] },
  };

  const rules = {
    health: 100,
    bite: 10,            // health an enemy takes each time it reaches you
    biteEvery: 1.0,
    biteWithin: 1.2,
    safeFall: 3.5,       // blocks you can fall without being hurt
    fallHurt: 10,        // health lost for each block beyond that
    restAfter: 5,        // seconds without being hurt before health starts coming back
    restore: 2,          // health a second after that
    food: 20,            // health an animal gives back when knocked out
    animals: 5,
    enemies: 2,
    near: 9,             // creatures appear at least this far away...
    far: 20,             // ...and no further than this
    gone: 42,            // and are forgotten beyond this
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

  function meetsBox(from, direction, low, high) {
    let near = 0, far = Infinity;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(direction[i]) < 1e-9) {
        if (from[i] < low[i] || from[i] > high[i]) return Infinity;
        continue;
      }
      let a = (low[i] - from[i]) / direction[i];
      let b = (high[i] - from[i]) / direction[i];
      if (a > b) { const swap = a; a = b; b = swap; }
      near = Math.max(near, a);
      far = Math.min(far, b);
      if (near > far) return Infinity;
    }
    return near;
  }

  function createSurvival(world, seed) {
    const random = randomFrom(seed);
    const life = {
      health: rules.health,
      creatures: [],     // { kind, x, y, z, heading, health, hitAgo, think, bite }
      knocked: { animals: 0, enemies: 0 },
      hurtAgo: 99,       // seconds since you were last hurt
      fellAgo: 99,       // seconds since you last ran out of health and started again
    };
    let spawnIn = 1;

    // Where a creature would stand in a column of the world: on top of the highest block.
    const standOn = (x, z) => world.top(Math.floor(x), Math.floor(z)) + 1;

    life.add = function (kind, x, z) {
      const creature = { kind, x, z, y: standOn(x, z), heading: random() * Math.PI * 2, health: KINDS[kind].health, hitAgo: 99, think: 0, bite: 0, walking: false };
      life.creatures.push(creature);
      return creature;
    };

    function spawn() {
      const p = world.player;
      const animals = life.creatures.filter((c) => KINDS[c.kind].animal).length;
      const enemies = life.creatures.length - animals;
      // A flat world is your own room: fewer visitors.
      const wantAnimals = world.flat ? 2 : rules.animals;
      const wantEnemies = world.flat ? 1 : rules.enemies;
      let kind = null;
      if (animals < wantAnimals) kind = random() < 0.5 ? 'pig' : 'sheep';
      else if (enemies < wantEnemies) kind = 'creeper';
      if (!kind) return;
      const angle = random() * Math.PI * 2;
      const far = rules.near + random() * (rules.far - rules.near);
      const x = p.x + Math.sin(angle) * far;
      const z = p.z + Math.cos(angle) * far;
      if (x < 2 || z < 2 || x > world.size - 2 || z > world.size - 2) return;
      life.add(kind, x, z);
    }

    life.boxOf = function (creature) {
      const [w, h, d] = KINDS[creature.kind].size;
      return [[creature.x - w / 2, creature.y, creature.z - d / 2], [creature.x + w / 2, creature.y + h, creature.z + d / 2]];
    };

    // Hits whatever creature is in the way of a line from `from` along `direction`,
    // if it is in reach and no block is in front of it. Returns the creature or null.
    life.hit = function (from, direction) {
      // As far as you can reach to build or break in this world.
      const block = world.aim(from, direction);
      let reach = block ? block.distance : world.body.reach;
      let struck = null;
      for (const creature of life.creatures) {
        const box = life.boxOf(creature);
        const distance = meetsBox(from, direction, box[0], box[1]);
        if (distance < reach) {
          reach = distance;
          struck = creature;
        }
      }
      if (!struck) return null;
      struck.health--;
      struck.hitAgo = 0;
      // Knocked back a little, away from you.
      const away = Math.hypot(direction[0], direction[2]) || 1;
      struck.x += direction[0] / away * 0.6;
      struck.z += direction[2] / away * 0.6;
      struck.y = standOn(struck.x, struck.z);
      if (struck.health <= 0) {
        life.creatures = life.creatures.filter((c) => c !== struck);
        if (KINDS[struck.kind].animal) {
          life.knocked.animals++;
          life.health = Math.min(rules.health, life.health + rules.food);
        } else {
          life.knocked.enemies++;
        }
      }
      return struck;
    };

    function hurt(amount) {
      life.health = Math.max(0, life.health - amount);
      life.hurtAgo = 0;
    }

    // Moves everything on by dt seconds. Call after world.update, so a landing can be felt.
    life.update = function (dt) {
      const p = world.player;
      life.hurtAgo += dt;
      life.fellAgo += dt;

      if (world.landed > rules.safeFall) hurt(Math.round((world.landed - rules.safeFall) * rules.fallHurt));

      spawnIn -= dt;
      if (spawnIn <= 0) {
        spawnIn = 1.5;
        spawn();
      }

      for (const c of life.creatures) {
        const kind = KINDS[c.kind];
        c.hitAgo += dt;
        c.think -= dt;
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const away = Math.hypot(dx, dz);
        if (kind.animal) {
          // Wander: pick a way to go now and then, and sometimes just stand.
          if (c.think <= 0) {
            c.think = 1.5 + random() * 3;
            c.walking = random() < 0.65;
            c.heading = random() * Math.PI * 2;
          }
        } else {
          // Come straight for you.
          c.walking = away > 0.9;
          c.heading = Math.atan2(dx, -dz);
          c.bite -= dt;
          const level = Math.abs(c.y - p.y) < 2;
          if (away < rules.biteWithin && level && c.bite <= 0 && !world.flying) {
            c.bite = rules.biteEvery;
            hurt(rules.bite);
          }
        }
        if (c.walking) {
          const x = c.x + Math.sin(c.heading) * kind.speed * dt;
          const z = c.z - Math.cos(c.heading) * kind.speed * dt;
          const y = standOn(x, z);
          const inWorld = x > 1.5 && z > 1.5 && x < world.size - 1.5 && z < world.size - 1.5;
          // They climb one block and step down a few, but will not climb walls or walk off cliffs.
          if (inWorld && y - c.y <= 1 && c.y - y <= 3) {
            c.x = x; c.z = z; c.y = y;
          } else if (kind.animal) {
            c.think = 0;
          }
        } else {
          c.y = standOn(c.x, c.z); // the ground may have been dug away, or built up
        }
      }
      life.creatures = life.creatures.filter((c) => Math.hypot(c.x - p.x, c.z - p.z) < rules.gone);

      if (life.hurtAgo > rules.restAfter) life.health = Math.min(rules.health, life.health + rules.restore * dt);

      // Out of health: start again where you began, keeping what you built and carry.
      if (life.health <= 0) {
        life.health = rules.health;
        life.creatures = [];
        life.fellAgo = 0;
        life.hurtAgo = 99;
        world.setFlying(false);
        Object.assign(p, { x: world.start[0], y: standOn(world.start[0], world.start[2]), z: world.start[2], fall: 0 });
      }
    };

    return life;
  }

  const api = { createSurvival, rules, KINDS };
  if (inNode) {
    module.exports = api;
  } else {
    root.PVR = root.PVR || {};
    root.PVR.survival = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
