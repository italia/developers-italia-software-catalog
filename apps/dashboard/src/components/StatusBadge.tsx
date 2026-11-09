export function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="ita-badge ita-badge-success">Attivo</span>
  ) : (
    <span className="ita-badge ita-badge-secondary">Inattivo</span>
  );
}
