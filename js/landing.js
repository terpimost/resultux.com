// The HTML/CSS scene is complete before any animation modules are loaded.
const scene = document.querySelector("#scene");
const canvas = document.querySelector("#wave");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const parameters = {
  amplitude: 10,
  impact: 36,
  frequency: 0.3,
  speed: 120,
  growth: 0.8,
  threshold: 450,
  dragStrength: 18,
  spacing: 32,
  releaseStrength: 14,
};
let renderer, simulation;
let ready = false,
  initializing = false,
  unavailable = false,
  raf = 0,
  lastTime = 0,
  lastDraw = 0;
const enabled = () => ready && !reduced.matches && !document.hidden;

function stop() {
  cancelAnimationFrame(raf);
  raf = 0;
  lastTime = lastDraw = 0;
}
function draw() {
  if (!enabled()) return;
  // Older WebGL devices may need CPU sampling, but rendering is always WebGL.
  if (renderer.requiresCPUSamples) simulation.compute();
  renderer.draw(simulation);
  canvas.classList.add("is-ready");
}
function resize() {
  if (!CSS.supports("height", "100dvh")) {
    scene.style.setProperty("--viewport-height", `${window.innerHeight}px`);
  }
  if (!ready) return;
  const { width, height } = scene.getBoundingClientRect();
  const w = Math.max(1, width),
    h = Math.max(1, height);
  simulation.resize(w, h);
  const scale = Math.min(
    devicePixelRatio || 1,
    2,
    renderer.maxSize / w,
    renderer.maxSize / h,
  );
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  renderer.resize();
  draw();
}
function wake() {
  if (raf || !enabled()) return;
  // Idle time must not age a freshly launched impulse.
  lastTime = performance.now();
  lastDraw = 0;
  raf = requestAnimationFrame(frame);
}
function frame(now) {
  raf = 0;
  if (!enabled()) return;
  if (now - lastDraw < 15.7) {
    raf = requestAnimationFrame(frame);
    return;
  }
  simulation.advance(Math.max(0, (now - lastTime) / 1000));
  lastTime = lastDraw = now;
  simulation.prune();
  draw();
  if (simulation.waves.length) raf = requestAnimationFrame(frame);
}
async function initialize() {
  try {
    const [
      { createSimulation },
      { attachPointerInteractions },
      { createWebGLRenderer },
    ] = await Promise.all([
      import("./simulation.js"),
      import("./pointer.js?v=selection-4"),
      import("./renderers/webgl.js"),
    ]);
    if (reduced.matches || document.hidden) return;
    if (!renderer) {
      renderer = createWebGLRenderer(canvas);
      simulation = createSimulation(parameters, { wake, enabled });
      attachPointerInteractions(scene, null, parameters, simulation, enabled);
    }
    if (!renderer.init()) {
      unavailable = true;
      return;
    }
    ready = true;
    resize(); // Submit the resting diagonal before revealing the canvas.
  } catch (error) {
    unavailable = true;
    console.warn(
      "Wave animation unavailable; keeping the CSS diagonal.",
      error,
    );
  } finally {
    initializing = false;
  }
}
function scheduleInitialization() {
  if (
    ready ||
    initializing ||
    unavailable ||
    reduced.matches ||
    document.hidden
  )
    return;
  initializing = true;
  // Give the CSS separator a paint opportunity before loading/compiling WebGL.
  requestAnimationFrame(() => requestAnimationFrame(initialize));
}
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  stop();
  ready = false;
  canvas.classList.remove("is-ready");
  simulation?.reset();
  renderer?.lost();
});
canvas.addEventListener("webglcontextrestored", () => {
  renderer?.restored();
  unavailable = false;
  scheduleInitialization();
});
reduced.addEventListener("change", () => {
  if (reduced.matches) {
    stop();
    simulation?.reset();
    canvas.classList.remove("is-ready");
  } else if (ready) resize();
  else scheduleInitialization();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stop();
  else if (ready) {
    draw();
    if (simulation.waves.length) wake();
  } else scheduleInitialization();
});
window.addEventListener("resize", resize);
new ResizeObserver(resize).observe(scene);
resize();
scheduleInitialization();

// Paint only the selected text's rectangles behind the difference-blended text.
// This preserves the appearance of every unselected character on either backdrop.
const selectionLayer = document.createElement("div");
selectionLayer.className = "selection-layer";
selectionLayer.setAttribute("aria-hidden", "true");
document.querySelector("#content").prepend(selectionLayer);
function paintSelection() {
  const selection = document.getSelection();
  const boxes = document.createDocumentFragment();
  document.querySelectorAll("[data-selectable]").forEach((element) => {
    const selected = Boolean(
      selection &&
        !selection.isCollapsed &&
        selection.containsNode(element, true),
    );
    element.classList.toggle("is-selected", selected);
    if (!selected) return;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      for (let i = 0; i < selection.rangeCount; i++) {
        const selectedRange = selection.getRangeAt(i);
        if (!selectedRange.intersectsNode(node)) continue;
        const range = document.createRange();
        range.setStart(
          node,
          selectedRange.startContainer === node ? selectedRange.startOffset : 0,
        );
        range.setEnd(
          node,
          selectedRange.endContainer === node
            ? selectedRange.endOffset
            : node.length,
        );
        for (const rect of range.getClientRects()) {
          if (!rect.width || !rect.height) continue;
          const box = document.createElement("div");
          const logoBounds = element.classList.contains("brand-text")
            ? element.closest(".brand").getBoundingClientRect()
            : null;
          Object.assign(box.style, {
            left: `${rect.left}px`,
            top: `${logoBounds ? logoBounds.top : rect.top}px`,
            width: `${rect.width}px`,
            height: `${logoBounds ? logoBounds.height : rect.height}px`,
          });
          boxes.append(box);
        }
      }
    }
  });
  selectionLayer.replaceChildren(boxes);
}
document.addEventListener("selectionchange", paintSelection);
window.addEventListener("resize", paintSelection);
document.fonts.ready.then(paintSelection);

// Start once the real font is ready; never reveal a fallback-font intro.
document.fonts
  .load('400 18px "Algorytm"')
  .then(async (fonts) => {
    if (!fonts.length) return;
    await document.fonts.ready;
    document.documentElement.classList.add("intro-ready");
  })
  .catch((error) =>
    console.warn("Waiting for the brand font; keeping text hidden.", error),
  );
