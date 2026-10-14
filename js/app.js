'use strict';

// Adding ?demo to the address swaps the camera for a moving test picture, so
// the VR view can be tried on a computer that has no camera.
const DEMO = new URLSearchParams(location.search).has('demo');

const screens = {
  home: document.getElementById('home'),
  vr: document.getElementById('vr'),
};
const HOME = 'home';      // the home menu, where you always start
const HEADSET = 'headset-view';
const SHOW_FOR = 4000;    // ms the buttons stay after a tap during a game
const startButton = document.getElementById('start');
const exitButton = document.getElementById('exit');
const recentreButton = document.getElementById('recentre');
const playAgainButton = document.getElementById('play-again');
const sideButtons = [document.getElementById('act-left'), document.getElementById('act-right')];
const levelButtons = Array.from(document.querySelectorAll('.level'));
const readyBox = document.getElementById('ready');
const messageBox = document.getElementById('message');
const continueButton = document.getElementById('continue');
const noticeBox = document.getElementById('notice');
const video = document.getElementById('camera');
const canvas = document.getElementById('view');

// If the two-eye drawing cannot start, the plain camera picture underneath still shows.
let view = null;
try {
  view = PVR.createView(canvas, video, PVR.settings);
} catch (err) {
  view = null;
}
if (!view) canvas.hidden = true;

const panel = PVR.createPanel(document.getElementById('panel'));
const tracking = PVR.createTracking((found) => {
  state.sensor = found;
  state.planted = false;
  // No readings: say so, and leave the rest of the view working.
  showNotice(found ? null : (state.motion === 'denied' ? 'motionOff' : 'noSensor'));
});

// Follow the circle. Its best score is kept on this phone.
const BEST_KEY = 'phone-vr.follow-the-circle.best.v1';
const game = PVR.game.createGame(Date.now());
let lastFrame = 0;

function bestScore() {
  try {
    return Math.max(0, parseInt(localStorage.getItem(BEST_KEY), 10) || 0);
  } catch (err) {
    return state.best;
  }
}

game.onFinish = (score) => {
  // The results show the best as it was, so a new best can be called out.
  state.bestShown = state.best;
  if (score > state.best) {
    state.best = score;
    try {
      localStorage.setItem(BEST_KEY, String(score));
    } catch (err) {
      // Nowhere to keep it: it still counts until the page is closed.
    }
  }
  playAgainButton.hidden = false;
};

function playAgain() {
  if (state.experience === 'blaster-arena') restartArena();
  playAgainButton.hidden = true;
  state.bestShown = state.best;
  state.planted = false;
  game.restart();
}

// Before the clock starts, the circle waits level with the horizon, a little
// to the right of wherever the player is facing. Starting takes a deliberate,
// steady look, so the clock cannot start while the phone is still on its way
// to your face. The spot it starts from then becomes "front" for that go.
function plantStartCircle(orientation) {
  const facing = PVR.math.yawOf(orientation);
  const away = Math.atan2(Math.sin(facing - tracking.frontYaw()), Math.cos(facing - tracking.frontYaw()));
  if (state.planted && Math.abs(away) < 25 * Math.PI / 180) return;
  tracking.setFront(facing + 8 * Math.PI / 180);
  state.planted = true;
}

// Pop the targets, and the hand tracking that Levels 2 and 3 use.
const targets = PVR.targets.createTargets(Date.now());
const hands = PVR.createHands(video);

