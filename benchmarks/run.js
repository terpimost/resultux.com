import os from "node:os";
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
const server = spawn(
  "python3",
  ["-m", "http.server", "8000", "--bind", "127.0.0.1"],
  { stdio: "ignore" },
);
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try {
      const response = await fetch("http://127.0.0.1:8000/benchmark.html");
      if (response.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch();
  await mkdir("benchmarks/results", { recursive: true });
  for (const preset of ["desktop", "mobile"]) {
    const context = await browser.newContext({
      viewport:
        preset === "desktop"
          ? { width: 1440, height: 1080 }
          : { width: 390, height: 844 },
      deviceScaleFactor: preset === "desktop" ? 1 : 2,
      isMobile: preset === "mobile",
      hasTouch: preset === "mobile",
    });
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:8000/benchmark.html");
    const result = await page.evaluate(async (preset) => {
      const { runComparison } = await import("./benchmarks/benchmark.js");
      return runComparison({ preset });
    }, preset);
    result.host = {
      platform: os.platform(),
      arch: os.arch(),
      osRelease: os.release(),
      cpu: os.cpus()[0]?.model,
    };
    result.environment =
      "Headless Chromium; mobile is viewport/touch emulation, not mobile hardware";
    await writeFile(
      `benchmarks/results/${preset}.json`,
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log(
      preset,
      result.results.map((x) => ({
        renderer: x.renderer,
        status: x.status,
        cpuMs: x.cpuMs?.mean,
        fps: x.fps,
      })),
    );
    await context.close();
  }
} finally {
  await browser?.close();
  server.kill();
}
