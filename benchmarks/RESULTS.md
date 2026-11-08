# Shader wave comparison

Host: Apple M2 Pro, macOS Darwin 25.5.0, arm64. Playwright Chromium 141,
headless, SwiftShader software WebGL. Mobile is a 390×464 CSS-pixel workload at
2× DPR with viewport/touch emulation on this same host. These measurements describe
CPU savings on the development host, not a physical phone or hardware GPU.

Three trials per path/profile, 120 warmup + 600 measured frames per trial,
seed 20261107. The CPU-backed WebGL baseline runs the original CPU displacement
calculation and streams its vertices. The shader path skips that calculation,
uploads only per-wave descriptors/new profiles, and keeps geometry on the GPU.
Canvas retains the CPU calculation. Run order reverses each trial.

CPU includes impulses, pruning and render submission; CPU paths also include
sampling. The table averages the three trial means; intervals over 25 ms are summed.

| Profile | Path      | Mean CPU ms/frame | Mean FPS | Intervals >25 ms |
| ------- | --------- | ----------------: | -------: | ---------------: |
| desktop | webgl-cpu |             0.097 |    59.94 |                1 |
| desktop | webgl     |             0.037 |    60.00 |                0 |
| desktop | canvas    |             0.112 |    60.00 |                0 |
| mobile  | webgl-cpu |             0.078 |    60.00 |                0 |
| mobile  | webgl     |             0.040 |    59.74 |                6 |
| mobile  | canvas    |             0.206 |    60.00 |                0 |

- desktop: CPU frame work fell from 0.097 ms to 0.037 ms (61% lower).
- mobile: CPU frame work fell from 0.078 ms to 0.040 ms (48% lower).

All paths stayed close to the 60 FPS cap, with occasional long frame intervals.
The result demonstrates less JavaScript/CPU work, not a higher maximum rendering
rate or faster GPU execution. CPU timings exclude asynchronous GPU completion;
timer granularity is coarse relative to these sub-millisecond costs. Use repeated,
otherwise idle physical-device runs before drawing hardware performance conclusions.

Raw distributions, actual wave-evaluation mode, driver identity and workload:
[desktop](results/desktop.json), [mobile emulation](results/mobile.json).
The initial version 1 results remain available as
[baseline desktop](results/baseline-desktop.json) and
[baseline mobile emulation](results/baseline-mobile.json); the table above uses
fresh side-by-side runs with the same version 2 harness.

Run `npm run benchmark` to reproduce. The browser benchmark page runs the same
comparison on actual desktop/mobile devices and exports JSON; see the root README.
No physical mobile or hardware-GPU measurements were available in this workspace.

These recordings precede the fill-triangulation correction and the denser 2 CSS-pixel mesh. The current renderer
fills along the diagonal normal and skips wave evaluation on the offscreen rail;
its timings have not been remeasured here.

A short post-density smoke check (48 active waves, 30 warmup + 120 observed frames,
shader path, same headless software driver) sustained about 60 FPS at 1440×900 @1×
and 390×844 @2×, without observed intervals over 25 ms. This is a responsiveness
check, not a replacement for the full comparison above or physical-device QA.