// Block world. What you build is kept on this phone.
const WORLD_KEY = 'phone-vr.block-world.v2'; // v2: the bigger world; builds from the small one could not be carried over
const WORLD_SEED = 20261013;
// Two worlds, each saved on its own: the made-up land for Simulation, and a
// bare floor for Real life, where what you build stands in your room.
const worlds = {
  sim: Object.assign(PVR.blocks.createWorld(WORLD_SEED), { key: WORLD_KEY }),
  real: Object.assign(PVR.blocks.createWorld(WORLD_SEED + 1, true), { key: WORLD_KEY + '.room' }),
};
for (const name in worlds) {
  worlds[name].savedAt = -1;
  worlds[name].savedTime = 0;
  try {
    worlds[name].load(localStorage.getItem(worlds[name].key));
  } catch (err) {
    // Nothing saved, or nowhere to save: start with the fresh world.
  }
}
let world = worlds.sim; // the one in use; follows the Real life / Simulation setting
let blockScene = null;
try {
  if (view) blockScene = PVR.createBlockScene(view.gl);
} catch (err) {
  blockScene = null;
}
const blockButtons = {
  walk: document.getElementById('b-walk'),
  build: document.getElementById('b-build'),
  dig: document.getElementById('b-break'),
};

// The inventory bar: one square for each kind of block you can build with.
const hotbar = document.getElementById('hotbar');
const hotbarSlots = PVR.blocks.BUILD_WITH.map((kind, i) => {
  const slot = document.createElement('button');
  slot.type = 'button';
  slot.style.background = PVR.blockColour(kind);
  slot.setAttribute('aria-label', PVR.blocks.NAMES[kind]);
  slot.addEventListener('click', () => world.setKind(i));
  hotbar.append(slot);
  return slot;
});

// Real steps, felt by the phone's motion sensor, walk you forward.
const stepCounter = PVR.steps.createStepCounter();
window.addEventListener('devicemotion', (event) => {
  if (!PVR.settings.steps || !walkable() || menu.isOpen()) return;
  const a = event.accelerationIncludingGravity;
  if (!a || a.x === null) return;
  const r = event.rotationRate || {};
  const turn = Math.hypot(r.alpha || 0, r.beta || 0, r.gamma || 0);
  // Each real step walks one stride; a few can queue up, no more.
  const body = (state.experience === 'blaster-arena' ? arena().land : world).body;
  if (stepCounter.feed(a.x, a.y, a.z, turn, performance.now())) blockPlay.stride = Math.min(blockPlay.stride + body.stride, body.stride * 3);
});

// Whether you are somewhere you can walk about in.
function walkable() {
  return state.experience === 'block-world' || state.experience === 'blaster-arena';
}

// Blaster arena: one arena for Simulation and one, with a floor you cannot see, for Real life.
const ARENA_BEST_KEY = 'phone-vr.blaster-arena.best.v1';
const arenas = {};
for (const name of ['sim', 'real']) {
  const land = PVR.blocks.createWorld(WORLD_SEED + 7, name === 'real', true);
  arenas[name] = { land, game: PVR.shooter.createShooter(land, Date.now()) };
  arenas[name].game.onOver = (score) => {
    arenaPlay.bestShown = arenaPlay.best;
    if (score > arenaPlay.best) {
      arenaPlay.best = score;
      try {
        localStorage.setItem(ARENA_BEST_KEY, String(score));
      } catch (err) {
        // Nowhere to keep it: it still counts until the page is closed.
      }
    }
  };
}
const arenaPlay = {
  trigger: false,     // the FIRE button is held
  pulled: false,      // the trigger (button or finger) was down last frame
  flashes: [],        // shots just fired, for drawing
  overFor: 0,         // seconds since the game ended
  signed3: false,
  best: 0,
  bestShown: 0,
};
try {
  arenaPlay.best = arenaPlay.bestShown = Math.max(0, parseInt(localStorage.getItem(ARENA_BEST_KEY), 10) || 0);
} catch (err) {
  // No saved best.
}
const arena = () => (PVR.settings.real ? arenas.real : arenas.sim);

function restartArena() {
  const { land, game: shooter } = arena();
  Object.assign(land.player, { x: land.size / 2 + 0.5, y: 1, z: land.size / 2 + 0.5, fall: 0 });
  shooter.restart();
  arenaPlay.bestShown = arenaPlay.best;
  arenaPlay.flashes = [];
  arenaPlay.overFor = 0;
}

