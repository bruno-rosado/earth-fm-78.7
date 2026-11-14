import { useEffect, useRef, useState } from "react";
import { generateMusicConfig, getFeatures, getMusicConfig } from "../api";
import { playMusic } from "./musicGeneration";

export default function MusicPlayer({ selectedTrack, videoRef }) {
  const [config, setConfig] = useState(null);
  const [features, setFeatures] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const controller = useRef(null);
  const playbackAbort = useRef(null);
  const request = useRef(null);
  const revision = useRef(0);

  useEffect(() => {
    const current = ++revision.current;
    const abort = new AbortController();
    request.current = abort;
    playbackAbort.current?.abort();
    controller.current?.stop();
    controller.current = null;
    setPlaying(false);
    setGenerating(false);
    setConfig(null);
    setFeatures(null);
    setError("");
    setNotice("");
    setLoading(Boolean(selectedTrack));
    if (selectedTrack) {
      Promise.all([
        getFeatures(selectedTrack.id, { signal: abort.signal }),
        getMusicConfig(selectedTrack.id, { signal: abort.signal }).catch((failure) => {
          if ([404, 409].includes(failure.status)) return null;
          if (abort.signal.aborted) throw failure;
          setError(failure.message);
          return null;
        }),
      ]).then(([samples, recipe]) => {
        if (revision.current !== current || abort.signal.aborted) return;
        setFeatures(samples);
        setConfig(recipe);
      }).catch((failure) => {
        if (!abort.signal.aborted) setError(failure.message);
      }).finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    }
    return () => {
      revision.current++;
      abort.abort();
      playbackAbort.current?.abort();
      controller.current?.stop();
      controller.current = null;
    };
  }, [selectedTrack]);

  async function generate() {
    const abort = request.current;
    setGenerating(true);
    setError("");
    try {
      const recipe = await generateMusicConfig(selectedTrack.id, prompt, { signal: abort.signal });
      if (!abort.signal.aborted) setConfig(recipe);
    } catch (failure) {
      if (!abort.signal.aborted) setError(failure.message);
    } finally {
      if (!abort.signal.aborted) setGenerating(false);
    }
  }

  async function play() {
    const current = revision.current;
    const abort = new AbortController();
    playbackAbort.current = abort;
    setPlaying(true);
    setError("");
    setNotice("");
    try {
      const playback = await playMusic({
        config, features, duration: selectedTrack.duration, video: videoRef?.current, signal: abort.signal,
        onEnded: () => { if (revision.current === current) setPlaying(false); },
        onVideoError: () => { if (revision.current === current) setNotice("Video unavailable; playing audio."); },
      });
      if (revision.current !== current) playback.stop();
      else controller.current = playback;
    } catch (failure) {
      if (revision.current === current) { setError(failure.message); setPlaying(false); }
    }
  }

  function stop() {
    revision.current++;
    playbackAbort.current?.abort();
    controller.current?.stop();
    controller.current = null;
    videoRef?.current?.pause();
    setPlaying(false);
  }

  return (
    <section className="music-player" aria-label="Track music player">
      <h2>{selectedTrack?.title ?? "Earth Frequencies"}</h2>
      {!selectedTrack ? <p>Select a track to make music.</p> : <>
        <label htmlFor="music-style">Music style</label>
        <input id="music-style" value={prompt} maxLength={1000} placeholder="Calm, flowing ocean music"
          onChange={(event) => setPrompt(event.target.value)} disabled={generating || playing} />
        <div className="music-player-controls">
          <button onClick={generate} disabled={loading || generating || playing || !features}>
            {generating ? "Generating…" : config ? "Regenerate music" : "Generate music"}
          </button>
          <button onClick={play} disabled={!config || !features || loading || generating || playing}>Play</button>
          <button onClick={stop} disabled={!playing}>Stop</button>
        </div>
        <p role="status">{loading ? "Loading track…" : config ? `${config.bpm} BPM · ${config.instrument.replaceAll("_", " ")}` : "Generate music for this track to begin."}</p>
        {notice && <p role="status">{notice}</p>}
        {error && <p role="alert">{error}</p>}
      </>}
    </section>
  );
}
