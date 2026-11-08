import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

test("landing: CSS first, WebGL only, static fallback and mobile viewport fit", async () => {
  const server = spawn(
    "python3",
    ["-m", "http.server", "8003", "--bind", "127.0.0.1"],
    { stdio: "ignore" },
  );
  let browser;
  try {
    for (let i = 0; i < 50; i++) {
      try {
        if ((await fetch("http://127.0.0.1:8003/index.html")).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    browser = await chromium.launch();
    const noJS = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 1440, height: 900 },
    });
    const staticPage = await noJS.newPage();
    await staticPage.goto("http://127.0.0.1:8003/");
    const css = await staticPage.locator(".diagonal").evaluate((e) => ({
      clip: getComputedStyle(e).clipPath,
      color: getComputedStyle(e).backgroundColor,
    }));
    assert.equal(css.clip, "polygon(0px 0px, 100% 0px, 0px 100%)");
    assert.equal(css.color, "rgb(237, 192, 228)");
    assert.equal(
      await staticPage
        .locator("#wave")
        .evaluate((e) => getComputedStyle(e).opacity),
      "0",
    );
    await noJS.close();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    await context.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      window.contextTypes = [];
      HTMLCanvasElement.prototype.getContext = function (type, ...options) {
        window.contextTypes.push(type);
        if (type === "2d") throw Error("Canvas fallback must not load");
        return getContext.call(this, type, ...options);
      };
      const request = window.requestAnimationFrame.bind(window),
        cancel = window.cancelAnimationFrame.bind(window);
      const pending = new Set();
      window.requestAnimationFrame = (fn) => {
        const id = request((time) => {
          pending.delete(id);
          fn(time);
        });
        pending.add(id);
        return id;
      };
      window.cancelAnimationFrame = (id) => {
        pending.delete(id);
        cancel(id);
      };
      window.pendingAnimationFrames = pending;
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const imports = [];
    page.on("request", (request) => imports.push(request.url()));
    await page.goto("http://127.0.0.1:8003/");
    await page.waitForFunction(() =>
      document.querySelector("#wave").classList.contains("is-ready"),
    );
    assert.equal(await page.locator("input,select,button").count(), 0);
    assert.ok(!imports.some((url) => url.endsWith("/renderers/canvas.js")));
    assert.equal(
      await page.evaluate(() => window.pendingAnimationFrames.size),
      0,
      "Idle scene must sleep",
    );
    const resting = await page.locator("#wave").screenshot();
    await page.touchscreen.tap(180, 450);
    await page.waitForTimeout(350);
    const animated = await page.locator("#wave").screenshot();
    assert.notDeepEqual(animated, resting, "Tap must deform the separator");
    for (const size of [
      { width: 390, height: 600 },
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(size);
      await page.waitForFunction(() => {
        const canvas = document.querySelector("#wave"),
          r = document.querySelector("#scene").getBoundingClientRect();
        return (
          Math.abs(r.height - innerHeight) < 1 &&
          canvas.height === Math.round(r.height * 2) &&
          canvas.width === Math.round(r.width * 2)
        );
      });
      const dimensions = await page.evaluate(() => ({
        w: innerWidth,
        h: innerHeight,
        scrollW: document.documentElement.scrollWidth,
        scrollH: document.documentElement.scrollHeight,
      }));
      assert.ok(
        dimensions.scrollW <= dimensions.w &&
          dimensions.scrollH <= dimensions.h,
        JSON.stringify(dimensions),
      );
      await page.evaluate(() => scrollTo(100, 100));
      assert.equal(await page.evaluate(() => scrollY), 0);
    }
    const logoBox = await page.locator(".brand-text").boundingBox();
    assert.ok(
      Math.abs(logoBox.width - 173) < 0.1,
      "Selectable logo text must match the SVG width",
    );
    await page.mouse.move(logoBox.x + 1, logoBox.y + logoBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      logoBox.x + logoBox.width - 1,
      logoBox.y + logoBox.height / 2,
      { steps: 20 },
    );
    await page.mouse.up();
    await page.waitForFunction(() =>
      document.querySelector(".brand-text").classList.contains("is-selected"),
    );
    assert.equal(
      await page.evaluate(() => getSelection().toString()),
      "Resultux",
    );
    assert.equal(
      await page
        .locator(".brand-text")
        .evaluate((e) => getComputedStyle(e, "::selection").color),
      "rgba(0, 0, 0, 0)",
    );
    const selectionBox = await page
      .locator(".selection-layer > div")
      .first()
      .boundingBox();
    assert.equal(selectionBox.height, 32);
    const textBox = await page.locator(".tagline").boundingBox();
    await page.mouse.move(textBox.x + 1, textBox.y + textBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      textBox.x + textBox.width - 1,
      textBox.y + textBox.height / 2,
      { steps: 20 },
    );
    await page.mouse.up();
    await page.waitForFunction(() =>
      document.querySelector(".tagline").classList.contains("is-selected"),
    );
    assert.equal(
      await page.evaluate(() => getSelection().toString()),
      "well-designed results",
    );
    assert.equal(
      await page
        .locator(".selection-layer > div")
        .first()
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgb(255, 255, 255)",
    );
    assert.equal(
      await page
        .locator(".tagline")
        .evaluate((e) => getComputedStyle(e).mixBlendMode),
      "difference",
    );
    assert.equal(
      await page
        .locator(".brand")
        .evaluate((e) => getComputedStyle(e).mixBlendMode),
      "difference",
    );
    await page.mouse.click(700, 300);
    await page.waitForFunction(
      () =>
        !document.querySelector(".tagline").classList.contains("is-selected"),
    );
    await page.evaluate(() => {
      const gl = document.querySelector("#wave").getContext("webgl");
      window.loss = gl.getExtension("WEBGL_lose_context");
      window.loss.loseContext();
    });
    await page.waitForFunction(
      () => !document.querySelector("#wave").classList.contains("is-ready"),
    );
    assert.equal(
      await page.locator("#wave").evaluate((e) => getComputedStyle(e).opacity),
      "0",
    );
    await page.waitForTimeout(100);
    await page.evaluate(() => window.loss.restoreContext());
    await page.waitForFunction(() =>
      document.querySelector("#wave").classList.contains("is-ready"),
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(
      () => !document.querySelector("#wave").classList.contains("is-ready"),
    );
    assert.equal(
      await page.evaluate(() => window.pendingAnimationFrames.size),
      0,
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForFunction(() =>
      document.querySelector("#wave").classList.contains("is-ready"),
    );
    assert.ok(
      (await page.evaluate(() => window.contextTypes)).every(
        (type) => type === "webgl",
      ),
    );
    assert.deepEqual(errors, []);
    await context.close();
    const unsupported = await browser.newPage();
    await unsupported.addInitScript(() => {
      window.contextAttempts = 0;
      HTMLCanvasElement.prototype.getContext = function (type) {
        if (type !== "webgl") throw Error("Unexpected fallback");
        window.contextAttempts++;
        return null;
      };
    });
    await unsupported.goto("http://127.0.0.1:8003/");
    await unsupported.waitForFunction(() => window.contextAttempts > 0);
    assert.equal(
      await unsupported
        .locator("#wave")
        .evaluate((e) => getComputedStyle(e).opacity),
      "0",
    );
    await unsupported.close();
    const reduced = await browser.newContext({ reducedMotion: "reduce" });
    const reducedPage = await reduced.newPage();
    let requests = 0;
    reducedPage.on("request", (r) => {
      if (r.url().endsWith("/renderers/webgl.js")) requests++;
    });
    await reducedPage.goto("http://127.0.0.1:8003/");
    assert.equal(
      await reducedPage
        .locator("#wave")
        .evaluate((e) => getComputedStyle(e).opacity),
      "0",
    );
    assert.equal(requests, 0);
    await reduced.close();
  } finally {
    await browser?.close();
    server.kill();
  }
});
