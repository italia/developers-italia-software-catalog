import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useId } from "react";

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
}

function FieldShell({ id, label, hint, error, required, className, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className={`ita-field ${className ?? ""}`}>
      <label className="ita-label" htmlFor={id}>
        {label} {required && <span className="ita-required" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="ita-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="ita-feedback ita-feedback-invalid">
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id: string, hint?: ReactNode, error?: string) =>
  [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;

export function TextField({ label, hint, error, required, className, ...input }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <input
        id={id}
        className={`ita-input w-full ${error ? "ita-invalid" : ""}`}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...input}
      />
    </FieldShell>
  );
}

export function TextArea({ label, hint, error, required, className, ...input }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <textarea
        id={id}
        className={`ita-textarea w-full ${error ? "ita-invalid" : ""}`}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...input}
      />
    </FieldShell>
  );
}

export function SelectField({ label, hint, error, required, className, children, ...input }: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <select id={id} className="ita-select w-full" required={required} aria-describedby={describedBy(id, hint, error)} {...input}>
        {children}
      </select>
    </FieldShell>
  );
}

export function Checkbox({ label, hint, checked, onChange, required }: { label: ReactNode; hint?: string; checked: boolean; onChange: (v: boolean) => void; required?: boolean }) {
  const id = useId();
  return (
    <label className="ita-choice" htmlFor={id}>
      <input id={id} type="checkbox" className="ita-checkbox" checked={checked} required={required} onChange={(e) => onChange(e.target.checked)} />
      <span className="ita-choice-text">
        <span>{label}</span>
        {hint && <span className="ita-choice-hint">{hint}</span>}
      </span>
    </label>
  );
}

/** Esito di un invio: errore o conferma, annunciato dagli screen reader. */
export function FormAlert({ kind, children }: { kind: "danger" | "success" | "warning"; children: ReactNode }) {
  return (
    <div role={kind === "danger" ? "alert" : "status"} className={`ita-alert ita-alert-${kind}`}>
      <div>{children}</div>
    </div>
  );
}

export function SubmitButton({ busy, children, className }: { busy: boolean; children: ReactNode; className?: string }) {
  return (
    <button type="submit" className={`ita-btn ita-btn-primary ${className ?? ""}`} disabled={busy}>
      {busy && <span className="ita-spinner ita-spinner-sm" aria-hidden="true" />}
      {children}
    </button>
  );
}
