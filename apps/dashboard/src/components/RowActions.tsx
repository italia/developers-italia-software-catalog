import { Link } from "react-router";
import { Icon } from "./Icon.tsx";

/** Azioni di una riga per gli ADMIN: modifica (link) ed elimina (apre la conferma). */
export function RowActions({ editTo, label, onDelete }: { editTo: string; label: string; onDelete: () => void }) {
  return (
    <span className="flex items-center gap-1">
      <Link to={editTo} className="ita-btn ita-btn-ghost ita-btn-xs ita-btn-square" title={`Modifica ${label}`} aria-label={`Modifica ${label}`}>
        <Icon name="it-pencil" className="size-4" />
      </Link>
      <button
        type="button"
        className="ita-btn ita-btn-ghost ita-btn-xs ita-btn-square text-error"
        title={`Elimina ${label}`}
        aria-label={`Elimina ${label}`}
        onClick={onDelete}
      >
        <Icon name="it-delete" className="size-4" />
      </button>
    </span>
  );
}
