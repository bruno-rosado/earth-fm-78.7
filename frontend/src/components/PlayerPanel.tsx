import { useEffect, useState, type RefObject } from "react";
import AudioVisualizer from "./AudioVisualizer";
import { scanPath, type DataSource } from "../services/tone/musicMapping.js";
import type { Track } from "../types";
import type { TrackPlayer } from "../services/tone/useTrackPlayer";

const SCAN_PATTERNS = [
  { value: "left-to-right", label: "Left to right" },
  { value: "right-to-left", label: "Right to left" },
  { value: "clockwise", label: "Clockwise" },
  { value: "counter-clockwise", label: "Counterclockwise" },
  { value: "outward", label: "Outward" },
  { value: "inward", label: "Inward" },
] as const;

const DATA_SOURCES = [
  { value: "brightness", label: "Image brightness" },
  { value: "color", label: "Image color" },
] as const satisfies readonly { value: DataSource; label: string }[];

interface PlayerPanelProps {
  track: Track;
  videoRef: RefObject<HTMLVideoElement | null>;
  player: TrackPlayer;
  onClose: () => void;
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export default function PlayerPanel({ track, videoRef, player, onClose }: PlayerPanelProps) {
  const [time, setTime] = useState(0);

  useEffect(() => {
    if (!player.playing) {
      setTime(player.getTime());
      return;
    }
    const timer = window.setInterval(() => setTime(player.getTime()), 100);
    return () => window.clearInterval(timer);
  }, [player.playing, player.getTime]);

  const seek = (value: number) => {
    setTime(value);
    player.seek(value);
  };
  const scan = scanPath(time, track.duration, player.scanPattern);

  return (
    <section className="player-panel" aria-label={`Now playing ${track.title}`}>
      <div className="player-heading">
        <div>
          <p className="eyebrow">Now in rotation</p>
          <h2>{track.title}</h2>
          <p className="track-description">{track.description}</p>
        </div>
        <button className="text-button" type="button" onClick={onClose}>Back to collection</button>
      </div>

      <div className="player-layout">
        <div className="video-frame">
          <video
            ref={videoRef}
            className="track-video"
            src={track.video}
            poster={track.cover ?? undefined}
            preload="metadata"
            playsInline
            muted
          />
          <svg
            className="video-scan-overlay"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            {scan.type === "vertical" && (
              <line x1={scan.position * 100} y1="0" x2={scan.position * 100} y2="100" />
            )}
            {scan.type === "rotating-line" && (
              <line x1="-21.2" y1="50" x2="121.2" y2="50" transform={`rotate(${scan.angle * 180 / Math.PI} 50 50)`} />
            )}
            {scan.type === "ring" && <circle cx="50" cy="50" r={Math.max(1, scan.radius * 70.71)} />}
          </svg>
          <span className="video-caption">NASA SCIENTIFIC VISUALIZATION</span>
        </div>

        <div className="player-side">
          <div className="visualizer-heading">
            <span>Ocean data field</span>
            <span>Temperature · current speed</span>
          </div>
          <div className="scan-pattern-control" role="group" aria-label="Scanner pattern">
            <span>Scanner pattern</span>
            {SCAN_PATTERNS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={player.scanPattern === value}
                disabled={player.starting}
                onClick={() => void player.setScanPattern(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="data-source-control">
            <span>Pitch follows</span>
            <select
              value={player.dataSource}
              disabled={player.starting}
              aria-label="Data mapped to pitch"
              onChange={(event) => {
                const source = DATA_SOURCES.find(({ value }) => value === event.currentTarget.value)?.value;
                if (source) void player.setDataSource(source);
              }}
            >
              {DATA_SOURCES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <AudioVisualizer
            features={track.features}
            duration={track.duration}
            getTime={player.getTime}
            playing={player.playing}
            pattern={player.scanPattern}
          />
          <div className="data-legend" aria-hidden>
            <span>Cold / slow</span><i /><span>Warm / fast</span>
          </div>

          <div className="transport">
            <button
              className="play-button"
              type="button"
              onClick={player.toggle}
              disabled={!player.ready || player.starting}
              aria-label={player.playing ? "Pause" : "Play"}
            >
              {player.starting ? "…" : player.playing ? "Ⅱ" : "▶"}
            </button>
            <div className="timeline">
              <input
                type="range"
                min={0}
                max={track.duration}
                step={0.1}
                value={Math.min(time, track.duration)}
                onChange={(event) => seek(Number(event.target.value))}
                aria-label="Playback position"
              />
              <div className="time-labels"><span>{formatTime(time)}</span><span>{formatTime(track.duration)}</span></div>
            </div>
            <label className="volume-control">
              <span aria-hidden>VOL</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={player.volume}
                onChange={(event) => player.setVolume(Number(event.target.value))}
                aria-label="Volume"
              />
            </label>
          </div>
          {player.error && <p className="player-error" role="alert">{player.error}</p>}
          {player.notice && <p className="player-notice" role="status">{player.notice}</p>}
          <p className="playback-note">
            Image data guides pitch; latitude shapes tone color and harmony. Current speed and direction shape rhythm and pan.
          </p>
        </div>
      </div>

      <a className="source-link" href={track.source} target="_blank" rel="noreferrer">View source at NASA SVS ↗</a>
    </section>
  );
}
