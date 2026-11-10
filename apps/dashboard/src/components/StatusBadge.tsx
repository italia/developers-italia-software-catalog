export function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="ita-badge ita-badge-success">Attivo</span>
  ) : (
    <span className="ita-badge ita-badge-secondary">Inattivo</span>
  );
}

const requestLabels = {
  PENDING: ["In attesa", "ita-badge-warning"],
  APPROVED: ["Approvata", "ita-badge-success"],
  REJECTED: ["Rifiutata", "ita-badge-danger"],
} as const;

export function RequestStatusBadge({ status }: { status: keyof typeof requestLabels }) {
  const [label, cls] = requestLabels[status];
  return <span className={`ita-badge ${cls}`}>{label}</span>;
}
