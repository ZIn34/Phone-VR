# MediaPipe hand tracking

These files are Google's MediaPipe hand tracker, copied here unchanged so the
page does not depend on any other website. They are only downloaded by the
phone when Level 2 or Level 3 is used.

- `vision_bundle.mjs` and `wasm/`: from the npm package `@mediapipe/tasks-vision`, version 1.1.0
- `hand_landmarker.task`: the hand model (float16, version 1), from
  `storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/`

Licence: Apache License 2.0, https://www.apache.org/licenses/LICENSE-2.0

To update: download the newer package and model and replace the files.
