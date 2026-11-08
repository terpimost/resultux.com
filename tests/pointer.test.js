import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

test("selectable text triggers waves without cancelling native gestures", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<div id="stage"><p data-selectable>Selectable text for dragging</p><button>Control</button></div>`,
    );
    const source = await readFile(
      new URL("../js/pointer.js", import.meta.url),
      "utf8",
    );
    await page.addScriptTag({
      content: source.replace("export function", "function"),
    });
    const result = await page.evaluate(async () => {
      const stage = document.querySelector("#stage");
      const text = stage.querySelector("p");
      const impulses = [];
      let captures = 0;
      stage.setPointerCapture = () => captures++;
      attachPointerInteractions(
        stage,
        null,
        {
          impact: 36,
          spacing: 10,
          dragStrength: 18,
          releaseStrength: 14,
          threshold: 1,
          amplitude: 10,
        },
        {
          w: 400,
          h: 800,
          L: Math.hypot(400, 800),
          launch: (...args) => impulses.push(args[3]),
          direction: () => 1,
        },
        () => true,
      );
      const range = document.createRange();
      range.selectNodeContents(text);
      getSelection().addRange(range);
      function send(target, type, pointerType = "mouse", x = 10) {
        const event = new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          pointerType,
          clientX: x,
          clientY: 10,
        });
        target.dispatchEvent(event);
        return event.defaultPrevented;
      }
      const cancelled = send(text, "pointerdown");
      send(text, "pointermove", "mouse", 80);
      send(window, "pointerup", "mouse", 80);
      send(text, "pointerdown", "touch");
      send(text, "pointercancel", "touch");
      const beforeControl = impulses.length;
      send(stage.querySelector("button"), "pointerdown");
      const afterControl = impulses.length;
      await new Promise((resolve) => setTimeout(resolve, 320));
      send(text, "pointermove", "mouse", 10);
      await new Promise((resolve) => setTimeout(resolve, 25));
      send(text, "pointermove", "mouse", 100);
      return {
        cancelled,
        captures,
        selected: getSelection().toString(),
        impulses,
        beforeControl,
        afterControl,
      };
    });
    assert.equal(result.cancelled, false);
    assert.equal(result.captures, 0);
    assert.equal(result.selected, "Selectable text for dragging");
    assert.equal(result.impulses.filter((kind) => kind === "impact").length, 2);
    assert.ok(result.impulses.includes("release"));
    assert.ok(result.impulses.includes("motion"));
    assert.equal(result.afterControl, result.beforeControl);
  } finally {
    await browser.close();
  }
});
