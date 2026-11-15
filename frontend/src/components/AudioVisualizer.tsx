import { useEffect, useRef } from "react";
import { sampleCell, scanPath, type ScanPattern } from "../services/tone/musicMapping.js";
import type { FeatureSample } from "../types";

interface AudioVisualizerProps {
  features: FeatureSample[];
  getTime: () => number;
  playing: boolean;
  pattern: ScanPattern;
  reducedMotion: boolean;
  highContrast: boolean;
  pausedTime: number;
}

export default function AudioVisualizer({ features, getTime, playing, pattern, reducedMotion, highContrast, pausedTime }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || features.length === 0) return;

    let frame = 0;
    const draw = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(bounds.width * ratio));
      const height = Math.max(1, Math.floor(bounds.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, bounds.width, bounds.height);
      const time = getTime();
      const rows = features[0].grid.length;
      const columns = features[0].grid[0].length;
      const insetX = 8;
      const insetY = 8;
      const cellWidth = (bounds.width - insetX * 2) / columns;
      const cellHeight = (bounds.height - insetY * 2) / rows;

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const [presence, temperature, speed] = sampleCell(
            features,
            time,
            (column + 0.5) / columns,
            row,
          );
          const hue = 220 - temperature * 180;
          const lightness = 28 + speed * 36;
          context.fillStyle = highContrast ? `hsl(${hue}, 85%, ${20 + speed * 55 + presence * 10}%)` : `hsla(${hue}, 78%, ${lightness}%, ${0.12 + presence * 0.88})`;
          context.fillRect(
            insetX + column * cellWidth + 1,
            insetY + row * cellHeight + 1,
            Math.max(0, cellWidth - 2),
            Math.max(0, cellHeight - 2),
          );
        }
      }

      if (!reducedMotion) {
        const path = scanPath(time, pattern);
        context.beginPath();
        context.strokeStyle = highContrast ? "#fff" : playing ? "rgba(248, 219, 169, .95)" : "rgba(248, 219, 169, .45)";
        context.lineWidth = highContrast ? 3 : 2;
        if (path.type === "vertical") {
          const scanX = insetX + path.position * (bounds.width - insetX * 2);
          context.moveTo(scanX, insetY);
          context.lineTo(scanX, bounds.height - insetY);
          context.stroke();
        } else if (path.type === "rotating-line") {
          const length = Math.hypot(bounds.width, bounds.height);
          context.save();
          context.translate(bounds.width / 2, bounds.height / 2);
          context.rotate(path.angle);
          context.moveTo(-length / 2, 0);
          context.lineTo(length / 2, 0);
          context.stroke();
          context.restore();
        } else {
          const radiusX = path.radius * bounds.width / Math.SQRT2;
          const radiusY = path.radius * bounds.height / Math.SQRT2;
          context.ellipse(bounds.width / 2, bounds.height / 2, Math.max(radiusX, 1), Math.max(radiusY, 1), 0, 0, Math.PI * 2);
          context.stroke();
        }
      }
      if (playing && !reducedMotion) frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);
    const timer = reducedMotion && playing ? window.setInterval(draw, 1000) : undefined;
    const resize = () => { if (!playing || reducedMotion) draw(); };
    window.addEventListener("resize", resize);
    return () => { window.cancelAnimationFrame(frame); window.clearInterval(timer); window.removeEventListener("resize", resize); };
  }, [features, getTime, playing, pattern, reducedMotion, highContrast, pausedTime]);

  return <canvas className="data-visualizer" ref={canvasRef} role="img" aria-label="Image feature grid: color indicates visual warmth and intensity indicates optical flow. Written values and a sound explanation follow below." />;
}
