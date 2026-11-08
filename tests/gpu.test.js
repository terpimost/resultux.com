import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import { packProfile, PROFILE_WIDTH } from "../js/renderers/wave-shader.js";

test("RGB24 profile encoding preserves signed samples", () => {
  const values = new Float32Array([
    -1.01, -1, -0.00001, 0, 0.00001, 0.5, 1, 1.01,
  ]);
  const pixels = new Uint8Array(PROFILE_WIDTH * 4);
  packProfile(values, pixels);
  for (let i = 0; i < values.length; i++) {
    const packed =
      pixels[i * 4] * 65536 + pixels[i * 4 + 1] * 256 + pixels[i * 4 + 2];
    assert.ok(Math.abs((packed * 4) / 16777215 - 2 - values[i]) < 0.00000013);
  }
});

test("vertex shader matches CPU WebGL across wave limits, reuse, resize and fallback", async () => {
  const server = spawn(
    "python3",
    ["-m", "http.server", "8002", "--bind", "127.0.0.1"],
    { stdio: "ignore" },
  );
  let browser;
  try {
    for (let i = 0; i < 50; i++) {
      try {
        if ((await fetch("http://127.0.0.1:8002/resultux-wave.html")).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:8002/benchmark.html");
    const result = await page.evaluate(async () => {
      const { createSimulation } = await import("./js/simulation.js");
      const { createWebGLRenderer } = await import("./js/renderers/webgl.js");
      const gpuCanvas = document.createElement("canvas"),
        cpuCanvas = document.createElement("canvas");
      const gpu = createWebGLRenderer(gpuCanvas),
        cpu = createWebGLRenderer(cpuCanvas, { waveEvaluation: "cpu" });
      if (!gpu.init() || gpu.waveEvaluation !== "vertex-shader")
        throw Error("Test requires the GPU wave shader");
      if (!cpu.init() || !cpu.requiresCPUSamples)
        throw Error("CPU baseline did not initialize");
      let uploads = 0,
        profileUploads = 0;
      const gl = gpuCanvas.getContext("webgl"),
        bufferData = gl.bufferData.bind(gl),
        texSubImage2D = gl.texSubImage2D.bind(gl);
      gl.bufferData = (...args) => {
        uploads++;
        return bufferData(...args);
      };
      gl.texSubImage2D = (...args) => {
        profileUploads++;
        return texSubImage2D(...args);
      };
      const ratios = [];
      const fillErrors = [];
      function compare(simulation) {
        simulation.compute();
        const displacement = new Float32Array(simulation.ds);
        cpu.draw(simulation);
        // GPU rendering must not depend on displacement computed on the CPU.
        simulation.ds.fill(1000000);
        gpu.draw(simulation);
        const a = new Uint8Array(cpuCanvas.width * cpuCanvas.height * 4),
          b = new Uint8Array(a.length);
        cpuCanvas
          .getContext("webgl")
          .readPixels(
            0,
            0,
            cpuCanvas.width,
            cpuCanvas.height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            a,
          );
        gl.readPixels(
          0,
          0,
          gpuCanvas.width,
          gpuCanvas.height,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          b,
        );
        let differences = 0;
        for (let i = 0; i < a.length; i += 4)
          if (
            Math.abs(a[i] - b[i]) > 3 ||
            Math.abs(a[i + 1] - b[i + 1]) > 3 ||
            Math.abs(a[i + 2] - b[i + 2]) > 3
          )
            differences++;
        ratios.push(differences / (a.length / 4));
        // Independent oracle: project each pixel into diagonal coordinates.
        // Pixel parity alone cannot catch a triangulation bug shared by both GL paths.
        let wrong = 0,
          checked = 0;
        const sx = simulation.w / gpuCanvas.width,
          sy = simulation.h / gpuCanvas.height;
        for (let py = 0; py < gpuCanvas.height; py++)
          for (let px = 0; px < gpuCanvas.width; px++) {
            const x = (px + 0.5) * sx,
              y = (py + 0.5) * sy;
            const u =
              (x * simulation.w + (simulation.h - y) * simulation.h) /
              (simulation.L * simulation.L);
            const sample = ((u + 0.5) * simulation.N) / 2,
              index = Math.floor(sample),
              fraction = sample - index;
            const d =
              displacement[index] * (1 - fraction) +
              displacement[index + 1] * fraction;
            const normal =
              (x - u * simulation.w) * simulation.nx +
              (y - (1 - u) * simulation.h) * simulation.ny;
            const slope =
              (displacement[index + 1] - displacement[index]) /
              ((simulation.L * 2) / simulation.N);
            if (
              Math.abs(normal - d) <
              2 * Math.hypot(1, slope) * Math.max(sx, sy)
            )
              continue;
            const expected = normal < d ? 237 : 27;
            const i = ((gpuCanvas.height - 1 - py) * gpuCanvas.width + px) * 4;
            checked++;
            if (Math.abs(b[i] - expected) > 3) wrong++;
          }
        fillErrors.push(wrong / checked);
      }
      const parameters = { frequency: 0.3, speed: 120, growth: 0.8 },
        simulation = createSimulation(parameters, { random: () => 0.501 });
      function resize(w, h, dpr) {
        simulation.resize(w, h);
        for (const canvas of [gpuCanvas, cpuCanvas]) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
        }
        gpu.resize();
        cpu.resize();
      }
      resize(390, 464, 2);
      compare(simulation);
      simulation.launch(0.4, 36, 1, "impact");
      simulation.advance(1.5);
      compare(simulation);
      const counts = [uploads, profileUploads];
      simulation.advance(0.1);
      compare(simulation);
      const repeatedCounts = [uploads, profileUploads];
      Object.assign(parameters, { frequency: 1.5, speed: 400, growth: 6 });
      for (let i = 0; i < 60; i++) {
        simulation.launch(
          i / 60,
          120,
          i % 2 ? 1 : -1,
          ["drag", "impact", "release", "motion"][i % 4],
        );
        simulation.advance(0.05);
      }
      compare(simulation);
      resize(1440, 594, 1);
      compare(simulation);
      simulation.advance(100);
      simulation.prune();
      compare(simulation);
      parameters.frequency = 0.15;
      simulation.launch(0.9, 60, -1, "motion");
      simulation.advance(4);
      compare(simulation);
      simulation.reset();
      compare(simulation);
      simulation.advance(1000000);
      simulation.launch(0.3, 36, 1, "impact");
      simulation.advance(1.5);
      compare(simulation);
      // Restoring a context must rebuild static geometry and all live profiles.
      const loss = gl.getExtension("WEBGL_lose_context");
      const lost = new Promise((resolve) =>
        gpuCanvas.addEventListener(
          "webglcontextlost",
          (event) => {
            event.preventDefault();
            gpu.lost();
            resolve();
          },
          { once: true },
        ),
      );
      loss.loseContext();
      await lost;
      await new Promise((resolve) => setTimeout(resolve, 100));
      const restored = new Promise((resolve) =>
        gpuCanvas.addEventListener("webglcontextrestored", resolve, {
          once: true,
        }),
      );
      loss.restoreContext();
      await Promise.race([
        restored,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(Error("Context restoration timed out")),
            3000,
          ),
        ),
      ]);
      gpu.restored();
      if (!gpu.init() || gpu.waveEvaluation !== "vertex-shader")
        throw Error("GPU mode not restored");
      gpu.resize();
      compare(simulation);

      // Accumulated impulses can fold screen-space x; the fill must stay continuous.
      Object.assign(parameters, { frequency: 0.3, speed: 120, growth: 0.8 });
      for (const [w, h] of [
        [982, 472],
        [390, 844],
      ])
        for (const sign of [-1, 1]) {
          simulation.reset();
          resize(w, h, 1);
          for (let i = 0; i < 48; i++)
            simulation.launch(0.5, 36, sign, "impact");
          for (const dt of [0.5, 0.5, 1, 1]) {
            simulation.advance(dt);
            compare(simulation);
          }
        }

      // Simulate a WebGL 1 implementation without vertex texture fetch support.
      const fallbackCanvas = document.createElement("canvas"),
        fallbackGL = fallbackCanvas.getContext("webgl");
      const getParameter = fallbackGL.getParameter.bind(fallbackGL);
      fallbackGL.getParameter = (p) =>
        p === fallbackGL.MAX_VERTEX_TEXTURE_IMAGE_UNITS ? 0 : getParameter(p);
      const fallback = createWebGLRenderer(fallbackCanvas);
      fallback.init();
      return {
        ratios,
        fillErrors,
        counts,
        repeatedCounts,
        fallback: fallback.waveEvaluation,
        requiresCPU: fallback.requiresCPUSamples,
      };
    });
    assert.ok(
      result.fillErrors.every((x) => x < 0.001),
      "Incorrect filled area: " + JSON.stringify(result.fillErrors),
    );
    assert.equal(result.fallback, "cpu");
    assert.equal(result.requiresCPU, true);
    assert.deepEqual(
      result.counts,
      result.repeatedCounts,
      "Unchanged geometry and profiles must not reupload",
    );
    assert.ok(
      result.ratios.every((x) => x < 0.001),
      JSON.stringify(result.ratios),
    );
  } finally {
    await browser?.close();
    server.kill();
  }
});
