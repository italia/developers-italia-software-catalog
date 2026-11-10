import { type FormEvent, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { FormAlert, SubmitButton, TextField } from "../../components/Form.tsx";
import { Icon } from "../../components/Icon.tsx";
import { Loading } from "../../components/States.tsx";
import { api } from "../../lib/api.ts";
import { useAuth } from "../../lib/auth.tsx";

/** Pagina "da" a cui tornare dopo l'accesso: solo percorsi dell'area riservata. */
const safeNext = (raw: string | null) => (raw && raw.startsWith("/dashboard") && !raw.startsWith("//") ? raw : "/dashboard");

export function Login() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (user) return <Navigate to={safeNext(params.get("da"))} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Si ricorda dove tornare, per la pagina di verifica aperta dal link.
      try {
        sessionStorage.setItem("login-next", safeNext(params.get("da")));
      } catch {
        /* storage non disponibile */
      }
      setMessage((await api<{ message: string }>("POST", "/auth/magic-link", { email: email.trim() })).message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="mx-auto max-w-lg space-y-6">
      <h1 className="flex items-center gap-2 text-3xl font-bold">
        <Icon name="it-locked" className="size-8" /> Area riservata
      </h1>
      <p>Inserisci il tuo indirizzo istituzionale: ti invieremo un link per entrare, valido una sola volta.</p>
      {message ? (
        <div role="status" className="ita-callout ita-callout-success">
          <p className="ita-callout-title flex items-center gap-2">
            <Icon name="it-mail" /> Controlla la posta
          </p>
          <p>{message}</p>
          <button type="button" className="ita-btn ita-btn-outline ita-btn-primary ita-btn-xs mt-4" onClick={() => setMessage(null)}>
            Usa un altro indirizzo
          </button>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={(e) => void submit(e)}>
          {error && <FormAlert kind="danger">{error}</FormAlert>}
          <TextField label="Email istituzionale" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <SubmitButton busy={busy}>
            Invia il link di accesso <Icon name="it-arrow-right" />
          </SubmitButton>
        </form>
      )}
    </article>
  );
}

/**
 * Aperta dal link nell'email. Serve un clic: un GET che consuma il token verrebbe bruciato
 * dai sistemi che aprono in anticipo i link delle email.
 */
export function LoginVerify() {
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = params.get("token") ?? "";

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("POST", "/auth/verify", { token });
      await refresh();
      let next = "/dashboard";
      try {
        next = safeNext(sessionStorage.getItem("login-next"));
        sessionStorage.removeItem("login-next");
      } catch {
        /* storage non disponibile */
      }
      navigate(next, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <article className="mx-auto max-w-lg space-y-6">
      <h1 className="text-3xl font-bold">Accedi alla dashboard</h1>
      {error ? (
        <>
          <FormAlert kind="danger">{error}</FormAlert>
          <a href="/accesso" className="ita-btn ita-btn-primary">
            Chiedi un nuovo link
          </a>
        </>
      ) : (
        <>
          <p>Conferma per entrare nell'area riservata del catalogo.</p>
          <button type="button" className="ita-btn ita-btn-primary" disabled={!token || busy} onClick={() => void verify()}>
            {busy && <span className="ita-spinner ita-spinner-sm" aria-hidden="true" />}
            Entra nella dashboard <Icon name="it-arrow-right" />
          </button>
        </>
      )}
    </article>
  );
}
