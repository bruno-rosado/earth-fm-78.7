// Landing copy shown before a track is chosen.
export default function Hero({ tracks, loading, error, onRetry, onStart, onBrowse }) {
  const first = tracks[0];
  const rows = first?.features?.[0]?.grid?.length ?? 8;
  const cols = first?.features?.[0]?.grid?.[0]?.length ?? 24;
  return (
    <section className="hero" aria-labelledby="hero-title">
      <p className="eyebrow">NASA Earth data · sonified</p>
      <h1 id="hero-title">Hear the ocean <span className="gradient-text">move.</span></h1>
      <p className="hero-copy">
        A moving planet. A one-of-a-kind composition. Turn NASA visualizations into
        music, follow every note back to its origin, and make Earth’s soundtrack your own.
      </p>
      <div className="hero-actions">
        <button className="primary large" onClick={() => first ? onStart(first) : onBrowse()} disabled={!first && loading}>
          <svg viewBox="0 0 24 24" aria-hidden><path d="M8 5.2v13.6L19 12z" fill="currentColor" /></svg>
          {first ? "Start listening" : loading ? "Loading tracks…" : "Choose a NASA video"}
        </button>
        <button className="ghost" onClick={onBrowse}>
          <svg viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m16.5 16.5 4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          Browse NASA videos
        </button>
      </div>
      {error && <p className="catalog-status" role="alert">{error}<button onClick={onRetry}>Retry</button></p>}
      {!loading && !error && !first && <p className="hero-copy">Your library is empty. Browse NASA videos to create your first track.</p>}
      <ul className="hero-stats">
        <li><strong>{rows}</strong> latitude voices</li>
        <li><strong>{rows * cols}</strong> regions per frame</li>
        <li><strong>Live</strong> composed in your browser</li>
      </ul>
    </section>
  );
}
