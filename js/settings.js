'use strict';

// Settings: how you play, and which kind of world. In headset
// view (two pictures, for lenses) also where and how big the eye pictures are.
// They are kept on this phone so they are still there next time.
window.PVR = window.PVR || {};

(function (PVR) {
  const STORAGE_KEY = 'phone-vr.settings.v1';

  PVR.defaultSettings = {
    level: 1,           // how you play: 1 screen buttons, 2 one hand, 3 both hands
    steps: true,        // real steps move you forward in games you can walk in
    stepWay: true,      // real steps go the way you step (back, left, right), not only forward
    real: false,        // false: Simulation, only the game's own world. true: Real life, the game's things appear in your room
    lenses: false,      // false: window mode, one full-screen picture. true: headset view, two eye pictures for lenses
    separation: 0.46,   // distance between the two picture centres, as a share of the screen width
    size: 1,            // 1 = the picture is as tall as the screen
    offsetY: 0,         // up (+) or down (-), as a share of the screen height
    distortion: true,   // lens distortion correction on or off
    strength: 0.25,     // how strongly the picture is curved to cancel the lens
  };

  // Lowest value, highest value, and how much one press of - or + changes it.
  PVR.settingLimits = {
    level: { min: 1, max: 3, step: 1 },
    separation: { min: 0.3, max: 0.7, step: 0.01 },
    size: { min: 0.5, max: 1.5, step: 0.02 },
    offsetY: { min: -0.25, max: 0.25, step: 0.01 },
    strength: { min: 0, max: 1, step: 0.05 },
  };

  // Settings that are simply one thing or the other, with the words for each.
  PVR.settingToggles = [
    { name: 'real', label: 'World', on: 'Real life', off: 'Simulation' },
    { name: 'steps', label: 'Walk by stepping', on: 'On', off: 'Off' },
    { name: 'stepWay', label: 'Step direction', on: 'As you step', off: 'Always forward' },
  ];

  PVR.settings = Object.assign({}, PVR.defaultSettings);

  PVR.clampSetting = function (name, value) {
    const limit = PVR.settingLimits[name];
    const stepped = Math.round(value / limit.step) * limit.step;
    return Math.max(limit.min, Math.min(limit.max, Number(stepped.toFixed(4))));
  };

  PVR.loadSettings = function () {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (err) {
      saved = null; // private browsing, or something unreadable: keep the starting values
    }
    if (!saved || typeof saved !== 'object') return;
    for (const name in PVR.settingLimits) {
      if (typeof saved[name] === 'number' && isFinite(saved[name])) {
        PVR.settings[name] = PVR.clampSetting(name, saved[name]);
      }
    }
    if (typeof saved.distortion === 'boolean') PVR.settings.distortion = saved.distortion;
    if (typeof saved.lenses === 'boolean') PVR.settings.lenses = saved.lenses;
    for (const toggle of PVR.settingToggles) {
      if (typeof saved[toggle.name] === 'boolean') PVR.settings[toggle.name] = saved[toggle.name];
    }
  };

  PVR.saveSettings = function () {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(PVR.settings));
    } catch (err) {
      // Nowhere to keep them: they still work until the page is closed.
    }
  };

  // Puts the numbers back to their starting values. How you play, and whether
  // headset view is on, are left alone.
  PVR.resetSettings = function () {
    const keep = { level: PVR.settings.level, lenses: PVR.settings.lenses };
    for (const toggle of PVR.settingToggles) keep[toggle.name] = PVR.settings[toggle.name];
    Object.assign(PVR.settings, PVR.defaultSettings, keep);
    PVR.saveSettings();
  };

  PVR.loadSettings();
})(window.PVR);
