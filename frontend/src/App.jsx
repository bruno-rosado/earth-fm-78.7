import { useEffect, useRef, useState } from "react";
import Scene from "./components/scene/Scene";
import MusicPlayer from "./services/tone/musicPlayer";
import { getTracks } from "./services/api";
import "./styles/components/player.css";

export default function App() {
  const [tracks, setTracks] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(null); // null = nothing selected (plain Earth)
  const videoRef = useRef(null);

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

  return (
    <>
      {/* Dev 3: full-page 3D scene (globe, background, jukebox) */}
      <Scene tracks={tracks} selectedTrack={selectedTrack} onSelect={setSelectedTrack} videoRef={videoRef} />
      {/* Dev 4: music player, floating on top of the scene */}
      <div className="player-overlay">
        <MusicPlayer selectedTrack={selectedTrack} videoRef={videoRef} />
      </div>
    </>
  );
}
