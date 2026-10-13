'use strict';

// Draws the VR view on one WebGL canvas: the same scene twice, once for each
// eye. The scene is the camera picture with an optional overlay painted on top.
//
// Scene units: the picture is 2 units tall (-1 at the bottom, +1 at the top).
window.PVR = window.PVR || {};

(function (PVR) {
  const OVERLAY_HEIGHT = 640;

  // Roughly how wide a phone's main back camera sees along the long side of a
  // video picture. Used so things drawn over the camera line up with the room.
  const CAMERA_FOV = 65 * Math.PI / 180;

  const VERTEX = `
    attribute vec2 aPos;
    void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const FRAGMENT = `
    precision highp float;
    uniform sampler2D uVideo;
    uniform sampler2D uOverlay;
    uniform vec2 uCentre;       // centre of this eye's picture, in canvas pixels
    uniform float uUnit;        // canvas pixels per scene unit
    uniform float uHalfWidth;   // half the picture's width, in scene units
    uniform vec2 uVideoScale;   // scene units -> video texture coordinates
    uniform vec2 uK;            // lens correction strength
    void main() {
      vec2 q = (gl_FragCoord.xy - uCentre) / uUnit;
      float r2 = dot(q, q);
      // Barrel distortion: the lens stretches the edges, so squeeze them first.
      vec2 s = q * (1.0 + uK.x * r2 + uK.y * r2 * r2);
      if (abs(s.x) > uHalfWidth || abs(s.y) > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }
      vec3 cam = texture2D(uVideo, 0.5 + s * uVideoScale).rgb;
      vec4 over = texture2D(uOverlay, 0.5 + s * vec2(0.5 / uHalfWidth, 0.5));
      gl_FragColor = vec4(over.rgb + cam * (1.0 - over.a), 1.0);
    }`;

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }

  function makeTexture(gl) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    return texture;
  }

  // Where each eye's picture goes on a canvas of W x H pixels.
  PVR.eyeLayout = function (W, H, settings) {
    const centreY = H / 2 + settings.offsetY * H;
    const shift = settings.separation * W / 2;
    return {
      halfWidth: (W / 2) / H,
      unit: (H / 2) * settings.size,
      left: { x: W / 2 - shift, y: centreY },
      right: { x: W / 2 + shift, y: centreY },
    };
  };

  // Returns null when this browser cannot draw with WebGL.
  PVR.createView = function (canvas, video, settings) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
    if (!gl) return null;

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uniform = {};
    for (const name of ['uVideo', 'uOverlay', 'uCentre', 'uUnit', 'uHalfWidth', 'uVideoScale', 'uK']) {
      uniform[name] = gl.getUniformLocation(program, name);
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

    const videoTexture = makeTexture(gl);
    gl.activeTexture(gl.TEXTURE1);
    const overlayTexture = makeTexture(gl);
    gl.uniform1i(uniform.uVideo, 0);
    gl.uniform1i(uniform.uOverlay, 1);

    const overlay = document.createElement('canvas');
    const overlayContext = overlay.getContext('2d');
    let painter = null;
    let raf = 0;

    function frame() {
      raf = requestAnimationFrame(frame);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.round(canvas.clientWidth * ratio);
      const H = Math.round(canvas.clientHeight * ratio);
      if (!W || !H) return;
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }

      const layout = PVR.eyeLayout(W, H, settings);
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      let cover = 1;
      let videoScale = [0, 0];
      if (vw && vh && video.readyState >= 2) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, videoTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        // Fill the picture with the camera without stretching it; crop what spills over.
        cover = Math.max(layout.halfWidth / (vw / 2), 1 / (vh / 2));
        videoScale = [1 / (cover * vw), 1 / (cover * vh)];
      }

      if (painter) {
        const width = Math.round(layout.halfWidth * OVERLAY_HEIGHT);
        if (overlay.width !== width || overlay.height !== OVERLAY_HEIGHT) {
          overlay.width = width;
          overlay.height = OVERLAY_HEIGHT;
        }
        overlayContext.clearRect(0, 0, width, OVERLAY_HEIGHT);
        // Scene units per unit of tan(angle), so the painter can place things by direction.
        const focal = cover * (Math.max(vw, vh) || 2) / 2 / Math.tan(CAMERA_FOV / 2);
        // Where a point of the camera picture (as shares of its width and height) lands on the overlay.
        const unit = OVERLAY_HEIGHT / 2;
        const place = (u, v) => [width / 2 + (u - 0.5) * vw * cover * unit, unit - (0.5 - v) * vh * cover * unit];
        painter(overlayContext, width, OVERLAY_HEIGHT, focal, place);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, overlayTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, overlay);
      }

      const k = settings.distortion ? settings.strength : 0;
      gl.uniform1f(uniform.uUnit, layout.unit);
      gl.uniform1f(uniform.uHalfWidth, layout.halfWidth);
      gl.uniform2f(uniform.uVideoScale, videoScale[0], videoScale[1]);
      gl.uniform2f(uniform.uK, k * 0.5, k * 0.2);

      gl.enable(gl.SCISSOR_TEST);
      const half = Math.floor(W / 2);
      for (const [eye, x, width] of [[layout.left, 0, half], [layout.right, half, W - half]]) {
        gl.viewport(x, 0, width, H);
        gl.scissor(x, 0, width, H);
        gl.uniform2f(uniform.uCentre, eye.x, eye.y);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }

    return {
      start() { if (!raf) raf = requestAnimationFrame(frame); },
      stop() { cancelAnimationFrame(raf); raf = 0; },
      setPainter(fn) { painter = fn; },
    };
  };
})(window.PVR);
