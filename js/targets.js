'use strict';

// Pop the targets: the test activity for the three ways of playing. Just the
// rules, with no drawing, so it is also run by tests/targets.test.js.
//
// A target's place is a yaw and pitch (radians) measured from "front".
(function (root) {
  const inNode = typeof module !== 'undefined' && module.exports;
  const math = inNode ? require('./math.js') : root.PVR.math;
  const RAD = Math.PI / 180;

  const rules = {
    count: 6,
    size: 4 * RAD,          // how big a target is, and how close the crosshair must be
    apart: 14 * RAD,        // targets are never closer together than this
    reachYaw: 40 * RAD,     // how far left and right they appear
    lowest: -12 * RAD,
    highest: 18 * RAD,
    comeBack: 1.2,          // seconds before a popped target appears somewhere new
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

  function between(a, b) {
    const one = math.direction(a.yaw, a.pitch);
    const two = math.direction(b.yaw, b.pitch);
    return Math.acos(Math.max(-1, Math.min(1, one[0] * two[0] + one[1] * two[1] + one[2] * two[2])));
  }

  function createTargets(seed) {
    const random = randomFrom(seed);
    const targets = { list: [], popped: 0 };

    function place(target) {
      for (let tries = 0; tries < 40; tries++) {
        target.yaw = (random() * 2 - 1) * rules.reachYaw;
        target.pitch = rules.lowest + random() * (rules.highest - rules.lowest);
        if (targets.list.every((other) => other === target || between(other, target) >= rules.apart)) return;
      }
    }

    targets.restart = function () {
      targets.list = [];
      targets.popped = 0;
      for (let i = 0; i < rules.count; i++) {
        const target = { yaw: 0, pitch: 0, away: 0 }; // away: seconds until it is back; 0 = showing
        place(target);
        targets.list.push(target);
      }
    };

    targets.update = function (dt) {
      for (const target of targets.list) {
        if (target.away <= 0) continue;
        target.away -= dt;
        if (target.away <= 0) {
          target.away = 0;
          place(target);
        }
      }
    };

    // Pops target number i. Returns false if it was already popped.
    targets.pop = function (i) {
      const target = targets.list[i];
      if (!target || target.away > 0) return false;
      target.away = rules.comeBack;
      targets.popped++;
      return true;
    };

    targets.direction = function (i, frontYaw) {
      return math.direction(frontYaw + targets.list[i].yaw, targets.list[i].pitch);
    };

    // Which target the middle of the view is on, or -1.
    targets.aimedAt = function (orientation, frontYaw) {
      const looking = math.rotate(orientation, [0, 0, -1]);
      let best = -1;
      let closest = rules.size;
      targets.list.forEach((target, i) => {
        if (target.away > 0) return;
        const d = targets.direction(i, frontYaw);
        const angle = Math.acos(Math.max(-1, Math.min(1, looking[0] * d[0] + looking[1] * d[1] + looking[2] * d[2])));
        if (angle <= closest) {
          closest = angle;
          best = i;
        }
      });
      return best;
    };

    targets.restart();
    return targets;
  }

  const api = { createTargets, rules };
  if (inNode) {
    module.exports = api;
  } else {
    root.PVR = root.PVR || {};
    root.PVR.targets = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
