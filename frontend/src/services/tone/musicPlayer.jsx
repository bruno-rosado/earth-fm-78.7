import { useCallback, useEffect, useRef, useState } from "react";
import { generateMusicConfig, getFeatures, getMusicConfig } from "../api";
import { createPlayback } from "./musicGeneration";
import { DEFAULT_CONFIG, scanPosition } from "./musicMapping";

const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const formatLongitude = (u) => {
  const degrees = Math.round(u * 360 - 180);
  return degrees === 0 || Math.abs(degrees) === 180 ? `${Math.abs(degrees)}°` : `${Math.abs(degrees)}°${degrees < 0 ? "W" : "E"}`;
};
const styleLabel = (config) =>
  `${config.key} ${config.mode.replaceAll("_", " ")} · ${config.bpm} BPM`;
const isTyping = (target) => ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName);

const MAPPINGS = [
  ["latitude", "Latitude", "pitch: north is high, south is low"],
  ["temperature", "Sea temperature", "tone color and chords: warm is brighter"],
  ["speed", "Current speed", "rhythm and loudness"],
  ["flow", "Current direction", "stereo: westward left, eastward right"],
];

export default function MusicPlayer({ selectedTrack, videoRef }) {
  const [features, setFeatures] = useState(null);
  const [config, setConfig] = useState(null);
  const [configSource, setConfigSource] = useState("default");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const playback = useRef(null);
  const revision = useRef(0);
  const request = useRef(null);
  const resumeWithNewStyle = useRef(false);
  const duration = selectedTrack?.duration ?? 0;

  const disposePlayback = useCallback(() => {
    playback.current?.dispose();
    playback.current = null;
    setPlaying(false);
  }, []);

  useEffect(() => {
    const current = ++revision.current;
    const abort = new AbortController();
    request.current = abort;
    disposePlayback();
    resumeWithNewStyle.current = false;
    setFeatures(null);
    setConfig(null);
    setConfigSource("default");
    setGenerating(false);
    setTime(0);
    setError("");
    setNotice("");
    setLoading(Boolean(selectedTrack));
    if (selectedTrack) {
      Promise.all([
        getFeatures(selectedTrack.id, { signal: abort.signal }),
        getMusicConfig(selectedTrack.id, { signal: abort.signal }).then(
          (recipe) => ({ recipe, source: "generated" }),
          (failure) => {
            if (abort.signal.aborted) throw failure;
            if (failure.status === 409) return { recipe: null, source: "stale" };
            if (failure.status !== 404) setError(failure.message);
            return { recipe: null, source: "default" };
          },
        ),
      ]).then(([samples, { recipe, source }]) => {
        if (revision.current !== current) return;
        setFeatures(samples);
        setConfig(recipe ?? { ...DEFAULT_CONFIG, track_id: selectedTrack.id });
        setConfigSource(source);
      }).catch((failure) => {
        if (!abort.signal.aborted) setError(failure.message);
      }).finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    }
    return () => {
      revision.current++;
      abort.abort();
      disposePlayback();
    };
  }, [selectedTrack, disposePlayback]);

  // Poll the audio clock for the progress bar; the 3D scene reads it every frame itself.
  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => setTime(playback.current?.getTime() ?? 0), 200);
    return () => clearInterval(timer);
  }, [playing]);

  const ready = Boolean(selectedTrack && features && config && !loading);

  const play = useCallback(async () => {
    if (!ready || starting) return;
    const current = revision.current;
    setError("");
    setStarting(true);
    try {
      if (!playback.current) {
        const created = await createPlayback({
          config, features, duration, video: videoRef?.current,
          onEnded: () => {
            if (revision.current !== current) return;
            setPlaying(false);
            setTime(duration);
          },
          onVideoError: () => {
            if (revision.current === current) setNotice("Video unavailable; playing audio only.");
          },
        });
        if (revision.current !== current) {
          created.dispose();
          return;
        }
        created.setVolume(volume);
        created.seek(time >= duration ? 0 : time);
        playback.current = created;
      }
      await playback.current.play();
      if (revision.current === current) setPlaying(true);
    } catch (failure) {
      if (revision.current === current) setError(failure.message);
    } finally {
      if (revision.current === current) setStarting(false);
    }
  }, [ready, starting, config, features, duration, videoRef, volume, time]);

  // After a new style replaces a playing one, continue with it once it's in state.
  useEffect(() => {
    if (resumeWithNewStyle.current && ready && !playback.current) {
      resumeWithNewStyle.current = false;
      play();
    }
  }, [config, ready, play]);

  const pause = useCallback(() => {
    playback.current?.pause();
    setPlaying(false);
  }, []);

  // Space toggles play/pause unless the user is typing.
  useEffect(() => {
    const onKey = (event) => {
      if (event.code !== "Space" || isTyping(event.target) || event.target?.tagName === "BUTTON") return;
      event.preventDefault();
      if (playing) pause();
      else play();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, play, pause]);

  function seek(value) {
    setTime(value);
    playback.current?.seek(value);
  }

  function changeVolume(value) {
    setVolume(value);
    playback.current?.setVolume(value);
  }

  async function generate() {
    const abort = request.current;
    const current = revision.current;
    setGenerating(true);
    setError("");
    try {
      const recipe = await generateMusicConfig(selectedTrack.id, prompt, { signal: abort.signal });
      if (abort.signal.aborted || revision.current !== current) return;
      // Rebuild the instruments with the new style, continuing from the same moment.
      const wasPlaying = playing;
      const at = playback.current?.getTime() ?? time;
      disposePlayback();
      setTime(at);
      setConfig(recipe);
      setConfigSource("generated");
      resumeWithNewStyle.current = wasPlaying;
    } catch (failure) {
      if (!abort.signal.aborted) setError(failure.message);
    } finally {
      if (!abort.signal.aborted) setGenerating(false);
    }
  }

  if (!selectedTrack) {
    return (
      <section className="music-player" aria-label="Track music player">
        <p className="eyebrow">Earth Frequencies</p>
        <h2>Listen to the planet</h2>
        <p className="muted">Choose a NASA visualization from the jukebox below. The globe turns and a scan line reads the map, turning the data under it into music.</p>
      </section>
    );
  }

  const scanU = scanPosition(time);
  const sourceText = { generated: "Gemini style", default: "Default style", stale: "Default style (track data changed; regenerate)" }[configSource];

  return (
    <section className="music-player" aria-label="Track music player">
      <p className="eyebrow">Now playing</p>
      <h2>{selectedTrack.title}</h2>

      <div className="transport">
        <button
          className="play-button"
          onClick={playing ? pause : play}
          disabled={!ready || starting}
          aria-label={playing ? "Pause" : "Play"}
        >
          {starting ? <span className="spinner" aria-hidden /> : playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="timeline">
          <input
            type="range" min={0} max={duration} step={0.1} value={Math.min(time, duration)}
            onChange={(event) => seek(Number(event.target.value))}
            disabled={!ready} aria-label="Position"
            style={{ "--progress": `${duration ? (100 * Math.min(time, duration)) / duration : 0}%` }}
          />
          <div className="times">
            <span>{formatTime(time)}</span>
            <span>{loading ? "Loading…" : `Scanning ${formatLongitude(scanU)}`}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      <label className="volume">
        <span>Volume</span>
        <input
          type="range" min={0} max={1} step={0.01} value={volume}
          onChange={(event) => changeVolume(Number(event.target.value))}
          style={{ "--progress": `${volume * 100}%` }}
        />
      </label>

      <ul className="legend">
        {MAPPINGS.map(([key, data, sound]) => (
          <li key={key}><span className={`swatch swatch-${key}`} aria-hidden /><strong>{data}</strong> → {sound}</li>
        ))}
      </ul>
      <div className="temperature-scale" aria-hidden><span>cold</span><span>warm</span></div>

      <details className="style-panel">
        <summary>
          <span>Style</span>
          <span className="muted">{config ? `${styleLabel(config)} · ${sourceText}` : "…"}</span>
        </summary>
        <label htmlFor="music-style">Describe a mood for Gemini</label>
        <div className="style-row">
          <input
            id="music-style" value={prompt} maxLength={1000} placeholder="Calm, glassy, slow ambient"
            onChange={(event) => setPrompt(event.target.value)} disabled={generating}
            onKeyDown={(event) => { if (event.key === "Enter" && features && !generating) generate(); }}
          />
          <button onClick={generate} disabled={loading || generating || !features}>
            {generating ? "Generating…" : "Generate"}
          </button>
        </div>
        <p className="muted small">The style changes key, tempo, and instruments. The data always drives the notes.</p>
      </details>

      {notice && <p className="notice" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
);
const PauseIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" /></svg>
);
