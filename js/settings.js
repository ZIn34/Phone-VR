'use strict';

// Eye-fit settings: where and how big the two eye pictures are drawn.
window.PVR = window.PVR || {};

PVR.defaultSettings = {
  separation: 0.46,   // distance between the two picture centres, as a share of the screen width
  size: 1,            // 1 = the picture is as tall as the screen
  offsetY: 0,         // up (+) or down (-), as a share of the screen height
  distortion: true,   // lens distortion correction on or off
  strength: 0.25,     // how strongly the picture is curved to cancel the lens
};

PVR.settings = Object.assign({}, PVR.defaultSettings);
