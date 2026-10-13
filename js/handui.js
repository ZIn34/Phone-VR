'use strict';

// What Levels 2 and 3 add to the view: a marker on each tracked hand, a plain
// message when no hand can be seen, and a menu worked by holding a fingertip
// over a button, so nothing needs a touch on the screen.
window.PVR = window.PVR || {};

(function (PVR) {
  const HOLD = 0.7;      // seconds a fingertip must rest on a button to press it
  const AGAIN = 0.4;     // seconds between repeats on the - and + buttons
  const STATUS = {
    loading: 'Getting hand tracking ready…',
    failed: 'Hand tracking could not start. In Settings, choose Level 1.',
    none: 'No hand in view. Hold your hand up in front of the phone.',
  };

  function text(ctx, words, x, y, size, colour) {
    ctx.font = `bold ${size}px sans-serif`;
    ctx.lineWidth = Math.max(4, size / 6);
    ctx.strokeStyle = 'rgba(0, 0, 0, .75)';
    ctx.strokeText(words, x, y);
    ctx.fillStyle = colour || '#fff';
    ctx.fillText(words, x, y);
  }

  // hands: [{ tip: [x, y], palm: [x, y] }] in canvas pixels. status: the tracker's status.
  PVR.paintHands = function (ctx, width, height, hands, status) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const hand of hands) {
      ctx.beginPath();
      ctx.moveTo(hand.palm[0], hand.palm[1]);
      ctx.lineTo(hand.tip[0], hand.tip[1]);
      ctx.strokeStyle = 'rgba(255, 255, 255, .5)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hand.tip[0], hand.tip[1], 16, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 0, 0, .7)';
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hand.tip[0], hand.tip[1], 5, 0, Math.PI * 2);
      ctx.fillStyle = '#3dffb0';
      ctx.fill();
    }
    const words = status === 'ready' ? (hands.length ? '' : STATUS.none) : STATUS[status];
    if (words) text(ctx, words, width / 2, height * 0.66, 19, '#ffb454');
  };

  // actions: { recentre(), exit(), playAgain(), canPlayAgain() }
  PVR.createHandMenu = function (actions) {
    const settings = PVR.settings;
    let screen = 'closed';   // 'closed' | 'main' | 'fit'
    let over = null;         // id of the button a fingertip is on
    let held = 0;
    let pressed = false;     // a one-press button stays quiet until the finger leaves it

    function change(name, direction) {
      settings[name] = PVR.clampSetting(name, settings[name] + direction * PVR.settingLimits[name].step);
      PVR.saveSettings();
    }

    function buttons(width, height) {
      const cx = width / 2;
      if (screen === 'closed') {
        return [{ id: 'menu', label: 'MENU', x: width * 0.86 - 44, y: height / 2 - 30, w: 88, h: 60, run: () => { screen = 'main'; } }];
      }
      const list = [];
      if (screen === 'main') {
        const rows = [
          ['Re-centre', actions.recentre],
          ['Eye fit and level', () => { screen = 'fit'; }],
          ['Exit to home', actions.exit],
          ['Close menu', () => { screen = 'closed'; }],
        ];
        if (actions.canPlayAgain()) rows.unshift(['Play again', () => { actions.playAgain(); screen = 'closed'; }]);
        const top = height / 2 - rows.length * 36;
        rows.forEach(([label, run], i) => list.push({ id: label, label, x: cx - 170, y: top + i * 72, w: 340, h: 60, run }));
        return list;
      }
      // Eye fit: one line per setting, with - on the left and + on the right.
      const lines = PVR.settingRows.length + 2;
      const top = height / 2 - lines * 32;
      let line = 0;
      const stepper = (row) => {
        const y = top + line++ * 64;
        list.push({ id: row.name + '-', label: '−', x: cx - 220, y, w: 76, h: 54, repeat: true, run: () => change(row.name, -1) });
        list.push({ id: row.name + '+', label: '+', x: cx + 144, y, w: 76, h: 54, repeat: true, run: () => change(row.name, 1) });
        list.push({ caption: row.label + ': ' + row.show(settings[row.name]), x: cx, y: y + 27 });
      };
      for (const row of PVR.settingRows) {
        if (row.name === 'strength') {
          const y = top + line++ * 64;
          list.push({
            id: 'lens', label: 'Lens correction: ' + (settings.distortion ? 'On' : 'Off'), x: cx - 170, y, w: 340, h: 54,
            run: () => { settings.distortion = !settings.distortion; PVR.saveSettings(); },
          });
        }
        stepper(row);
      }
      list.push({ id: 'back', label: 'Back', x: cx - 170, y: top + line * 64, w: 340, h: 54, run: () => { screen = 'main'; } });
      return list;
    }

    return {
      isOpen() { return screen !== 'closed'; },
      close() { screen = 'closed'; over = null; },

      // fingertips: [[x, y]] in canvas pixels. dt: seconds since the last frame.
      paint(ctx, width, height, fingertips, dt) {
        const list = buttons(width, height);
        const hit = list.find((b) => b.run && fingertips.some((tip) => tip[0] >= b.x && tip[0] <= b.x + b.w && tip[1] >= b.y && tip[1] <= b.y + b.h));
        if (!hit || hit.id !== over) {
          over = hit ? hit.id : null;
          held = 0;
          pressed = false;
        } else if (!pressed) {
          held += dt;
          if (held >= HOLD) {
            hit.run();
            if (hit.repeat) held = HOLD - AGAIN; else pressed = true;
          }
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (screen !== 'closed') {
          ctx.fillStyle = 'rgba(0, 0, 0, .72)';
          ctx.fillRect(0, 0, width, height);
        }
        for (const b of list) {
          if (!b.run) {
            text(ctx, b.caption, b.x, b.y, 20);
            continue;
          }
          const on = b.id === over;
          ctx.beginPath();
          ctx.roundRect(b.x, b.y, b.w, b.h, 14);
          ctx.fillStyle = on ? 'rgba(79, 140, 255, .55)' : 'rgba(11, 13, 18, .72)';
          ctx.fill();
          ctx.strokeStyle = on ? '#fff' : 'rgba(255, 255, 255, .55)';
          ctx.lineWidth = 3;
          ctx.stroke();
          if (on && !pressed) {
            // Fills from the left while the fingertip rests on it.
            ctx.save();
            ctx.clip();
            ctx.fillStyle = 'rgba(61, 255, 176, .6)';
            ctx.fillRect(b.x, b.y, b.w * Math.min(1, held / HOLD), b.h);
            ctx.restore();
          }
          text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2, b.label.length <= 1 ? 34 : 22);
        }
      },
    };
  };
})(window.PVR);
