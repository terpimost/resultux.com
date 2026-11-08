import { graphicsInfo } from "./environment.js";
import { createSimulation } from "../js/simulation.js";
import { createCanvasRenderer } from "../js/renderers/canvas.js";
import { createWebGLRenderer } from "../js/renderers/webgl.js";
import { summarize } from "../js/performance.js";
export const presets = {
  desktop: { width: 1440, height: 594, dpr: 1 },
  mobile: { width: 390, height: 464, dpr: 2 },
};
function seeded(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(resolve));
export async function runComparison({
  preset = "desktop",
  warmup = 120,
  frames = 600,
  trials = 3,
  includeCPUWebGL = true,
} = {}) {
  const size = presets[preset];
  if (
    !size ||
    !Number.isInteger(frames) ||
    frames < 1 ||
    !Number.isInteger(warmup) ||
    warmup < 0 ||
    !Number.isInteger(trials) ||
    trials < 1
  )
    throw Error("Invalid benchmark configuration");
  const graphics = graphicsInfo();
  const results = [];
  for (let trial = 0; trial < trials; trial++)
    for (const name of trial % 2
      ? ["canvas", "webgl", ...(includeCPUWebGL ? ["webgl-cpu"] : [])]
      : [...(includeCPUWebGL ? ["webgl-cpu"] : []), "webgl", "canvas"]) {
      const canvas = document.createElement("canvas");
      canvas.width = size.width * size.dpr;
      canvas.height = size.height * size.dpr;
      canvas.style.width = size.width + "px";
      canvas.style.height = size.height + "px";
      document.querySelector("#surface").replaceChildren(canvas);
      const renderer =
        name !== "canvas"
          ? createWebGLRenderer(canvas, {
              waveEvaluation: name === "webgl-cpu" ? "cpu" : "auto",
            })
          : createCanvasRenderer(canvas);
      if (name !== "canvas" && !renderer.init()) {
        results.push({ trial, renderer: name, status: "unavailable" });
        continue;
      }
      renderer.resize(size.width, size.height);
      const simulation = createSimulation(
        { frequency: 0.3, speed: 120, growth: 0.8 },
        { random: seeded(20261107) },
      );
      simulation.resize(size.width, size.height);
      const cpu = [],
        compute = [],
        submit = [],
        intervals = [];
      let previous = 0,
        lastDraw = 0,
        aborted = false;
      const invalidate = () => {
        aborted = true;
      };
      document.addEventListener("visibilitychange", invalidate);
      canvas.addEventListener("webglcontextlost", invalidate);
      try {
        for (let frame = 0; frame < warmup + frames; ) {
          const now = await nextFrame();
          if (aborted || document.hidden)
            throw Error(
              "Benchmark invalidated by visibility change or context loss; rerun in foreground",
            );
          if (now - lastDraw < 15.7) continue;
          lastDraw = now;
          const start = performance.now();
          // Repeatable mixture of click, drag and release impulses, up to the 48-wave cap.
          if (frame % 6 === 0)
            simulation.launch(
              ((frame * 37) % 101) / 100,
              frame % 30 === 0 ? 36 : 18,
              frame % 12 === 0 ? 1 : -1,
              frame % 30 === 0 ? "impact" : "drag",
            );
          if (frame % 30 === 24) simulation.launch(0.7, 14, -1, "release");
          simulation.advance(1 / 60);
          simulation.prune();
          if (renderer.requiresCPUSamples) simulation.compute();
          const computed = performance.now();
          renderer.draw(simulation);
          const end = performance.now();
          if (frame >= warmup) {
            cpu.push(end - start);
            compute.push(computed - start);
            submit.push(end - computed);
            if (previous) intervals.push(now - previous);
          }
          previous = now;
          frame++;
        }
        results.push({
          trial,
          renderer: name,
          status: "ok",
          waveEvaluation: renderer.waveEvaluation,
          samples: simulation.N,
          frames,
          cpuMs: summarize(cpu),
          simulationMs: summarize(compute),
          renderSubmitMs: summarize(submit),
          frameIntervalMs: summarize(intervals),
          fps: 1000 / summarize(intervals).mean,
          overBudgetFrames: intervals.filter((x) => x > (1000 / 60) * 1.5)
            .length,
        });
      } finally {
        document.removeEventListener("visibilitychange", invalidate);
        canvas.removeEventListener("webglcontextlost", invalidate);
      }
    }
  return {
    version: 2,
    includeCPUWebGL,
    graphics,
    parameters: { frequency: 0.3, speed: 120, growth: 0.8 },
    preset,
    size,
    seed: 20261107,
    warmup,
    frames,
    trials,
    userAgent: navigator.userAgent,
    devicePixelRatio: devicePixelRatio,
    hardwareConcurrency: navigator.hardwareConcurrency,
    timestamp: new Date().toISOString(),
    results,
  };
}