// One frame of Blaster arena. Returns what the painter needs to draw over it.
function playArena(dt, orientation, focal, width, height, seen, handsOn, paused) {
  const { land, game: shooter } = arena();
  const ahead = PVR.math.rotate(orientation, [0, 0, -1]);
  let walk = blockPlay.walking;
  let sign = 0;
  if (blockPlay.stride > 0 && !paused) {
    walk = true;
    blockPlay.stride = Math.max(0, blockPlay.stride - land.body.speed * dt);
  }

  // Where the blaster points, and whether its trigger is down.
  let aim = [width / 2, height / 2];
  let hand = null;
  let trigger = arenaPlay.trigger;
  if (handsOn) {
    const signOf = (h) => (h.up && h.up[0] && h.up[1] && !h.up[3] ? (h.up[2] ? 3 : 2) : 0);
    sign = seen.reduce((found, h) => found || signOf(h), 0);
    if (sign === 2) walk = true;
    if (sign === 3 && !arenaPlay.signed3 && !paused) shooter.nextBlaster();
    arenaPlay.signed3 = sign === 3;
    // The hand holding the blaster: it points where the hand is on the screen,
    // and curling the index finger pulls the trigger.
    const holding = seen.find((h) => !signOf(h));
    aim = holding ? holding.palm : null;
    if (holding) {
      hand = { palm: holding.palm, angle: Math.atan2(holding.knuckle[1] - holding.wrist[1], holding.knuckle[0] - holding.wrist[0]) };
      trigger = holding.straight < (arenaPlay.pulled ? 0.88 : 0.75);
    } else {
      trigger = false;
    }
  }

  if (!paused) {
    land.update(dt, walk && !shooter.over ? [ahead[0], ahead[2]] : null);
    const eye = land.eyes();
    const blaster = PVR.shooter.BLASTERS[shooter.blaster];
    const pressed = trigger && !arenaPlay.pulled;
    if (shooter.over) {
      arenaPlay.overFor += dt;
      if (pressed && arenaPlay.overFor > 1.5) restartArena();
    } else if (aim && (pressed || (trigger && blaster.auto))) {
      const shot = shooter.fire(eye, lookThrough(orientation, focal, width, height, aim));
      if (shot) arenaPlay.flashes.push({ to: shot.to, life: 1 });
    }
    arenaPlay.pulled = trigger;
    shooter.update(dt, eye);
    for (const flash of arenaPlay.flashes) flash.life -= dt / 0.12;
    arenaPlay.flashes = arenaPlay.flashes.filter((flash) => flash.life > 0);
  }

  blockScene.orientation = orientation;
  blockScene.target = null;
  blockScene.boxes = PVR.arenaBoxes(shooter, performance.now() / 1000, land.eyes());
  return { handsOn, eye: land.eyes(), aim, hand, flashes: arenaPlay.flashes, best: arenaPlay.bestShown, sign };
}
const FIST_HOLD = 0.45;   // seconds a fist is held before it breaks a block
const FIST_AGAIN = 0.7;   // seconds between breaks while it stays held
const blockPlay = {
  walking: false,     // the WALK button is held
  stride: 0,          // blocks still to walk from real steps already taken
  sign: 0,            // 2 or 3: that many fingers are being held up
  signed3: false,     // the three-finger sign has already changed the block this time
  fist: 0,            // seconds a fist has been held over a block
  pinching: [],
};

// Keeps the world: straight away when a block changes, and every few seconds for where you are standing.
function saveWorld(now) {
  if (world.savedAt === world.changed && now - world.savedTime < 3000) return;
  world.savedAt = world.changed;
  world.savedTime = now;
  try {
    localStorage.setItem(world.key, world.save());
  } catch (err) {
    // Nowhere to keep it: it still works until the page is closed.
  }
}

// Which way a point of the picture looks, out in the world.
function lookThrough(orientation, focal, width, height, point) {
  const unit = height / 2;
  const x = (point[0] - width / 2) / unit / focal;
  const y = (height / 2 - point[1]) / unit / focal;
  const length = Math.hypot(x, y, 1);
  return PVR.math.rotate(orientation, [x / length, y / length, -1 / length]);
}

