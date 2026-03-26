/**
 * Shared flags for Apex Terminal L1 onboarding (see AuthGate).
 */
export function isTerminalAuthDisabled(): boolean {
  const v = import.meta.env.VITE_TERMINAL_AUTH_DISABLED;
  if (v === "false" || v === "0") return false;
  if (v === "true" || v === "1") return true;
  return import.meta.env.DEV;
}
