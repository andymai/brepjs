// Insecure HTTP origins, sandboxed iframes, and a few older browsers expose
// `navigator.clipboard` as undefined; calling `?.writeText(...)` then chaining
// `.then(...)` throws synchronously. Guard explicitly and report success/fail.
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
