export const DEFAULT_INSTALL_PROMPT_STORAGE_KEY = 'pwa-install-dismissed';
export const DEFAULT_INSTALL_PROMPT_COOLDOWN_MS = 1000 * 60 * 60 * 24 * 7;

export function isInstallPromptDue(
  lastPrompt: string | null,
  now = Date.now(),
  cooldownMs = DEFAULT_INSTALL_PROMPT_COOLDOWN_MS,
): boolean {
  if (!lastPrompt) return true;
  const timestamp = Number.parseInt(lastPrompt, 10);
  if (!Number.isFinite(timestamp)) return true;
  return now - timestamp > cooldownMs;
}

export function isIOSUserAgent(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;

  // Since iPadOS 13, Safari can identify an iPad as macOS when desktop-class
  // browsing is enabled. A touch-capable Macintosh UA distinguishes those
  // devices from ordinary Macs without relying on the deprecated platform API.
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}
