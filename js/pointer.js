/** Translate pointer velocity, capture and travel into simulation impulses. */
export function attachPointerInteractions(stage, exit, P, simulation, enabled) {
  const { launch, direction } = simulation;
  let hovering = false,
    dragging = false,
    pointerId = null,
    prev = null,
    lastDrag = null,
    dragTravel = 0,
    dragVelocity = 0,
    lastImpulse = 0,
    velocity = 0,
    armed = true,
    lastMotion = 0;
  function pos(e) {
    const r = stage.getBoundingClientRect(),
      x = e.clientX - r.left,
      y = e.clientY - r.top;
    return {
      x,
      y,
      u: Math.max(
        0,
        Math.min(
          1,
          (x * simulation.w + (simulation.h - y) * simulation.h) /
            (simulation.L * simulation.L),
        ),
      ),
      at: performance.now(),
    };
  }
  function hover(v) {
    hovering = v;
    prev = null;
    velocity = 0;
    armed = true;
  }
  stage.addEventListener("pointerenter", (e) => {
    if (e.pointerType !== "touch") {
      hover(true);
      prev = pos(e);
    }
  });
  stage.addEventListener("pointerleave", () => {
    if (!dragging) hover(false);
  });
  stage.addEventListener("pointerdown", (e) => {
    if (
      e.target === exit ||
      e.target.closest?.("[data-wave-ignore]") ||
      (e.target.closest?.(
        "a, button, input, textarea, select, [contenteditable]",
      ) &&
        !e.target.closest?.("[data-selectable]")) ||
      !enabled()
    )
      return;
    const selecting = Boolean(e.target.closest?.("[data-selectable]"));
    // Observe text gestures without capturing the pointer or cancelling native
    // selection, long press, or link activation.
    if (!selecting) {
      document.getSelection()?.removeAllRanges();
      e.preventDefault();
    }
    const q = pos(e);
    dragging = true;
    pointerId = e.pointerId;
    lastDrag = q;
    dragTravel = 0;
    dragVelocity = 0;
    if (!selecting) stage.setPointerCapture(e.pointerId);
    hover(true);
    launch(q.u, P.impact, direction(q), "impact");
  });
  stage.addEventListener("pointermove", (e) => {
    if (!dragging && e.target.closest?.("[data-wave-ignore]")) {
      hover(false);
      return;
    }
    const q = pos(e);
    if (dragging && e.pointerId === pointerId) {
      if (lastDrag) {
        const dist = Math.hypot(q.x - lastDrag.x, q.y - lastDrag.y),
          dt = Math.max(0.008, (q.at - lastDrag.at) / 1000);
        dragVelocity = 0.6 * dragVelocity + (0.4 * dist) / dt;
        dragTravel += dist;
        if (dragTravel >= P.spacing && q.at - lastImpulse >= 80) {
          launch(
            q.u,
            Math.min(
              P.dragStrength * 1.35,
              Math.max(
                3,
                P.dragStrength * (0.35 + Math.min(1, dragVelocity / 1200)),
              ),
            ),
            direction(q),
            "drag",
          );
          dragTravel = 0;
          lastImpulse = q.at;
        }
      }
      lastDrag = q;
      return;
    }
    if (e.pointerType === "touch") return;
    if (!hovering) hover(true);
    if (prev) {
      const dt = (q.at - prev.at) / 1000;
      if (dt > 0.003 && dt < 0.2) {
        velocity =
          0.35 * velocity +
          (0.65 * Math.hypot(q.x - prev.x, q.y - prev.y)) / dt;
        if (velocity < P.threshold * 0.35) armed = true;
        if (armed && velocity > P.threshold && q.at - lastMotion > 300) {
          launch(q.u, P.amplitude, direction(q), "motion");
          armed = false;
          lastMotion = q.at;
        }
      } else if (dt >= 0.2) {
        velocity = 0;
        armed = true;
      }
    }
    prev = q;
  });
  function finish(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    const q = pos(e);
    if (dragTravel > 8 || dragVelocity > 100)
      launch(q.u, P.releaseStrength, direction(q), "release");
    dragging = false;
    pointerId = null;
    lastDrag = null;
    prev = q;
    velocity = 0;
    armed = true;
    hover(e.pointerType !== "touch" && stage.matches(":hover"));
  }
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", finish);
  stage.addEventListener("lostpointercapture", (e) => {
    if (dragging && e.pointerId === pointerId) {
      dragging = false;
      pointerId = null;
      hover(false);
    }
  });
}
