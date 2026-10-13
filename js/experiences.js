'use strict';

// The things you can open from the home screen, and what each one says before
// you start. The key is the part of the address after the #.
//
// steps can be one list, or a list for each level (how you play). levels, if
// given, names the levels it works at; it is hidden at the others. group is
// the heading it sits under, on the home screen and in the floating menu.
window.PVR = window.PVR || {};

PVR.experiences = {
  'see-your-room': {
    title: 'See your room',
    group: 'Testing',
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
    group: 'Games',
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
  'pop-the-targets': {
    title: 'Pop the targets',
    group: 'Testing',
    lead: 'A quick test of how you play: pop the blue targets floating around you.',
    steps: {
      1: [
        'Tap Start, allow motion and camera, and turn the phone sideways.',
        'Hold the phone in both hands, up to your eyes.',
        'Turn to put the cross on a target. It turns green.',
        'Tap a POP button at either side of the screen with your thumb.',
      ],
      2: [
        'Tap Start, allow motion and camera, and turn the phone sideways.',
        'Hold the phone to your eyes with one hand.',
        'Hold your other hand up in front of the phone, in good light. A white ring marks your fingertip.',
        'Touch a target with your fingertip to pop it.',
      ],
      3: [
        'Tap Start, allow motion and camera, then put the phone in its holder.',
        'Hold both hands up in front of you, in good light. A white ring marks each index fingertip.',
        'Touch a target with either fingertip to pop it.',
      ],
    },
    note: 'Good to know: at Levels 2 and 3 the camera has to see your hand, so keep it in front of the phone and in good light. The first time, hand tracking takes a few seconds to get ready. To change level, go back to the home screen.',
  },
  // Not an activity of its own: your room, with the floating menu already open.
  'menu': {
    title: 'Menu in VR',
    lead: 'Everything you can do, on tiles floating in front of you. Choose without taking the phone from your face.',
    steps: [
      'Tap Start, allow motion and camera, and turn the phone sideways.',
      'Hold the phone to your eyes. The menu hangs in the room in front of you: turn your head to look across it.',
      'To choose, look steadily at a tile for a second. You can also tap it, or at Levels 2 and 3 pinch on it.',
      'To bring the menu back later: look down at the MENU disc, tap MENU at the side of the screen, or at Levels 2 and 3 show the camera your open palm.',
    ],
    note: 'Good to know: looking at a tile always works. Tapping needs a finger on the screen, and pinching or showing your palm needs the camera to see your hand in good light.',
    notInMenu: true,
  },
};
