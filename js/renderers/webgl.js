import {
  WAVE_LIMIT,
  PROFILE_WIDTH,
  PROFILE_HEIGHT,
  packProfile,
  waveVertexShader,
} from "./wave-shader.js";

const cpuVertexShader =
  "attribute vec2 p;uniform vec2 resolution;void main(){vec2 v=p/resolution;gl_Position=vec4(v.x*2.0-1.0,1.0-v.y*2.0,0.0,1.0);}";
const fragmentShader =
  "precision mediump float;uniform vec4 color;void main(){gl_FragColor=color;}";

/** waveEvaluation: "cpu" retains the original path for comparison and older GPUs. */
export function createWebGLRenderer(gc, { waveEvaluation = "auto" } = {}) {
  let gl = null,
    program = null,
    buffer = null,
    texture = null,
    attrib = -1,
    uniform = null;
  let glFailed = false,
    glLost = false,
    gpuWaves = false,
    sampleCount = -1;
  let vertices = new Float32Array(0),
    slots = new Array(WAVE_LIMIT).fill(null);
  const motion = new Float32Array(WAVE_LIMIT * 4),
    shape = new Float32Array(WAVE_LIMIT * 4);
  const pixels = new Uint8Array(PROFILE_WIDTH * 4);

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw Error(message);
    }
    return shader;
  }
  function link(vertexSource) {
    const shaders = [];
    let linked = null;
    try {
      shaders.push(compile(gl.VERTEX_SHADER, vertexSource));
      shaders.push(compile(gl.FRAGMENT_SHADER, fragmentShader));
      linked = gl.createProgram();
      for (const shader of shaders) gl.attachShader(linked, shader);
      gl.linkProgram(linked);
      if (!gl.getProgramParameter(linked, gl.LINK_STATUS))
        throw Error(gl.getProgramInfoLog(linked));
      return linked;
    } catch (error) {
      if (linked) gl.deleteProgram(linked);
      throw error;
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
    }
  }
  function initGL() {
    if (glFailed || glLost) return false;
    try {
      if (!gl)
        gl = gc.getContext("webgl", {
          alpha: false,
          antialias: true,
          powerPreference: "low-power",
          preserveDrawingBuffer: false,
        });
      if (!gl) return false;
      if (!program) {
        // Vertex texture fetch is optional in WebGL 1; no float-texture extension is needed.
        gpuWaves =
          waveEvaluation !== "cpu" &&
          gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) > 0 &&
          gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS) >= 100 &&
          gl.getParameter(gl.MAX_TEXTURE_SIZE) >= PROFILE_WIDTH;
        if (gpuWaves) {
          try {
            program = link(waveVertexShader);
          } catch (error) {
            console.warn(
              "GPU waves unavailable; using CPU-backed WebGL",
              error,
            );
            gpuWaves = false;
          }
        }
        if (!gpuWaves) program = link(cpuVertexShader);
        attrib = gl.getAttribLocation(program, "p");
        uniform = {};
        for (const name of [
          "resolution",
          "color",
          "waveCount",
          "waveMotion[0]",
          "waveShape[0]",
          "profiles",
        ])
          uniform[name] = gl.getUniformLocation(program, name);
        buffer = gl.createBuffer();
        sampleCount = -1;
        if (gpuWaves) {
          texture = gl.createTexture();
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            PROFILE_WIDTH,
            PROFILE_HEIGHT,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null,
          );
          slots.fill(null);
        }
      }
      return true;
    } catch (error) {
      console.warn("WebGL unavailable; using Canvas2D", error);
      glFailed = true;
      return false;
    }
  }
  function uploadWaves(state) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // Retain row ownership across pruning/shifts; only newly launched profiles upload.
    for (let row = 0; row < WAVE_LIMIT; row++)
      if (slots[row] && !state.waves.includes(slots[row])) slots[row] = null;
    for (let i = 0; i < state.waves.length; i++) {
      const wave = state.waves[i];
      let row = slots.indexOf(wave);
      if (row < 0) {
        row = slots.indexOf(null);
        slots[row] = wave;
        packProfile(wave.table, pixels);
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          row,
          PROFILE_WIDTH,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixels,
        );
      }
      const offset = i * 4;
      // Upload age rather than absolute time: avoids subtracting large float timestamps on GPU.
      motion[offset] = wave.u;
      motion[offset + 1] = wave.sign * wave.amp;
      motion[offset + 2] = state.time - wave.born;
      motion[offset + 3] = wave.speed;
      shape[offset] = wave.growth;
      shape[offset + 1] = wave.life;
      shape[offset + 2] = row;
    }
    gl.uniform1i(uniform.waveCount, state.waves.length);
    gl.uniform4fv(uniform["waveMotion[0]"], motion);
    gl.uniform4fv(uniform["waveShape[0]"], shape);
    gl.uniform1i(uniform.profiles, 0);
  }
  function draw(state) {
    if (!gl || glLost || !program) return;
    gl.useProgram(program);
    gl.uniform2f(uniform.resolution, state.w, state.h);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(attrib);
    gl.vertexAttribPointer(attrib, 2, gl.FLOAT, false, 0, 0);
    gl.clearColor(27 / 255, 18 / 255, 25 / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (gpuWaves) {
      if (sampleCount !== state.N) {
        vertices = new Float32Array((state.N + 1) * 4);
        for (let i = 0; i <= state.N; i++) {
          vertices[i * 4] = vertices[i * 4 + 2] = state.us[i];
          vertices[i * 4 + 1] = 0;
          vertices[i * 4 + 3] = 1;
        }
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        sampleCount = state.N;
      }
      uploadWaves(state);
    } else {
      if (vertices.length !== (state.N + 1) * 4)
        vertices = new Float32Array((state.N + 1) * 4);
      let j = 0;
      for (let i = 0; i <= state.N; i++) {
        const u = state.us[i],
          d = state.ds[i],
          x = u * state.w + state.nx * d,
          y = (1 - u) * state.h + state.ny * d;
        vertices[j++] = u * state.w - state.nx * state.L;
        vertices[j++] = (1 - u) * state.h - state.ny * state.L;
        vertices[j++] = x;
        vertices[j++] = y;
      }
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    }
    gl.uniform4f(uniform.color, 237 / 255, 192 / 255, 228 / 255, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, (state.N + 1) * 2);
  }
  return {
    init: initGL,
    draw,
    get requiresCPUSamples() {
      return !gpuWaves;
    },
    get waveEvaluation() {
      return gpuWaves ? "vertex-shader" : "cpu";
    },
    get maxSize() {
      return gl && !glLost ? gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) : 8192;
    },
    resize() {
      if (gl && !glLost) gl.viewport(0, 0, gc.width, gc.height);
    },
    lost() {
      glLost = true;
      program = null;
      buffer = null;
      texture = null;
      sampleCount = -1;
      slots.fill(null);
    },
    restored() {
      glLost = false;
      glFailed = false;
      program = null;
      buffer = null;
      texture = null;
      sampleCount = -1;
      slots.fill(null);
    },
  };
}
