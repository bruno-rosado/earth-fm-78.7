// Landing copy shown before a track is chosen.
export default function Hero({ tracks, onStart, onBrowse }) {
  const first = tracks[0];
  return (
    <section className="hero" aria-labelledby="hero-title">
      <p className="eyebrow">NASA Earth data · sonified</p>
      <h1 id="hero-title">Hear the ocean <span className="gradient-text">move.</span></h1>
      <p className="hero-copy">
        Pick any NASA Earth visualization and hear it. As the globe turns, a scan line sweeps the
        map: every latitude is a voice, warm colors sing brighter, fast motion plays faster, and
        each current pans the way it flows.
      </p>
      <div className="hero-actions">
        <button className="primary large" onClick={() => first && onStart(first)} disabled={!first}>
          <svg viewBox="0 0 24 24" aria-hidden><path d="M8 5.2v13.6L19 12z" fill="currentColor" /></svg>
          {first ? "Start listening" : "Loading tracks…"}
        </button>
        <button className="ghost" onClick={onBrowse}>
          <svg viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m16.5 16.5 4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          Browse NASA videos
        </button>
      </div>
      <ul className="hero-stats">
        <li><strong>8</strong> latitude voices</li>
        <li><strong>192</strong> regions per frame</li>
        <li><strong>10k+</strong> NASA videos to search</li>
      </ul>
    </section>
  );
}
