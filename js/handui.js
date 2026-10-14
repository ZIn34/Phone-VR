'use strict';

// What Levels 2 and 3 add to the view: a marker on each tracked hand, and a
// plain message when no hand can be seen.
window.PVR = window.PVR || {};

(function (PVR) {
  const STATUS = {
    loading: 'Getting hand tracking ready…',
    failed: 'Hand tracking could not start. Use the buttons at the sides instead.',
    none: 'No hand in view. Hold your hand up in front of the phone.',
  };

  function text(ctx, words, x, y, size, colour) {
    ctx.font = `bold ${size}px sans-serif`;
    ctx.lineWidth = Math.max(4, size / 6);
    ctx.strokeStyle = 'rgba(0, 0, 0, .75)';
    ctx.strokeText(words, x, y);
    ctx.fillStyle = colour || '#fff';
    ctx.fillText(words, x, y);
  }

  // hands: [{ tip: [x, y], palm: [x, y] }] in canvas pixels. status: the tracker's status.
  PVR.paintHands = function (ctx, width, height, hands, status) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const hand of hands) {
      ctx.beginPath();
      ctx.moveTo(hand.palm[0], hand.palm[1]);
      ctx.lineTo(hand.tip[0], hand.tip[1]);
      ctx.strokeStyle = 'rgba(255, 255, 255, .5)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hand.tip[0], hand.tip[1], 16, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 0, 0, .7)';
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hand.tip[0], hand.tip[1], 5, 0, Math.PI * 2);
      ctx.fillStyle = '#3dffb0';
      ctx.fill();
    }
    const words = status === 'ready' ? (hands.length ? '' : STATUS.none) : STATUS[status];
    if (words) text(ctx, words, width / 2, height * 0.66, 19, '#ffb454');
  };
})(window.PVR);
