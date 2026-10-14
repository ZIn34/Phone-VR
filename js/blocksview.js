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
      gl_FragColor = vec4(mix(colour, uSky, smoothstep(13.0, 24.0, vFar)), 1.0);
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

  // gl is the view's own drawing context. Returns the scene the view draws in place of the camera.
  PVR.createBlockScene = function (gl, world) {
    const blocks = program(gl, VERTEX, FRAGMENT);
    const lines = program(gl, LINE_VERTEX, LINE_FRAGMENT);
    const at = {
      place: gl.getAttribLocation(blocks, 'aPlace'),
      uv: gl.getAttribLocation(blocks, 'aUv'),
      colour: gl.getAttribLocation(blocks, 'aColour'),
      linePlace: gl.getAttribLocation(lines, 'aPlace'),
    };
    const lineBuffer = gl.createBuffer();
    const pieces = {};          // "cx,cz" -> { buffer, vertices }
    const SEE = 26;             // pieces further away than this are lost in the haze, so they are not drawn

    const scene = {
      orientation: [0, 0, 0, 1],  // which way the player is looking
      target: null,               // the block being aimed at, to outline

      // How zoomed the world is. A made-up world is shown wider than a true
      // window would be, or you would only ever see a sliver of it.
      focal(settings, screenHeightPx) {
        if (settings.lenses) return 1.2;
        const screenHeightCm = screenHeightPx / (160 / 2.54);
        return Math.max(1.2, Math.min(2.6, 0.45 * 2 * settings.distance / screenHeightCm));
      },

      // eye: -1 left, +1 right, 0 for one picture. halfWidth: half the picture's width when its height is 2.
      render(eye, halfWidth, focal) {
        // Redraw the pieces that changed. Each is small, so building stays quick however big the world is.
        for (const key of world.dirty) {
          const [cx, cz] = key.split(',').map(Number);
          const mesh = buildMesh(world, cx, cz);
          const piece = pieces[key] || (pieces[key] = { buffer: gl.createBuffer(), vertices: 0, cx, cz });
          gl.bindBuffer(gl.ARRAY_BUFFER, piece.buffer);
          gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.DYNAMIC_DRAW);
          piece.vertices = mesh.length / 8;
        }
        world.dirty.clear();

        // Where the eye is, and the matrix that turns places in the world into places in the picture.
        const q = scene.orientation;
        const right = math.rotate(q, [1, 0, 0]);
        const up = math.rotate(q, [0, 1, 0]);
        const back = math.rotate(q, [0, 0, 1]);
        const eyes = world.eyes();
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

        gl.clearColor(SKY[0], SKY[1], SKY[2], 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);

        gl.useProgram(blocks);
        gl.uniformMatrix4fv(gl.getUniformLocation(blocks, 'uCamera'), false, camera);
        gl.uniform3f(gl.getUniformLocation(blocks, 'uSky'), SKY[0], SKY[1], SKY[2]);
        gl.enableVertexAttribArray(at.place);
        gl.enableVertexAttribArray(at.uv);
        gl.enableVertexAttribArray(at.colour);
        const size = world.chunk;
        for (const key in pieces) {
          const piece = pieces[key];
          if (!piece.vertices) continue;
          // How far the nearest part of this piece is from the player.
          const dx = Math.max(piece.cx * size - eyes[0], 0, eyes[0] - (piece.cx + 1) * size);
          const dz = Math.max(piece.cz * size - eyes[2], 0, eyes[2] - (piece.cz + 1) * size);
          if (Math.hypot(dx, dz) > SEE) continue;
          gl.bindBuffer(gl.ARRAY_BUFFER, piece.buffer);
          gl.vertexAttribPointer(at.place, 3, gl.FLOAT, false, 32, 0);
          gl.vertexAttribPointer(at.uv, 2, gl.FLOAT, false, 32, 12);
          gl.vertexAttribPointer(at.colour, 3, gl.FLOAT, false, 32, 20);
          gl.drawArrays(gl.TRIANGLES, 0, piece.vertices);
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

  // The colour to show for a kind of block in the inventory bar.
  PVR.blockColour = function (kind) {
    const c = COLOURS[kind][kind === B.kinds.GRASS ? 0 : 1];
    return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
  };

  // The one button that hangs in the view at Levels 2 and 3, worked by resting a fingertip on it.
  PVR.blockHandButtons = function (width, height) {
    return [{ id: 'mode', label: '', x: width * 0.86 - 50, y: height / 2 - 34, w: 100, h: 68 }];
  };

  // What is painted over the block world: the cross to aim with, the block in
  // hand, and at Levels 2 and 3 the hand-worked buttons.
  // hud: { handsOn, building, over: id of the hand button a fingertip is on, held: 0 to 1, sign: 2 or 3 fingers up, or 0 }
  PVR.paintBlocks = function (ctx, width, height, world, hud) {
    const cx = width / 2;
    const cy = height / 2;
    ctx.lineCap = 'round';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

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

    for (const b of PVR.blockHandButtons(width, height)) {
      const on = b.id === hud.over;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 14);
      ctx.fillStyle = on ? 'rgba(79, 140, 255, .55)' : 'rgba(11, 13, 18, .6)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, .6)';
      ctx.lineWidth = 3;
      ctx.stroke();
      if (on && hud.held > 0) {
        ctx.save();
        ctx.clip();
        ctx.fillStyle = 'rgba(61, 255, 176, .6)';
        ctx.fillRect(b.x, b.y, b.w * Math.min(1, hud.held), b.h);
        ctx.restore();
      }
      const label = hud.building ? 'BUILD' : 'BREAK';
      text(ctx, label, b.x + b.w / 2, b.y + b.h / 2, 20);
    }
    // What the hand signs do, and which one is being seen right now.
    const sign = hud.sign === 2 ? 'Two fingers: walking' : (hud.sign === 3 ? 'Three fingers: next block' : (hud.building ? 'Pinch: build' : 'Pinch: break') + '   2 fingers: walk   3 fingers: next block');
    text(ctx, sign, cx, height * 0.08, 18, hud.sign ? '#3dffb0' : '#fff');
  };
})(window.PVR);
