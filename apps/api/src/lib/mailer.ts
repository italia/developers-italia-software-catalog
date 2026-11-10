import nodemailer, { type Transporter } from "nodemailer";

// Invio delle email (magic link, conferma dell'onboarding) con le variabili SMTP_*.
// In sviluppo arrivano in Mailpit (bun run infra:mail, http://localhost:8025).
// Da spostare in packages/mailer con i template MJML di onboarding-italia (Fase 6).

let transporter: Transporter | null = null;

function transport(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "localhost",
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USERNAME ? { user: process.env.SMTP_USERNAME, pass: process.env.SMTP_PASSWORD ?? "" } : undefined,
  });
  return transporter;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  cc?: string;
  bcc?: string;
}

/** Sostituibile nei test. */
export const mailer = {
  async send(mail: Mail) {
    // EMAIL_OVERRIDE_RECIPIENT (solo sviluppo/staging) reindirizza tutto, copie comprese.
    const override = process.env.EMAIL_OVERRIDE_RECIPIENT;
    await transport().sendMail({
      from: process.env.EMAIL_FROM ?? "no-reply@developers.italia.it",
      to: override || mail.to,
      cc: override ? undefined : mail.cc,
      bcc: override ? undefined : mail.bcc,
      subject: override ? `[per ${mail.to}] ${mail.subject}` : mail.subject,
      text: mail.text,
      html: mail.html,
    });
  },
};

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** HTML minimo con i colori .italia; i paragrafi sono testo, i link vengono resi pulsanti. */
export function mailHtml(title: string, paragraphs: string[], actions: { label: string; url: string }[] = []) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${escape(p)}</p>`).join("");
  const buttons = actions
    .map(
      (a) =>
        `<a href="${escape(a.url)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 20px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px;font-weight:600">${escape(a.label)}</a>`,
    )
    .join("");
  return `<!doctype html><html lang="it"><body style="margin:0;padding:24px;background:#f5f5f5;font-family:'Titillium Web',Geneva,Tahoma,sans-serif;color:#1a1a1a">
<div style="max-width:560px;margin:0 auto;background:#fff;padding:32px;border-top:4px solid #0066cc">
<p style="margin:0 0 8px;color:#5c6f82;font-size:14px">Developers Italia · Catalogo del software</p>
<h1 style="margin:0 0 24px;font-size:24px">${escape(title)}</h1>${body}<div style="margin-top:8px">${buttons}</div>
</div></body></html>`;
}
