import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { searchTrack } from "../services/api";
import type { TrackSearchResults } from "../types";

const AiAnswer = lazy(() => import("./AiAnswer"));

export default function TrackSearch({ trackId }: { trackId: string }) {
  const [data, setData] = useState<TrackSearchResults | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const request = useRef<AbortController | null>(null);
  const headingId = useId();
  const resultsId = useId();
  const explanation = data?.engine === "google_ai_mode" ? data : null;
  useEffect(() => () => request.current?.abort(), []);

  const search = async () => {
    if (explanation) { setExpanded((previous) => !previous); return; }
    if (pending) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setPending(true); setError(""); setExpanded(true);
    try {
      const response = await searchTrack(trackId, controller.signal);
      if (controller.signal.aborted) return;
      if (response.track_id !== trackId || response.engine !== "google_ai_mode" || !response.answer?.trim()) throw new Error("An AI explanation could not be loaded for this track. Please try again.");
      setData(response);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "The AI explanation could not load. Please try again.");
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  };

  return (
    <section className="track-search" aria-labelledby={headingId}>
      <div className="track-search-heading">
        <div><p className="eyebrow">Explore the story</p><h3 id={headingId}>Curious about this visualization?</h3><p>Get an explanation from Google AI Mode, powered by SerpAPI.</p></div>
        <button className="access-button" type="button" onClick={() => void search()} disabled={pending} aria-expanded={expanded} aria-controls={resultsId}>{pending ? "Getting AI explanation…" : explanation ? expanded ? "Hide explanation" : "Show explanation" : "Ask Google AI Mode"}</button>
      </div>
      <p className="track-search-status" role="status" aria-atomic="true">{pending ? "Google AI Mode is preparing an explanation. This can take a moment." : explanation ? "AI explanation ready." : ""}</p>
      {error && <p className="track-search-error" role="alert">{error}</p>}
      <div id={resultsId} hidden={!expanded} aria-busy={pending}>
        {explanation && <>
          <div className="track-ai-answer" aria-label="Google AI Mode explanation"><Suspense fallback={<p role="status">Formatting explanation…</p>}><AiAnswer text={explanation.answer} /></Suspense></div>
          {explanation.sources.length > 0 && <details className="track-ai-sources"><summary>Sources ({explanation.sources.length})</summary><ul>{explanation.sources.map((source) => <li key={source.url}>
            <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<span className="sr-only"> (opens in a new tab)</span><span aria-hidden> ↗</span></a><span>{source.source}</span>
          </li>)}</ul></details>}
          <p className="track-search-credit">AI-generated explanation · Google AI Mode via SerpAPI · {explanation.cached ? "Saved explanation" : "Newly retrieved"}.</p>
        </>}
      </div>
    </section>
  );
}
