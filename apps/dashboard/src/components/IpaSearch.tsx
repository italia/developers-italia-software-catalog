import { useEffect, useId, useRef, useState } from "react";
import { api, type IpaEntityDto } from "../lib/api.ts";

interface Props {
  label: string;
  hint?: string;
  required?: boolean;
  value: IpaEntityDto | null;
  onChange: (entity: IpaEntityDto | null) => void;
}

/**
 * Ricerca di un ente nell'anagrafica IndicePA (per nome, codice IPA o codice fiscale),
 * con il pattern combobox di WAI-ARIA: frecce per scegliere, Invio per confermare.
 */
export function IpaSearch({ label, hint, required, value, onChange }: Props) {
  const id = useId();
  const [text, setText] = useState(value?.description ?? "");
  const [results, setResults] = useState<IpaEntityDto[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const skip = useRef(false);

  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    const q = text.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      api<{ data: IpaEntityDto[] }>("GET", `/ipa-entities?q=${encodeURIComponent(q)}&limit=10`, undefined, controller.signal)
        .then((r) => {
          setResults(r.data);
          setOpen(true);
          setActive(-1);
        })
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [text]);

  const choose = (e: IpaEntityDto) => {
    skip.current = true;
    setText(e.description);
    setOpen(false);
    onChange(e);
  };

  return (
    <div className="ita-field relative max-w-none">
      <label className="ita-label" htmlFor={id}>
        {label} {required && <span className="ita-required" aria-hidden="true">*</span>}
      </label>
      <input
        id={id}
        type="search"
        role="combobox"
        autoComplete="off"
        className="ita-input w-full"
        aria-expanded={open && results.length > 0}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
        aria-describedby={hint ? `${id}-hint` : undefined}
        required={required}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (value) onChange(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && open && active >= 0 && results[active]) {
            e.preventDefault();
            choose(results[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {loading && <span className="ita-spinner ita-spinner-sm absolute end-3 top-11" aria-hidden="true" />}
      {hint && (
        <p id={`${id}-hint`} className="ita-hint">
          {hint}
        </p>
      )}
      {open && results.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="ipa-results">
          {results.map((e, i) => (
            <li
              key={e.ipa}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "ipa-result-active" : undefined}
              onMouseDown={(ev) => {
                ev.preventDefault();
                choose(e);
              }}
            >
              <span className="font-semibold">{e.description}</span>
              <span className="text-sm">
                Codice IPA <code>{e.ipa}</code>
                {e.category ? ` · ${e.category}` : ""}
                {e.publisherId ? " · già nel catalogo" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && !loading && text.trim().length >= 2 && results.length === 0 && (
        <p className="ita-hint" role="status">
          Nessun ente trovato in IndicePA.
        </p>
      )}
    </div>
  );
}
