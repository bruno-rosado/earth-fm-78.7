// Full-screen loader that fades out once the 3D scene's textures are ready.
import { useEffect, useState } from "react";
import { useProgress } from "@react-three/drei";

export default function LoadingScreen() {
  const { active, progress } = useProgress();
  const [hidden, setHidden] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const done = (!active && progress >= 100) || timedOut;

  // Never block the page for long if a texture is slow or fails.
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!done) return undefined;
    const timer = setTimeout(() => setHidden(true), 900);
    return () => clearTimeout(timer);
  }, [done]);

  if (hidden) return null;
  return (
    <div className={`loading-screen ${done ? "is-done" : ""}`} aria-hidden={done}>
      <div className="loading-mark" />
      <p>Tuning in to Earth…</p>
      <div className="loading-bar"><span style={{ width: `${Math.round(progress)}%` }} /></div>
    </div>
  );
}
