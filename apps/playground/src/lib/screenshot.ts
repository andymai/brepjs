// Captures the playground viewer's canvas as a PNG and triggers a download.
// Resolves to true if the file was offered to the user, false otherwise.
//
// The R3F Canvas is created with `preserveDrawingBuffer: true` so the GPU
// buffer survives between frames — `toBlob` would otherwise return null on
// browsers that auto-clear after present.
//
// Uses `canvas.toBlob` instead of `toDataURL` so PNG compression hands off
// to the browser thread instead of stalling the JS event loop. On a 2x
// retina viewport (~5 MP, ~20 MB raw), the sync path can freeze the UI for
// hundreds of milliseconds.
export function downloadViewerScreenshot(
  filename = `brepjs-${Date.now()}.png`
): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  // The viewer is the only canvas the playground mounts, so a single
  // querySelector is sufficient. If we ever add a second canvas (e.g. a
  // sketch overlay), the lookup needs scoping to the viewer container.
  const canvas = document.querySelector('canvas');
  if (!canvas) return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(false);
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = filename;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        resolve(true);
      }, 'image/png');
    } catch {
      // Cross-origin tainted canvas would throw here; brepjs draws no foreign
      // textures so this is unexpected, but we'd rather no-op than crash.
      resolve(false);
    }
  });
}
