// Captured once at startup — components that mount later can still access it.
let _prompt: any = null;
const _listeners = new Set<() => void>();

export function initPwaInstallCapture() {
  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    _prompt = e;
    _listeners.forEach((fn) => fn());
  });
}

export function getPwaInstallPrompt() {
  return _prompt;
}

export function clearPwaInstallPrompt() {
  _prompt = null;
}

export function onPwaInstallPromptReady(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
