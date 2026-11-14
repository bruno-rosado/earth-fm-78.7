import { useCallback, useEffect, useRef, useState } from "react";
import Scene from "./components/scene/Scene";
import Dock from "./components/ui/Dock";
import Hero from "./components/ui/Hero";
import LoadingScreen from "./components/ui/LoadingScreen";
import Readout from "./components/ui/Readout";
import { getTracks } from "./services/api";
import useTrackPlayer from "./services/tone/useTrackPlayer";
import "./styles/components/ui.css";

export default function App() {
  const [tracks, setTracks] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(null); // null = nothing selected (plain Earth)
  const [autoPlay, setAutoPlay] = useState(false);
  const videoRef = useRef(null);
  const player = useTrackPlayer(selectedTrack, videoRef, { autoPlay });

  useEffect(() => {
    async function load() {
      try {
        setTracks(await getTracks());
      } catch (err) {
        console.error("Could not load tracks:", err);
      }
    }
    load();
  }, []); // [] = run once when the page loads

  // Picking a record plays it straight away, like a jukebox.
  const select = useCallback((track) => {
    setAutoPlay(true);
    setSelectedTrack(track);
  }, []);
  const close = useCallback(() => setSelectedTrack(null), []);

  // Escape returns to the track list.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape" && !event.target.closest?.("input")) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <>
      {/* Dev 3: full-page 3D scene (globe, background, jukebox) */}
      <Scene tracks={tracks} selectedTrack={selectedTrack} onSelect={select} videoRef={videoRef} />

      <header className="brand">
        <span className="brand-mark" aria-hidden />
        <span className="brand-name">Earth <strong>Frequencies</strong></span>
      </header>

      <div className={`ui-layer ${selectedTrack ? "is-focused" : ""}`}>
        {!selectedTrack && <Hero tracks={tracks} onStart={select} />}
        {selectedTrack && <Readout key={`readout-${selectedTrack.id}`} getTime={player.getTime} />}
        {selectedTrack && <Dock key={`dock-${selectedTrack.id}`} track={selectedTrack} player={player} onClose={close} />}
        {!selectedTrack && <p className="browse-hint">Scroll or ← → to browse · Enter or click to play</p>}
      </div>

      <LoadingScreen />
    </>
  );
}
