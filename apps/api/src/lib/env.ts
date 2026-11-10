// Variabili d'ambiente della dashboard e delle email, lette a ogni uso (così i test
// possono cambiarle) e normalizzate.

const list = (name: string) =>
  (process.env[name] ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

export const env = {
  dashboardUrl: () => (process.env.DASHBOARD_URL ?? "http://localhost:5173").replace(/\/$/, ""),
  allowedDomains: () => list("DASHBOARD_ALLOWED_EMAIL_DOMAINS"),
  allowedEmails: () => list("DASHBOARD_ALLOWED_EMAILS"),
  adminEmails: () => list("DASHBOARD_ADMIN_EMAILS"),
  magicLinkTtlMinutes: () => Number(process.env.MAGIC_LINK_TTL_MINUTES ?? 15),
  sessionTtlHours: () => Number(process.env.SESSION_TTL_HOURS ?? 8),
  onboardingTtlHours: () => Number(process.env.ONBOARDING_CONFIRM_TTL_HOURS ?? 72),
};

/**
 * Chi può entrare nella dashboard: dominio esatto (niente sottodomini, niente endsWith
 * sull'intera stringa), indirizzi elencati, amministratori.
 */
export function canLogin(email: string): boolean {
  const e = email.toLowerCase();
  if (env.adminEmails().includes(e) || env.allowedEmails().includes(e)) return true;
  const domain = e.slice(e.lastIndexOf("@") + 1);
  return e.includes("@") && env.allowedDomains().includes(domain);
}

export const roleFor = (email: string): "ADMIN" | "VIEWER" => (env.adminEmails().includes(email.toLowerCase()) ? "ADMIN" : "VIEWER");
