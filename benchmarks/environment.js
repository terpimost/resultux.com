/** Collect driver identity separately from the timed workload. */
export function graphicsInfo() {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl");
  if (!gl) return { available: false };
  const extension = gl.getExtension("WEBGL_debug_renderer_info");
  const info = {
    available: true,
    vendor: gl.getParameter(
      extension ? extension.UNMASKED_VENDOR_WEBGL : gl.VENDOR,
    ),
    renderer: gl.getParameter(
      extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER,
    ),
    version: gl.getParameter(gl.VERSION),
  };
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return info;
}
