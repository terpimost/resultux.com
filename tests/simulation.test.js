import { test } from "node:test";
import assert from "node:assert/strict";
import { createSimulation } from "../js/simulation.js";
import { summarize } from "../js/performance.js";
const parameters = { frequency: 0.3, speed: 120, growth: 0.8 };
test("seeded waves are repeatable, finite, capped and eventually pruned", () => {
  const a = createSimulation(parameters, { random: () => 0.5 }),
    b = createSimulation(parameters, { random: () => 0.5 });
  for (const s of [a, b]) {
    s.resize(1440, 594);
    for (let i = 0; i < 60; i++) s.launch(i / 60, 36, 1, "impact");
    s.advance(2);
    s.compute();
  }
  assert.equal(a.waves.length, 48);
  assert.deepEqual(a.ds, b.ds);
  assert.ok(a.ds.some((x) => x !== 0));
  assert.ok(a.ds.every(Number.isFinite));
  a.advance(100);
  a.prune();
  a.compute();
  assert.equal(a.waves.length, 0);
  assert.ok(a.ds.every((x) => x === 0));
});
test("disabled/reduced motion prevents impulses and reset clears displacement", () => {
  const s = createSimulation(parameters, { enabled: () => false });
  s.launch(0.5, 36, 1, "impact");
  assert.equal(s.waves.length, 0);
  const active = createSimulation(parameters);
  active.resize(390, 464);
  active.launch(0.5, 36, -1, "drag");
  active.advance(1);
  active.compute();
  active.reset();
  active.compute();
  assert.ok(active.ds.every((x) => x === 0));
  assert.ok((2 * active.L) / active.N <= 2);
});
test("monitor reports expected percentiles", () => {
  assert.deepEqual(summarize([4, 1, 3, 2]), { mean: 2.5, p50: 2, p95: 3 });
});

test("denser mesh reduces large-wave interpolation error without changing physics", () => {
  const models = [10, 2, 0.5].map((sampleSpacing) => {
    const s = createSimulation(parameters, {
      random: () => 0.5,
      sampleSpacing,
    });
    s.resize(640, 360);
    for (let i = 0; i < 16; i++) s.launch(0.5, 36, -1, "impact");
    s.advance(1);
    s.compute();
    return s;
  });
  function interpolate(s, u) {
    const index = ((u + 0.5) * s.N) / 2,
      i = Math.floor(index),
      fraction = index - i;
    return s.ds[i] * (1 - fraction) + s.ds[Math.min(i + 1, s.N)] * fraction;
  }
  const [coarse, smooth, reference] = models;
  const error = (s) => {
    let worst = 0;
    for (let i = 0; i <= reference.N; i++)
      worst = Math.max(
        worst,
        Math.abs(interpolate(s, reference.us[i]) - reference.ds[i]),
      );
    return worst;
  };
  assert.ok(
    error(smooth) < error(coarse) / 5,
    JSON.stringify({ coarse: error(coarse), smooth: error(smooth) }),
  );
  assert.equal(smooth.waves.length, coarse.waves.length);
  assert.ok(smooth.ds.every(Number.isFinite));
  smooth.resize(7680, 4320);
  assert.ok(smooth.N <= 4096, "Bound mesh work on very large screens");
});