// One frame of Block world. Returns what the painter needs to draw over it.
function playBlocks(dt, orientation, focal, width, height, seen, handsOn, paused) {
  const ahead = PVR.math.rotate(orientation, [0, 0, -1]);
  let walk = blockPlay.walking;
  blockPlay.sign = 0;
  // Real steps already taken are walked off a little each frame.
  if (blockPlay.stride > 0 && !paused) {
    walk = true;
    blockPlay.stride = Math.max(0, blockPlay.stride - world.body.speed * dt);
  }
  let aimPoint = [width / 2, height / 2];

  if (handsOn && !paused) {
    // Hand signs, so nothing needs a touch on the screen:
    //   pinch = build, fist = break, two fingers up = walk, three fingers up = next block.
    const signOf = (hand) => (hand.up && hand.up[0] && hand.up[1] && !hand.up[3] ? (hand.up[2] ? 3 : 2) : 0);
    const fistOf = (hand) => !!hand.up && !hand.up.some(Boolean);
    blockPlay.sign = seen.reduce((sign, hand) => sign || signOf(hand), 0);
    if (blockPlay.sign === 2) walk = true;
    if (blockPlay.sign === 3 && !blockPlay.signed3) world.nextKind();
    blockPlay.signed3 = blockPlay.sign === 3;

    // The hand that is aiming: a fingertip when pointing or pinching, the middle of the hand for a fist.
    const pointer = seen.find((hand) => !signOf(hand));
    const fist = !!pointer && fistOf(pointer);
    aimPoint = pointer ? (fist ? pointer.palm : pointer.tip) : null;

    // A fist held over a block breaks it, like a punch, and goes on breaking while it is held.
    blockPlay.fist = fist ? blockPlay.fist + dt : 0;
    if (blockPlay.fist >= FIST_HOLD) {
      world.dig(world.aim(world.eyes(), lookThrough(orientation, focal, width, height, pointer.palm)));
      blockPlay.fist = FIST_HOLD - FIST_AGAIN;
    }
    // A pinch builds, once, at the moment finger and thumb come together.
    seen.forEach((hand, i) => {
      const was = !!blockPlay.pinching[i];
      blockPlay.pinching[i] = hand.pinch < 0.22 || (was && hand.pinch < 0.32);
      if (blockPlay.pinching[i] && !was && hand === pointer && !fist) {
        world.build(world.aim(world.eyes(), lookThrough(orientation, focal, width, height, hand.tip)));
      }
    });
    blockPlay.pinching.length = seen.length;
  } else {
    blockPlay.fist = 0;
  }

  if (!paused) world.update(dt, walk ? [ahead[0], ahead[2]] : null);
  const target = aimPoint ? world.aim(world.eyes(), lookThrough(orientation, focal, width, height, aimPoint)) : null;
  blockScene.orientation = orientation;
  blockScene.target = paused ? null : target;
  saveWorld(performance.now());
  return { handsOn, sign: blockPlay.sign, fist: Math.min(1, blockPlay.fist / FIST_HOLD), aimPoint };
}

// Level 1: BUILD and BREAK act on the block under the cross. Looking alone does nothing.
function blockAct(build) {
  if (state.experience !== 'block-world' || menu.isOpen()) return;
  const target = world.aim(world.eyes(), PVR.math.rotate(tracking.orientation(), [0, 0, -1]));
  if (build) world.build(target); else world.dig(target);
}

// The floating menu lists what works at the current level.
function worksAt(experience, level) {
  return !experience.levels || experience.levels.includes(level);
}

const menu = PVR.createMenu({
  tiles: () => Object.keys(PVR.experiences)
    .filter((key) => worksAt(PVR.experiences[key], PVR.settings.level))
    .sort((a, b) => (PVR.experiences[a].group === 'Games' ? 0 : 1) - (PVR.experiences[b].group === 'Games' ? 0 : 1))
    .map((key) => ({ id: key, label: PVR.experiences[key].title, group: PVR.experiences[key].group }))
    // The old two-picture view, kept for anyone with a lens holder. Off unless chosen.
    .concat([{ id: HEADSET, label: 'Headset view: ' + (PVR.settings.lenses ? 'On' : 'Off'), caption: 'NEEDS LENSES', group: 'Testing', stay: true }]),
  choose: switchTo,
  recentre: () => tracking.recentre(),
  home: goHome,
  playAgain,
  canPlayAgain: () => (state.experience === 'follow-the-circle' && game.phase === 'done') || (state.experience === 'blaster-arena' && arena().game.over),
});

