import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

test("browser controls, rendering, fallback and reduced motion", async () => {
  const server = spawn(
    "python3",
    ["-m", "http.server", "8001", "--bind", "127.0.0.1"],
    { stdio: "ignore" },
  );
  let browser;
  try {
    for (let i = 0; i < 50; i++) {
      try {
        if ((await fetch("http://127.0.0.1:8001/resultux-wave.html")).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    browser = await chromium.launch();
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:8001/resultux-wave.html");
    await page.waitForFunction(() =>
      document.querySelector("#stats").textContent.includes("Idle"),
    );
    assert.equal(await page.locator("input[type=range]").count(), 9);
    await page.selectOption("#renderer", "canvas");
    assert.equal(await page.locator("#canvas2d").isVisible(), true);
    await page.locator("#stage").click({ position: { x: 300, y: 150 } });
    await page.waitForFunction(() =>
      document.querySelector("#stats").textContent.includes("Active waves 1"),
    );
    await page.click("#pause");
    assert.equal(await page.locator("#pause").textContent(), "Resume");
    await page.click("#pause");
    await page.click("#reset");
    await page.click("#fullscreen");
    assert.equal(
      await page.locator("#host").evaluate((e) => e.classList.contains("full")),
      true,
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await page.locator("#host").evaluate((e) => e.classList.contains("full")),
      false,
    );
    await page.selectOption("#renderer", "webgl");
    const hasGL = await page.locator("#canvasgl").isVisible();
    if (hasGL) {
      await page.evaluate(() => {
        const gl = document.querySelector("#canvasgl").getContext("webgl");
        window.loss = gl.getExtension("WEBGL_lose_context");
        window.loss.loseContext();
      });
      await page.waitForFunction(
        () =>
          getComputedStyle(document.querySelector("#canvas2d")).display ===
          "block",
      );
      await page.evaluate(() => window.loss.restoreContext());
      await page.waitForFunction(
        () =>
          getComputedStyle(document.querySelector("#canvasgl")).display ===
          "block",
      );
    }
    const fallback = await browser.newPage();
    await fallback.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...options) {
        return type === "webgl"
          ? null
          : getContext.call(this, type, ...options);
      };
    });
    await fallback.goto("http://127.0.0.1:8001/resultux-wave.html");
    await fallback.waitForFunction(() =>
      document.querySelector("#stats").textContent.includes("Canvas 2D"),
    );
    assert.equal(await fallback.locator("#canvas2d").isVisible(), true);
    await fallback.close();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await page.locator("#stage").click({ position: { x: 100, y: 100 } });
    assert.match(await page.locator("#stats").textContent(), /Idle/);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("http://127.0.0.1:8001/benchmark.html");
    const comparison = await page.evaluate(async () => {
      const { runComparison } = await import("./benchmarks/benchmark.js");
      return runComparison({
        preset: "mobile",
        warmup: 2,
        frames: 4,
        trials: 1,
        includeCPUWebGL: false,
      });
    });
    const pixels = await page.evaluate(async () => {
      const { createSimulation } = await import("./js/simulation.js");
      const { createCanvasRenderer } = await import("./js/renderers/canvas.js");
      const { createWebGLRenderer } = await import("./js/renderers/webgl.js");
      const simulation = createSimulation(
        { frequency: 0.3, speed: 120, growth: 0.8 },
        { random: () => 0.5 },
      );
      simulation.resize(390, 464);
      simulation.launch(0.4, 36, 1, "impact");
      simulation.advance(1.5);
      simulation.compute();
      const canvas = document.createElement("canvas"),
        gpuCanvas = document.createElement("canvas");
      for (const element of [canvas, gpuCanvas]) {
        element.width = 390;
        element.height = 464;
      }
      const cpu = createCanvasRenderer(canvas),
        gpu = createWebGLRenderer(gpuCanvas);
      if (!gpu.init()) return null;
      cpu.resize(390, 464);
      gpu.resize();
      cpu.draw(simulation);
      gpu.draw(simulation);
      const a = canvas.getContext("2d").getImageData(0, 0, 390, 464).data;
      const gl = gpuCanvas.getContext("webgl"),
        b = new Uint8Array(a.length);
      gl.readPixels(0, 0, 390, 464, gl.RGBA, gl.UNSIGNED_BYTE, b);
      let mismatch = 0,
        pink = 0,
        dark = 0;
      for (let y = 0; y < 464; y++)
        for (let x = 0; x < 390; x++) {
          const i = (y * 390 + x) * 4,
            j = ((463 - y) * 390 + x) * 4;
          if (
            Math.abs(a[i] - b[j]) > 3 ||
            Math.abs(a[i + 1] - b[j + 1]) > 3 ||
            Math.abs(a[i + 2] - b[j + 2]) > 3
          )
            mismatch++;
          if (a[i] === 237) pink++;
          if (a[i] === 27) dark++;
        }
      return { ratio: mismatch / (390 * 464), pink, dark };
    });
    if (pixels) {
      assert.ok(pixels.ratio < 0.01, JSON.stringify(pixels));
      assert.ok(pixels.pink > 1000);
      assert.ok(pixels.dark > 1000);
    }
    assert.equal(comparison.results.length, 2);
    assert.ok(
      comparison.results.some(
        (x) => x.renderer === "canvas" && x.status === "ok",
      ),
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.kill();
  }
});
