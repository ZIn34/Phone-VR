'use strict';

// Feels real steps from the phone's motion sensor, so walking in real life
// can move you in a game. It cannot tell where you are or which way a step
// went, only that you took one. No browser needed, so it is also run by
// tests/steps.test.js.
(function (root) {
  const inNode = typeof module !== 'undefined' && module.exports;

  const rules = {
    bump: 1.3,        // how hard a jolt counts as a step, in metres per second squared above standing still
    settle: 0.4,      // the jolt must fall back below this before another step can count
    gap: 280,         // ms: steps closer together than this are one step
    turning: 150,     // degrees per second: while the phone is being swung round, jolts are ignored
  };

  function createStepCounter() {
    let resting = 9.81;   // what the sensor reads when nothing is happening, learnt slowly
    let jolt = 0;         // how far above that it is right now, smoothed a little
    let armed = true;
    let lastStep = -Infinity;
    let lastTime = null;

    const counter = {
      steps: 0,
      // Give it each reading: acceleration including gravity (x, y, z), how fast
      // the phone is turning (degrees per second, or 0), and the time in ms.
      // Returns true when that reading completes a step.
      feed(x, y, z, turn, time) {
        const strength = Math.hypot(x, y, z);
        const dt = lastTime === null ? 0.016 : Math.min(0.1, Math.max(0.001, (time - lastTime) / 1000));
        lastTime = time;
        resting += (strength - resting) * Math.min(1, dt / 1.5);
        jolt += (strength - resting - jolt) * Math.min(1, dt / 0.06);
        if (turn > rules.turning) {
          armed = false; // swinging the phone about is not walking
          return false;
        }
        if (!armed) {
          if (jolt < rules.settle) armed = true;
          return false;
        }
        if (jolt > rules.bump && time - lastStep > rules.gap) {
          armed = false;
          lastStep = time;
          counter.steps++;
          return true;
        }
        return false;
      },
    };
    return counter;
  }

  const api = { createStepCounter, rules };
  if (inNode) {
    module.exports = api;
  } else {
    root.PVR = root.PVR || {};
    root.PVR.steps = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
