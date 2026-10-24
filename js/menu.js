'use strict';

// The floating menu: tiles that hang in the room in front of you, in both eyes.
// It stays where it was opened, so you turn your head to look across it.
// It is the home of the whole thing: after Start you are always in it until
// you choose something, and Home brings you back to it.
//
// Looking at a tile never chooses it. How you choose depends on how you play:
//   Level 1: aim the cross in the middle of the view at a tile and press a
//            SELECT button at the side of the screen.
//   Levels 2 and 3: point at a tile and pinch, or hold your fingertip on it.
// To open it from inside an activity: the MENU button at the side of the
// screen, or (Levels 2 and 3) show the camera an open palm, or hold a
// fingertip on the MENU button in the view.
window.PVR = window.PVR || {};

(function (PVR) {
  const math = PVR.math;
  const RAD = Math.PI / 180;
  const REST = 0.9;          // seconds a fingertip rests on a tile to choose it
  const AGAIN = 0.45;        // seconds between repeats on - and +
  const PINCH = 0.22;        // thumb and finger this close (against hand size) is a pinch...
  const UNPINCH = 0.32;      // ...and this far apart lets go
  const PALM = 0.8;          // seconds an open palm is shown to open the menu
  const TILE_W = 12 * RAD;
  const TILE_H = 5.4 * RAD;
  const GAP = 1.2 * RAD;
  const LINE = 4.6 * RAD;    // height of one settings line
  const FOCAL_FOR_SIZES = 2.79;
  const DROP = 0.5 * RAD;
  const HEADING = 2.2 * RAD;   // height of a section heading
  const HANDLE_H = 3.4 * RAD;  // height of the handle you grab to move the menu

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
  //   tiles(): [{ id, label, caption, group, stay }]   what can be chosen at the current level, with
  //       the section it sits in; stay: choosing it leaves the menu open
  //   choose(id), recentre(), home(), canPlayAgain(), playAgain()
  //   recipes(): [{ label, can, run }] things that can be crafted right now, or null where there is no crafting
  // }
  PVR.createMenu = function (actions) {
    const settings = PVR.settings;
    let screen = 'closed';      // 'closed' | 'main' | 'fit' | 'craft'
    let anchorYaw = 0;          // where the menu hangs in the room
    let anchorPitch = 0;
    // blocked: the tile a fingertip was already on when a screen appeared. It
    // does not count until the fingertip has moved off it, so nothing is chosen
    // by accident. undefined = not looked at yet since the screen appeared.
    const rest = { id: null, time: 0, done: false, blocked: undefined };
    let atHome = false;         // at the home menu, which cannot be closed
    let moving = null;          // the menu is being carried: 'aim' (by where you look) or the number of the hand pinching its handle
    let pinching = [];          // per hand: is it pinching right now
    let palmTime = 0;
    let restOpen = 0;
    let restCraft = 0;

    function change(name, direction) {
      settings[name] = PVR.clampSetting(name, settings[name] + direction * PVR.settingLimits[name].step);
      PVR.saveSettings();
    }

    function show(next) {
      screen = next;
      rest.id = null;
      rest.time = 0;
      rest.blocked = undefined;
      moving = null;
    }

    // screen: which screen to open on; the main one unless said.
    function open(orientation, screen) {
      anchorYaw = math.yawOf(orientation);
      // Level with where you are looking, but never down at the floor or up at the ceiling.
      anchorPitch = Math.max(-10 * RAD, Math.min(12 * RAD, math.pitchOf(orientation)));
      palmTime = restOpen = restCraft = 0;
      show(screen || 'main');
    }

    // The tiles of the current screen. x and y are angles from the middle of the menu.
    function layout() {
      const list = [];
      const tile = (id, label, caption, x, y, w, h, run, repeat) => list.push({ id, label, caption, x, y, w, h, run, repeat, line: h === LINE });
      if (screen === 'main') {
        // Each section has its heading, then its tiles three to a row.
        const rows = [];
        const activities = actions.tiles();
        const sections = [];
        for (const a of activities) if (!sections.includes(a.group)) sections.push(a.group);
        for (const section of sections) {
          rows.push({ heading: section });
          const inSection = activities.filter((a) => a.group === section);
          for (let i = 0; i < inSection.length; i += 3) {
            rows.push({ tiles: inSection.slice(i, i + 3).map((a) => [a.id, a.label, a.caption || '', () => { actions.choose(a.id); if (!a.stay) show('closed'); }]) });
          }
        }
        const row = [
          ['fit', 'Settings', '', () => show('fit')],
          ['recentre', 'Re-centre', '', () => actions.recentre()],
        ];
        // In Block world: turning the blocks you have into other things.
        if (actions.recipes && actions.recipes()) row.unshift(['craft', 'Craft', 'BLOCK WORLD', () => show('craft')]);
        // At home there is nowhere to go back to, and nothing to close.
        if (!atHome) {
          row.push(['home', 'Home', 'BACK TO THIS MENU', () => actions.home()]);
          const last = [['close', 'Close menu', '', () => show('closed')]];
          if (actions.canPlayAgain()) last.unshift(['again', 'Play again', '', () => { actions.playAgain(); show('closed'); }]);
          rows.push({ gap: true }, { tiles: row }, { tiles: last });
        } else {
          rows.push({ gap: true }, { tiles: row });
        }
        const tall = (r) => (r.tiles ? TILE_H + GAP : (r.heading ? HEADING : GAP));
        let y = rows.reduce((sum, r) => sum + tall(r), 0) / 2;
        for (const r of rows) {
          const middle = y - tall(r) / 2;
          y -= tall(r);
          if (r.heading) list.push({ words: r.heading.toUpperCase(), x: 0, y: middle - 0.3 * RAD, size: 17, colour: '#9aa3b5' });
          if (!r.tiles) continue;
          r.tiles.forEach(([id, label, caption, run], c) => {
            tile(id, label, caption, (c - (r.tiles.length - 1) / 2) * (TILE_W + GAP), middle, TILE_W, TILE_H, run);
          });
        }
        return list;
      }
      if (screen === 'craft') {
        // One wide tile for each thing you can make; choosing it makes one lot.
        const recipes = actions.recipes() || [];
        const step = LINE + 0.7 * RAD;
        const count = recipes.length + 1;
        recipes.forEach((recipe, i) => {
          tile('craft' + i, recipe.can ? recipe.label : recipe.label + ': need more', '', 0, ((count - 1) / 2 - i) * step, 36 * RAD, LINE, recipe.run);
        });
        tile('back', 'Back', '', 0, ((count - 1) / 2 - recipes.length) * step, 36 * RAD, LINE, () => show('main'));
        return list;
      }
      // Settings: one line each, - on the left and + on the right.
      const lines = [];
      for (const toggle of PVR.settingToggles) lines.push({ toggle: toggle.name, label: toggle.label, on: toggle.on, off: toggle.off });
      for (const row of PVR.settingRows) {
        if (!PVR.settingShown(row)) continue;
        if (row.name === 'strength') lines.push({ toggle: 'distortion', label: 'Lens correction' });
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
          tile(line.toggle, line.label + ': ' + (settings[line.toggle] ? (line.on || 'On') : (line.off || 'Off')), '', 0, y, 33 * RAD, LINE, () => {
            settings[line.toggle] = !settings[line.toggle];
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
      //   hands: [{ tip: [x, y], pinch, open, palmUp }] in canvas pixels; empty when hands are not used
      //   handsOn: true when hands do the choosing (Levels 2 and 3)
      //   select: true on the frame a SELECT button at the side was pressed
      //   home: true at the home menu, which is always open
      //   quiet: true while playing a game, when nothing extra should sit in the view
      //   craft: true where a CRAFT button should be offered (Block world)
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

        atHome = !!input.home;
        if (screen === 'closed' && atHome) open(orientation);

        if (screen === 'closed') {
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
          }
          // A button fixed in the view, pressed by resting a fingertip on it. Returns how long it has been rested on.
          const restButton = (b, words, rested, colour) => {
            const on = input.hands.some((hand) => hand.tip[0] >= b.x && hand.tip[0] <= b.x + b.w && hand.tip[1] >= b.y && hand.tip[1] <= b.y + b.h);
            rested = on ? rested + dt : 0;
            ctx.beginPath();
            ctx.roundRect(b.x, b.y, b.w, b.h, 14);
            ctx.fillStyle = on ? 'rgba(79, 140, 255, .55)' : colour;
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, .6)';
            ctx.lineWidth = 3;
            ctx.stroke();
            if (on) {
              ctx.save();
              ctx.clip();
              ctx.fillStyle = 'rgba(61, 255, 176, .6)';
              ctx.fillRect(b.x, b.y, b.w * Math.min(1, rested / REST), b.h);
              ctx.restore();
            }
            text(ctx, words, b.x + b.w / 2, b.y + b.h / 2, 22);
            return rested;
          };
          // MENU at the right of the view, while not playing.
          restOpen = input.handsOn && !input.quiet ? restButton({ x: width * 0.86 - 44, y: height / 2 - 30, w: 88, h: 60 }, 'MENU', restOpen, 'rgba(11, 13, 18, .72)') : 0;
          // CRAFT in Block world, a little lower, opening the craft list straight away.
          restCraft = input.handsOn && input.craft ? restButton({ x: width * 0.86 - 50, y: height / 2 + 50, w: 100, h: 56 }, 'CRAFT', restCraft, 'rgba(120, 80, 30, .75)') : 0;
          if (restCraft >= REST) open(orientation, 'craft');
          else if (palmTime >= PALM || restOpen >= REST) open(orientation);
          return;
        }

        // Open: work out where every tile is on the canvas. Sizes were chosen
        // for a picture about 40 degrees tall; they shrink or grow with the
        // picture, so the menu always takes up the same share of the screen.
        const fit = FOCAL_FOR_SIZES / focal;
        const tiles = layout();
        // The handle at the top: grab it to carry the whole menu somewhere else.
        const top = Math.max(...tiles.map((t) => (t.w ? t.y + t.h / 2 : t.y + 1.3 * RAD)));
        const handle = {
          id: 'move', handle: true, line: true, caption: '', x: 0, y: top + 0.9 * RAD + HANDLE_H / 2, w: 18 * RAD, h: HANDLE_H,
          label: moving === null ? '✥ MOVE MENU' : (moving === 'aim' ? 'SELECT to put down' : 'Let go to put down'),
          run() {},
        };
        tiles.push(handle);
        for (const t of tiles) {
          t.x *= fit;
          t.y = (t.y - DROP) * fit; // the whole menu sits a touch below eye level
          if (t.w) { t.w *= fit; t.h *= fit; }
        }

        // While it is being carried, the menu goes wherever the cross or the pinching fingertip points.
        if (moving !== null) {
          let towards = null;
          if (moving === 'aim') {
            towards = [math.yawOf(orientation), math.pitchOf(orientation)];
          } else if (input.hands[moving] && pinching[moving]) {
            const tip = input.hands[moving].tip;
            const x = (tip[0] - width / 2) / unit / focal;
            const y = (height / 2 - tip[1]) / unit / focal;
            const length = Math.hypot(x, y, 1);
            const d = math.rotate(orientation, [x / length, y / length, -1 / length]);
            towards = [Math.atan2(d[0], -d[2]), Math.asin(Math.max(-1, Math.min(1, d[1])))];
          }
          if (towards) {
            anchorYaw = towards[0] - handle.x;
            anchorPitch = Math.max(-60 * RAD, Math.min(60 * RAD, towards[1] - handle.y));
          }
          // Put down: SELECT again, or the pinch let go.
          if (moving === 'aim' ? input.select : !towards) {
            moving = null;
            input = Object.assign({}, input, { select: false }); // that press only put the menu down
            rest.blocked = undefined;
          }
        }
        const carried = moving !== null;

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

        // Looking at a tile only shows which one a SELECT press would choose.
        const pressed = new Set();
        const aimed = input.handsOn ? null : under(middle) || null;
        const pointing = input.hands.map((hand) => under(hand.tip));
        if (carried) {
          // Nothing is chosen while the menu is being carried.
          dwell(rest, null, dt, REST, false);
        } else {
          if (aimed && input.select) pressed.add(aimed);
          pointing.forEach((t, i) => { if (t && pinched[i]) pressed.add(t); });
          const rested = pointing.find((t) => t && !t.handle) || null;
          if (dwell(rest, rested ? rested.id : null, dt, REST, rested && rested.repeat)) pressed.add(rested);
          // Picking the menu up by its handle: SELECT with the cross on it, or a pinch on it.
          if (pressed.has(handle)) {
            pressed.delete(handle);
            const hand = pointing.findIndex((t, i) => t === handle && pinched[i]);
            moving = hand >= 0 ? hand : 'aim';
          }
        }

        ctx.fillStyle = 'rgba(0, 0, 0, .55)';
        ctx.fillRect(0, 0, width, height);
        for (const t of tiles) {
          if (t.words) {
            if (t.at) text(ctx, t.words, t.at[0], t.at[1], t.size || 19, t.colour);
            continue;
          }
          if (!t.corners) continue;
          const c = t.corners;
          const lit = t === aimed || t.id === rest.id || (t.handle && moving !== null);
          ctx.beginPath();
          ctx.moveTo(c[0][0], c[0][1]);
          for (let i = 1; i < 4; i++) ctx.lineTo(c[i][0], c[i][1]);
          ctx.closePath();
          ctx.fillStyle = lit ? 'rgba(79, 140, 255, .6)' : 'rgba(22, 26, 35, .85)';
          ctx.fill();
          ctx.strokeStyle = lit ? '#fff' : 'rgba(255, 255, 255, .5)';
          ctx.lineWidth = 3;
          ctx.stroke();
          // The tile fills from the left while a fingertip rests on it.
          const state = t.id === rest.id ? rest : null;
          if (state && !state.done && state.time > 0) {
            const f = Math.min(1, state.time / REST);
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
            // Long words are made small enough to fit across the tile.
            const wide = Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]);
            const fits = wide / (t.label.length * 0.58);
            text(ctx, t.label, x, y, t.label.length <= 1 ? tall * 0.6 : Math.max(11, Math.min(fits, tall * (t.line ? 0.34 : 0.22))));
          }
        }

        // Level 1: the cross you aim with, and a reminder of how to choose.
        if (!input.handsOn) {
          ctx.beginPath();
          ctx.moveTo(middle[0] - 18, middle[1]); ctx.lineTo(middle[0] - 5, middle[1]);
          ctx.moveTo(middle[0] + 5, middle[1]); ctx.lineTo(middle[0] + 18, middle[1]);
          ctx.moveTo(middle[0], middle[1] - 18); ctx.lineTo(middle[0], middle[1] - 5);
          ctx.moveTo(middle[0], middle[1] + 5); ctx.lineTo(middle[0], middle[1] + 18);
          ctx.strokeStyle = 'rgba(0, 0, 0, .7)';
          ctx.lineWidth = 7;
          ctx.stroke();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        text(ctx, input.handsOn ? 'Point at a tile and pinch' : 'Aim the cross at a tile, then tap SELECT', middle[0], height * 0.055, 18, '#3dffb0');

        // Press last, so a tile that changes the screen does not disturb this frame's drawing.
        for (const t of pressed) {
          if (actions.sound) actions.sound('click');
          t.run();
        }
      },
    };
  };
})(window.PVR);