// Goes from one activity straight to another without leaving VR.
function switchTo(key) {
  if (key === HEADSET) {
    PVR.settings.lenses = !PVR.settings.lenses;
    PVR.saveSettings();
    return;
  }
  if (!PVR.experiences[key]) return;
  state.experience = key;
  playAgain();
  targets.restart();
}

// Back to the home menu, still in VR.
function goHome() {
  state.experience = HOME;
  menu.close(); // it opens again at once, in front of wherever you are facing now
}

function isGame() {
  const experience = PVR.experiences[state.experience];
  return !!experience && experience.group === 'Games';
}

// Shows only the controls that fit how you play and what you are doing, and
// runs hand tracking only when it is used. Returns true when the side buttons
// are what chooses things.
function fitControls(level, now) {
  if (level === 1) {
    hands.stop();
  } else {
    hands.start(level === 3 ? 2 : 1);
  }
  // If hand tracking cannot start, the side buttons take over so nobody is stuck.
  const buttons = level === 1 || hands.status === 'failed';
  const label = menu.isOpen() ? 'SELECT' : (state.experience === 'pop-the-targets' ? 'POP' : '');
  // Real life or Simulation: which block world is in use, and whether the camera shows behind it.
  world = PVR.settings.real ? worlds.real : worlds.sim;
  const inArenaGame = state.experience === 'blaster-arena' && !!blockScene;
  if (blockScene) {
    blockScene.world = inArenaGame ? arena().land : world;
    blockScene.seeThrough = PVR.settings.real;
    if (!inArenaGame) blockScene.boxes = [];
  }
  const inBlocks = state.experience === 'block-world' && !!blockScene && !menu.isOpen();
  const inArena = inArenaGame && !menu.isOpen();
  // The same three buttons serve both games: walk, and two actions.
  for (const key in blockButtons) blockButtons[key].hidden = !(buttons && (inBlocks || inArena));
  blockButtons.build.textContent = inArena ? 'FIRE' : 'BUILD';
  blockButtons.dig.textContent = inArena ? 'NEXT' : 'BREAK';
  if (!inArena) arenaPlay.trigger = false;
  hotbar.hidden = !inBlocks;
  hotbarSlots.forEach((slot, i) => slot.setAttribute('aria-pressed', i === world.kind));
  if (!inBlocks && !inArena) { blockPlay.walking = false; blockPlay.stride = 0; }
  if (view) view.setScene(state.experience === 'block-world' || inArenaGame ? blockScene : null);
  for (const button of sideButtons) {
    button.hidden = !(buttons && label);
    if (label) button.textContent = label;
  }
  // While playing a game the other buttons stay off the screen.
  screens.vr.classList.toggle('bare', isGame() && !menu.isOpen() && now > state.showUntil);
  screens.vr.classList.toggle('one', !PVR.settings.lenses);
  return buttons;
}

