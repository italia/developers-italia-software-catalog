import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { CheckResult, checkOk } from "../components/CheckResult.tsx";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { CopyCell } from "../components/Copy.tsx";
import { type Column, DataTable } from "../components/DataTable.tsx";
import { Checkbox, SelectField, TextArea, TextField } from "../components/Form.tsx";
import { Icon } from "../components/Icon.tsx";
import { RequestStatusBadge } from "../components/StatusBadge.tsx";
import { api, listPath, type OnboardingRequestDto, type Page, type ThirdPartyRequestDto, useApi } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { formatDate, shortUrl } from "../lib/format.ts";
import { useListParams } from "../lib/useListParams.ts";
import { usePublisherOptions } from "./SoftwareEdit.tsx";

type Decision<T> = { row: T; action: "approve" | "reject" } | null;

function DecisionButtons({ onApprove, onReject }: { onApprove: () => void; onReject: () => void }) {
  return (
    <span className="flex gap-1">
      <button type="button" className="ita-btn ita-btn-success ita-btn-xs" onClick={onApprove}>
        Approva
      </button>
      <button type="button" className="ita-btn ita-btn-outline ita-btn-danger ita-btn-xs" onClick={onReject}>
        Rifiuta
      </button>
    </span>
  );
}

// --- Onboarding delle PA ---------------------------------------------------------

