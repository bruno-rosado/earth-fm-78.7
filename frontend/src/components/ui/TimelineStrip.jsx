// The seek bar: a strip colored by the sea temperature the scan line will pass
// over, dimmed where it crosses land. Drag or click anywhere to seek.
import { useEffect, useMemo, useRef } from "react";
import { scanTimeline } from "../../services/tone/musicMapping";
import { formatTime, temperatureColor } from "./format";
import useAnimationFrame from "./useAnimationFrame";

const STEPS = 240;

export default function TimelineStrip({ features, duration, getTime, onSeek, disabled }) {
  const canvasRef = useRef(null);
  const playheadRef = useRef(null);
  const playedRef = useRef(null);
  const currentRef = useRef(null);
  const inputRef = useRef(null);
  const strip = useMemo(
    () => (features && duration ? scanTimeline(features, duration, STEPS) : null),
    [features, duration],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    canvas.width = STEPS;
    canvas.height = 1;
    context.clearRect(0, 0, STEPS, 1);
    if (!strip) return;
    strip.forEach(({ warmth, presence }, x) => {
      context.fillStyle = temperatureColor(warmth, 0.25 + Math.min(1, presence * 1.4) * 0.75);
      context.fillRect(x, 0, 1, 1);
    });
  }, [strip]);

  useAnimationFrame(() => {
    const time = Math.min(duration, getTime());
    const percent = duration ? (100 * time) / duration : 0;
    playheadRef.current.style.left = `${percent}%`;
    playedRef.current.style.width = `${percent}%`;
    currentRef.current.textContent = formatTime(time);
    if (document.activeElement !== inputRef.current) inputRef.current.value = time;
  });

  return (
    <div className={`timeline ${disabled ? "is-disabled" : ""}`}>
      <span className="timeline-time" ref={currentRef}>0:00</span>
      <div className="timeline-track">
        <canvas ref={canvasRef} className={`timeline-canvas ${strip ? "is-ready" : ""}`} aria-hidden />
        <div className="timeline-played" ref={playedRef} aria-hidden />
        <div className="timeline-playhead" ref={playheadRef} aria-hidden />
        <input
          ref={inputRef}
          type="range" min={0} max={duration || 1} step={0.1} defaultValue={0}
          onInput={(event) => onSeek(Number(event.target.value))}
          disabled={disabled} aria-label="Seek"
        />
      </div>
      <span className="timeline-time">{formatTime(duration)}</span>
    </div>
  );
}