if (view) {
  view.setPainter((ctx, width, height, focal, place) => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastFrame) / 1000); // a long gap (page in the background) does not count
    lastFrame = now;
    const orientation = tracking.orientation();
    const front = tracking.frontYaw();
    const level = PVR.settings.level;
    const buttons = fitControls(level, now);

    // Hands, as places on this canvas. None when the side buttons are in use.
    let seen = [];
    if (!buttons) {
      hands.update(now);
      seen = hands.inView(now).map((hand) => {
        const onCanvas = {};
        for (const part of ['tip', 'palm', 'wrist', 'knuckle']) if (hand[part]) onCanvas[part] = place(hand[part][0], hand[part][1]);
        return Object.assign({}, hand, onCanvas);
      });
    }
    const fingertips = seen.map((hand) => hand.tip);

    // While the menu is open everything underneath stands still, so closing
    // it puts you back exactly where you were.
    const paused = menu.isOpen();
    // Simulation: these two have no world of their own, so a plain sky and ground stands in for your room.
    if (!PVR.settings.real && (state.experience === 'follow-the-circle' || state.experience === 'pop-the-targets')) {
      PVR.paintBackdrop(ctx, width, height, focal, orientation);
    }
    if (state.experience === 'follow-the-circle') {
      if (!paused) {
        if (game.phase === 'waiting') plantStartCircle(orientation);
        game.update(dt, orientation, tracking.frontYaw());
      }
      if (game.phase !== 'done') playAgainButton.hidden = true;
      PVR.paintGame(ctx, width, height, focal, orientation, tracking.frontYaw(), game, state.bestShown);
    } else if (state.experience === 'pop-the-targets') {
      if (!paused) targets.update(dt);
      PVR.paintTargets(ctx, width, height, focal, orientation, front, targets, buttons ? 1 : level, paused ? [] : fingertips);
    } else if (state.experience === 'block-world' && blockScene) {
      PVR.paintBlocks(ctx, width, height, world, playBlocks(dt, orientation, focal, width, height, seen, !buttons, paused));
    } else if (state.experience === 'blaster-arena' && blockScene) {
      PVR.paintArena(ctx, width, height, focal, orientation, arena().game, playArena(dt, orientation, focal, width, height, seen, !buttons, paused));
    } else if (state.experience === 'see-your-room') {
      PVR.paintMarkers(ctx, width, height, focal, orientation, front);
    }

    menu.paint(ctx, width, height, focal, orientation, {
      hands: seen, handsOn: !buttons, select: state.select, home: state.experience === HOME, quiet: isGame(),
    }, dt);
    state.select = false;
    if (level > 1) PVR.paintHands(ctx, width, height, seen, hands.status);
  });
}

// A side button: chooses the tile under the cross in the menu, pops the target under it in Pop the targets.
function sidePress() {
  if (menu.isOpen()) {
    state.select = true;
    return;
  }
  const aimed = targets.aimedAt(tracking.orientation(), tracking.frontYaw());
  if (aimed >= 0) targets.pop(aimed);
}

function chooseLevel(level) {
  PVR.settings.level = PVR.clampSetting('level', level);
  PVR.saveSettings();
  showLevel();
}

// Marks the chosen level on the start page.
function showLevel() {
  const level = PVR.settings.level;
  for (const button of levelButtons) button.setAttribute('aria-pressed', Number(button.dataset.level) === level);
}

const state = {
  stream: null,
  motion: 'unknown', // 'granted' | 'denied' | 'unavailable'
  message: null,     // which problem message is showing, if any
  sensor: null,      // true once the phone sends motion readings, false if none arrive
  wakeLock: null,
  experience: HOME,  // where you are: HOME (the home menu) or a key of PVR.experiences
  best: 0,           // best score in Follow the circle
  bestShown: 0,      // the best to show beside the current go
  select: false,     // a SELECT button was pressed since the last frame
  showUntil: 0,      // during a game, the buttons show until this time
  planted: false,    // whether the circle that starts a go has been put in front of the player
};
state.best = state.bestShown = bestScore();

function show(name) {
  for (const key in screens) screens[key].hidden = key !== name;
  window.scrollTo(0, 0);
}

// Leaving VR, or arriving: the start page.
function route() {
  stopCamera();
  showMessage(null);
  state.experience = HOME;
  state.best = state.bestShown = bestScore();
  const homeBest = document.getElementById('home-best');
  homeBest.hidden = !state.best;
  homeBest.textContent = 'Your best score in Follow the circle: ' + state.best;
  showLevel();
  show('home');
  if (!canUseSensors()) showMessage('insecure');
}

// Phones only hand out the camera and motion sensors to pages opened over https.
function canUseSensors() {
  return DEMO || window.isSecureContext;
}

