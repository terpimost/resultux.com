import { createSimulation } from "./simulation.js";
import { attachPointerInteractions } from "./pointer.js";
import { createCanvasRenderer } from "./renderers/canvas.js";
import { createWebGLRenderer } from "./renderers/webgl.js";
import { createPerformanceMonitor } from "./performance.js";
const $ = (id) => document.getElementById(id),
  host = $("host"),
  stage = $("stage"),
  gc = $("canvasgl"),
  cc = $("canvas2d"),
  stats = $("stats");
const P = {
  amplitude: 10,
  impact: 36,
  frequency: 0.3,
  speed: 120,
  growth: 0.8,
  threshold: 450,
  dragStrength: 18,
  spacing: 32,
  releaseStrength: 14,
};
const settings = [
  ["amplitude", "Movement amplitude", "px", 0, 60, 1],
  ["impact", "Click / tap amplitude", "px", 0, 120, 1],
  ["frequency", "Frequency", "Hz", 0.15, 1.5, 0.05],
  ["speed", "Propagation speed", "px/s", 50, 400, 5],
  ["growth", "Outward growth", "×", 0, 6, 0.1],
  ["threshold", "Motion threshold", "px/s", 100, 1500, 25],
  ["spacing", "Drag impulse spacing", "px", 12, 90, 2],
  ["dragStrength", "Drag strength", "px", 2, 50, 1],
  ["releaseStrength", "Release strength", "px", 0, 50, 1],
];
for (const [key, title, unit, min, max, step] of settings) {
  const label = document.createElement("label"),
    value = document.createElement("span"),
    input = document.createElement("input");
  value.textContent = P[key] + " " + unit;
  label.textContent = title;
  label.append(value, input);
  input.type = "range";
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = P[key];
  input.addEventListener("input", () => {
    P[key] = +input.value;
    value.textContent = P[key] + " " + unit;
  });
  $("controls").append(label);
}
const canvas = createCanvasRenderer(cc),
  gpu = createWebGLRenderer(gc),
  monitor = createPerformanceMonitor();
let activeRenderer = null,
  running = true,
  visible = true,
  raf = 0,
  lastDraw = 0,
  clock = performance.now(),
  lastStats = 0;
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
const simulation = createSimulation(P, {
  wake,
  enabled: () => running && !reduced.matches,
});
const { waves } = simulation;
function selectRenderer() {
  const want =
    $("renderer").value === "canvas"
      ? "canvas"
      : gpu.init()
        ? "webgl"
        : "canvas";
  if (want !== activeRenderer) {
    activeRenderer = want;
    gc.style.display = want === "webgl" ? "block" : "none";
    cc.style.display = want === "canvas" ? "block" : "none";
    resize();
  }
}
function resize() {
  const r = stage.getBoundingClientRect(),
    w = Math.max(1, r.width),
    h = Math.max(1, r.height);
  simulation.resize(w, h);
  const scale = Math.min(
    window.devicePixelRatio || 1,
    2,
    gpu.maxSize / w,
    gpu.maxSize / h,
  );
  gc.width = cc.width = Math.max(1, Math.round(w * scale));
  gc.height = cc.height = Math.max(1, Math.round(h * scale));
  canvas.resize(w, h);
  gpu.resize();
  draw();
}
function draw() {
  const renderer = activeRenderer === "webgl" ? gpu : canvas;
  if (renderer.requiresCPUSamples) simulation.compute();
  renderer.draw(simulation);
}
function wake() {
  if (!raf && visible && running && !reduced.matches) {
    raf = requestAnimationFrame(frame);
  }
}
function frame(now) {
  raf = 0;
  if (!visible || !running || reduced.matches) return;
  if (now - lastDraw < 15.7) {
    raf = requestAnimationFrame(frame);
    return;
  }
  simulation.advance(Math.max(0, (now - clock) / 1000));
  clock = now;
  lastDraw = now;
  simulation.prune();
  const start = performance.now();
  draw();
  monitor.record(now, performance.now() - start);
  if (now - lastStats > 450) {
    stats.textContent = monitor.format(
      activeRenderer,
      gc,
      simulation,
      activeRenderer === "webgl" && !gpu.requiresCPUSamples,
    );
    lastStats = now;
  }
  if (waves.length) raf = requestAnimationFrame(frame);
}
attachPointerInteractions(
  stage,
  $("exit"),
  P,
  simulation,
  () => running && !reduced.matches,
);
gc.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  gpu.lost();
  activeRenderer = "webgl";
  selectRenderer();
  draw();
});
gc.addEventListener("webglcontextrestored", () => {
  gpu.restored();
  selectRenderer();
  resize();
});
$("renderer").addEventListener("change", () => {
  selectRenderer();
  draw();
});
$("reset").addEventListener("click", () => {
  waves.length = 0;
  draw();
});
$("pause").addEventListener("click", () => {
  running = !running;
  $("pause").textContent = running ? "Pause" : "Resume";
  if (running) {
    clock = performance.now();
    if (waves.length) wake();
  } else if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
});
function setFull(on) {
  host.classList.toggle("full", on);
  document.body.style.overflow = on ? "hidden" : "";
  $("fullscreen").textContent = on ? "Exit fullscreen" : "Expand fullscreen";
  resize();
}
$("fullscreen").addEventListener("click", () =>
  setFull(!host.classList.contains("full")),
);
$("exit").addEventListener("click", () => setFull(false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && host.classList.contains("full")) setFull(false);
});
new ResizeObserver(resize).observe(stage);
const observer = new IntersectionObserver((entries) => {
  visible = entries[0].isIntersecting && !document.hidden;
  if (visible) {
    clock = performance.now();
    if (waves.length) wake();
  } else if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
});
observer.observe(stage);
document.addEventListener("visibilitychange", () => {
  visible = !document.hidden;
  if (visible) {
    clock = performance.now();
    if (waves.length) wake();
  } else if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
});
reduced.addEventListener?.("change", () => {
  if (reduced.matches) {
    waves.length = 0;
    draw();
  } else if (waves.length) wake();
});
selectRenderer();
resize();
draw();
stats.textContent =
  "Renderer " +
  (activeRenderer === "webgl" ? "WebGL 1" : "Canvas 2D") +
  "\nIdle — no animation";
