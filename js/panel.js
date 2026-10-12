'use strict';

// The eye-fit settings panel. It opens on top of the VR view, so every change
// can be seen in the two pictures straight away.
window.PVR = window.PVR || {};

(function (PVR) {
  const percent = (value) => Math.round(value * 100) + '%';
  const ROWS = [
    { name: 'separation', label: 'Eye distance', less: 'Closer together', more: 'Further apart', show: percent },
    { name: 'size', label: 'Picture size', less: 'Smaller', more: 'Bigger', show: percent },
    {
      name: 'offsetY', label: 'Up / down', less: 'Down', more: 'Up',
      show: (value) => (value === 0 ? 'Middle' : (value > 0 ? 'Up ' : 'Down ') + Math.abs(Math.round(value * 100))),
    },
    { name: 'strength', label: 'Correction strength', less: 'Weaker', more: 'Stronger', show: percent },
  ];
  const HOLD_DELAY = 400;  // ms a button is held before it starts repeating
  const HOLD_EVERY = 90;

  PVR.createPanel = function (panel) {
    const settings = PVR.settings;
    const values = {};
    const steppers = {};
    const toggle = panel.querySelector('#lens-toggle');

    function refresh() {
      for (const row of ROWS) values[row.name].textContent = row.show(settings[row.name]);
      toggle.textContent = settings.distortion ? 'On' : 'Off';
      toggle.setAttribute('aria-pressed', settings.distortion);
      steppers.strength.classList.toggle('disabled', !settings.distortion);
    }

    function change(name, direction) {
      settings[name] = PVR.clampSetting(name, settings[name] + direction * PVR.settingLimits[name].step);
      PVR.saveSettings();
      refresh();
    }

    function stepButton(row, direction) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = direction < 0 ? '−' : '+';
      button.setAttribute('aria-label', `${row.label}: ${direction < 0 ? row.less : row.more}`);
      button.dataset.setting = row.name;
      button.dataset.direction = direction;

      // One tap is one step; holding the button keeps going.
      let wait = 0;
      let repeat = 0;
      let held = false;
      const release = () => { clearTimeout(wait); clearInterval(repeat); };
      button.addEventListener('pointerdown', () => {
        held = false;
        release();
        wait = setTimeout(() => {
          held = true;
          repeat = setInterval(() => change(row.name, direction), HOLD_EVERY);
        }, HOLD_DELAY);
      });
      for (const end of ['pointerup', 'pointerleave', 'pointercancel']) button.addEventListener(end, release);
      button.addEventListener('click', () => { if (!held) change(row.name, direction); held = false; });
      return button;
    }

    const rows = panel.querySelector('#setting-rows');
    const lensRow = panel.querySelector('#lens-row');
    for (const row of ROWS) {
      const line = document.createElement('div');
      line.className = 'setting';
      const label = document.createElement('span');
      label.className = 'setting-label';
      label.textContent = row.label;
      const value = document.createElement('span');
      value.className = 'setting-value';
      values[row.name] = value;
      steppers[row.name] = line;
      line.append(label, stepButton(row, -1), value, stepButton(row, 1));
      // Strength belongs under the lens correction switch.
      if (row.name === 'strength') lensRow.after(line); else rows.insertBefore(line, lensRow);
    }

    toggle.addEventListener('click', () => {
      settings.distortion = !settings.distortion;
      PVR.saveSettings();
      refresh();
    });
    panel.querySelector('#reset').addEventListener('click', () => {
      PVR.resetSettings();
      refresh();
    });
    panel.querySelector('#done').addEventListener('click', () => { panel.hidden = true; });

    refresh();
    return {
      open() { refresh(); panel.hidden = false; },
      close() { panel.hidden = true; },
      toggle() { if (panel.hidden) this.open(); else this.close(); },
    };
  };
})(window.PVR);
