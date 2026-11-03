type StatsCardsProps = {
  total: number;
  active: number;
  connected: boolean;
};

export function StatsCards({ total, active, connected }: StatsCardsProps) {
  return (
    <section className="stats-grid" aria-label="Task statistics">
      <article className="stat-card"><span className="stat-icon">◫</span><div><span className="stat-card__label">Total Tasks</span><strong>{total}</strong></div></article>
      <article className="stat-card"><span className="stat-icon stat-icon--green">↗</span><div><span className="stat-card__label">Active Tasks</span><strong>{active}</strong></div></article>
      <article className="stat-card"><span className="stat-icon stat-icon--dark">◉</span><div><span className="stat-card__label">Wallet Status</span><strong className="stat-status">{connected ? "Connected" : "Disconnected"}</strong></div></article>
    </section>
  );
}
