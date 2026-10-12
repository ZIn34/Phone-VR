'use strict';

// Follow the circle: the rules of the game, with no drawing in it, so it is
// also run by tests/game.test.js.
//
// The circle's place is a yaw and pitch (radians) measured from "front".
(function (root) {
  const inNode = typeof module !== 'undefined' && module.exports;
  const math = inNode ? require('./math.js') : root.PVR.math;
  const RAD = Math.PI / 180;

  const rules = {
    length: 60,              // seconds of play
    holdToStart: 1.5,        // seconds the crosshair must rest on the circle to begin
    onTarget: 4.5 * RAD,     // how close the crosshair must be to count
    circleSize: 3.5 * RAD,   // how big the circle is drawn
    pointsPerSecond: 100,
    reachYaw: 35 * RAD,      // how far left and right the circle wanders
    reachPitch: 14 * RAD,    // how far up and down
    slow: 0.15,              // how fast it moves along its path at the start...
    fast: 0.75,              // ...and at the end
    resultsPause: 2.5,       // seconds the results show before looking at the circle restarts
  };

  // Repeatable random numbers, so a test can replay the same game.
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

  function createGame(seed) {
    let random;
    let along;        // how far the circle has gone along its path
    let direction;    // +1 or -1: which way it is going round
    let elapsed;
    let nextStop;     // when the circle next stops and stays planted
    let stopLeft;     // seconds left of the current stop
    let resultsFor;

    const game = {
      phase: 'waiting',   // 'waiting' -> 'playing' -> 'done'
      yaw: 0,
      pitch: 0,
      score: 0,
      timeLeft: rules.length,
      onTarget: false,
      hold: 0,            // 0 to 1: how far through "look at the circle to start"
      stopped: false,
      onFinish: null,     // called with the final score
    };

    function place() {
      game.yaw = rules.reachYaw * Math.sin(along);
      game.pitch = rules.reachPitch * Math.sin(1.618 * along);
    }

    function begin() {
      game.phase = 'playing';
      game.score = 0;
      game.hold = 0;
      elapsed = 0;
      stopLeft = 0;
      nextStop = 5 + random() * 4;
    }

    game.restart = function () {
      random = randomFrom(seed++);
      along = 0;
      direction = random() < 0.5 ? 1 : -1;
      resultsFor = 0;
      game.phase = 'waiting';
      game.score = 0;
      game.timeLeft = rules.length;
      game.hold = 0;
      game.stopped = false;
      place();
    };

    // The circle's direction in the room.
    game.direction = function (frontYaw) {
      return math.direction(frontYaw + game.yaw, game.pitch);
    };

    // Moves the game on by dt seconds. orientation is where the player is looking.
    game.update = function (dt, orientation, frontYaw) {
      const looking = math.rotate(orientation, [0, 0, -1]);
      const target = game.direction(frontYaw);
      const dot = looking[0] * target[0] + looking[1] * target[1] + looking[2] * target[2];
      game.onTarget = Math.acos(Math.max(-1, Math.min(1, dot))) <= rules.onTarget;

      if (game.phase === 'waiting') {
        game.hold = game.onTarget ? game.hold + dt / rules.holdToStart : 0;
        if (game.hold >= 1) begin();
        return;
      }

      if (game.phase === 'done') {
        resultsFor += dt;
        const ready = resultsFor >= rules.resultsPause;
        game.hold = ready && game.onTarget ? game.hold + dt / rules.holdToStart : 0;
        if (game.hold >= 1) {
          game.restart();
          begin();
        }
        return;
      }

      dt = Math.min(dt, rules.length - elapsed); // the last moment stops exactly on the minute
      elapsed += dt;
      if (game.onTarget) game.score += rules.pointsPerSecond * dt;

      if (stopLeft > 0) {
        stopLeft -= dt;
        if (stopLeft <= 0) {
          // Off again, sometimes back the way it came.
          if (random() < 0.5) direction = -direction;
          nextStop = elapsed + 5 + random() * 5;
        }
      } else {
        const speed = rules.slow + (rules.fast - rules.slow) * Math.min(1, elapsed / rules.length);
        along += direction * speed * dt;
        if (elapsed >= nextStop) stopLeft = 0.8 + random() * 1.0;
      }
      game.stopped = stopLeft > 0;
      place();

      game.timeLeft = Math.max(0, rules.length - elapsed);
      if (elapsed >= rules.length) {
        game.phase = 'done';
        game.score = Math.round(game.score);
        game.hold = 0;
        game.stopped = false;
        resultsFor = 0;
        // Back to the front, where looking at it starts another go.
        along = 0;
        place();
        if (game.onFinish) game.onFinish(game.score);
      }
    };

    game.restart();
    return game;
  }

  const api = { createGame, rules };
  if (inNode) {
    module.exports = api;
  } else {
    root.PVR = root.PVR || {};
    root.PVR.game = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
