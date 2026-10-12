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
  // No readings: say so, and leave the rest of the view working.
  showNotice(found ? null : (state.motion === 'denied' ? 'motionOff' : 'noSensor'));
});
if (view) {
  view.setPainter((ctx, width, height, focal) => {
    PVR.paintMarkers(ctx, width, height, focal, tracking.orientation(), tracking.frontYaw());
  });
}

const state = {
  stream: null,
  motion: 'unknown', // 'granted' | 'denied' | 'unavailable'
  message: null,     // which problem message is showing, if any
  sensor: null,      // true once the phone sends motion readings, false if none arrive
  wakeLock: null,
};

function show(name) {
  for (const key in screens) screens[key].hidden = key !== name;
  window.scrollTo(0, 0);
}

function route() {
  stopCamera();
  showMessage(null);
  const intro = location.hash === '#see-your-room';
  show(intro ? 'intro' : 'home');
  if (intro && !canUseSensors()) showMessage('insecure');
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
