'use strict';

// Hand tracking for Levels 2 and 3: finds hands in the camera picture using
// Google's MediaPipe, which is only downloaded the first time it is needed.
//
// Positions are shares of the camera picture: [0, 0] is its top left corner
// and [1, 1] its bottom right.
window.PVR = window.PVR || {};

(function (PVR) {
  const LOOK_EVERY = 80;  // ms between looks at the picture; each look is heavy work for a phone
  const FRESH_FOR = 500;  // ms a sighting stays believable if no newer look has happened

  PVR.createHands = function (video) {
    const base = new URL('vendor/mediapipe/', document.baseURI).href;
    let landmarker = null;
    let wanted = 0;       // how many hands to look for; 0 = not in use
    let lastLook = 0;

    const hands = {
      status: 'off',      // 'off' | 'loading' | 'ready' | 'failed'
      list: [],           // one entry for each hand seen at the last look
      seenAt: 0,
    };

    async function load() {
      hands.status = 'loading';
      try {
        const vision = await import(base + 'vision_bundle.mjs');
        const files = await vision.FilesetResolver.forVisionTasks(base + 'wasm');
        landmarker = await vision.HandLandmarker.createFromOptions(files, {
          // CPU: slower than the graphics chip, but it behaves the same on every phone.
          baseOptions: { modelAssetPath: base + 'hand_landmarker.task', delegate: 'CPU' },
          runningMode: 'VIDEO',
          numHands: wanted || 1,
        });
        hands.status = wanted ? 'ready' : 'off';
      } catch (err) {
        landmarker = null;
        hands.status = 'failed';
      }
    }

    // Starts looking for up to `count` hands. Safe to call every frame.
    hands.start = function (count) {
      if (count === wanted && hands.status !== 'off') return;
      const changed = count !== wanted;
      wanted = count;
      if (hands.status === 'loading' || hands.status === 'failed') return;
      if (!landmarker) {
        load();
        return;
      }
      if (changed) landmarker.setOptions({ numHands: count });
      hands.status = 'ready';
    };

    hands.stop = function () {
      wanted = 0;
      hands.list = [];
      if (hands.status === 'ready') hands.status = 'off';
    };

    // Forgets a failure so the next start tries again.
    hands.retry = function () {
      if (hands.status === 'failed') hands.status = 'off';
    };

    // Takes a fresh look at the camera picture when one is due.
    hands.update = function (now) {
      if (hands.status !== 'ready' || !landmarker) return;
      if (now - lastLook < LOOK_EVERY || video.readyState < 2 || !video.videoWidth) return;
      lastLook = now;
      try {
        const found = landmarker.detectForVideo(video, now);
        const sides = found.handedness || found.handednesses || [];
        hands.list = found.landmarks.map((points, i) => {
          const far = (a, b) => Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y);
          // Which way the hand is turned: the sign of this flips between palm and back,
          // and is opposite for left and right hands.
          const turn = (points[5].x - points[0].x) * (points[17].y - points[0].y) - (points[5].y - points[0].y) * (points[17].x - points[0].x);
          const right = sides[i] && sides[i][0] && sides[i][0].categoryName === 'Right';
          return {
            tip: [points[8].x, points[8].y],   // end of the index finger
            palm: [(points[0].x + points[5].x + points[17].x) / 3, (points[0].y + points[5].y + points[17].y) / 3],
            // Thumb and index fingertip close together, measured against the size of the hand.
            pinch: far(4, 8) / far(0, 9),
            // All four fingers stretched out.
            open: [8, 12, 16, 20].every((tip) => far(tip, 0) > far(tip - 2, 0) * 1.1),
            // The palm, not the back of the hand, is towards the camera.
            palmUp: right ? turn < 0 : turn > 0,
          };
        });
        hands.seenAt = now;
      } catch (err) {
        hands.list = [];
        hands.status = 'failed';
      }
    };

    // The hands in view right now. Empty as soon as sight of them is lost, so
    // nothing drawn from this can freeze in place.
    hands.inView = function (now) {
      return hands.status === 'ready' && now - hands.seenAt < FRESH_FOR ? hands.list : [];
    };

    return hands;
  };
})(window.PVR);
