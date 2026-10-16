'use strict';

// Block world: drawing. The 3D world is drawn with WebGL into a picture that
// takes the place of the camera, so you cannot see your room. The words and
// buttons in the view are painted on top like every other activity.
window.PVR = window.PVR || {};

(function (PVR) {
  const math = PVR.math;
  const B = PVR.blocks;
  const SKY = [0.55, 0.76, 0.96];
  const EYES_APART = 0.064;   // for two eye pictures: how far apart the two views are, in blocks (a block is about a metre)
  const NEAR = 0.08;
  const FAR = 60;

  // Colour of each kind of block: [top, sides, bottom].
  const COLOURS = {
    [B.kinds.GRASS]: [[0.37, 0.68, 0.26], [0.47, 0.42, 0.24], [0.50, 0.36, 0.23]],
    [B.kinds.DIRT]: [[0.52, 0.38, 0.24], [0.50, 0.36, 0.23], [0.46, 0.33, 0.21]],
    [B.kinds.STONE]: [[0.58, 0.58, 0.60], [0.54, 0.54, 0.56], [0.48, 0.48, 0.50]],
    [B.kinds.WOOD]: [[0.62, 0.50, 0.30], [0.42, 0.30, 0.17], [0.62, 0.50, 0.30]],
    [B.kinds.LEAVES]: [[0.22, 0.52, 0.20], [0.19, 0.46, 0.18], [0.16, 0.40, 0.16]],
    [B.kinds.PLANKS]: [[0.80, 0.64, 0.40], [0.76, 0.60, 0.37], [0.70, 0.55, 0.34]],
    [B.kinds.BRICK]: [[0.72, 0.33, 0.27], [0.68, 0.30, 0.25], [0.60, 0.27, 0.22]],
    [B.kinds.GLASS]: [[0.70, 0.90, 0.98], [0.62, 0.84, 0.95], [0.55, 0.78, 0.90]],
    [B.kinds.LAMP]: [[1.00, 0.93, 0.55], [1.00, 0.88, 0.45], [0.95, 0.80, 0.40]],
  };

  // The six faces of a cube: which way it faces, which colour it uses, how
  // bright it is, and its four corners with their texture coordinates.
  const FACES = [
    { n: [0, 1, 0], colour: 0, light: 1.00, corners: [[0, 1, 0, 0, 0], [0, 1, 1, 0, 1], [1, 1, 1, 1, 1], [1, 1, 0, 1, 0]] },
    { n: [0, -1, 0], colour: 2, light: 0.55, corners: [[0, 0, 0, 0, 0], [1, 0, 0, 1, 0], [1, 0, 1, 1, 1], [0, 0, 1, 0, 1]] },
    { n: [1, 0, 0], colour: 1, light: 0.80, corners: [[1, 0, 0, 0, 0], [1, 1, 0, 0, 1], [1, 1, 1, 1, 1], [1, 0, 1, 1, 0]] },
    { n: [-1, 0, 0], colour: 1, light: 0.80, corners: [[0, 0, 0, 0, 0], [0, 0, 1, 1, 0], [0, 1, 1, 1, 1], [0, 1, 0, 0, 1]] },
    { n: [0, 0, 1], colour: 1, light: 0.68, corners: [[0, 0, 1, 0, 0], [1, 0, 1, 1, 0], [1, 1, 1, 1, 1], [0, 1, 1, 0, 1]] },
    { n: [0, 0, -1], colour: 1, light: 0.68, corners: [[0, 0, 0, 0, 0], [0, 1, 0, 0, 1], [1, 1, 0, 1, 1], [1, 0, 0, 1, 0]] },
  ];

  const VERTEX = `
    attribute vec3 aPlace;
    attribute vec2 aUv;
    attribute vec3 aColour;
    uniform mat4 uCamera;
    varying vec2 vUv;
    varying vec3 vColour;
    varying float vFar;
    void main() {
      gl_Position = uCamera * vec4(aPlace, 1.0);
      vUv = aUv;
      vColour = aColour;
      vFar = gl_Position.w;
    }`;

  const FRAGMENT = `
    precision highp float;
    uniform vec3 uSky;
    uniform float uSeeThrough;
    varying vec2 vUv;
    varying vec3 vColour;
    varying float vFar;
    void main() {
      // Chunky pixels, like a block game: each face is 8 by 8 squares of slightly different shades.
      vec2 square = floor(vUv * 8.0);
      float shade = fract(sin(dot(square + vColour.rg * 31.0, vec2(12.9898, 78.233))) * 43758.5453);
      vec3 colour = vColour * (0.88 + 0.16 * shade);
      // A darker line round the edge of every face, so single blocks can be told apart.
      float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
      if (edge < 0.035) colour *= 0.78;
      // Far away fades into the sky, which also hides the edge of the world.
      // Over the camera picture there is no sky, so far blocks fade away instead.
      float haze = smoothstep(13.0, 24.0, vFar);
      gl_FragColor = uSeeThrough > 0.5 ? vec4(colour, 1.0 - haze) : vec4(mix(colour, uSky, haze), 1.0);
    }`;

  const LINE_VERTEX = `
    attribute vec3 aPlace;
    uniform mat4 uCamera;
    void main() { gl_Position = uCamera * vec4(aPlace, 1.0); }`;
  const LINE_FRAGMENT = `
    precision mediump float;
    void main() { gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0); }`;

  function program(gl, vertex, fragment) {
    const make = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const p = gl.createProgram();
    gl.attachShader(p, make(gl.VERTEX_SHADER, vertex));
    gl.attachShader(p, make(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  // One piece of the world: every face of its blocks that has air beside it, as triangles.
  function buildMesh(world, cx, cz) {
    const data = [];
    const size = world.chunk;
    const empty = (x, y, z) => { const k = world.get(x, y, z); return !k || k === B.kinds.FLOOR; };
    for (let y = 0; y < world.height; y++) {
      for (let z = cz * size; z < (cz + 1) * size; z++) {
        for (let x = cx * size; x < (cx + 1) * size; x++) {
          const kind = world.get(x, y, z);
          if (!kind || kind === B.kinds.FLOOR) continue; // the floor of a flat world is not drawn
          const colours = COLOURS[kind];
          for (const face of FACES) {
            const nx = x + face.n[0], ny = y + face.n[1], nz = z + face.n[2];
            if (ny < 0 || !empty(nx, ny, nz)) continue; // hidden against another block
            const c = colours[face.colour];
            const push = (corner) => data.push(x + corner[0], y + corner[1], z + corner[2], corner[3], corner[4], c[0] * face.light, c[1] * face.light, c[2] * face.light);
            const q = face.corners;
            push(q[0]); push(q[1]); push(q[2]);
            push(q[0]); push(q[2]); push(q[3]);
          }
        }
      }
    }
    return new Float32Array(data);
  }

  // The 12 edges of the block being aimed at, a touch bigger than the block so they show.
  function outline(block) {
    const lo = -0.004, hi = 1.004;
    const c = (i) => [block[0] + ((i & 1) ? hi : lo), block[1] + ((i & 2) ? hi : lo), block[2] + ((i & 4) ? hi : lo)];
    const data = [];
    for (const [a, b] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) data.push(...c(a), ...c(b));
    return new Float32Array(data);
  }

  // gl is the view's own drawing context. Returns the scene the view draws in
  // place of the camera, or (see-through) on top of it.
  PVR.createBlockScene = function (gl) {
    const blocks = program(gl, VERTEX, FRAGMENT);
    const lines = program(gl, LINE_VERTEX, LINE_FRAGMENT);
    const at = {
      place: gl.getAttribLocation(blocks, 'aPlace'),
      uv: gl.getAttribLocation(blocks, 'aUv'),
      colour: gl.getAttribLocation(blocks, 'aColour'),
      linePlace: gl.getAttribLocation(lines, 'aPlace'),
    };
    const lineBuffer = gl.createBuffer();
    const boxBuffer = gl.createBuffer();
    const piecesOf = new WeakMap(); // for each world: "cx,cz" -> { buffer, vertices }
    const SEE = 26;             // pieces further away than this are lost in the haze, so they are not drawn

    const scene = {
      world: null,                // which world to draw
      seeThrough: false,          // true: only the blocks are drawn, for laying over the camera picture
      orientation: [0, 0, 0, 1],  // which way the player is looking
      target: null,               // the block being aimed at, to outline
      boxes: [],                  // loose boxes to draw this frame: { low: [x, y, z], high: [x, y, z], colour: [r, g, b] }

      // How zoomed the world is. A made-up world is shown wider than a true
      // window would be, or you would only ever see a sliver of it.
      focal(settings, screenHeightPx) {
        if (settings.lenses) return 1.2;
        const screenHeightCm = screenHeightPx / (160 / 2.54);
        return Math.max(1.2, Math.min(2.6, 0.45 * 2 * 10 / screenHeightCm)); // sized for a phone held about 10 cm away: a wide view
      },

      // eye: -1 left, +1 right, 0 for one picture. halfWidth: half the picture's width when its height is 2.
      render(eye, halfWidth, focal) {
        const world = scene.world;
        if (!piecesOf.has(world)) piecesOf.set(world, {});
        const pieces = piecesOf.get(world);
        const size = world.chunk;
        const eyes = world.eyes();
        // How far the nearest part of a piece is from the player.
        const farOff = (cx, cz) => Math.hypot(Math.max(cx * size - eyes[0], 0, eyes[0] - (cx + 1) * size), Math.max(cz * size - eyes[2], 0, eyes[2] - (cz + 1) * size));
        const draw = (key, cx, cz) => {
          const mesh = buildMesh(world, cx, cz);
          const piece = pieces[key] || (pieces[key] = { buffer: gl.createBuffer(), vertices: 0, cx, cz });
          gl.bindBuffer(gl.ARRAY_BUFFER, piece.buffer);
          gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.DYNAMIC_DRAW);
          piece.vertices = mesh.length / 8;
        };
        // Redraw the pieces that changed. Each is small, so building stays quick however big the world is.
        for (const key of world.dirty) if (pieces[key]) draw(key, pieces[key].cx, pieces[key].cz);
        world.dirty.clear();
        // Draw the pieces that have come into sight, nearest first. Only a few
        // a frame, so walking into new land does not stutter; all at once when
        // nothing is drawn yet.
        const ecx = Math.floor(eyes[0] / size), ecz = Math.floor(eyes[2] / size);
        const around = Math.ceil(SEE / size) + 1;
        const wanted = [];
        for (let cx = ecx - around; cx <= ecx + around; cx++) {
          for (let cz = ecz - around; cz <= ecz + around; cz++) {
            if (pieces[cx + ',' + cz] || !world.hasPiece(cx, cz)) continue;
            const far = farOff(cx, cz);
            if (far <= SEE) wanted.push({ cx, cz, far });
          }
        }
        wanted.sort((one, two) => one.far - two.far);
        const most = Object.keys(pieces).length ? 2 : wanted.length;
        for (const want of wanted.slice(0, most)) draw(want.cx + ',' + want.cz, want.cx, want.cz);
        // Let go of pieces left well behind.
        for (const key in pieces) {
          if (farOff(pieces[key].cx, pieces[key].cz) > SEE + size * 2) {
            gl.deleteBuffer(pieces[key].buffer);
            delete pieces[key];
          }
        }

        // Where the eye is, and the matrix that turns places in the world into places in the picture.
        const q = scene.orientation;
        const right = math.rotate(q, [1, 0, 0]);
        const up = math.rotate(q, [0, 1, 0]);
        const back = math.rotate(q, [0, 0, 1]);
        const from = [0, 1, 2].map((i) => eyes[i] + right[i] * eye * EYES_APART / 2);
        const dot = (a) => -(a[0] * from[0] + a[1] * from[1] + a[2] * from[2]);
        const px = focal / halfWidth;
        const pz = (FAR + NEAR) / (NEAR - FAR);
        const pw = 2 * FAR * NEAR / (NEAR - FAR);
        // Projection times view, written out column by column.
        const camera = new Float32Array([
          px * right[0], focal * up[0], pz * back[0], -back[0],
          px * right[1], focal * up[1], pz * back[1], -back[1],
          px * right[2], focal * up[2], pz * back[2], -back[2],
          px * dot(right), focal * dot(up), pz * dot(back) + pw, -dot(back),
        ]);

        if (scene.seeThrough) gl.clearColor(0, 0, 0, 0); else gl.clearColor(SKY[0], SKY[1], SKY[2], 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);

        gl.useProgram(blocks);
        gl.uniformMatrix4fv(gl.getUniformLocation(blocks, 'uCamera'), false, camera);
        gl.uniform3f(gl.getUniformLocation(blocks, 'uSky'), SKY[0], SKY[1], SKY[2]);
        gl.uniform1f(gl.getUniformLocation(blocks, 'uSeeThrough'), scene.seeThrough ? 1 : 0);
        gl.enableVertexAttribArray(at.place);
        gl.enableVertexAttribArray(at.uv);
        gl.enableVertexAttribArray(at.colour);
        for (const key in pieces) {
          const piece = pieces[key];
          if (!piece.vertices || farOff(piece.cx, piece.cz) > SEE) continue;
          gl.bindBuffer(gl.ARRAY_BUFFER, piece.buffer);
          gl.vertexAttribPointer(at.place, 3, gl.FLOAT, false, 32, 0);
          gl.vertexAttribPointer(at.uv, 2, gl.FLOAT, false, 32, 12);
          gl.vertexAttribPointer(at.colour, 3, gl.FLOAT, false, 32, 20);
          gl.drawArrays(gl.TRIANGLES, 0, piece.vertices);
        }
        if (scene.boxes.length) {
          const data = [];
          for (const box of scene.boxes) {
            const size = [0, 1, 2].map((i) => box.high[i] - box.low[i]);
            for (const face of FACES) {
              const push = (corner) => data.push(
                box.low[0] + corner[0] * size[0], box.low[1] + corner[1] * size[1], box.low[2] + corner[2] * size[2],
                corner[3], corner[4], box.colour[0] * face.light, box.colour[1] * face.light, box.colour[2] * face.light);
              const q = face.corners;
              push(q[0]); push(q[1]); push(q[2]);
              push(q[0]); push(q[2]); push(q[3]);
            }
          }
          gl.bindBuffer(gl.ARRAY_BUFFER, boxBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
          gl.vertexAttribPointer(at.place, 3, gl.FLOAT, false, 32, 0);
          gl.vertexAttribPointer(at.uv, 2, gl.FLOAT, false, 32, 12);
          gl.vertexAttribPointer(at.colour, 3, gl.FLOAT, false, 32, 20);
          gl.drawArrays(gl.TRIANGLES, 0, data.length / 8);
        }
        gl.disableVertexAttribArray(at.uv);
        gl.disableVertexAttribArray(at.colour);
        gl.disableVertexAttribArray(at.place);

        if (scene.target) {
          gl.useProgram(lines);
          gl.uniformMatrix4fv(gl.getUniformLocation(lines, 'uCamera'), false, camera);
          gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, outline(scene.target.block), gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(at.linePlace);
          gl.vertexAttribPointer(at.linePlace, 3, gl.FLOAT, false, 0, 0);
          gl.drawArrays(gl.LINES, 0, 24);
          gl.disableVertexAttribArray(at.linePlace);
        }
        gl.disable(gl.DEPTH_TEST);
      },
    };
    return scene;
  };

  function text(ctx, words, x, y, size, colour) {
    ctx.font = `bold ${size}px sans-serif`;
    ctx.lineWidth = Math.max(4, size / 6);
    ctx.strokeStyle = 'rgba(0, 0, 0, .75)';
    ctx.strokeText(words, x, y);
    ctx.fillStyle = colour || '#fff';
    ctx.fillText(words, x, y);
  }

  // The boxes that make up the animals and enemies, for the 3D drawing.
  PVR.creatureBoxes = function (life) {
    const boxes = [];
    const box = (x, y, z, w, h, d, colour) => boxes.push({ low: [x - w / 2, y, z - d / 2], high: [x + w / 2, y + h, z + d / 2], colour });
    for (const c of life.creatures) {
      const flash = c.hitAgo < 0.12;
      const tint = (colour) => (flash ? [1, 1, 1] : colour);
      // The head sits towards wherever it is heading.
      const fx = Math.sin(c.heading), fz = -Math.cos(c.heading);
      if (c.kind === 'creeper') {
        box(c.x, c.y, c.z, 0.6, 1.15, 0.4, tint([0.30, 0.62, 0.28]));
        box(c.x, c.y + 1.15, c.z, 0.55, 0.55, 0.55, tint([0.36, 0.72, 0.33]));
        box(c.x + fx * 0.25, c.y + 1.3, c.z + fz * 0.25, 0.3, 0.2, 0.3, tint([0.08, 0.12, 0.08]));
      } else {
        const coat = c.kind === 'pig' ? [0.95, 0.62, 0.66] : [0.93, 0.93, 0.90];
        const face = c.kind === 'pig' ? [0.90, 0.52, 0.58] : [0.45, 0.42, 0.40];
        box(c.x, c.y, c.z, 0.5, 0.3, 0.5, tint([coat[0] * 0.8, coat[1] * 0.8, coat[2] * 0.8]));       // legs
        box(c.x, c.y + 0.3, c.z, 0.9, 0.55, 0.9, tint(coat));                                       // body
        box(c.x + fx * 0.5, c.y + 0.45, c.z + fz * 0.5, 0.45, 0.45, 0.45, tint(face));              // head
      }
    }
    return boxes;
  };

  // Top right, while real steps can walk you: how many have been felt so far,
  // or, if the phone is sending no movement readings at all, that steps cannot be felt.
  PVR.paintStepInfo = function (ctx, width, height, info) {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const words = info.none ? 'No movement readings from the phone, so steps cannot be felt' : 'Steps felt: ' + info.steps + (info.way ? ', going ' + info.way : '');
    ctx.font = 'bold 17px sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0, 0, 0, .75)';
    ctx.strokeText(words, width - 16, 38);
    ctx.fillStyle = info.none ? '#ffb454' : '#fff';
    ctx.fillText(words, width - 16, 38);
    ctx.textAlign = 'center';
  };

  // The colour to show for a kind of block in the inventory bar.
  PVR.blockColour = function (kind) {
    const c = COLOURS[kind][kind === B.kinds.GRASS ? 0 : 1];
    return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
  };

  // What is painted over the block world: the cross to aim with, the block in
  // hand, and at Levels 2 and 3 what the hand signs do.
  // hud: { handsOn, sign: which hand sign is being seen (2, 3, 'jump', 'fly' or 0),
  //        fist: 0 to 1 as a fist gets ready to break, aimPoint: where the hand aims,
  //        life: health and creatures, flying }
  PVR.paintBlocks = function (ctx, width, height, world, hud) {
    const cx = width / 2;
    const cy = height / 2;
    ctx.lineCap = 'round';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // A red flash round the edge when you are hurt.
    const life = hud.life;
    if (life.hurtAgo < 0.4) {
      const edge = ctx.createRadialGradient(cx, cy, height * 0.35, cx, cy, width * 0.6);
      edge.addColorStop(0, 'rgba(255, 0, 0, 0)');
      edge.addColorStop(1, `rgba(255, 0, 0, ${0.6 * (1 - life.hurtAgo / 0.4)})`);
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, width, height);
    }
    // Health bar, top left.
    const share = life.health / 100;
    ctx.fillStyle = 'rgba(0, 0, 0, .6)';
    ctx.fillRect(90, 22, 268, 30);
    ctx.fillStyle = share > 0.5 ? '#3dffb0' : (share > 0.25 ? '#ffb454' : '#ff4d4d');
    ctx.fillRect(94, 26, 260 * share, 22);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(90, 22, 268, 30);
    text(ctx, 'HEALTH ' + Math.ceil(life.health), 224, 38, 17);
    ctx.textAlign = 'left';
    text(ctx, 'Animals ' + life.knocked.animals + '   Enemies ' + life.knocked.enemies + (hud.flying ? '   FLYING' : ''), 90, 72, 18, hud.flying ? '#3dffb0' : '#fff');
    ctx.textAlign = 'center';
    if (life.fellAgo < 3) text(ctx, 'Out of health. Starting again where you began.', cx, cy - 60, 26, '#ffb454');

    if (!hud.handsOn) {
      ctx.beginPath();
      ctx.moveTo(cx - 18, cy); ctx.lineTo(cx - 5, cy);
      ctx.moveTo(cx + 5, cy); ctx.lineTo(cx + 18, cy);
      ctx.moveTo(cx, cy - 18); ctx.lineTo(cx, cy - 5);
      ctx.moveTo(cx, cy + 5); ctx.lineTo(cx, cy + 18);
      ctx.strokeStyle = 'rgba(0, 0, 0, .7)';
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();
      return;
    }

    // A ring that fills round a fist as it gets ready to break the block.
    if (hud.fist > 0 && hud.aimPoint) {
      ctx.beginPath();
      ctx.arc(hud.aimPoint[0], hud.aimPoint[1], 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hud.fist);
      ctx.strokeStyle = '#ffb454';
      ctx.lineWidth = 7;
      ctx.stroke();
    }
    // What the hand signs do, and which one is being seen right now.
    const names = { 2: 'Two fingers: walking', 3: 'Three fingers: next block', jump: 'Little finger: jump', fly: 'Index and little finger: ' + (hud.flying ? 'flying' : 'landing') };
    const seenSign = hud.fist > 0 ? 'Fist: breaking or hitting' : (names[hud.sign] || '');
    text(ctx, seenSign || 'Pinch: build   Fist: break or hit   2 fingers: walk   3: next block', cx, height * 0.865, 17, seenSign ? '#3dffb0' : '#fff');
    if (!seenSign) text(ctx, 'Little finger: jump   Index + little finger: fly', cx, height * 0.915, 17);
  };
})(window.PVR);
