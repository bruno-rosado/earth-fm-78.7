import { useCallback, useEffect, useRef, useState } from "react";
import AlbumGrid from "./components/AlbumGrid";
import AccessibilitySettings from "./components/AccessibilitySettings";
import PlayerPanel from "./components/PlayerPanel";
import ReadAloud from "./components/ReadAloud";
import { getTrack, getTrackFeatures, getTracks } from "./services/api";
import useTrackPlayer from "./services/tone/useTrackPlayer";
import { describePage } from "./services/accessibility.js";
import { useAccessibilityPreferences, useSpeech } from "./services/useAccessibility";
import type { CatalogTrack, Track } from "./types";

export default function App() {
  const [tracks, setTracks] = useState<CatalogTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(true);
  const [tracksError, setTracksError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [track, setTrack] = useState<Track | null>(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const player = useTrackPlayer(track, videoRef);
  const settings = useAccessibilityPreferences();
  const speech = useSpeech(settings.preferences, player.setDucking);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    settingsTrigger.current?.focus();
  }, []);
  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeSettings(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, closeSettings]);

  useEffect(() => {
    const controller = new AbortController();
    getTracks(controller.signal)
      .then(setTracks)
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setTracksError(failure instanceof Error ? failure.message : "Could not load the album collection.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setTracksLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setTrack(null);
      setTrackLoading(false);
      setTrackError("");
      return;
    }

    const controller = new AbortController();
    setTrack(null);
    setTrackLoading(true);
    setTrackError("");
    Promise.all([
      getTrack(selectedId, controller.signal),
      getTrackFeatures(selectedId, controller.signal),
    ])
      .then(([details, features]) => setTrack({ ...details, features }))
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setTrackError(failure instanceof Error ? failure.message : "Could not load this track.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setTrackLoading(false);
      });
    return () => controller.abort();
  }, [selectedId]);

  const selectTrack = (id: string) => {
    if (id === selectedId) return;
    speech.stop();
    setTrack(null);
    setSelectedId(id);
  };

  const closeTrack = () => {
    speech.stop();
    const previousId = selectedId;
    setSelectedId(null);
    setTrack(null);
    if (previousId) document.getElementById(`track-${previousId}`)?.focus();
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="Earth Frequencies home" onClick={(event) => {
          event.preventDefault();
          closeTrack();
        }}>
          <span className="wordmark-icon" aria-hidden>EF</span>
          <span>EARTH <strong>FREQUENCIES</strong></span>
        </a>
        <div className="header-actions">
          <button type="button" className="access-button contrast-toggle" aria-pressed={settings.preferences.highContrast} onClick={() => settings.setPreference("highContrast", !settings.preferences.highContrast)}>High contrast <span aria-hidden>{settings.preferences.highContrast ? "On" : "Off"}</span></button>
          <button type="button" className="access-button" ref={settingsTrigger} aria-expanded={settingsOpen} aria-controls="accessibility-settings" onClick={() => settingsOpen ? closeSettings() : setSettingsOpen(true)}>Accessibility</button>
        </div>
      </header>

      <AccessibilitySettings open={settingsOpen} settings={settings} speech={speech} onClose={closeSettings} onReadPage={() => speech.read(describePage(tracks))} />
      <p className="sr-only" role="status" aria-atomic="true">{speech.message}</p>
      <main id="main-content" tabIndex={-1}>

      <section className="intro">
        <p className="eyebrow"><span className="status-dot" /> A jukebox for our living planet</p>
        <h1>Listen to the<br /><em>shape of Earth.</em></h1>
        <p className="intro-copy">
          Scientific visualizations become original soundtracks. Choose a record
          to see the data and hear it come alive.
        </p>
        <div className="page-reading-actions"><button className="access-button" type="button" onClick={() => speech.read(describePage(tracks))} disabled={tracksLoading}>{speech.supported ? "Read page aloud" : "Show page transcript"}</button>{speech.speaking && <button className="access-button" type="button" onClick={speech.stop}>Stop reading</button>}</div>
      </section>

      {speech.text && <ReadAloud speech={speech} />}

      <section className="collection" aria-labelledby="collection-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">The collection</p>
            <h2 id="collection-title">Curated Earth stories</h2>
          </div>
          <span className="track-count">{tracks.length.toString().padStart(2, "0")} TRACKS</span>
        </div>

        {tracksLoading && <p className="status-message" role="status">Loading the collection…</p>}
        {tracksError && <p className="status-message error-message" role="alert">{tracksError}</p>}
        {!tracksLoading && !tracksError && tracks.length === 0 && (
          <p className="status-message">No albums are available yet.</p>
        )}
        {tracks.length > 0 && (
          <AlbumGrid tracks={tracks} selectedId={selectedId} onSelect={selectTrack} />
        )}
      </section>

      {trackLoading && <p className="status-message track-loading" role="status">Preparing the track and its data…</p>}
      {trackError && (
        <div className="track-error" role="alert">
          <p>{trackError}</p>
          <button className="text-button" type="button" onClick={closeTrack}>Back to collection</button>
        </div>
      )}
      {track && (
        <PlayerPanel
          key={track.id}
          track={track}
          videoRef={videoRef}
          player={player}
          preferences={settings.preferences}
          speech={speech}
          onClose={closeTrack}
        />
      )}
      </main>

      <footer className="site-footer">
        <span>EARTH FREQUENCIES</span>
        <span>Preprocessed NASA imagery · Sonification in your browser</span>
      </footer>
    </div>
  );
}
