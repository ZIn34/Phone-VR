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

  // Which way the steps are going. Give it the phone's movement as the world
  // sees it: x east, y up, z south (gravity in or out; it works out which).
  //
  // When you walk, you rise and fall once each step, and you are fastest
  // along the way you are going at the bottom of each fall, when your foot
  // lands, and slowest at the top. So the way you are going is the way your
  // speed swings in time with the up-and-down push of each step. Walking
  // backwards it swings backwards, and so on. Swaying from side to side swings
  // once every two steps, so it does not get in the way.
  const wayRules = {
    leak: 0.5,      // seconds: speed is worked out from movement, slowly forgetting, so it cannot drift away
    over: 1.3,      // seconds: about the last two steps are weighed
    sure: 0.3,      // below this certainty (0 to 1), steps go forward
  };

  function createStepWay() {
    const mean = [0, 0, 0];   // the steady part of the movement: gravity, and any tilt
    const speed = [0, 0];     // how fast you are moving east and south, against your usual speed
    let along = [0, 0];       // speed swing times up-and-down push, weighed over the last steps
    let size = 1e-9;          // the same without direction, to judge how sure it is
    let lastTime = null;
    let started = 0;
    return {
      feed(x, y, z, time) {
        const dt = lastTime === null ? 0 : Math.max(0, Math.min(0.1, (time - lastTime) / 1000));
        lastTime = time;
        started += dt;
        const settle = Math.min(1, dt / 1.0);
        const now = [x, y, z];
        for (let i = 0; i < 3; i++) mean[i] += (now[i] - mean[i]) * (started < 0.3 ? 1 : settle);
        const up = y - mean[1];
        const keep = Math.exp(-dt / wayRules.leak);
        speed[0] = (speed[0] + (x - mean[0]) * dt) * keep;
        speed[1] = (speed[1] + (z - mean[2]) * dt) * keep;
        const weigh = Math.min(1, dt / wayRules.over);
        along = [along[0] + (up * speed[0] - along[0]) * weigh, along[1] + (up * speed[1] - along[1]) * weigh];
        size += (Math.abs(up) * Math.hypot(speed[0], speed[1]) - size) * weigh;
      },
      // The way of the last steps, as a turn from the way you face (radians, a
      // quarter turn at a time; positive is to the left), or 0 for forward when unsure.
      // facing: [x, z], the way you face, flat.
      turn(facing) {
        const sure = Math.hypot(along[0], along[1]) / Math.max(size, 1e-9);
        if (sure < wayRules.sure) return 0;
        const across = facing[1] * along[0] - facing[0] * along[1];
        const ahead = facing[0] * along[0] + facing[1] * along[1];
        const angle = Math.atan2(across, ahead);
        return Math.round(angle / (Math.PI / 2)) * (Math.PI / 2) + 0; // + 0: never minus nought
      },
      sureness() { return Math.hypot(along[0], along[1]) / Math.max(size, 1e-9); },
    };
  }

  const api = { createStepCounter, createStepWay, rules, wayRules };
  if (inNode) {
    module.exports = api;
  } else {
    root.PVR = root.PVR || {};
    root.PVR.steps = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
