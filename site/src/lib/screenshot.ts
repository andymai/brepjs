// Captures the playground viewer's canvas as a PNG and triggers a download.
// Returns true if the capture started, false if no canvas was found.
//
// The R3F Canvas is created with `preserveDrawingBuffer: true` so the GPU
// buffer survives between frames — `toDataURL` would otherwise return a
// blank image on browsers that auto-clear after present.
export function downloadViewerScreenshot(filename = `brepjs-${Date.now()}.png`): boolean {
  if (typeof document === 'undefined') return false;
  // The viewer is the only canvas the playground mounts, so a single
  // querySelector is sufficient. If we ever add a second canvas (e.g. a
  // sketch overlay), the lookup needs scoping to the viewer container.
  const canvas = document.querySelector('canvas');
  if (!canvas) return false;
  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL('image/png');
  } catch {
    // Cross-origin tainted canvas would throw here; brepjs draws no foreign
    // textures so this is unexpected, but we'd rather no-op than crash.
    return false;
  }
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return true;
}