// Replaces the Start button with what went wrong and how to fix it. Pass null to clear it.
function showMessage(key) {
  state.message = key;
  messageBox.hidden = !key;
  readyBox.hidden = !!key;
  if (!key) return;
  const message = PVR.messages[key];
  document.getElementById('message-title').textContent = message.title;
  document.getElementById('message-text').textContent = message.text;
  const steps = document.getElementById('message-steps');
  steps.textContent = '';
  for (const step of message.steps) {
    const item = document.createElement('li');
    item.textContent = step;
    steps.append(item);
  }
  const more = document.getElementById('message-more');
  more.textContent = message.more || '';
  more.hidden = !message.more;
  continueButton.hidden = !message.canContinue;
}

function showNotice(key) {
  noticeBox.hidden = !key;
  if (key) document.getElementById('notice-text').textContent = PVR.notices[key];
}

function tryAgain() {
  if (state.message === 'insecure') {
    // The same page at its secure address, if there is one.
    if (location.protocol === 'http:') location.protocol = 'https:'; else location.reload();
    return;
  }
  start();
}

// iPhone only shows the motion question when it is asked straight from a tap,
// so this has to run before anything else that waits.
async function askForMotion() {
  if (typeof DeviceOrientationEvent === 'undefined') return 'unavailable';
  if (typeof DeviceOrientationEvent.requestPermission !== 'function') return 'granted';
  try {
    // Both asked at once, straight from the tap: which way the phone points, and its movement (for counting steps).
    const pointing = DeviceOrientationEvent.requestPermission();
    const moving = typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function'
      ? DeviceMotionEvent.requestPermission().catch(() => 'denied')
      : Promise.resolve('granted');
    const [answer] = await Promise.all([pointing, moving]);
    return answer === 'granted' ? 'granted' : 'denied';
  } catch (err) {
    return 'denied';
  }
}

async function askForCamera() {
  if (DEMO) return demoStream();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new DOMException('This browser cannot use the camera from this page.', 'NotFoundError');
  }
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    // Full HD, so the picture stays sharp when it is zoomed to match the distance from your face.
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  });
}

function demoStream() {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  function draw(time) {
    ctx.fillStyle = '#20324a';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.strokeStyle = '#5f7ea6';
    ctx.lineWidth = 2;
    for (let x = 0; x <= 1280; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 720); ctx.stroke(); }
    for (let y = 0; y <= 720; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1280, y); ctx.stroke(); }
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(640, 360, 200, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ef476f';
    ctx.fillRect(600 + Math.sin(time / 700) * 400, 340, 80, 40);
    ctx.fillStyle = '#fff';
    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Test picture (no camera)', 640, 90);
    if (state.stream) requestAnimationFrame(draw);
  }
  const stream = canvas.captureStream(30);
  state.stream = stream;
  requestAnimationFrame(draw);
  return stream;
}

// Stops the phone dimming and locking while it is in front of your eyes.
async function keepAwake() {
  if (!navigator.wakeLock || state.wakeLock) return;
  try {
    state.wakeLock = await navigator.wakeLock.request('screen');
    state.wakeLock.addEventListener('release', () => { state.wakeLock = null; });
  } catch (err) {
    state.wakeLock = null;
  }
}

function stopCamera() {
  panel.close();
  hands.stop();
  hands.retry();
  menu.close();
  for (const button of sideButtons) button.hidden = true;
  playAgainButton.hidden = true;
  showNotice(null);
  if (view) view.stop();
  tracking.stop();
  if (state.wakeLock) state.wakeLock.release();
  if (!state.stream) return;
  state.stream.getTracks().forEach((track) => track.stop());
  state.stream = null;
  video.srcObject = null;
}

