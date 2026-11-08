# Resultux wave

A dependency-free browser prototype with WebGL 1 and Canvas 2D rendering.

Run `npm start` (or `python3 -m http.server 8000`) and open
[the page](http://localhost:8000/). ES modules require HTTP.
The default [`index.html`](index.html) is a full-screen, non-scrollable page with
no visible controls, using the supplied SVG wordmark and local Algorytm font. Its CSS diagonal paints immediately, before loading
animation code. WebGL is initialized after a paint opportunity and shown only
after submitting its first frame. Unsupported WebGL, reduced motion, failed
initialization and context loss leave the static CSS separator visible. There is
no Canvas 2D fallback or import on this page. The `.content` layer contains the wordmark and is reserved
for the next design step and sits above the backgrounds with safe-area padding.

Mobile sizing uses `100dvh` to track the space available with browser toolbars,
with an `innerHeight` fallback for older browsers. The scene is fixed and does not
scroll or rubber-band; pinch zoom remains enabled. ResizeObserver keeps WebGL's
CSS-pixel geometry and backing buffer aligned through viewport/orientation changes,
with DPR capped at 2×. Browser toolbars may stay visible on a non-scrollable page;
the layout fits the available area rather than relying on bars collapsing. See
[dynamic viewport units](https://web.dev/blog/viewport-units) for the sizing model.
Physical Safari/Android toolbar behavior still needs device QA; automated tests
exercise mobile viewport resizing, rotation, touch and static failure modes.

The original [`resultux-wave.html`](resultux-wave.html) remains a diagnostic demo;
Canvas code is retained only for this demo and the renderer benchmark.
All nine sliders, renderer selection, reset, pause, fullscreen, pointer movement,
click/tap, drag and release retain their original behavior. Reduced motion disables
impulses; offscreen/hidden animation sleeps; WebGL context loss selects Canvas.

- `js/simulation.js`: wave profiles, propagation, pruning and sampled geometry;
  injectable randomness and explicit simulation time allow deterministic replay.
- `js/pointer.js`: pointer capture, velocity thresholds, drag spacing and impulses.
- `js/renderers/`: WebGL triangle strip and Canvas polygon, using the same sample positions.
  `wave-shader.js` evaluates propagation, delayed waveform interpolation, outward
  growth, summation and vertex placement in the vertex shader. Geometry uploads
  only when the sample count changes; waveform textures upload only for new waves.
- `js/performance.js`: live CPU/FPS monitoring and benchmark summaries.
- `js/app.js`: controls, sizing, renderer selection and animation lifecycle.

## Verification

`npm ci && npx playwright install chromium` installs development tools.
`npm test` checks simulation invariants, browser controls, fallback/recovery, reduced
motion and Canvas/WebGL pixel agreement (allowing edge antialiasing differences).
Landing tests cover CSS without JavaScript, WebGL unavailability/context loss,
reduced motion, no idle animation loop, touch response and changing mobile sizes.
GPU tests cover 48 waves, extreme settings, profile reuse, resize, long-running
simulation time, context restoration and capability fallback. An independent
pixel-fill check projects into diagonal coordinates to catch folded triangles,
including 48 reinforcing impulses in landscape and portrait. `npm run format`
formats source files.

## Shader evaluation

WebGL skips CPU displacement sampling and per-frame vertex-buffer uploads. A
small uniform array describes the active waves; an RGB24 texture atlas holds the
original normalized lookup tables. The shader interpolates those same tables to
preserve their timing and cached frequency behavior. CPU work still includes
launching/pruning waves, preparing new profiles and evaluating the wave side for
pointer impulses. Canvas continues to use the CPU model. The fill strips extend
along the diagonal normal, rather than vertical screen columns, so overlapping
waves cannot fold the fill into a vertical edge. Only boundary vertices evaluate
waves; the opposite rail stays offscreen. The curve mesh targets 2 CSS pixels
per segment (previously about 10), with a 4096-segment cap. This reduces faceting
on large waves while bounding work at very large viewport sizes.

The renderer checks vertex texture and uniform limits and falls back to the
original CPU-backed WebGL path if needed or if the wave shader cannot compile.
WebGL 1 makes vertex texture access optional; see the
[WebGL specification](https://registry.khronos.org/webgl/specs/latest/1.0/).
Context loss still falls back to Canvas, and restoration rebuilds the shader,
static geometry and live profile textures. Live stats show `Evaluations GPU`
when shader evaluation is active.

## Reproducible benchmark

Open [the benchmark](http://localhost:8000/benchmark.html), select a desktop or
mobile workload, run the comparison, then download JSON. For actual desktop/mobile
comparisons, run this page on each physical device (serve on your LAN), using the
same browser version when possible. Record device model, OS, browser, power mode
and thermal conditions alongside the JSON. Keep the page foregrounded and avoid
other work. Visibility changes or context loss invalidate a run.

`npm run benchmark` launches pinned Playwright Chromium, runs both profiles, and
writes `benchmarks/results/{desktop,mobile}.json`. The mobile profile emulates
viewport, touch and DPR on the host CPU/GPU; it **does not measure mobile hardware**.
Headless GPU drivers may differ from a normal browser. Use physical-device browser
runs for performance conclusions about phones.

Each profile runs three trials per path, reversing run order each trial:
`webgl-cpu` is the original CPU sampling + WebGL submission path; `webgl` uses
shader evaluation where supported; `canvas` is Canvas 2D. The `waveEvaluation`
field identifies the actual path, including fallback. Each trial
starts with the same seed (20261107), 120 warmup frames, then 600 measured frames.
Simulation advances by exactly 1/60 second per drawn frame; a fixed click/drag/release
sequence exercises the 48-wave limit. Desktop uses 1440×594 CSS pixels at 1×;
mobile uses 390×464 at 2×. The same profile has identical sample counts, wave
parameters and backing resolution for all paths. The frame cap matches the
prototype. It measures smoothness under the cap rather than maximum throughput.

JSON reports mean/p50/p95 total CPU, simulation CPU, renderer submission CPU,
frame interval, achieved FPS and intervals over 25 ms. CPU measurements do not
wait for GPU completion; FPS/intervals reflect scheduling and presentation pressure,
not isolated GPU execution time. Compare distributions across trials, not a single
small CPU difference. WebGL unavailable is reported explicitly, never as Canvas
results under a WebGL label. Output includes browser, DPR, seed, dimensions and
workload settings so runs can be repeated. Version 2 includes the CPU-backed
WebGL baseline. Earlier version 1 outputs are retained as
`benchmarks/results/baseline-{desktop,mobile}.json`.

Recorded host results and interpretation are in [`benchmarks/RESULTS.md`](benchmarks/RESULTS.md).
