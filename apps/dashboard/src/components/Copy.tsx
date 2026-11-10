import { type ReactNode, useEffect, useState } from "react";
import { Icon } from "./Icon.tsx";

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  // Contesti non sicuri (http su un host che non è localhost): fallback con execCommand.
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

/** Pulsante con l'icona "copia": copia `value` negli appunti e conferma per 1,5 secondi. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      className={`copy-btn ${copied ? "copy-btn-done" : ""}`}
      title={copied ? "Copiato" : `Copia ${label}`}
      aria-label={copied ? `${label} copiato` : `Copia ${label}`}
      onClick={(e) => {
        e.stopPropagation();
        void writeClipboard(value).then(() => setCopied(true));
      }}
    >
      <Icon name={copied ? "it-check" : "it-copy"} className="size-4" />
      <span className="sr-only" aria-live="polite">
        {copied ? "Copiato negli appunti" : ""}
      </span>
    </button>
  );
}

/**
 * Cella di tabella con il valore e, accanto, il pulsante copia (visibile al passaggio
 * del mouse o con il focus da tastiera). Senza valore non mostra il pulsante.
 */
export function CopyCell({ value, label, children }: { value: string | null | undefined; label: string; children?: ReactNode }) {
  return (
    <span className="copy-cell">
      <span className="copy-cell-value">{children ?? value ?? "—"}</span>
      {value ? <CopyButton value={value} label={label} /> : null}
    </span>
  );
}
