# Phone test guide

Everything here needs a real iPhone, so it could not be tried on the computer
the page was built on. On that computer the layout, the settings, the problem
messages and the head-tracking maths were tested with a test picture and
pretend sensor readings. Nothing below has been tried on a phone yet.

You need: your iPhone, Safari, and the link to the page (it must start with
`https://`). The headset holder is needed from step 3.

## 1. Open and start

1. Open the link in Safari. You should see **Phone VR** with a **Testing**
   section and **See your room** inside it.
2. Tap **See your room**, then **Start**.
3. The phone asks about **motion**, then about the **camera**. Allow both.
4. Hold the phone upright: it should say **Turn your phone sideways**. Turn it
   sideways and the message should go.

Works if: you see your room twice, side by side, with a thin line down the
middle, from the **back** camera.

## 2. Get rid of Safari's bars

1. In Safari tap **Share**, then **Add to Home Screen**.
2. Open **Phone VR** from the new icon and start See your room again.

Works if: the pictures fill the whole screen with no address bar. (The phone
will ask about camera and motion again the first time; that is normal.)

## 3. See your room through the lenses

1. Hold the phone up to your eyes behind the lenses, or put it in the holder.
2. Look around the room.

Works if: the two pictures merge into one view. It will look **flat, not 3D**:
a phone has one back camera, so both eyes get the same picture. If the pictures
do not merge, do step 5 and come back.

## 4. Head tracking

1. Find the green horizon line and the word **FRONT**.
2. Turn your head left: FRONT should slide to the **right**. Turn right: it
   should slide **left**. Keep turning to find RIGHT, BACK and LEFT.
3. Look up: the horizon should move **down**. Look down: it should move **up**.
4. Move quickly, then slowly. The markers should follow smoothly, no jumping.
5. Drift test: put the small white cross on a door frame and note which green
   post is on it. Look around for one minute, then look back.
6. If FRONT has wandered, face forward and tap **Re-centre** (bottom middle).

Works if: every direction moves the right way, it is smooth, and after a minute
the same post is still on the door frame, or very close to it.

Please tell me: whether the posts stay glued to real objects while you turn, or
slide a little against them. That depends on a guess about the camera's width
of view and may need tuning.

## 5. Eye fit

1. Tap once anywhere on the pictures (or tap **Settings**, bottom middle).
2. **Eye distance**: press + and - until the two pictures merge comfortably.
3. **Picture size** and **Up / down**: centre the picture in each lens.
4. **Lens correction** and **Correction strength**: choose what makes straight
   things, like a door frame, look straight through the lenses.
5. Tap **Done**. Close the page completely, open it again and start.

Works if: each change shows straight away, and your settings are still there
after reopening. **Reset** puts everything back.

Please tell me: the numbers you ended up with. They would make better starting
values.

## 6. When something is refused

1. Close Safari completely, open the page, tap Start and refuse the **camera**.
   You should get **The camera was not allowed** with steps. Follow them and
   tap **Try again**.
2. Do the same but refuse **motion**. You should get **Motion was not allowed**
   with steps and a **Continue without head tracking** button.

Works if: you never see a blank screen, and the steps match what your phone
actually shows. If a step does not match your phone, tell me what you saw.

## Known limits

- Flat picture, not 3D (one camera).
- Safari's bars only go away when the page is opened from the Home Screen.
- You have to lift the phone a little to press the settings buttons.
- The iPhone's motion reading has no compass correction, so FRONT can wander
  slowly over time. Re-centre fixes it.
- Not tried on Android. It was checked in Chrome on a computer, which uses the
  same engine, but not on an Android phone.
