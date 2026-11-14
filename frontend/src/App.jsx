import { useEffect, useState } from "react";
import MusicPlayer from "./services/tone/musicPlayer";

export default function App() {
  // const [msg, setMsg] = useState("loading...");
  // useEffect(() => {
  //   fetch("/api/hello")
  //     .then((r) => r.json())
  //     .then((d) => setMsg(d.message))
  //     .catch((e) => setMsg(`Error: ${e.message}`));
  // }, []);

  return (
   <div>
  <h1>Example</h1>

    <MusicPlayer />
   </div>
  );
}
