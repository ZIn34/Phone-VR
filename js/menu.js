'use strict';

// The floating menu: tiles that hang in the room in front of you, in both eyes.
// It stays where it was opened, so you turn your head to look across it.
//
// Ways to open it: the MENU button at the side of the screen, looking down at
// the MENU disc near your feet, or (Levels 2 and 3) showing the camera an open
// palm, or resting a fingertip on the MENU button in the view.
// Ways to choose a tile: look at it for a second, tap it, pinch on it, or rest
// a fingertip on it.
window.PVR = window.PVR || {};

(function (PVR) {
  const math = PVR.math;
  const RAD = Math.PI / 180;
  const LOOK = 1.0;          // seconds of steady looking that chooses a tile
  const REST = 0.9;          // seconds a fingertip rests on a tile to choose it
  const AGAIN = 0.45;        // seconds between repeats on - and +
  const PINCH = 0.22;        // thumb and finger this close (against hand size) is a pinch...
  const UNPINCH = 0.32;      // ...and this far apart lets go
  const PALM = 0.8;          // seconds an open palm is shown to open the menu
  const DOWN = -32 * RAD;    // where the look-down MENU disc sits
  const DOWN_SIZE = 5 * RAD;
  const TILE_W = 12 * RAD;
  const TILE_H = 6.5 * RAD;
  const GAP = 1.5 * RAD;
  const LINE = 4.6 * RAD;    // height of one settings line

  function text(ctx, words, x, y, size, colour) {
    ctx.font = `bold ${Math.round(size)}px sans-serif`;
    ctx.lineWidth = Math.max(3, size / 6);
    ctx.strokeStyle = 'rgba(0, 0, 0, .75)';
    ctx.strokeText(words, x, y);
    ctx.fillStyle = colour || '#fff';
    ctx.fillText(words, x, y);
  }

  function inside(point, corners) {
    // corners go round the tile in order; the point is inside if it is on the same side of every edge.
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      const side = (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
      if (side !== 0) {
        if (sign && Math.sign(side) !== sign) return false;
        sign = Math.sign(side);
      }
    }
    return true;
  }

  // actions: {
  //   tiles(): [{ id, label, caption }]   the activities that work at the current level
  //   choose(id), recentre(), home(), canPlayAgain(), playAgain()
  // }
  PVR.createMenu = function (actions) {
    const settings = PVR.settings;
    let screen = 'closed';      // 'closed' | 'main' | 'fit'
    let anchorYaw = 0;          // where the menu hangs in the room
    let anchorPitch = 0;
    // blocked: the tile a pointer was already on when a screen appeared. It
    // does not count until the pointer has moved off it, so nothing is chosen
    // by accident. undefined = not looked at yet since the screen appeared.
    const gaze = { id: null, time: 0, done: false, blocked: undefined };
    const rest = { id: null, time: 0, done: false, blocked: undefined };
    let pinching = [];          // per hand: is it pinching right now
    let palmTime = 0;
    let downTime = 0;
    let restOpen = 0;

    function change(name, direction) {
      settings[name] = PVR.clampSetting(name, settings[name] + direction * PVR.settingLimits[name].step);
      PVR.saveSettings();
    }

    function show(next) {
      screen = next;
      gaze.id = rest.id = null;
      gaze.time = rest.time = 0;
      gaze.blocked = rest.blocked = undefined;
    }

    function open(orientation) {
      anchorYaw = math.yawOf(orientation);
      // A little below where you are looking, but never down at the floor or up at the ceiling.
      anchorPitch = Math.max(-12 * RAD, Math.min(10 * RAD, math.pitchOf(orientation) - 4 * RAD));
      palmTime = downTime = restOpen = 0;
      show('main');
    }

    // The tiles of the current screen. x and y are angles from the middle of the menu.
    function layout() {
      const list = [];
      const tile = (id, label, caption, x, y, w, h, run, repeat) => list.push({ id, label, caption, x, y, w, h, run, repeat });
      if (screen === 'main') {
        const rows = [];
        const activities = actions.tiles();
        for (let i = 0; i < activities.length; i += 3) {
          rows.push(activities.slice(i, i + 3).map((a) => [a.id, a.label, a.caption, () => { actions.choose(a.id); show('closed'); }]));
        }
        rows.push([
          ['fit', 'Settings', 'EYE FIT AND LEVEL', () => show('fit')],
          ['recentre', 'Re-centre', '', () => actions.recentre()],
          ['home', 'Home', 'LEAVE VR', () => actions.home()],
        ]);
        const last = [['close', 'Close menu', '', () => show('closed')]];
        if (actions.canPlayAgain()) last.unshift(['again', 'Play again', '', () => { actions.playAgain(); show('closed'); }]);
        rows.push(last);
        const step = TILE_H + GAP;
        rows.forEach((row, r) => {
          const y = ((rows.length - 1) / 2 - r) * step;
          row.forEach(([id, label, caption, run], c) => {
            tile(id, label, caption, (c - (row.length - 1) / 2) * (TILE_W + GAP), y, TILE_W, TILE_H, run);
          });
        });
        return list;
      }
      // Settings: one line each, - on the left and + on the right.
      const lines = [];
      for (const row of PVR.settingRows) {
        if (row.name === 'strength') lines.push({ toggle: true });
        lines.push({ row });
      }
      lines.push({ back: true });
      const step = LINE + 0.7 * RAD;
      lines.forEach((line, i) => {
        const y = ((lines.length - 1) / 2 - i) * step;
        if (line.row) {
          const name = line.row.name;
          tile(name + '-', '−', '', -13 * RAD, y, 7 * RAD, LINE, () => change(name, -1), true);
          tile(name + '+', '+', '', 13 * RAD, y, 7 * RAD, LINE, () => change(name, 1), true);
          list.push({ words: line.row.label + ': ' + line.row.show(settings[name]), x: 0, y });
        } else if (line.toggle) {
          tile('lens', 'Lens correction: ' + (settings.distortion ? 'On' : 'Off'), '', 0, y, 33 * RAD, LINE, () => {
            settings.distortion = !settings.distortion;
            PVR.saveSettings();
          });
        } else {
          tile('back', 'Back', '', 0, y, 33 * RAD, LINE, () => show('main'));
        }
      });
      return list;
    }

    // Counts up while a pointer stays on one tile, and says when it should press.
    function dwell(state, id, dt, needed, repeat) {
      if (state.blocked === undefined) state.blocked = id;
      if (id === state.blocked) id = null; else state.blocked = null;
      if (id !== state.id) {
        state.id = id;
        state.time = 0;
        state.done = false;
        return false;
      }
      if (!id || state.done) return false;
      state.time += dt;
      if (state.time < needed) return false;
      if (repeat) state.time = needed - AGAIN; else state.done = true;
      return true;
    }

    return {
      isOpen() { return screen !== 'closed'; },
      open,
      close() { show('closed'); },

      // input: {
      //   hands: [{ tip: [x, y], pinch, open, palmUp }] in canvas pixels; empty at Level 1
      //   handsOn: true at Levels 2 and 3
      //   tap: [x, y] where the screen was tapped this frame, in canvas pixels, or null
      // }
      paint(ctx, width, height, focal, orientation, input, dt) {
        const unit = height / 2;
        const middle = [width / 2, height / 2];
        const spot = (yaw, pitch) => {
          const p = math.project(orientation, math.direction(yaw, pitch), focal);
          return p ? [width / 2 + p[0] * unit, height / 2 - p[1] * unit] : null;
        };
        ctx.lineJoin = 'round';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // A pinch counts once, at the moment finger and thumb come together.
        const pinched = input.hands.map((hand, i) => {
          const was = !!pinching[i];
          pinching[i] = hand.pinch < PINCH || (was && hand.pinch < UNPINCH);
          return pinching[i] && !was;
        });
        pinching.length = input.hands.length;

        if (screen === 'closed') {
          // Look down: a MENU disc below wherever you are facing.
          const yaw = math.yawOf(orientation);
          const onDisc = Math.abs(math.pitchOf(orientation) - DOWN) < DOWN_SIZE;
          downTime = onDisc ? downTime + dt : 0;
          const disc = spot(yaw, DOWN);
          if (disc) {
            const radius = focal * Math.tan(DOWN_SIZE) * unit;
            ctx.beginPath();
            ctx.arc(disc[0], disc[1], radius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(11, 13, 18, .6)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, .7)';
            ctx.lineWidth = 3;
            ctx.stroke();
            if (downTime > 0) {
              ctx.beginPath();
              ctx.arc(disc[0], disc[1], radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, downTime / LOOK));
              ctx.strokeStyle = '#3dffb0';
              ctx.lineWidth = 7;
              ctx.stroke();
            }
            text(ctx, 'MENU', disc[0], disc[1], 22);
          }

          let handOpen = false;
          if (input.handsOn) {
            // An open palm shown to the camera.
            const palm = input.hands.find((hand) => hand.open && hand.palmUp);
            palmTime = palm ? palmTime + dt : 0;
            if (palm && palmTime > 0.15) {
              ctx.beginPath();
              ctx.arc(palm.palm[0], palm.palm[1], 44, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, palmTime / PALM));
              ctx.strokeStyle = '#3dffb0';
              ctx.lineWidth = 8;
              ctx.stroke();
              text(ctx, 'MENU', palm.palm[0], palm.palm[1], 20);
            }
            // A MENU button fixed at the right of the view, pressed by resting a fingertip on it.
            const b = { x: width * 0.86 - 44, y: height / 2 - 30, w: 88, h: 60 };
            const on = input.hands.some((hand) => hand.tip[0] >= b.x && hand.tip[0] <= b.x + b.w && hand.tip[1] >= b.y && hand.tip[1] <= b.y + b.h);
            restOpen = on ? restOpen + dt : 0;
            ctx.beginPath();
            ctx.roundRect(b.x, b.y, b.w, b.h, 14);
            ctx.fillStyle = on ? 'rgba(79, 140, 255, .55)' : 'rgba(11, 13, 18, .72)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, .6)';
            ctx.lineWidth = 3;
            ctx.stroke();
            if (on) {
              ctx.save();
              ctx.clip();
              ctx.fillStyle = 'rgba(61, 255, 176, .6)';
              ctx.fillRect(b.x, b.y, b.w * Math.min(1, restOpen / REST), b.h);
              ctx.restore();
            }
            text(ctx, 'MENU', b.x + b.w / 2, b.y + b.h / 2, 22);
            handOpen = palmTime >= PALM || restOpen >= REST;
          }
          if (downTime >= LOOK || handOpen) open(orientation);
          return;
        }

        // Open: work out where every tile is on the canvas.
        const tiles = layout();
        for (const t of tiles) {
          if (t.words) {
            t.at = spot(anchorYaw + t.x, anchorPitch + t.y);
            continue;
          }
          const corners = [
            spot(anchorYaw + t.x - t.w / 2, anchorPitch + t.y + t.h / 2),
            spot(anchorYaw + t.x + t.w / 2, anchorPitch + t.y + t.h / 2),
            spot(anchorYaw + t.x + t.w / 2, anchorPitch + t.y - t.h / 2),
            spot(anchorYaw + t.x - t.w / 2, anchorPitch + t.y - t.h / 2),
          ];
          t.corners = corners.every(Boolean) ? corners : null;
        }
        const under = (point) => tiles.find((t) => t.corners && inside(point, t.corners));

        // Hands come first; looking only counts when no hand is in view, so a
        // glance cannot choose one tile while a finger is going for another.
        const pressed = new Set();
        const pointing = input.hands.map((hand) => under(hand.tip));
        pointing.forEach((t, i) => { if (t && pinched[i]) pressed.add(t); });
        const rested = pointing.find(Boolean) || null;
        if (dwell(rest, rested ? rested.id : null, dt, REST, rested && rested.repeat)) pressed.add(rested);
        const looking = input.hands.length === 0;
        const looked = looking ? under(middle) || null : null;
        if (dwell(gaze, looked ? looked.id : null, dt, LOOK, looked && looked.repeat)) pressed.add(looked);
        if (input.tap) {
          const tapped = under(input.tap);
          if (tapped) pressed.add(tapped);
        }

        ctx.fillStyle = 'rgba(0, 0, 0, .55)';
        ctx.fillRect(0, 0, width, height);
        for (const t of tiles) {
          if (t.words) {
            if (t.at) text(ctx, t.words, t.at[0], t.at[1], 19);
            continue;
          }
          if (!t.corners) continue;
          const c = t.corners;
          const lit = t.id === gaze.id || t.id === rest.id;
          ctx.beginPath();
          ctx.moveTo(c[0][0], c[0][1]);
          for (let i = 1; i < 4; i++) ctx.lineTo(c[i][0], c[i][1]);
          ctx.closePath();
          ctx.fillStyle = lit ? 'rgba(79, 140, 255, .6)' : 'rgba(22, 26, 35, .85)';
          ctx.fill();
          ctx.strokeStyle = lit ? '#fff' : 'rgba(255, 255, 255, .5)';
          ctx.lineWidth = 3;
          ctx.stroke();
          // The countdown: the tile fills from the left while you look at it or rest a finger on it.
          const state = t.id === rest.id ? rest : (t.id === gaze.id ? gaze : null);
          if (state && !state.done && state.time > 0) {
            const f = Math.min(1, state.time / (state === rest ? REST : LOOK));
            ctx.beginPath();
            ctx.moveTo(c[0][0], c[0][1]);
            ctx.lineTo(c[0][0] + (c[1][0] - c[0][0]) * f, c[0][1] + (c[1][1] - c[0][1]) * f);
            ctx.lineTo(c[3][0] + (c[2][0] - c[3][0]) * f, c[3][1] + (c[2][1] - c[3][1]) * f);
            ctx.lineTo(c[3][0], c[3][1]);
            ctx.closePath();
            ctx.fillStyle = 'rgba(61, 255, 176, .55)';
            ctx.fill();
          }
          const x = (c[0][0] + c[2][0]) / 2;
          const y = (c[0][1] + c[2][1]) / 2;
          const tall = Math.abs(c[3][1] - c[0][1]);
          if (t.caption) {
            text(ctx, t.caption, x, y - tall * 0.24, Math.max(10, tall * 0.13), '#9aa3b5');
            text(ctx, t.label, x, y + tall * 0.12, Math.max(13, tall * 0.2));
          } else {
            text(ctx, t.label, x, y, t.label.length <= 1 ? tall * 0.6 : Math.max(13, tall * (t.h === LINE ? 0.34 : 0.22)));
          }
        }

        // Where you are looking, when looking is what chooses.
        if (looking) {
          ctx.beginPath();
          ctx.arc(middle[0], middle[1], 7, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.strokeStyle = 'rgba(0, 0, 0, .7)';
          ctx.lineWidth = 3;
          ctx.stroke();
          if (gaze.id && !gaze.done) {
            ctx.beginPath();
            ctx.arc(middle[0], middle[1], 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, gaze.time / LOOK));
            ctx.strokeStyle = '#3dffb0';
            ctx.lineWidth = 6;
            ctx.stroke();
          }
        }

        // Press last, so a tile that changes the screen does not disturb this frame's drawing.
        for (const t of pressed) t.run();
      },
    };
  };
})(window.PVR);
