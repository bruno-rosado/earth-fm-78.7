import { useEffect, useRef, useState } from "react";
import AlbumGrid from "./components/AlbumGrid";
import PlayerPanel from "./components/PlayerPanel";
import { getTrack, getTrackFeatures, getTracks } from "./services/api";
import useTrackPlayer from "./services/tone/useTrackPlayer";
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
    setTrack(null);
    setSelectedId(id);
  };

  const closeTrack = () => {
    setSelectedId(null);
    setTrack(null);
  };

  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="Earth Frequencies home" onClick={(event) => {
          event.preventDefault();
          closeTrack();
        }}>
          <span className="wordmark-icon" aria-hidden>EF</span>
          <span>EARTH <strong>FREQUENCIES</strong></span>
        </a>
        <span className="header-note">NASA DATA · GENERATED SOUND</span>
      </header>

      <section className="intro">
        <p className="eyebrow"><span className="status-dot" /> A jukebox for our living planet</p>
        <h1>Listen to the<br /><em>shape of Earth.</em></h1>
        <p className="intro-copy">
          Scientific visualizations become original soundtracks. Choose a record
          to see the data and hear it come alive.
        </p>
      </section>

      <section className="collection" aria-labelledby="collection-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">The collection</p>
            <h2 id="collection-title">Curated Earth stories</h2>
          </div>
          <span className="track-count">{tracks.length.toString().padStart(2, "0")} TRACKS</span>
        </div>

        {tracksLoading && <p className="status-message">Loading the collection…</p>}
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
          onClose={closeTrack}
        />
      )}

      <footer className="site-footer">
        <span>EARTH FREQUENCIES</span>
        <span>Preprocessed NASA imagery · Sonification in your browser</span>
      </footer>
    </main>
  );
}
