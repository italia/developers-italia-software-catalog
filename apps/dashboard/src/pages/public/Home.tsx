import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { FormAlert, SelectField, SubmitButton, TextField } from "../../components/Form.tsx";
import { Icon } from "../../components/Icon.tsx";
import { IpaSearch } from "../../components/IpaSearch.tsx";
import { api, type IpaEntityDto, type OnboardingRequestDto } from "../../lib/api.ts";

const steps = [
  ["Cerca l'ente", "Scegli la tua amministrazione dall'anagrafica IndicePA e la PEC a cui inviare la conferma."],
  ["Indica il code hosting", "L'URL dell'organizzazione su GitHub, GitLab o Bitbucket che ospita i repository dell'ente."],
  ["Conferma dalla PEC", "Ricevi alla PEC dell'ente un link per confermare: solo allora il code hosting entra nel catalogo."],
] as const;

/**
 * Home pubblica: onboarding delle PA, flusso standard (sostituisce onboarding.developers.italia.it).
 * La richiesta viene verificata con un link inviato alla PEC dell'ente in IndicePA.
 */
export function Home() {
  const [entity, setEntity] = useState<IpaEntityDto | null>(null);
  const [pec, setPec] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [url, setUrl] = useState("");
  const [trap, setTrap] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<OnboardingRequestDto | null>(null);

  const choose = (e: IpaEntityDto | null) => {
    setEntity(e);
    setPec(e?.pec.length === 1 ? e.pec[0]! : "");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!entity) return setError("Scegli l'ente dai risultati della ricerca.");
    setBusy(true);
    setError(null);
    try {
      setSent(
        await api<OnboardingRequestDto>("POST", "/onboarding-requests", {
          ipa: entity.ipa,
          pec,
          contactName,
          contactPhone: contactPhone || undefined,
          codeHostingUrl: url.trim(),
          ...(trap && { website: trap }),
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-10">
      <section className="hero ita-hero ita-hero-sm rounded-box" aria-labelledby="hero-title">
        <div className="hero-content">
          <div>
            <span className="ita-hero-kicker">Software a riuso della PA</span>
            <h1 id="hero-title" className="ita-hero-title">
              Porta il software della tua amministrazione nel catalogo
            </h1>
            <p className="ita-hero-text">
              Registra lo strumento di code hosting dell'ente: il catalogo di Developers Italia ne scandirà ogni notte i repository con un
              file publiccode.yml (Linee guida per l'acquisizione e il riuso di software, artt. 68 e 69 del CAD).
            </p>
          </div>
        </div>
      </section>

      <ol className="grid gap-4 md:grid-cols-3">
        {steps.map(([title, text], i) => (
          <li key={title} className="ita-card ita-card-borderless rounded-box bg-base-200 p-5">
            <p className="mb-1 text-sm font-semibold text-primary">Passo {i + 1}</p>
            <h2 className="mb-2 text-lg font-bold">{title}</h2>
            <p className="text-sm">{text}</p>
          </li>
        ))}
      </ol>

      <section aria-labelledby="form-title" className="max-w-3xl">
        <h2 id="form-title" className="mb-4 text-2xl font-bold">
          Richiesta di onboarding
        </h2>

        {sent ? (
          <div role="status" className="ita-callout ita-callout-success">
            <p className="ita-callout-title flex items-center gap-2">
              <Icon name="it-mail" /> Controlla la PEC dell'ente
            </p>
            <p>
              Abbiamo inviato a <strong>{sent.pec}</strong> un link per confermare la registrazione di{" "}
              <strong>{sent.codeHostingUrl}</strong> per {sent.administration}. Il link vale 72 ore; se non arriva puoi inviare di nuovo
              la richiesta.
            </p>
            <button type="button" className="ita-btn ita-btn-outline ita-btn-primary ita-btn-xs mt-4" onClick={() => setSent(null)}>
              Nuova richiesta
            </button>
          </div>
        ) : (
          <form className="space-y-5" onSubmit={(e) => void submit(e)} noValidate={false}>
            {error && <FormAlert kind="danger">{error}</FormAlert>}
            <p className="text-sm">
              I campi con <span className="ita-required">*</span> sono obbligatori.
            </p>

            <IpaSearch label="Amministrazione" hint="Cerca per nome, codice IPA o codice fiscale." required value={entity} onChange={choose} />

            {entity && (
              <SelectField
                label="PEC a cui inviare la conferma"
                required
                value={pec}
                onChange={(e) => setPec(e.target.value)}
                hint="Le PEC pubblicate dall'ente in IndicePA. Chi la riceve deve poter confermare la richiesta per conto dell'ente."
                className="max-w-none"
              >
                <option value="">— scegli —</option>
                {entity.pec.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </SelectField>
            )}
            {entity && entity.pec.length === 0 && (
              <FormAlert kind="warning">
                L'ente non ha PEC in IndicePA: scrivi a contatti@developers.italia.it per completare l'onboarding.
              </FormAlert>
            )}

            <TextField
              label="Referente (nome e cognome)"
              required
              autoComplete="name"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              hint="La persona che fa la richiesta: il nome compare nell'email inviata alla PEC."
            />
            <TextField
              label="Telefono del referente"
              type="tel"
              autoComplete="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              hint="Facoltativo: lo usiamo solo per contattarti su questa richiesta."
            />
            <TextField
              label="URL dello strumento di code hosting"
              type="url"
              required
              placeholder="https://github.com/comune-di-reuso"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="max-w-none"
              hint={
                <>
                  L'organizzazione che ospita i repository dell'ente (GitHub, GitLab, Bitbucket o un'istanza propria). Viene{" "}
                  <strong>aggiunto</strong> a quelli già noti; per rimuoverne uno scrivi a{" "}
                  <a className="ita-link" href="mailto:contatti@developers.italia.it">
                    contatti@developers.italia.it
                  </a>
                  .
                </>
              }
            />
            {/* Campo trappola per i bot, nascosto agli utenti e alle tecnologie assistive */}
            <div className="hidden" aria-hidden="true">
              <label>
                Sito web
                <input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
              </label>
            </div>

            <SubmitButton busy={busy} className="mt-2">
              Invia la richiesta <Icon name="it-arrow-right" />
            </SubmitButton>
          </form>
        )}
      </section>

      <section className="ita-callout ita-callout-primary max-w-3xl">
        <p className="ita-callout-title">Non sei una pubblica amministrazione?</p>
        <p>
          Se sviluppi software open source utile alla PA puoi <Link to="/terze-parti" className="ita-link">chiedere di inserirlo</Link> come
          software di terze parti.
        </p>
      </section>
    </div>
  );
}
