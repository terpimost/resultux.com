/** CPU submission time only: neither renderer waits for GPU completion. */
export function summarize(values) {
  if (!values.length) return { mean: 0, p50: 0, p95: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    p50: sorted[Math.floor((sorted.length - 1) * 0.5)],
    p95: sorted[Math.floor((sorted.length - 1) * 0.95)],
  };
}
export function createPerformanceMonitor() {
  let avgCost = 0,
    avgFps = 60,
    last = 0;
  return {
    record(now, cost) {
      const delta = last ? now - last : 16.67;
      last = now;
      avgFps = 0.9 * avgFps + (0.1 * 1000) / Math.max(1, delta);
      avgCost = 0.9 * avgCost + 0.1 * cost;
    },
    format(renderer, canvas, simulation, gpuWaves = false) {
      return `Renderer ${renderer === "webgl" ? "WebGL 1" : "Canvas 2D"}\nFPS ${Math.round(avgFps)} / 60\nResolution ${canvas.width} × ${canvas.height}\nDPR ${(canvas.width / simulation.w).toFixed(2)}×\nActive waves ${simulation.waves.length}\nSamples ${simulation.N} · Evaluations ${gpuWaves ? "GPU" : simulation.evals}\nCPU draw ${avgCost.toFixed(2)} ms`;
    },
  };
}
