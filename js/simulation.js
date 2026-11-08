/**
 * CSS-pixel wave model shared by both renderers. u spans -0.5…1.5 so the
 * diagonal extends beyond the viewport; N is the number of sampled segments.
 * advance() owns simulation time; launch() snapshots the current parameters.
 */
export function createSimulation(
  P,
  {
    wake = () => {},
    enabled = () => true,
    random = Math.random,
    sampleSpacing = 2,
  } = {},
) {
  if (!Number.isFinite(sampleSpacing) || sampleSpacing <= 0) {
    throw new RangeError(
      "Sample spacing must be a positive CSS-pixel distance",
    );
  }
  const TAU = 2 * Math.PI,
    ROUND = 44,
    CUTOFF = 0.25,
    MAX_WAVES = 48,
    MAX_SAMPLES = 4096,
    STEP = 0.01;
  const profiles = new Map(),
    waves = [];
  let w = 1,
    h = 1,
    L = 1,
    nx = 0,
    ny = 0,
    N = 256,
    us = new Float32Array(257),
    ds = new Float32Array(257),
    simTime = 0,
    evals = 0;
  function peak(freq, duration) {
    let m = 0.001;
    for (let t = 0.004; t < Math.min(16, duration * 6); t += 0.008) {
      const v = Math.abs(
        (1 - Math.exp(-5 * t)) *
          Math.exp(-t / duration) *
          Math.sin(TAU * freq * t),
      );
      if (v > m) m = v;
    }
    return m;
  }
  function profile(freq, duration) {
    const key = Math.round(freq * 1000) + "/" + duration;
    if (profiles.has(key)) return profiles.get(key);
    const table = new Float32Array(1601),
      norm = peak(freq, duration);
    for (let i = 0; i < table.length; i++) {
      const t = i * STEP;
      table[i] =
        ((1 - Math.exp(-5 * t)) *
          Math.exp(-t / duration) *
          Math.sin(TAU * freq * t)) /
        norm;
    }
    if (profiles.size > 120) profiles.clear();
    profiles.set(key, table);
    return table;
  }
  function sample(table, t) {
    if (t <= 0 || t >= 16) return 0;
    const x = t / STEP,
      i = x | 0;
    return table[i] + (table[i + 1] - table[i]) * (x - i);
  }
  function waveValue(a, u) {
    const dx = (u - a.u) * L,
      dist = Math.sqrt(dx * dx + ROUND * ROUND) - ROUND,
      t = simTime - a.born - dist / a.speed;
    if (t <= 0 || t >= a.life) return 0;
    const maxDist = Math.max(1, (u < a.u ? a.u : 1 - a.u) * L),
      r = Math.min(1, dist / maxDist);
    return (
      a.sign * a.amp * (1 + a.growth * r * r * (3 - 2 * r)) * sample(a.table, t)
    );
  }
  function direction(q) {
    let d = 0;
    for (const a of waves) d += waveValue(a, q.u);
    const bx = q.u * w + nx * d,
      by = (1 - q.u) * h + ny * d;
    return (q.x - bx) * nx + (q.y - by) * ny < 0 ? 1 : -1;
  }
  function launch(u, amp, sign, kind) {
    if (!enabled() || amp <= 0) return;
    const duration =
        kind === "drag"
          ? 1.25
          : kind === "impact"
            ? 1.7
            : kind === "release"
              ? 1.8
              : 2.8,
      freq = P.frequency * (0.97 + 0.06 * random());
    waves.push({
      u,
      amp,
      sign,
      born: simTime,
      speed: Math.max(20, P.speed),
      growth: P.growth,
      duration,
      life: duration * 5.5,
      norm: peak(freq, duration),
      table: profile(freq, duration),
    });
    if (waves.length > MAX_WAVES) waves.shift();
    wake();
  }
  function prune() {
    for (let i = waves.length - 1; i >= 0; i--) {
      const a = waves[i],
        age = simTime - a.born;
      const far = Math.max(a.u + 0.5, 1.5 - a.u) * L,
        arrival = (Math.sqrt(far * far + ROUND * ROUND) - ROUND) / a.speed;
      const youngest = Math.max(0, age - arrival);
      const bound =
        (a.amp *
          (1 + Math.max(0, a.growth)) *
          Math.exp(-youngest / a.duration)) /
        a.norm;
      if (age > arrival + a.life || bound < CUTOFF) waves.splice(i, 1);
    }
  }
  function compute() {
    ds.fill(0);
    evals = 0;
    for (const a of waves) {
      const age = simTime - a.born;
      if (age <= 0) continue;
      const travel = a.speed * age,
        reach = Math.sqrt(Math.max(0, travel * (travel + 2 * ROUND))) / L;
      const lo = Math.max(0, Math.ceil(((a.u - reach + 0.5) * N) / 2)),
        hi = Math.min(N, Math.floor(((a.u + reach + 0.5) * N) / 2));
      for (let i = lo; i <= hi; i++) {
        const u = us[i],
          dx = (u - a.u) * L,
          dist = Math.sqrt(dx * dx + ROUND * ROUND) - ROUND,
          t = age - dist / a.speed;
        if (t <= 0 || t >= a.life) continue;
        const maxDist = Math.max(1, (u < a.u ? a.u : 1 - a.u) * L),
          r = Math.min(1, dist / maxDist);
        ds[i] +=
          a.sign *
          a.amp *
          (1 + a.growth * r * r * (3 - 2 * r)) *
          sample(a.table, t);
        evals++;
      }
    }
  }
  function resize(width, height) {
    w = width;
    h = height;
    L = Math.hypot(w, h);
    nx = h / L;
    ny = w / L;
    // The sampled domain spans twice the viewport diagonal. Keep segments
    // near 2 CSS px instead of the original 10 px, including on large screens.
    N = Math.max(96, Math.min(MAX_SAMPLES, Math.ceil((2 * L) / sampleSpacing)));
    us = new Float32Array(N + 1);
    ds = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) us[i] = -0.5 + (2 * i) / N;
  }
  return {
    waves,
    launch,
    direction,
    compute,
    prune,
    resize,
    reset() {
      waves.length = 0;
    },
    advance(dt) {
      simTime += dt;
    },
    get time() {
      return simTime;
    },
    get w() {
      return w;
    },
    get h() {
      return h;
    },
    get L() {
      return L;
    },
    get nx() {
      return nx;
    },
    get ny() {
      return ny;
    },
    get N() {
      return N;
    },
    get us() {
      return us;
    },
    get ds() {
      return ds;
    },
    get evals() {
      return evals;
    },
  };
}
