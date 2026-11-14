import { useEffect, useState } from "react";
import Scene from "./components/scene/Scene";
import { getTracks } from "./services/api";

export default function App() {
  const [tracks, setTracks] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(null); // null = nothing selected (plain Earth)

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

  return <Scene tracks={tracks} selectedTrack={selectedTrack} onSelect={setSelectedTrack} />;
}
