import { useEffect, useRef, useState } from "react";
import { searchNasa } from "../services/api";
import useImports from "../services/useImports";
import type { CatalogTrack, NasaVideo } from "../types";

interface Props {
  onReady: (track: CatalogTrack) => void;
  onOpen: (id: string) => void;
}

export default function NasaSearch({ onReady, onOpen }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<NasaVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const { jobs, importVideo, dismiss } = useImports(onReady);
  const term = query.trim();

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey
          && !(target instanceof Element && target.closest("input, textarea, select, [contenteditable]"))) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    setResults([]);
    setError("");
    setLoading(term.length >= 2);
    if (term.length < 2) return;
    const controller = new AbortController();
    let deadline: ReturnType<typeof setTimeout>;
    const debounce = setTimeout(async () => {
      deadline = setTimeout(() => controller.abort("timeout"), 45_000);
      try {
        const found = await searchNasa(term, controller.signal);
        if (!controller.signal.aborted) setResults(found);
      } catch (failure) {
        if (!controller.signal.aborted || controller.signal.reason === "timeout") {
          setError(controller.signal.reason === "timeout" ? "NASA is taking longer than expected. Please try again." : failure instanceof Error ? failure.message : "Could not search NASA.");
        }
      } finally {
        clearTimeout(deadline);
        if (!controller.signal.aborted || controller.signal.reason === "timeout") setLoading(false);
      }
    }, 400);
    return () => { clearTimeout(debounce); clearTimeout(deadline); controller.abort(); };
  }, [term, retry]);

  return (
    <section className="nasa-search" aria-label="Discover NASA videos">
      <form className="nasa-search-form" role="search" aria-label="NASA visualizations" onSubmit={(event) => {
        event.preventDefault(); setOpen(true); if (error) setRetry((value) => value + 1);
      }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
        <label className="sr-only" htmlFor="nasa-query">Search NASA videos</label>
        <input ref={input} id="nasa-query" type="search" placeholder="Search NASA videos — oceans, hurricanes, sea ice…" maxLength={120}
          value={query} autoComplete="off" aria-controls="nasa-results" aria-describedby="nasa-search-hint"
          onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setOpen(false); input.current?.blur(); } }} />
        <button type="submit" className="access-button">Search NASA</button>
      </form>
      <p id="nasa-search-hint" className="nasa-search-hint">Find a NASA visualization. Add it to your library, then hear its data.</p>

      {open && <div id="nasa-results" className="nasa-results">
        <div className="nasa-results-heading"><h2>Explore NASA</h2><button className="text-button" type="button" onClick={() => { input.current?.focus(); setOpen(false); }}>Close results</button></div>
        {term.length < 2 && <p className="nasa-search-hint">Try “ocean currents”, “wildfire smoke”, or “sea ice”. Enter at least two characters.</p>}
        <p className="nasa-search-status" role="status">{loading ? "Searching NASA’s visualization catalog…" : term.length >= 2 && !error ? `${results.length} videos found for “${term}”.` : ""}</p>
        {error && <div className="nasa-search-error" role="alert"><p>{error}</p><button type="button" className="access-button" onClick={() => setRetry((value) => value + 1)}>Try again</button></div>}
        {!loading && !error && term.length >= 2 && results.length === 0 && <p className="nasa-search-hint">No downloadable videos found. Try another topic.</p>}
        <div className="nasa-result-grid">
          {results.map((video) => {
            const job = jobs[video.nasa_id];
            const track = job?.track ?? video.track;
            const busy = job && job.status !== "done" && job.status !== "error";
            return <article className="nasa-result" key={video.nasa_id}>
              {video.thumbnail && <img src={video.thumbnail} alt="" loading="lazy" />}
              <div className="nasa-result-copy">
                <p className="eyebrow">NASA SVS{video.release_date ? ` · ${video.release_date.slice(0, 4)}` : ""}</p>
                <h3>{video.title}</h3>
                <p className="nasa-result-description">{video.description}</p>
                <p className="nasa-result-meta">{track ? "In your library" : `${video.video.width} px wide${video.video.size_mb ? ` · ${video.video.size_mb} MB` : ""}`}</p>
                <button className="access-button" type="button" disabled={Boolean(busy) || (!track && video.video.too_large)}
                  aria-label={`${track ? "Open" : busy ? "Preparing" : "Add to library:"} ${video.title}`}
                  onClick={() => track ? onOpen(track.id) : void importVideo(video.nasa_id)}>
                  {track ? "Open track ↗" : busy ? job.message : video.video.too_large ? "Video exceeds import limit" : job?.status === "error" ? "Retry import" : "↓ Add to library"}
                </button>
                <a className="nasa-result-source" href={video.source} target="_blank" rel="noreferrer">View at NASA <span className="sr-only">(opens in a new tab)</span><span aria-hidden="true">↗</span></a>
              </div>
            </article>;
          })}
        </div>
      </div>}

      {Object.values(jobs).length > 0 && <ul className="nasa-imports" aria-label="Video imports">
        {Object.values(jobs).map((job) => <li key={job.nasa_id}>
          <div><strong>{job.track?.title ?? `NASA SVS ${job.nasa_id}`}</strong><p role="status">{job.message}</p>
            {job.status !== "done" && job.status !== "error" && <progress max={1} value={job.status === "queued" || job.progress === 0 ? undefined : job.progress} aria-label={`${job.message}, NASA ${job.nasa_id}`} />}
          </div>
          {job.status === "done" && job.track && <button type="button" className="access-button" onClick={() => onOpen(job.track!.id)}>Play track</button>}
          {(job.status === "done" || job.status === "error") && <button type="button" className="text-button" aria-label={`Dismiss import notice for NASA ${job.nasa_id}`} onClick={() => dismiss(job.nasa_id)}>Dismiss</button>}
        </li>)}
      </ul>}
    </section>
  );
}
