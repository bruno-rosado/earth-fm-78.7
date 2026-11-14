import { useEffect, useRef } from "react";

// Calls `callback` every animation frame while mounted. Use it to write
// fast-changing values straight to the DOM without re-rendering React.
export default function useAnimationFrame(callback) {
  const latest = useRef(callback);
  latest.current = callback;
  useEffect(() => {
    let frame = requestAnimationFrame(function loop(now) {
      latest.current(now);
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
}
