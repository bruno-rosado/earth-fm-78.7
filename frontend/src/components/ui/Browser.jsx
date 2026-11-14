// The browser panel: your library, NASA recommendations, and search results.
// Clicking a card plays a track or imports the visualization and then plays it.
import { useEffect, useRef, useState } from "react";
import { getRecommendations, searchNasa } from "../../services/api";
import { formatTime } from "./format";

const DEBOUNCE_MS = 450;

function ImportState({ job }) {
  if (!job) return null;
  if (job.status === "error") return <span className="card-state is-error">{job.message}</span>;
  const percent = Math.round((job.progress ?? 0) * 100);
  const label = { queued: "Queued", downloading: "Downloading", analyzing: "Analyzing", done: "Ready" }[job.status] ?? job.status;
  return (
    <span className="card-state">
      <span className="card-progress"><span style={{ width: `${job.status === "queued" ? 4 : percent}%` }} /></span>
      <span>{label} {job.status === "queued" || job.status === "done" ? "" : `${percent}%`}</span>
    </span>
  );
}

function NasaCard({ card, job, onPlay, onImport }) {
  const importing = job && !["done", "error"].includes(job.status);
  const track = card.track ?? (job?.status === "done" ? job.track : null);
  const tooLarge = !track && card.video.too_large;
  const act = () => {
    if (importing || tooLarge) return;
    if (track) onPlay(track);
    else onImport(card.nasa_id);
  };
  const size = card.video.size_mb ? ` · ${card.video.size_mb} MB` : "";
  return (
    <li className={`card ${importing ? "is-importing" : ""} ${tooLarge ? "is-disabled" : ""}`}>
      <button type="button" className="card-button" onClick={act} disabled={importing || tooLarge} aria-label={`${track ? "Play" : "Add and play"} ${card.title}`} title={tooLarge ? "This video is too large to import" : undefined}>
        <span className="card-thumb">
          {card.thumbnail ? <img src={card.thumbnail} alt="" loading="lazy" /> : <span className="card-thumb-empty" />}
          <span className="card-badge">{track ? "In library" : tooLarge ? "Too large" : `${card.video.width}×${card.video.height}${size}`}</span>
          <span className="card-play" aria-hidden>
            <svg viewBox="0 0 24 24">{track ? <path d="M8 5.2v13.6L19 12z" fill="currentColor" /> : <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />}</svg>
          </span>
        </span>
        <span className="card-title">{card.title}</span>
        <span className="card-meta">{card.release_date ? `NASA SVS · ${card.release_date.slice(0, 4)}` : "NASA SVS"}</span>
        <ImportState job={job} />
      </button>
    </li>
  );
}

function LibraryCard({ track, onPlay, onRemove, current }) {
  const imported = track.id.startsWith("svs");
  return (
    <li className={`card ${current ? "is-current" : ""}`}>
      {imported && onRemove && (
        <button type="button" className="card-remove" onClick={() => onRemove(track)} aria-label={`Remove ${track.title} from my library`} title="Remove from my library">
          <svg viewBox="0 0 24 24" aria-hidden><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
        </button>
      )}
      <button type="button" className="card-button" onClick={() => onPlay(track)} aria-label={`Play ${track.title}`}>
        <span className="card-thumb">
          {track.cover ? <img src={track.cover} alt="" loading="lazy" /> : <span className="card-thumb-empty" />}
          <span className="card-badge">{formatTime(track.duration)}</span>
          <span className="card-play" aria-hidden><svg viewBox="0 0 24 24"><path d="M8 5.2v13.6L19 12z" fill="currentColor" /></svg></span>
        </span>
        <span className="card-title">{track.title}</span>
        <span className="card-meta">{current ? "Now playing" : imported ? "Imported from NASA" : "Ready to play"}</span>
      </button>
    </li>
  );
}

function Grid({ items, renderItem, skeletons = 0 }) {
  return (
    <ul className="card-grid">
      {items.map(renderItem)}
      {Array.from({ length: skeletons }, (_, i) => <li key={`s${i}`} className="card is-skeleton" aria-hidden><span className="card-thumb" /><span className="card-title" /><span className="card-meta" /></li>)}
    </ul>
  );
}

// view: "browse" (library + recommendations) or "library" (just my library).
export default function Browser({ query, view = "browse", tracks, selectedTrack, jobs, onPlay, onImport, onRemove, onClose, onBrowseAll }) {
  const [recommended, setRecommended] = useState(null);
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);
  const trimmed = query.trim();

  useEffect(() => {
    let cancelled = false;
    getRecommendations().then((cards) => { if (!cancelled) setRecommended(cards); })
      .catch((failure) => { if (!cancelled) { setRecommended([]); setError(failure.message); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    abortRef.current?.abort();
    if (trimmed.length < 2) {
      setResults(null);
      setSearching(false);
      return undefined;
    }
    const abort = new AbortController();
    abortRef.current = abort;
    setSearching(true);
    const timer = setTimeout(() => {
      searchNasa(trimmed, { signal: abort.signal })
        .then((cards) => { if (!abort.signal.aborted) { setResults(cards); setError(""); } })
        .catch((failure) => { if (!abort.signal.aborted) { setResults([]); setError(failure.message); } })
        .finally(() => { if (!abort.signal.aborted) setSearching(false); });
    }, DEBOUNCE_MS);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [trimmed]);

  const nasaCard = (card) => (
    <NasaCard key={card.nasa_id} card={card} job={jobs[card.nasa_id]} onPlay={onPlay} onImport={onImport} />
  );
  const showResults = trimmed.length >= 2;

  return (
    <section className="browser" aria-label="Browse visualizations">
      <header className="browser-head">
        <h2>{showResults ? <>Results for <em>“{trimmed}”</em></> : view === "library" ? "My library" : "Browse"}</h2>
        <button type="button" className="icon-button small" onClick={onClose} aria-label="Close browser">
          <svg viewBox="0 0 24 24" aria-hidden><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
      </header>
      {error && <p className="browser-error" role="alert">{error}</p>}

      {showResults ? (
        results && results.length === 0 && !searching
          ? <p className="browser-empty">No videos found. Try “ocean”, “sea ice”, or “wildfire smoke”.</p>
          : <Grid items={results ?? []} renderItem={nasaCard} skeletons={searching && !results ? 6 : 0} />
      ) : view === "library" ? (
        <>
          <p className="browser-lead">{tracks.length} track{tracks.length === 1 ? "" : "s"} ready to play. Imported videos live on this computer.</p>
          <Grid items={tracks} renderItem={(track) => <LibraryCard key={track.id} track={track} current={selectedTrack?.id === track.id} onPlay={onPlay} onRemove={onRemove} />} />
          <button type="button" className="ghost browser-more" onClick={onBrowseAll}>
            <svg viewBox="0 0 24 24" aria-hidden><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
            Add more from NASA
          </button>
        </>
      ) : (
        <>
          <h3 className="browser-section">My library</h3>
          <Grid items={tracks} renderItem={(track) => <LibraryCard key={track.id} track={track} current={selectedTrack?.id === track.id} onPlay={onPlay} />} />
          <h3 className="browser-section">Recommended from NASA</h3>
          <Grid items={recommended ?? []} renderItem={nasaCard} skeletons={recommended ? 0 : 6} />
        </>
      )}
      <p className="browser-foot">Videos come from NASA's Scientific Visualization Studio. Adding one downloads it and analyzes every frame, which takes a minute or two.</p>
    </section>
  );
}
