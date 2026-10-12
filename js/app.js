'use strict';

// Adding ?demo to the address swaps the camera for a moving test picture, so
// the VR view can be tried on a computer that has no camera.
const DEMO = new URLSearchParams(location.search).has('demo');

const screens = {
  home: document.getElementById('home'),
  intro: document.getElementById('intro'),
  vr: document.getElementById('vr'),
};
const startButton = document.getElementById('start');
const exitButton = document.getElementById('exit');
const recentreButton = document.getElementById('recentre');
const playAgainButton = document.getElementById('play-again');
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

if (view) {
  view.setPainter((ctx, width, height, focal) => {
    const orientation = tracking.orientation();
    if (state.experience !== 'follow-the-circle') {
      PVR.paintMarkers(ctx, width, height, focal, orientation, tracking.frontYaw());
      return;
    }
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastFrame) / 1000); // a long gap (page in the background) does not count
    lastFrame = now;
    if (game.phase === 'waiting') plantStartCircle(orientation);
    game.update(dt, orientation, tracking.frontYaw());
    if (game.phase !== 'done') playAgainButton.hidden = true;
    PVR.paintGame(ctx, width, height, focal, orientation, tracking.frontYaw(), game, state.bestShown);
  });
}

const state = {
  stream: null,
  motion: 'unknown', // 'granted' | 'denied' | 'unavailable'
  message: null,     // which problem message is showing, if any
  sensor: null,      // true once the phone sends motion readings, false if none arrive
  wakeLock: null,
  experience: null,  // which experience is open: a key of PVR.experiences
  best: 0,           // best score in Follow the circle
  bestShown: 0,      // the best to show beside the current go
  planted: false,    // whether the circle that starts a go has been put in front of the player
};
state.best = state.bestShown = bestScore();

function show(name) {
  for (const key in screens) screens[key].hidden = key !== name;
  window.scrollTo(0, 0);
}

function route() {
  stopCamera();
  showMessage(null);
  const key = location.hash.slice(1);
  const experience = PVR.experiences[key];
  state.experience = experience ? key : null;
  state.best = state.bestShown = bestScore();
  const homeBest = document.getElementById('home-best');
  homeBest.hidden = !state.best;
  homeBest.textContent = 'Best score: ' + state.best;
  if (!experience) return show('home');

  document.getElementById('intro-title').textContent = experience.title;
  document.getElementById('intro-lead').textContent = experience.lead;
  document.getElementById('intro-note').textContent = experience.note;
  const steps = document.getElementById('intro-steps');
  steps.textContent = '';
  for (const step of experience.steps) {
    const item = document.createElement('li');
    item.textContent = step;
    steps.append(item);
  }
  const introBest = document.getElementById('intro-best');
  introBest.hidden = !(experience.scored && state.best);
  introBest.textContent = 'Your best score: ' + state.best;
  show('intro');
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
    return (await DeviceOrientationEvent.requestPermission()) === 'granted' ? 'granted' : 'denied';
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
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
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
    lastFrame = performance.now();
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
exitButton.addEventListener('click', () => { location.hash = ''; });
recentreButton.addEventListener('click', () => tracking.recentre());
playAgainButton.addEventListener('click', playAgain);
document.getElementById('open-settings').addEventListener('click', () => panel.toggle());

// One tap anywhere on the pictures opens or closes the settings.
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
  if (drag && drag.moved < 10) panel.toggle();
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
