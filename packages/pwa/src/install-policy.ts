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

export function isIOSUserAgent(userAgent: string): boolean {
  return /iPad|iPhone|iPod/.test(userAgent);
}
