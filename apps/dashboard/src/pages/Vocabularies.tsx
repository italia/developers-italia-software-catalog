import type { VocabularyDetailDto, VocabularyDto, VocabularyTermDto } from "@sw-catalog/shared";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { CopyCell } from "../components/Copy.tsx";
import { Checkbox, TextArea, TextField } from "../components/Form.tsx";
import { Icon } from "../components/Icon.tsx";
import { ErrorAlert, Loading } from "../components/States.tsx";
import { api, useApi } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { formatDate } from "../lib/format.ts";
import { useDeleteDialog } from "../lib/useDeleteDialog.tsx";

// Liste editoriali del catalogo (D13): misure e beneficiari PNRR.
// Le liste nascono dal seed; gli ADMIN ne modificano nome, descrizione e voci.

const num = new Intl.NumberFormat("it-IT");

export function VocabulariesList() {
  const { data, loading, error } = useApi<{ data: VocabularyDto[] }>("/vocabularies");
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Liste editoriali</h1>
        <p className="text-base-content/70">
          Valori usati dal catalogo, come i filtri PNRR. Le tassonomie dello standard publiccode (categorie, ambiti…) non sono qui:
          cambiano con lo standard.
        </p>
      </header>
      {error && <ErrorAlert error={error} />}
      {loading && !data && <Loading />}
      {data && (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.data.map((v) => (
            <li key={v.id} className="flex flex-col gap-2 rounded-box border border-base-300 bg-base-100 p-4">
              <h2 className="!text-xl !m-0 font-semibold">
                <Link to={`/dashboard/liste/${v.id}`} className="ita-link">
                  {v.name}
                </Link>
              </h2>
              {v.description && <p className="text-sm text-base-content/70">{v.description}</p>}
              <p className="mt-auto text-sm">
                {num.format(v.activeTermCount)} voci attive
                {v.termCount > v.activeTermCount && <> su {num.format(v.termCount)}</>} · aggiornata il {formatDate(v.updatedAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface TermForm {
  key: string;
  labelIt: string;
  labelEn: string;
  active: boolean;
}

const emptyForm: TermForm = { key: "", labelIt: "", labelEn: "", active: true };
const formOf = (t: VocabularyTermDto): TermForm => ({ key: t.key, labelIt: t.labelIt ?? "", labelEn: t.labelEn ?? "", active: t.active });

export function VocabularyDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const { data: v, loading, error, reload } = useApi<VocabularyDetailDto>(`/vocabularies/${id}?all=true`);

  // Dialogo di creazione/modifica: target null = chiuso, "new" = nuova voce
  const [target, setTarget] = useState<VocabularyTermDto | "new" | null>(null);
  const [form, setForm] = useState<TermForm>(emptyForm);
  const [editingList, setEditingList] = useState(false);
  const [listForm, setListForm] = useState({ name: "", description: "" });
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<Error | null>(null);

  const del = useDeleteDialog<VocabularyTermDto>({
    title: "Eliminare la voce?",
    path: (t) => `/vocabularies/${id}/terms/${t.id}`,
    body: (t) => (
      <p>
        La voce <strong>{t.labelIt ?? t.key}</strong> (chiave <code>{t.key}</code>) sparirà dalla lista. Se serve solo nasconderla,
        disattivala: resta recuperabile.
      </p>
    ),
    onDeleted: reload,
  });

  if (loading && !v) return <Loading />;
  if (error || !v) return <ErrorAlert error={error ?? new Error("Lista non trovata")} />;

  const openTerm = (t: VocabularyTermDto | "new") => {
    setForm(t === "new" ? emptyForm : formOf(t));
    setTarget(t);
  };

  const saveTerm = async () => {
    const body = { key: form.key, labelIt: form.labelIt, labelEn: form.labelEn, active: form.active };
    if (target === "new") await api("POST", `/vocabularies/${id}/terms`, body);
    else if (target) await api("PATCH", `/vocabularies/${id}/terms/${target.id}`, body);
    setTarget(null);
    reload();
  };

  const toggle = async (t: VocabularyTermDto) => {
    await api("PATCH", `/vocabularies/${id}/terms/${t.id}`, { active: !t.active });
    reload();
  };

  const move = async (index: number, delta: -1 | 1) => {
    const ids = v.terms.map((t) => t.id);
    const other = index + delta;
    if (other < 0 || other >= ids.length) return;
    [ids[index], ids[other]] = [ids[other]!, ids[index]!];
    setMoving(true);
    setMoveError(null);
    try {
      await api("PUT", `/vocabularies/${id}/order`, { termIds: ids });
      reload();
    } catch (e) {
      setMoveError(e as Error);
    } finally {
      setMoving(false);
    }
  };

  const keyChanged = target !== null && target !== "new" && form.key.trim() !== target.key;

  return (
    <article className="space-y-6">
      <Link to="/dashboard/liste" className="ita-link inline-flex items-center gap-1">
        <Icon name="it-arrow-left" className="size-4" /> Tutte le liste
      </Link>

      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold">{v.name}</h1>
          {v.description && <p className="text-base-content/70">{v.description}</p>}
          <p className="text-sm text-base-content/70">
            Identificativo <code>{v.id}</code> · {num.format(v.activeTermCount)} voci attive su {num.format(v.termCount)} · aggiornata il{" "}
            {formatDate(v.updatedAt)}
          </p>
        </div>
        {isAdmin && (
          <span className="flex gap-2">
            <button
              type="button"
              className="ita-btn ita-btn-outline ita-btn-primary ita-btn-xs"
              onClick={() => {
                setListForm({ name: v.name, description: v.description ?? "" });
                setEditingList(true);
              }}
            >
              <Icon name="it-pencil" className="size-4" /> Modifica la lista
            </button>
            <button type="button" className="ita-btn ita-btn-primary ita-btn-xs" onClick={() => openTerm("new")}>
              <Icon name="it-plus" className="size-4" /> Nuova voce
            </button>
          </span>
        )}
      </header>

      {moveError && <ErrorAlert error={moveError} />}

      <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
        <table className="table">
          <caption className="sr-only">Voci della lista {v.name}, nell'ordine in cui vengono mostrate</caption>
          <thead>
            <tr>
              <th scope="col" className="w-12">
                #
              </th>
              <th scope="col">Chiave</th>
              <th scope="col">Etichetta (it)</th>
              <th scope="col">Etichetta (en)</th>
              <th scope="col">Stato</th>
              {isAdmin && (
                <th scope="col" className="text-end">
                  Azioni
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {v.terms.map((t, i) => (
              <tr key={t.id} className={t.active ? "" : "text-base-content/50"}>
                <td>{i + 1}</td>
                <td>
                  <CopyCell value={t.key} label="la chiave">
                    <code>{t.key}</code>
                  </CopyCell>
                </td>
                <td>{t.labelIt ? <CopyCell value={t.labelIt} label="l'etichetta" /> : <span title="Senza etichetta si mostra la chiave">—</span>}</td>
                <td>{t.labelEn ?? "—"}</td>
                <td>
                  <span className={`ita-badge ${t.active ? "ita-badge-success" : "ita-badge-secondary"}`}>{t.active ? "Attiva" : "Disattivata"}</span>
                </td>
                {isAdmin && (
                  <td>
                    <span className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        className="ita-btn ita-btn-ghost ita-btn-xs ita-btn-square"
                        aria-label={`Sposta su ${t.key}`}
                        title="Sposta su"
                        disabled={moving || i === 0}
                        onClick={() => void move(i, -1)}
                      >
                        <Icon name="it-arrow-up" className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="ita-btn ita-btn-ghost ita-btn-xs ita-btn-square"
                        aria-label={`Sposta giù ${t.key}`}
                        title="Sposta giù"
                        disabled={moving || i === v.terms.length - 1}
                        onClick={() => void move(i, 1)}
                      >
                        <Icon name="it-arrow-down" className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="ita-btn ita-btn-ghost ita-btn-xs"
                        aria-label={`${t.active ? "Disattiva" : "Attiva"} ${t.key}`}
                        onClick={() => void toggle(t)}
                      >
                        {t.active ? "Disattiva" : "Attiva"}
                      </button>
                      <button
                        type="button"
                        className="ita-btn ita-btn-ghost ita-btn-xs ita-btn-square"
                        aria-label={`Modifica ${t.key}`}
                        title="Modifica"
                        onClick={() => openTerm(t)}
                      >
                        <Icon name="it-pencil" className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="ita-btn ita-btn-ghost ita-btn-xs ita-btn-square text-error"
                        aria-label={`Elimina ${t.key}`}
                        title="Elimina"
                        onClick={() => del.ask(t)}
                      >
                        <Icon name="it-delete" className="size-4" />
                      </button>
                    </span>
                  </td>
                )}
              </tr>
            ))}
            {v.terms.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="py-8 text-center text-base-content/70">
                  Nessuna voce.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={target !== null}
        title={target === "new" ? "Nuova voce" : "Modifica la voce"}
        confirmLabel="Salva"
        onClose={() => setTarget(null)}
        onConfirm={saveTerm}
      >
        <div className="space-y-4">
          <TextField
            label="Chiave"
            required
            value={form.key}
            onChange={(e) => setForm({ ...form, key: e.target.value })}
            hint="Il valore che usa il catalogo (es. il numero della misura PNRR)."
            error={keyChanged ? "Cambiare la chiave cambia il valore cercato dal catalogo: i software che usano quella vecchia non saranno più trovati." : undefined}
          />
          <TextField label="Etichetta in italiano" value={form.labelIt} onChange={(e) => setForm({ ...form, labelIt: e.target.value })} hint="Senza etichetta si mostra la chiave." />
          <TextField label="Etichetta in inglese" value={form.labelEn} onChange={(e) => setForm({ ...form, labelEn: e.target.value })} />
          <Checkbox label="Attiva (visibile nel catalogo)" checked={form.active} onChange={(active) => setForm({ ...form, active })} />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={editingList}
        title="Modifica la lista"
        confirmLabel="Salva"
        onClose={() => setEditingList(false)}
        onConfirm={async () => {
          await api("PATCH", `/vocabularies/${id}`, listForm);
          setEditingList(false);
          reload();
        }}
      >
        <div className="space-y-4">
          <TextField label="Nome" required value={listForm.name} onChange={(e) => setListForm({ ...listForm, name: e.target.value })} />
          <TextArea
            label="Descrizione"
            rows={4}
            value={listForm.description}
            onChange={(e) => setListForm({ ...listForm, description: e.target.value })}
            hint="A cosa serve la lista e come la usa il catalogo."
          />
        </div>
      </ConfirmDialog>

      {del.dialog}
    </article>
  );
}