function OnboardingRequests() {
  const { isAdmin } = useAuth();
  const [params, update] = useListParams("");
  const list = useApi<Page<OnboardingRequestDto>>(listPath("onboarding-requests", params));
  const [decision, setDecision] = useState<Decision<OnboardingRequestDto>>(null);
  const [note, setNote] = useState("");

  const columns = useMemo(() => {
    const cols: Column<OnboardingRequestDto>[] = [
      {
        accessor: "administration",
        label: "Ente",
        width: "1.2fr",
        minWidth: 220,
        cellRenderer: ({ row }) => (
          <CopyCell value={row.administration} label="il nome dell'ente">
            {row.publisherId ? (
              <Link to={`/dashboard/publishers/${row.publisherId}`} className="ita-link font-semibold">
                {row.administration}
              </Link>
            ) : (
              <span className="font-semibold">{row.administration}</span>
            )}
          </CopyCell>
        ),
      },
      { accessor: "ipa", label: "Codice IPA", width: 130, cellRenderer: ({ row }) => <CopyCell value={row.ipa} label="il codice IPA"><code>{row.ipa}</code></CopyCell> },
      {
        accessor: "codeHostingUrl",
        label: "Code hosting",
        width: "1fr",
        minWidth: 220,
        cellRenderer: ({ row }) => (
          <CopyCell value={row.codeHostingUrl} label="l'URL">
            <a href={row.codeHostingUrl} className="ita-link truncate" target="_blank" rel="noreferrer">
              {shortUrl(row.codeHostingUrl)}
            </a>
          </CopyCell>
        ),
      },
      { accessor: "contactName", label: "Referente", width: 160, cellRenderer: ({ row }) => <CopyCell value={row.contactName} label="il referente" /> },
      { accessor: "pec", label: "PEC", width: 200, cellRenderer: ({ row }) => <CopyCell value={row.pec} label="la PEC"><span className="truncate">{row.pec ?? "—"}</span></CopyCell> },
      { accessor: "status", label: "Stato", width: 110, cellRenderer: ({ row }) => <RequestStatusBadge status={row.status} /> },
      { accessor: "createdAt", label: "Ricevuta", width: 160, cellRenderer: ({ row }) => formatDate(row.createdAt) },
    ];
    if (isAdmin) {
      cols.push({
        accessor: "_actions",
        label: "Azioni",
        width: 170,
        pinned: "right",
        cellRenderer: ({ row }) =>
          row.status === "PENDING" ? (
            <DecisionButtons onApprove={() => setDecision({ row, action: "approve" })} onReject={() => setDecision({ row, action: "reject" })} />
          ) : (
            <span className="text-sm">{row.decidedAt ? formatDate(row.decidedAt) : "—"}</span>
          ),
      });
    }
    return cols;
  }, [isAdmin]);

  const close = () => {
    setDecision(null);
    setNote("");
  };

  return (
    <>
      <p className="mb-4">
        Richieste dal form di onboarding. Di norma è l'ente a confermarle dal link ricevuto via PEC; qui si può decidere al suo posto, per
        esempio se la PEC non arriva.
      </p>
      <DataTable
        columns={columns}
        page={list.data}
        loading={list.loading}
        error={list.error}
        params={params}
        onChange={update}
        filter="status"
        searchPlaceholder="Ente, codice IPA, URL, referente…"
        caption="Richieste di onboarding"
      />
      <ConfirmDialog
        open={decision !== null}
        title={decision?.action === "approve" ? "Approvare la richiesta?" : "Rifiutare la richiesta?"}
        confirmLabel={decision?.action === "approve" ? "Approva" : "Rifiuta"}
        danger={decision?.action === "reject"}
        onClose={close}
        onConfirm={async () => {
          if (!decision) return;
          await api("POST", `/onboarding-requests/${decision.row.id}/${decision.action}`, { note: note || undefined });
          close();
          list.reload();
        }}
      >
        {decision && (
          <div className="space-y-4">
            <p>
              {decision.action === "approve"
                ? `${decision.row.codeHostingUrl} verrà aggiunto ai code hosting di ${decision.row.administration} (l'organizzazione viene creata se non esiste).`
                : `La richiesta di ${decision.row.administration} per ${decision.row.codeHostingUrl} verrà chiusa senza modifiche al catalogo.`}
            </p>
            <TextArea label="Nota (facoltativa)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="max-w-none" />
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}

// --- Software di terze parti -------------------------------------------------------

function ThirdPartyRequests() {
  const { isAdmin } = useAuth();
  const [params, update] = useListParams("");
  const list = useApi<Page<ThirdPartyRequestDto>>(listPath("third-party-requests", params));
  const publishers = usePublisherOptions().filter((p) => !p.alternativeId);
  const [decision, setDecision] = useState<Decision<ThirdPartyRequestDto>>(null);
  const [form, setForm] = useState({ mode: "existing" as "existing" | "new", publisherId: "", description: "", email: "", force: false, note: "" });

  const columns = useMemo(() => {
    const cols: Column<ThirdPartyRequestDto>[] = [
      {
        accessor: "repositoryUrl",
        label: "Repository",
        width: "1.3fr",
        minWidth: 240,
        cellRenderer: ({ row }) => (
          <CopyCell value={row.repositoryUrl} label="l'URL del repository">
            <a href={row.repositoryUrl} className="ita-link truncate font-semibold" target="_blank" rel="noreferrer">
              {row.validation?.name ?? shortUrl(row.repositoryUrl)}
            </a>
          </CopyCell>
        ),
      },
      {
        accessor: "validation",
        label: "publiccode.yml",
        width: 140,
        cellRenderer: ({ row }) =>
          !row.validation ? "—" : checkOk(row.validation) ? (
            <span className="ita-badge ita-badge-success">Valido</span>
          ) : (
            <span className="ita-badge ita-badge-danger" title={row.validation.errors.map((e) => `${e.key} ${e.description}`).join("\n")}>
              {row.validation.found ? `${row.validation.errors.length} errori` : "Non trovato"}
            </span>
          ),
      },
      {
        accessor: "requesterEmail",
        label: "Richiedente",
        width: 210,
        cellRenderer: ({ row }) => (
          <CopyCell value={row.requesterEmail ?? row.requesterGithub} label="il richiedente">
            <span className="truncate">{row.requesterName ? `${row.requesterName} · ` : ""}{row.requesterEmail ?? (row.requesterGithub ? `@${row.requesterGithub}` : "—")}</span>
          </CopyCell>
        ),
      },
      {
        accessor: "source",
        label: "Provenienza",
        width: 120,
        cellRenderer: ({ row }) =>
          row.source === "GITHUB_ISSUE" && row.githubIssueUrl ? (
            <a className="ita-link" href={row.githubIssueUrl} target="_blank" rel="noreferrer">
              Issue GitHub
            </a>
          ) : (
            "Form"
          ),
      },
      { accessor: "status", label: "Stato", width: 110, cellRenderer: ({ row }) => <RequestStatusBadge status={row.status} /> },
      { accessor: "createdAt", label: "Ricevuta", width: 160, cellRenderer: ({ row }) => formatDate(row.createdAt) },
    ];
    if (isAdmin) {
      cols.push({
        accessor: "_actions",
        label: "Azioni",
        width: 170,
        pinned: "right",
        cellRenderer: ({ row }) =>
          row.status === "PENDING" ? (
            <DecisionButtons onApprove={() => setDecision({ row, action: "approve" })} onReject={() => setDecision({ row, action: "reject" })} />
          ) : row.softwareId ? (
            <Link className="ita-link text-sm" to={`/dashboard/software/${row.softwareId}`}>
              Vai al software
            </Link>
          ) : (
            <span className="text-sm">{row.decidedAt ? formatDate(row.decidedAt) : "—"}</span>
          ),
      });
    }
    return cols;
  }, [isAdmin]);

  const close = () => {
    setDecision(null);
    setForm({ mode: "existing", publisherId: "", description: "", email: "", force: false, note: "" });
  };

  const r = decision?.row;
  return (
    <>
      <p className="mb-4">Richieste di inserimento di software open source di terze parti, dal form pubblico e (in futuro) dalle issue GitHub.</p>
      <DataTable
        columns={columns}
        page={list.data}
        loading={list.loading}
        error={list.error}
        params={params}
        onChange={update}
        filter="status"
        searchPlaceholder="URL, email o nome del richiedente…"
        caption="Richieste di software di terze parti"
      />
      <ConfirmDialog
        open={decision !== null}
        title={decision?.action === "approve" ? "Approvare la richiesta?" : "Rifiutare la richiesta?"}
        confirmLabel={decision?.action === "approve" ? "Approva e aggiungi" : "Rifiuta"}
        danger={decision?.action === "reject"}
        onClose={close}
        onConfirm={async () => {
          if (!decision || !r) return;
          const note = form.note || undefined;
          if (decision.action === "reject") {
            await api("POST", `/third-party-requests/${r.id}/reject`, { note });
          } else {
            const target =
              form.mode === "existing"
                ? { publisherId: form.publisherId }
                : { newPublisher: { description: form.description.trim(), email: form.email.trim() || null } };
            if (form.mode === "existing" && !form.publisherId) throw new Error("Scegli l'organizzazione.");
            await api("POST", `/third-party-requests/${r.id}/approve`, { ...target, note, ...(form.force && { force: true }) });
          }
          close();
          list.reload();
        }}
      >
        {r && (
          <div className="space-y-4">
            <p>
              <a className="ita-link break-all" href={r.repositoryUrl} target="_blank" rel="noreferrer">
                {r.repositoryUrl}
              </a>
              {r.requesterEmail && <> · richiesta da {r.requesterEmail}, che riceverà un'email con l'esito.</>}
            </p>
            {r.notes && <p className="italic">“{r.notes}”</p>}
            {r.validation && <CheckResult check={r.validation} />}
            {decision?.action === "approve" && (
              <>
                <p className="text-sm">Il publiccode.yml viene ricontrollato al momento dell'approvazione.</p>
                <fieldset className="ita-choice-group">
                  <legend className="ita-legend">Organizzazione che pubblica il software</legend>
                  <div className="ita-choice-list ita-choice-list-inline">
                    <label className="ita-choice">
                      <input type="radio" className="ita-radio" checked={form.mode === "existing"} onChange={() => setForm({ ...form, mode: "existing" })} />
                      <span className="ita-choice-text">Già nel catalogo</span>
                    </label>
                    <label className="ita-choice">
                      <input type="radio" className="ita-radio" checked={form.mode === "new"} onChange={() => setForm({ ...form, mode: "new" })} />
                      <span className="ita-choice-text">Nuova</span>
                    </label>
                  </div>
                </fieldset>
                {form.mode === "existing" ? (
                  <SelectField label="Organizzazione" value={form.publisherId} onChange={(e) => setForm({ ...form, publisherId: e.target.value })} className="max-w-none">
                    <option value="">— scegli —</option>
                    {publishers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.description}
                      </option>
                    ))}
                  </SelectField>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField label="Nome" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                    <TextField label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                )}
                {!checkOk(r.validation) && (
                  <Checkbox label="Aggiungi comunque il repository" checked={form.force} onChange={(force) => setForm({ ...form, force })} />
                )}
              </>
            )}
            <TextArea label="Nota per il richiedente (facoltativa)" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="max-w-none" />
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}

export function Requests() {
  const [search, setSearch] = useSearchParams();
  const tab = search.get("tipo") === "terze-parti" ? "terze-parti" : "onboarding";
  const pending = {
    onboarding: useApi<Page<OnboardingRequestDto>>("/onboarding-requests?status=PENDING&page[size]=1").data?.meta.total,
    "terze-parti": useApi<Page<ThirdPartyRequestDto>>("/third-party-requests?status=PENDING&page[size]=1").data?.meta.total,
  };
  const tabs = [
    ["onboarding", "Onboarding PA"],
    ["terze-parti", "Software di terze parti"],
  ] as const;

  return (
    <>
      <h1 className="mb-2 flex items-center gap-2 text-3xl font-bold">
        <Icon name="it-inbox" className="size-8" /> Richieste
      </h1>
      <div role="tablist" className="tabs tabs-border ita-tabs mb-6" aria-label="Tipo di richiesta">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`tab ${tab === key ? "tab-active" : ""}`}
            onClick={() => setSearch(key === "onboarding" ? {} : { tipo: key })}
          >
            {label}
            {pending[key] ? <span className="ita-badge ita-badge-warning">{pending[key]}</span> : null}
          </button>
        ))}
      </div>
      {tab === "onboarding" ? <OnboardingRequests key="o" /> : <ThirdPartyRequests key="t" />}
    </>
  );
}
