export function Loading({ label = "Caricamento…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-8" role="status">
      <span className="ita-spinner ita-spinner-sm" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorAlert({ error }: { error: Error }) {
  return (
    <div role="alert" className="ita-alert ita-alert-danger my-4">
      <div>
        <strong>Impossibile caricare i dati.</strong> {error.message}
      </div>
    </div>
  );
}
