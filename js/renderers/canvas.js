export function createCanvasRenderer(canvas) {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw Error("Canvas 2D unavailable");
  function drawCanvas(state) {
    ctx.fillStyle = "#1b1219";
    ctx.fillRect(0, 0, state.w, state.h);
    ctx.beginPath();
    // Close outside the viewport in diagonal coordinates, matching the GL fill.
    ctx.moveTo(
      -0.5 * state.w - state.nx * state.L,
      1.5 * state.h - state.ny * state.L,
    );
    ctx.lineTo(
      1.5 * state.w - state.nx * state.L,
      -0.5 * state.h - state.ny * state.L,
    );
    for (let i = state.N; i >= 0; i--)
      ctx.lineTo(
        state.us[i] * state.w + state.nx * state.ds[i],
        (1 - state.us[i]) * state.h + state.ny * state.ds[i],
      );
    ctx.closePath();
    ctx.fillStyle = "#edc0e4";
    ctx.fill();
  }
  return {
    draw: drawCanvas,
    requiresCPUSamples: true,
    waveEvaluation: "cpu",
    resize(w, h) {
      ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
    },
  };
}
