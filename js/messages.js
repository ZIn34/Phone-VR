'use strict';

// What the page says when something it needs is refused or missing.
window.PVR = window.PVR || {};

PVR.messages = {
  insecure: {
    title: 'This page needs a secure address',
    text: 'Phones only let a web page use the camera and motion sensors when its address starts with https://. This address does not.',
    steps: [
      'Look at the address at the top. It should start with https://',
      'Tap Try again to open the secure version of this page.',
    ],
  },
  cameraDenied: {
    title: 'The camera was not allowed',
    text: 'See your room needs the back camera to show you your room. To allow it on an iPhone:',
    steps: [
      'Tap the button at the left end of Safari’s address bar, then Website Settings.',
      'Set Camera to Allow.',
      'Tap Try again below. If the phone asks, choose Allow.',
      'If that did not work: open the Settings app, find Safari, tap Camera and choose Ask or Allow.',
    ],
    more: 'On Android: tap the icon at the left end of the address bar, then Permissions, and allow Camera.',
  },
  noCamera: {
    title: 'No camera was found',
    text: 'This device does not seem to have a camera this page can use. See your room needs a phone with a back camera.',
    steps: [
      'Open this page on your phone.',
      'On an iPhone, open it in Safari, not inside another app such as a chat or mail app.',
    ],
  },
  cameraBusy: {
    title: 'The camera is busy',
    text: 'The camera is there, but it could not be started. Another app may be using it.',
    steps: [
      'Close other apps that use the camera, such as Camera or a video call.',
      'Tap Try again.',
    ],
  },
  motionDenied: {
    title: 'Motion was not allowed',
    text: 'Without motion the picture cannot follow your head. The iPhone remembers this answer until Safari is closed, so to allow it:',
    steps: [
      'Close Safari completely: swipe up from the bottom of the screen, pause, then swipe Safari away.',
      'Open this page again and tap Start.',
      'When it asks about motion and orientation, choose Allow.',
      'If it still does not ask: open the Settings app, find Safari, then Advanced, then Website Data, remove this site and try again.',
    ],
    more: 'You can also carry on without head tracking. You will still see your room.',
    canContinue: true,
  },
};

// Short notices shown on top of the VR view, which keeps working underneath.
PVR.notices = {
  noSensor: 'Head tracking is not available: this device is not sending any motion readings. Everything else still works. Drag the picture to look around instead.',
  motionOff: 'Head tracking is off because motion was not allowed. You can still see your room. Drag the picture to move the markers.',
};

// Which message fits a camera error from the browser.
PVR.cameraMessage = function (error) {
  const name = error && error.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'cameraDenied';
  if (name === 'NotReadableError' || name === 'AbortError') return 'cameraBusy';
  return 'noCamera';
};
