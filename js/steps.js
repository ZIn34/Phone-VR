'use strict';

// Feels real steps from the phone's motion sensor, so walking in real life
// can move you in a game. It cannot tell where you are or which way a step
// went, only that you took one. No browser needed, so it is also run by
// tests/steps.test.js.
//
// A phone held in front of you in both hands bounces much less than one in a
// pocket, and every person walks differently, so the level that counts as a
// step is learnt from how the phone has been moving in the last few seconds.
(function (root) {
  const inNode = typeof module !== 'undefined' && module.exports;

  const rules = {
    least: 0.55,      // the smallest jolt (m/s² above standing still) that can ever count as a step
    share: 0.55,      // a step must also be this share of the recent biggest jolts
    settle: 0.35,     // after a step the jolt must fall below this share of the step before another can count
    gap: 280,         // ms: steps closer together than this are one step
    turning: 200,     // degrees per second: while the phone is being swung round, jolts are ignored
  };

  function createStepCounter() {
    let resting = null;   // what the sensor reads when nothing is happening, learnt slowly
    let jolt = 0;         // how far above that it is right now, smoothed a little
    let recent = 0;       // the size of recent big jolts, slowly forgotten
    let armed = true;
    let lastStep = -Infinity;
    let lastTime = null;
    let stepSize = 0;

    const counter = {
      steps: 0,
      readings: 0,        // how many sensor readings have arrived, to tell whether any are
      // Give it each reading: acceleration (x, y, z; with or without gravity), how
      // fast the phone is turning (degrees per second, or 0), and the time in ms.
      // Returns true when that reading completes a step.
      feed(x, y, z, turn, time) {
        counter.readings++;
        const strength = Math.hypot(x, y, z);
        const dt = lastTime === null ? 0.016 : Math.min(0.1, Math.max(0.001, (time - lastTime) / 1000));
        lastTime = time;
        if (resting === null) resting = strength;
        resting += (strength - resting) * Math.min(1, dt / 1.5);
        jolt += (strength - resting - jolt) * Math.min(1, dt / 0.05);
        recent = Math.max(recent * Math.exp(-dt / 2.5), jolt);
        if (turn > rules.turning) {
          armed = false; // swinging the phone about is not walking
          stepSize = rules.least;
          return false;
        }
        if (!armed) {
          if (jolt < stepSize * rules.settle) armed = true;
          return false;
        }
        const level = Math.max(rules.least, recent * rules.share);
        if (jolt > level && time - lastStep > rules.gap) {
          armed = false;
          stepSize = jolt;
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
