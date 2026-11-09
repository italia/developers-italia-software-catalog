#!/usr/bin/env bun
// Invia un'email di prova con la stessa configurazione SMTP_* che userà il mailer
// (packages/mailer, Fase 6 di new-plan.md). In locale l'email arriva in Mailpit.
//
//   bun run mail:test [--to indirizzo@esempio.it]
import { parseArgs } from "node:util";
import nodemailer from "nodemailer";

const { values } = parseArgs({ options: { to: { type: "string", default: "prova@innovazione.gov.it" } } });

const host = process.env.SMTP_HOST ?? "localhost";
const port = Number(process.env.SMTP_PORT ?? 1025);
const from = process.env.EMAIL_FROM ?? "no-reply@developers.italia.it";
const uiPort = process.env.MAILPIT_UI_PORT ?? "8025";

const transport = nodemailer.createTransport({
  host,
  port,
  secure: process.env.SMTP_SECURE === "true",
  ...(process.env.SMTP_USERNAME && {
    auth: { user: process.env.SMTP_USERNAME, pass: process.env.SMTP_PASSWORD ?? "" },
  }),
});

const sentAt = new Date().toLocaleString("it-IT");
const info = await transport.sendMail({
  from,
  to: values.to,
  subject: `Prova del mailer · ${sentAt}`,
  text: `Email di prova inviata da developers-italia-software-catalog il ${sentAt}.`,
  html: `<p>Email di prova inviata da <strong>developers-italia-software-catalog</strong> il ${sentAt}.</p>
<p><a href="http://localhost:5173/">Esempio di link come quello di accesso alla dashboard</a></p>`,
});
console.log(`inviata a ${values.to} tramite ${host}:${port} (Message-ID ${info.messageId})`);

// Con Mailpit in locale: verifica che sia arrivata e stampa il link per aprirla.
if (host === "localhost" || host === "127.0.0.1") {
  try {
    const res = await fetch(`http://${host}:${uiPort}/api/v1/messages?limit=20`);
    const { messages } = (await res.json()) as { messages: { ID: string; MessageID: string }[] };
    const id = info.messageId.replace(/^<|>$/g, "");
    const found = messages.find((m) => m.MessageID === id);
    console.log(found ? `ricevuta in Mailpit: http://${host}:${uiPort}/view/${found.ID}` : "non trovata in Mailpit");
    if (!found) process.exitCode = 1;
  } catch {
    console.log(`Mailpit non raggiungibile su http://${host}:${uiPort}: è avviato? (bun run infra:mail)`);
    process.exitCode = 1;
  }
}
