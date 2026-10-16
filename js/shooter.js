'use strict';

// Blaster arena: the rules of the game, with no drawing in it, so it is also
// run by tests/shooter.test.js.
//
// It is played in a block world (see blocks.js) that has walls to hide
// behind. Robots step out from behind their wall, fire one slow bolt you can
// see coming, and step back. Places are [x, y, z] in blocks.
(function (root) {
  const inNode = typeof module !== 'undefined' && module.exports;

  const BLASTERS = [
    { name: 'Blaster', damage: 1, wait: 0.35, auto: false },   // the one you start with
    { name: 'Rapid', damage: 0.5, wait: 0.11, auto: true },    // fires for as long as the trigger is held
    { name: 'Heavy', damage: 3, wait: 1.0, auto: false },      // one hit is enough
  ];

  const rules = {
    health: 100,
    hurt: 15,            // health lost to each bolt that reaches you
    robots: 6,
    robotHealth: 3,
    robotSize: [0.7, 1.7, 0.7],
    boltSpeed: 7,        // blocks a second: slow enough to see coming and step aside
    boltLife: 6,
    hitWithin: 0.55,     // a bolt this close to you has hit you
    slide: 0.5,          // seconds a robot takes to step out or back
    out: 2.4,            // seconds it stays out
    aimFor: 1.0,         // how long it is out before it fires
    backAfter: 6,        // seconds before a knocked-out robot is replaced
    pickupWithin: 1.2,
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

  // Where a line from `from` along `direction` first meets a box, as a distance, or Infinity.
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

  // world: an arena from blocks.js, with world.cover listing its walls.
  function createShooter(world, seed) {
    let random;
    const game = {
      health: rules.health,
      score: 0,
      over: false,
      robots: [],
      bolts: [],       // the robots' shots: { at: [x, y, z], going: [x, y, z], life }
      pickups: [],     // blasters lying about: { at: [x, y, z], blaster: index }
      owned: [0],      // which blasters you have
      blaster: 0,      // which one is in hand (an index into BLASTERS)
      wait: 0,         // seconds until the blaster can fire again
      hurtAgo: 99,     // seconds since you were last hit, for the red flash
      onOver: null,    // called with the score when the game ends
    };

    function freeWall(except) {
      const taken = new Set(game.robots.filter((r) => r !== except && r.state !== 'down').map((r) => r.wall));
      const free = world.cover.map((wall, i) => i).filter((i) => !taken.has(i));
      return free.length ? free[Math.floor(random() * free.length)] : Math.floor(random() * world.cover.length);
    }

    // Puts a robot behind a wall, out of sight.
    function hide(robot) {
      robot.wall = freeWall(robot);
      const wall = world.cover[robot.wall];
      robot.hidden = wall.behind.slice();
      robot.shown = wall.beside.slice();
      robot.at = robot.hidden.slice();
      robot.health = rules.robotHealth;
      robot.state = 'hidden';
      robot.time = hiddenFor();
      robot.fired = false;
    }

    // Robots come out more often the more you have knocked out.
    function hiddenFor() {
      return Math.max(1.2, 3.5 - game.score * 0.08) * (0.6 + 0.8 * random());
    }

    game.restart = function () {
      random = randomFrom(seed++);
      Object.assign(game, { health: rules.health, score: 0, over: false, bolts: [], owned: [0], blaster: 0, wait: 0, hurtAgo: 99 });
      game.robots = [];
      for (let i = 0; i < Math.min(rules.robots, world.cover.length); i++) {
        const robot = {};
        game.robots.push(robot);
        hide(robot);
        robot.time *= 0.4 + i * 0.25; // they do not all come out at once
      }
      game.pickups = world.pickupSpots.map((at, i) => ({ at: at.slice(), blaster: 1 + (i % (BLASTERS.length - 1)) }));
    };

    // The box a robot takes up, for hitting.
    game.boxOf = function (robot) {
      const [w, h, d] = rules.robotSize;
      return [[robot.at[0] - w / 2, robot.at[1], robot.at[2] - d / 2], [robot.at[0] + w / 2, robot.at[1] + h, robot.at[2] + d / 2]];
    };

    // Fires the blaster in hand from `from` along `direction` (a unit vector).
    // Returns null if it is not ready, else { to: where the shot ended, hit: the robot it hit or null }.
    game.fire = function (from, direction) {
      if (game.over || game.wait > 0) return null;
      const blaster = BLASTERS[game.blaster];
      game.wait = blaster.wait;
      const block = world.aim(from, direction, 60);
      let reach = block ? block.distance : 60;
      let struck = null;
      for (const robot of game.robots) {
        if (robot.state === 'down') continue;
        const box = game.boxOf(robot);
        const distance = meetsBox(from, direction, box[0], box[1]);
        if (distance < reach) {
          reach = distance;
          struck = robot;
        }
      }
      if (struck) {
        struck.health -= blaster.damage;
        struck.hitAgo = 0;
        if (struck.health <= 0) {
          struck.state = 'down';
          struck.time = rules.backAfter;
          game.score++;
        }
      }
      return { to: [0, 1, 2].map((i) => from[i] + direction[i] * reach), hit: struck };
    };

    game.nextBlaster = function () {
      const i = game.owned.indexOf(game.blaster);
      game.blaster = game.owned[(i + 1) % game.owned.length];
    };

    // Moves the game on by dt seconds. you: where your eyes are.
    game.update = function (dt, you) {
      game.wait = Math.max(0, game.wait - dt);
      game.hurtAgo += dt;
      if (game.over) return;

      for (const robot of game.robots) {
        robot.time -= dt;
        robot.hitAgo = (robot.hitAgo === undefined ? 99 : robot.hitAgo) + dt;
        const mix = (from, to, t) => [0, 1, 2].map((i) => from[i] + (to[i] - from[i]) * t);
        if (robot.state === 'down') {
          if (robot.time <= 0) hide(robot);
        } else if (robot.state === 'hidden') {
          if (robot.time <= 0) { robot.state = 'coming'; robot.time = rules.slide; }
        } else if (robot.state === 'coming') {
          robot.at = mix(robot.hidden, robot.shown, 1 - Math.max(0, robot.time) / rules.slide);
          if (robot.time <= 0) { robot.state = 'out'; robot.time = rules.out; robot.fired = false; }
        } else if (robot.state === 'out') {
          if (!robot.fired && robot.time <= rules.out - rules.aimFor) {
            // One slow bolt, aimed at where you are now. Step aside and it misses.
            robot.fired = true;
            const from = [robot.at[0], robot.at[1] + rules.robotSize[1] * 0.75, robot.at[2]];
            const to = [you[0] - from[0], you[1] - 0.3 - from[1], you[2] - from[2]];
            const length = Math.hypot(to[0], to[1], to[2]) || 1;
            game.bolts.push({ at: from, going: to.map((v) => v / length * rules.boltSpeed), life: rules.boltLife });
          }
          if (robot.time <= 0) { robot.state = 'going'; robot.time = rules.slide; }
        } else if (robot.state === 'going') {
          robot.at = mix(robot.shown, robot.hidden, 1 - Math.max(0, robot.time) / rules.slide);
          if (robot.time <= 0) { robot.state = 'hidden'; robot.time = hiddenFor(); }
        }
      }

      for (const bolt of game.bolts) {
        bolt.life -= dt;
        for (let i = 0; i < 3; i++) bolt.at[i] += bolt.going[i] * dt;
        // A wall stops a bolt, so you can hide too.
        if (world.solid(Math.floor(bolt.at[0]), Math.floor(bolt.at[1]), Math.floor(bolt.at[2]))) bolt.life = 0;
        const nearBody = Math.hypot(bolt.at[0] - you[0], bolt.at[2] - you[2]) < rules.hitWithin && bolt.at[1] > you[1] - 1.6 && bolt.at[1] < you[1] + 0.3;
        if (bolt.life > 0 && nearBody) {
          bolt.life = 0;
          game.health = Math.max(0, game.health - rules.hurt);
          game.hurtAgo = 0;
        }
      }
      game.bolts = game.bolts.filter((bolt) => bolt.life > 0);

      // Walking into a blaster picks it up and puts it in your hand.
      game.pickups = game.pickups.filter((pickup) => {
        if (Math.hypot(pickup.at[0] - you[0], pickup.at[2] - you[2]) > rules.pickupWithin) return true;
        if (!game.owned.includes(pickup.blaster)) game.owned.push(pickup.blaster);
        game.blaster = pickup.blaster;
        return false;
      });

      if (game.health <= 0) {
        game.over = true;
        game.bolts = [];
        if (game.onOver) game.onOver(game.score);
      }
    };

    game.restart();
    return game;
  }

  // The trigger finger at Levels 2 and 3. Each reading is how straight the
  // index finger is: 1 straight, less as it curls. Every hand and every pose is
  // different, so there is no fixed level: it pulls when the finger curls a
  // little from how straight it has just been, and lets go when it opens a
  // little from its deepest curl. Quick small pulls each fire.
  const triggerRules = {
    pull: 0.1,       // a curl this much from just before is a pull
    release: 0.07,   // opening this much from the deepest curl lets go
    forget: 0.8,     // seconds: a slow drift of the finger is forgotten, so it never fires by itself
  };

  function createTrigger() {
    let peak = null;      // how straight the finger has just been
    let deepest = 1;      // how far it is curled during a pull
    let lastTime = null;
    const trigger = {
      down: false,
      curl: 0,            // 0 relaxed to 1 at the point of firing, for the meter
      // straight: the reading; time: in seconds. Returns whether the trigger is down.
      feed(straight, time) {
        const dt = lastTime === null ? 0 : Math.max(0, Math.min(0.2, time - lastTime));
        lastTime = time;
        if (peak === null) peak = straight;
        if (!trigger.down) {
          if (straight > peak) peak = straight;
          else peak += (straight - peak) * Math.min(1, dt / triggerRules.forget);
          if (peak - straight > triggerRules.pull) {
            trigger.down = true;
            deepest = straight;
          }
        } else {
          deepest = Math.min(deepest, straight);
          if (straight - deepest > triggerRules.release) {
            trigger.down = false;
            peak = straight;
          }
        }
        trigger.curl = trigger.down ? 1 : Math.max(0, Math.min(1, (peak - straight) / triggerRules.pull));
        return trigger.down;
      },
      // The hand went out of sight: start again when it comes back.
      reset() {
        peak = null;
        lastTime = null;
        trigger.down = false;
        trigger.curl = 0;
      },
    };
    return trigger;
  }

  const api = { createShooter, createTrigger, triggerRules, rules, BLASTERS, meetsBox };
  if (inNode) {
    module.exports = api;
  } else {
    root.PVR = root.PVR || {};
    root.PVR.shooter = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
