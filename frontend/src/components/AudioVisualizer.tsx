import { useEffect, useRef } from "react";
import { sampleCell, scanPosition } from "../services/tone/musicMapping.js";
import type { FeatureSample } from "../types";

interface AudioVisualizerProps {
  features: FeatureSample[];
  getTime: () => number;
  playing: boolean;
}

export default function AudioVisualizer({ features, getTime, playing }: AudioVisualizerProps) {
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
          context.fillStyle = `hsla(${hue}, 78%, ${lightness}%, ${0.12 + presence * 0.88})`;
          context.fillRect(
            insetX + column * cellWidth + 1,
            insetY + row * cellHeight + 1,
            Math.max(0, cellWidth - 2),
            Math.max(0, cellHeight - 2),
          );
        }
      }

      const scanX = insetX + scanPosition(time) * (bounds.width - insetX * 2);
      context.beginPath();
      context.moveTo(scanX, insetY);
      context.lineTo(scanX, bounds.height - insetY);
      context.strokeStyle = playing ? "rgba(248, 219, 169, .95)" : "rgba(248, 219, 169, .45)";
      context.lineWidth = 2;
      context.stroke();

      frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [features, getTime, playing]);

  return <canvas className="data-visualizer" ref={canvasRef} role="img" aria-label="Animated map of the track's measured ocean data" />;
}
