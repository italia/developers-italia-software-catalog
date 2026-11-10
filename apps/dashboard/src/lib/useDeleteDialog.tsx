import { type ReactNode, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { api } from "./api.ts";

interface Options<T> {
  title: string;
  /** Percorso dell'API per DELETE */
  path: (row: T) => string;
  body: (row: T) => ReactNode;
  onDeleted: (row: T) => void;
}

/** Conferma ed esecuzione di un DELETE: ask(riga) apre il dialogo, dialog va nel JSX. */
export function useDeleteDialog<T>({ title, path, body, onDeleted }: Options<T>) {
  const [target, setTarget] = useState<T | null>(null);
  const dialog = (
    <ConfirmDialog
      open={target !== null}
      title={title}
      confirmLabel="Elimina"
      danger
      onClose={() => setTarget(null)}
      onConfirm={async () => {
        if (!target) return;
        await api("DELETE", path(target));
        const row = target;
        setTarget(null);
        onDeleted(row);
      }}
    >
      {target !== null && body(target)}
    </ConfirmDialog>
  );
  return { ask: setTarget, dialog };
}
