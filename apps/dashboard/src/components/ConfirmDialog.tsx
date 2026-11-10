import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon.tsx";

interface Props {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** Se lancia, l'errore resta nel dialogo */
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

/** Dialogo modale nativo (<dialog>) con l'aspetto .italia (ita-modal). */
export function ConfirmDialog({ open, title, children, confirmLabel, danger, onConfirm, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setError(null);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} className={`modal ita-modal ita-modal-alert`} aria-labelledby={titleId} onClose={onClose}>
      <div className="modal-box">
        <button type="button" className="ita-modal-close" aria-label="Chiudi" onClick={onClose}>
          <Icon name="it-close" />
        </button>
        <div className={`ita-modal-icon ${danger ? "ita-modal-icon-danger" : "ita-modal-icon-primary"}`}>
          <Icon name={danger ? "it-warning-circle" : "it-check-circle"} className="size-12" />
        </div>
        <h2 id={titleId} className="ita-modal-title">
          {title}
        </h2>
        <div className="ita-modal-body text-start">
          {children}
          {error && (
            <div role="alert" className="ita-alert ita-alert-danger mt-4">
              <div>{error}</div>
            </div>
          )}
        </div>
        <div className="modal-action justify-center">
          <button type="button" className="ita-btn ita-btn-outline ita-btn-primary" onClick={onClose} disabled={busy}>
            Annulla
          </button>
          <button
            type="button"
            className={`ita-btn ${danger ? "ita-btn-danger" : "ita-btn-primary"}`}
            onClick={() => void confirm()}
            disabled={busy}
          >
            {busy && <span className="ita-spinner ita-spinner-sm" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="submit" aria-label="Chiudi" />
      </form>
    </dialog>
  );
}
