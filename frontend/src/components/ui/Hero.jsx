// Landing copy shown before a track is chosen.
export default function Hero({ tracks, onStart }) {
  const first = tracks[0];
  return (
    <section className="hero" aria-labelledby="hero-title">
      <p className="eyebrow">NASA Earth data · sonified</p>
      <h1 id="hero-title">Hear the ocean <span className="gradient-text">move.</span></h1>
      <p className="hero-copy">
        As the globe turns, a scan line sweeps NASA's ocean model. Every latitude is a voice:
        warm water sings brighter, fast currents play faster, and each current pans the way it flows.
      </p>
      <div className="hero-actions">
        <button className="primary large" onClick={() => first && onStart(first)} disabled={!first}>
          <svg viewBox="0 0 24 24" aria-hidden><path d="M8 5.2v13.6L19 12z" fill="currentColor" /></svg>
          {first ? "Start listening" : "Loading tracks…"}
        </button>
        <span className="hero-hint">or pick a record below</span>
      </div>
      <ul className="hero-stats">
        <li><strong>8</strong> latitude voices</li>
        <li><strong>192</strong> ocean regions</li>
        <li><strong>4</strong> data dimensions</li>
      </ul>
    </section>
  );
}
