import { useCallback, useEffect, useRef, useState } from "react";
import Scene from "./components/scene/Scene";
import Browser from "./components/ui/Browser";
import Dock from "./components/ui/Dock";
import Hero from "./components/ui/Hero";
import ImportToasts from "./components/ui/ImportToasts";
import LoadingScreen from "./components/ui/LoadingScreen";
import Readout from "./components/ui/Readout";
import ListeningLab from "./components/ui/ListeningLab";
import SearchBar from "./components/ui/SearchBar";
import { getTracks, removeTrack } from "./services/api";
import useImports from "./services/useImports";
import useTrackPlayer from "./services/tone/useTrackPlayer";
import "./styles/components/ui.css";

export default function App() {
  const [tracks, setTracks] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(null); // null = nothing selected (plain Earth)
  const [autoPlay, setAutoPlay] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [browserView, setBrowserView] = useState("browse"); // "browse" or "library"
  const [query, setQuery] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [labOpen, setLabOpen] = useState(true);
  const videoRef = useRef(null);
  const player = useTrackPlayer(selectedTrack, videoRef, { autoPlay });

  const refreshTracks = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const list = await getTracks();
      setTracks(list);
      return list;
    } catch (err) {
      console.error("Could not load tracks:", err);
      setCatalogError("Couldn’t reach your track library. Check that the backend is running, then retry.");
      return [];
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => { refreshTracks(); }, [refreshTracks]); // run once when the page loads

  // Picking a record plays it straight away, like a jukebox.
  const select = useCallback((track) => {
    setAutoPlay(true);
    setSelectedTrack(track);
    setBrowserOpen(false);
  }, []);
  const close = useCallback(() => setSelectedTrack(null), []);

  // A finished import joins the library and starts playing.
  const { jobs, importVideo, dismiss } = useImports(useCallback(async (track) => {
    const list = await refreshTracks();
    select(list.find((t) => t.id === track.id) ?? track);
  }, [refreshTracks, select]));

  // Escape closes the browser first, then the open track.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "Escape" || event.target.closest?.("input")) return;
      if (browserOpen) setBrowserOpen(false);
      else if (selectedTrack && labOpen) setLabOpen(false);
      else close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [browserOpen, close, selectedTrack, labOpen]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key.toLowerCase() !== "l" || event.metaKey || event.ctrlKey || event.altKey || event.target.closest?.("input, textarea, select, [contenteditable]")) return;
      if (selectedTrack && !browserOpen) setLabOpen((open) => !open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedTrack, browserOpen]);

  const openBrowser = useCallback(() => { setBrowserView("browse"); setBrowserOpen(true); }, []);
  const openLibrary = useCallback(() => { setBrowserView("library"); setBrowserOpen(true); }, []);
  const closeBrowser = useCallback(() => setBrowserOpen(false), []);

  // The logo takes you home: no track open, panel closed, search cleared.
  const goHome = useCallback((event) => {
    event.preventDefault();
    setSelectedTrack(null);
    setBrowserOpen(false);
    setQuery("");
  }, []);

  const remove = useCallback(async (track) => {
    try {
      await removeTrack(track.id);
      if (selectedTrack?.id === track.id) setSelectedTrack(null);
      refreshTracks();
    } catch (err) {
      console.error(err);
    }
  }, [selectedTrack, refreshTracks]);

  return (
    <>
      {/* Dev 3: full-page 3D scene (globe, background, jukebox) */}
      <Scene tracks={tracks} selectedTrack={selectedTrack} onSelect={select} videoRef={videoRef} />

      <header className="topbar">
        <a className="brand" href="/" onClick={goHome} aria-label="Earth Frequencies home">
          <span className="brand-mark" aria-hidden />
          <span className="brand-name">Earth <strong>Frequencies</strong></span>
        </a>
        <SearchBar value={query} onChange={setQuery} open={browserOpen} onOpen={openBrowser} onClose={closeBrowser} />
        <nav className="topbar-actions" aria-label="Library">
          <button type="button" className={`chip ${browserOpen && browserView === "library" ? "is-active" : ""}`} onClick={browserOpen && browserView === "library" ? closeBrowser : openLibrary}>
            <svg viewBox="0 0 24 24" aria-hidden><path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            My library
            {tracks.length > 0 && <span className="chip-count">{tracks.length}</span>}
          </button>
        </nav>
        <ImportToasts jobs={jobs} hidden={browserOpen} onDismiss={dismiss} />
      </header>

      <div className={`ui-layer ${selectedTrack ? "is-focused" : ""} ${labOpen && selectedTrack ? "has-lab" : ""}`}>
        {!selectedTrack && <Hero tracks={tracks} loading={catalogLoading} error={catalogError} onRetry={refreshTracks} onStart={select} onBrowse={openBrowser} />}
        {selectedTrack && !labOpen && <div className="player-tools"><button className="chip" onClick={() => setLabOpen(true)} aria-expanded={false}>Inside the sound <kbd>L</kbd></button></div>}
        {selectedTrack && labOpen && <ListeningLab track={selectedTrack} player={player} videoRef={videoRef} onClose={() => setLabOpen(false)} />}
        {selectedTrack && <Readout key={`readout-${selectedTrack.id}`} getTime={player.getTime} />}
        {selectedTrack && <p className="experience-caption"><span className={`signal-dot ${player.playing ? "is-live" : ""}`} />{player.starting ? "Building your soundtrack…" : player.playing ? "Composed from the data · playing live" : "Press Space to listen · L opens the lab"}</p>}
        {selectedTrack && <Dock key={`dock-${selectedTrack.id}`} track={selectedTrack} player={player} onClose={close} />}
        {!selectedTrack && !browserOpen && <p className="browse-hint">Scroll or ← → to browse · Enter or click to play · / to search</p>}
      </div>

      {browserOpen && (
        <>
          <div className="browser-backdrop" onClick={closeBrowser} aria-hidden />
          <Browser
            query={query} view={browserView} tracks={tracks} selectedTrack={selectedTrack} jobs={jobs}
            onPlay={select} onImport={importVideo} onRemove={remove} onClose={closeBrowser} onBrowseAll={openBrowser}
          />
        </>
      )}

      <LoadingScreen />
    </>
  );
}
