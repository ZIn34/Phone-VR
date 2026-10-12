'use strict';

// The things you can open from the home screen, and what each one says before
// you start. The key is the part of the address after the #.
window.PVR = window.PVR || {};

PVR.experiences = {
  'see-your-room': {
    title: 'See your room',
    lead: 'Your phone’s back camera, shown to both eyes.',
    steps: [
      'Tap Start.',
      'Allow motion and camera when asked.',
      'Turn the phone sideways, then hold it up to your eyes or put it in a holder.',
    ],
    note: 'Good to know: a phone has one back camera, so both eyes get the same picture. You will see your room, but it will look flat, not truly 3D.',
  },
  'follow-the-circle': {
    title: 'Follow the circle',
    lead: 'Turn your head to keep the crosshair on a moving circle for one minute.',
    steps: [
      'Tap Start, allow motion and camera, and turn the phone sideways.',
      'Look straight ahead. A circle waits just to your right: look at it until the ring around it fills. That starts the clock.',
      'Follow the circle with your head. You score while the crosshair is on it.',
      'It gets faster, and sometimes it stops dead to catch you out.',
    ],
    note: 'Good to know: you play over the camera picture of your room. Sit or stand where you can turn your head freely. The circle stays in front of you, so you never have to turn right round.',
    scored: true,
  },
};
