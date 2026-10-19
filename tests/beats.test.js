'use strict';

// Run with: node --test tests/beats.test.js
const test = require('node:test');
const assert = require('node:assert');
const { createBeats, rules } = require('../js/beats.js');

const STEP = 1 / 60;
const SECONDS = 60 / rules.bpm;
const none = () => ({ taps: { left: false, right: false }, hands: [], handsOn: false, held: {} });
const start = () => { const game = createBeats(4); game.restart(); return game; };

// Plays the whole song, tapping the right button when each block is `late`
// seconds from its beat (or never, for blocks `skip` says no to).
function play(game, late, skip = () => false, wrong = false) {
  const due = game.notes.slice();
  for (let t = 0; t < 120 && !game.over; t += STEP) {
    const input = none();
    for (const note of due) {
      if (note.tapped || skip(note)) continue;
      if ((game.beat - note.beat) * SECONDS >= late) {
        note.tapped = true;
        const red = wrong ? !note.red : note.red;
        input.taps[red ? 'left' : 'right'] = true;
      }
    }
    game.update(STEP, input);
  }
}

test('the song has blocks in all four frames, red on the left and blue on the right', () => {
  const game = start();
  assert.ok(game.notes.length > 80, `${game.notes.length} blocks`);
  for (let slot = 0; slot < 4; slot++) assert.ok(game.notes.some((n) => n.slot === slot));
  assert.ok(game.notes.every((n) => n.red === n.slot < 2));
});

test('blocks fly in and reach their frame exactly on their beat', () => {
  const game = start();
  const note = game.notes[0];
  game.beat = note.beat - 2;
  assert.ok(game.place(note)[2] < rules.hitAt - 5, 'far away two beats before');
  game.beat = note.beat;
  assert.strictEqual(game.place(note)[2], rules.hitAt);
});

test('tapping the right colour on the beat is Perfect every time, and the song ends with grade S', () => {
  const game = start();
  play(game, 0.01);
  assert.ok(game.over);
  assert.strictEqual(game.hits, game.notes.length);
  assert.strictEqual(game.perfects, game.notes.length);
  assert.match(game.overTitle, /Grade S/);
  assert.ok(game.best === game.notes.length, 'one long combo');
});

test('a little late is Good, worth less', () => {
  const perfect = start(), good = start();
  play(perfect, 0.02);
  play(good, 0.12);
  assert.strictEqual(good.hits, good.notes.length);
  assert.strictEqual(good.perfects, 0);
  assert.ok(good.score < perfect.score);
});

test('the wrong colour, or too late, does not count', () => {
  const wrong = start();
  play(wrong, 0.01, () => false, true);
  assert.strictEqual(wrong.hits, 0);
  const late = start();
  play(late, 0.3);
  assert.strictEqual(late.hits, 0);
});

test('missing blocks drains the energy, and with none left the song stops', () => {
  const game = start();
  play(game, 0.01, () => true);
  assert.ok(game.over);
  assert.strictEqual(game.overTitle, 'Out of energy');
  assert.ok(game.beat < rules.beats / 2, 'long before the end');
});

test('a combo raises the points for each block, and a miss ends it', () => {
  const game = start();
  let i = 0;
  play(game, 0.01, () => ++i === 20);
  assert.ok(game.best >= 19);
  assert.ok(game.multiplier() >= 1);
  assert.ok(game.score > game.hits * 100, 'combos paid more than 100 a block');
});

test('touching a block with a fingertip as it arrives hits it', () => {
  const game = start();
  const note = game.notes[0];
  for (let t = 0; t < 30 && game.beat < note.beat; t += STEP) game.update(STEP, none());
  const p = game.place(note);
  const to = [p[0] - rules.eye[0], p[1] - rules.eye[1], p[2] - rules.eye[2]];
  const l = Math.hypot(...to);
  game.update(STEP, { taps: {}, hands: [{ dir: to.map((v) => v / l) }], handsOn: true, held: {} });
  assert.ok(note.hit);
  assert.strictEqual(game.hits, 1);
});