async function start(options) {
  const skipMotion = !!(options && options.skipMotion);
  showMessage(null);
  if (!canUseSensors()) return showMessage('insecure');
  startButton.disabled = true;
  try {
    state.motion = skipMotion ? 'denied' : await askForMotion();
    if (state.motion === 'denied' && !skipMotion) return showMessage('motionDenied');
    state.stream = await askForCamera();
    video.srcObject = state.stream;
    await video.play();
    show('vr');
    playAgain();
    targets.restart();
    lastFrame = performance.now();
    state.experience = HOME;
    state.showUntil = 0;
    tracking.start();
    if (view) view.start();
    keepAwake();
  } catch (err) {
    stopCamera();
    showMessage(PVR.cameraMessage(err));
  } finally {
    startButton.disabled = false;
  }
}

startButton.addEventListener('click', () => start());
document.getElementById('retry').addEventListener('click', tryAgain);
continueButton.addEventListener('click', () => start({ skipMotion: true }));
document.getElementById('notice-ok').addEventListener('click', () => showNotice(null));
document.getElementById('notice-retry').addEventListener('click', () => {
  showNotice(null);
  tracking.start(); // listens again; the notice comes back if there are still no readings
});
// Exit: from an activity back to the home menu; from the home menu out of VR.
exitButton.addEventListener('click', () => { if (state.experience === HOME) route(); else goHome(); });
recentreButton.addEventListener('click', () => tracking.recentre());
playAgainButton.addEventListener('click', playAgain);
for (const button of sideButtons) button.addEventListener('click', sidePress);

// Block world: WALK works while it is held; the others act once for each tap.
for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'pointerleave']) {
  blockButtons.walk.addEventListener(type, (event) => {
    blockPlay.walking = type === 'pointerdown';
    blockButtons.walk.classList.toggle('held', blockPlay.walking);
    event.preventDefault();
  });
}
blockButtons.build.addEventListener('click', () => blockAct(true));
blockButtons.dig.addEventListener('click', () => {
  if (state.experience === 'blaster-arena') arena().game.nextBlaster(); else blockAct(false);
});
// In Blaster arena the upper button is FIRE: it fires when pressed, and a rapid blaster keeps firing while it is held.
for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'pointerleave']) {
  blockButtons.build.addEventListener(type, () => { arenaPlay.trigger = type === 'pointerdown' && state.experience === 'blaster-arena'; });
}

document.getElementById('open-menu').addEventListener('click', () => {
  if (!menu.isOpen()) menu.open(tracking.orientation()); else if (state.experience !== HOME) menu.close();
});
for (const button of levelButtons) button.addEventListener('click', () => chooseLevel(Number(button.dataset.level)));
document.getElementById('open-settings').addEventListener('click', () => panel.toggle());

// One tap anywhere on the pictures opens or closes the settings. During a
// game it brings the hidden buttons back for a few seconds instead.
// With no motion sensor, dragging the picture (or the arrow keys) turns a pretend head.
let drag = null;
canvas.addEventListener('pointerdown', (event) => {
  drag = { x: event.clientX, y: event.clientY, moved: 0 };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!drag) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  drag.x = event.clientX;
  drag.y = event.clientY;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  if (tracking.hasSensor()) return;
  const perPixel = 0.7 / canvas.clientHeight; // about one picture height per 40 degrees
  tracking.look(-dx * perPixel, dy * perPixel);
});
canvas.addEventListener('pointerup', () => {
  if (drag && drag.moved < 10) {
    if (isGame() && !menu.isOpen()) state.showUntil = performance.now() + SHOW_FOR; else panel.toggle();
  }
  drag = null;
});
canvas.addEventListener('pointercancel', () => { drag = null; });
window.addEventListener('keydown', (event) => {
  if (screens.vr.hidden || tracking.hasSensor()) return;
  const step = 5 * Math.PI / 180;
  if (event.key === 'ArrowLeft') tracking.look(-step, 0);
  if (event.key === 'ArrowRight') tracking.look(step, 0);
  if (event.key === 'ArrowUp') tracking.look(0, step);
  if (event.key === 'ArrowDown') tracking.look(0, -step);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !screens.vr.hidden) keepAwake();
});
window.addEventListener('hashchange', route);

// Already opened from the Home Screen: the bars are gone, so the tip is not needed.
if (navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) {
  document.getElementById('bars-tip').hidden = true;
}

route();
