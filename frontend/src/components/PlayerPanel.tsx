import { useEffect, useRef, useState, type RefObject } from "react";
import AudioVisualizer from "./AudioVisualizer";
import TrackSearch from "./TrackSearch";
import { scanPath, type DataSource } from "../services/tone/musicMapping.js";
import type { Track } from "../types";
import type { TrackPlayer } from "../services/tone/useTrackPlayer";
import { currentVisualData, describeTrack, formatSpokenTime, formatVisualValue, SOUND_LEGEND, type AccessibilityPreferences } from "../services/accessibility.js";
import type { SpeechReader } from "../services/useAccessibility";

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
  preferences: AccessibilityPreferences;
  speech: SpeechReader;
  onClose: () => void;
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export default function PlayerPanel({ track, videoRef, player, preferences, speech, onClose }: PlayerPanelProps) {
  const [time, setTime] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [track.id]);
  const data = currentVisualData(track.features, time);

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
    <section className="player-panel" aria-labelledby="player-title">
      <div className="player-heading">
        <div>
          <p className="eyebrow">Now in rotation</p>
          <h2 id="player-title" tabIndex={-1} ref={heading}>{track.title}</h2>
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
            aria-label={`NASA visualization: ${track.title}`}
            aria-describedby="visual-description"
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
            <span>Visual data field</span>
            <span>Color warmth · visual flow</span>
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
            reducedMotion={preferences.reducedMotion}
            highContrast={preferences.highContrast}
            pausedTime={player.playing ? 0 : time}
          />
          <div className="data-legend" aria-hidden>
            <span>Blue / less motion</span><i /><span>Red / more motion</span>
          </div>
          <dl className="current-data" aria-label="Current visual feature values">
            <div><dt>Brightness</dt><dd>{formatVisualValue(data.brightness)}</dd></div>
            <div><dt>Contrast</dt><dd>{formatVisualValue(data.contrast)}</dd></div>
            <div><dt>Frame change</dt><dd>{formatVisualValue(data.motion)}</dd></div>
          </dl>

          <div className="transport">
            <button
              className="play-button"
              type="button"
              onClick={player.toggle}
              disabled={!player.ready || player.starting}
              aria-label={player.playing ? "Pause" : "Play"}
              aria-describedby="playback-status"
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
                aria-valuetext={`${formatSpokenTime(time)} of ${formatSpokenTime(track.duration)}`}
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
                aria-valuetext={`${Math.round(player.volume * 100)} percent`}
              />
            </label>
          </div>
          {player.error && <p className="player-error" role="alert">{player.error}</p>}
          <p id="playback-status" className="playback-note" role="status">{player.starting ? "Starting playback…" : player.playing ? "Playing video and generated sound." : "Paused. Press Play to listen."}</p>
          {player.notice && <p className="player-notice" role="status">{player.notice}</p>}
          <div className="access-actions"><button type="button" className="access-button" onClick={() => speech.read(describeTrack(track))}>Explain track description</button>{speech.speaking && <button type="button" className="access-button" onClick={speech.stop}>Stop reading</button>}</div>
          <p className="playback-note">
            Image data guides pitch; latitude shapes tone color and harmony. Current speed and direction shape rhythm and pan.
          </p>
        </div>
      </div>

      <details className="sound-description" id="visual-description"><summary>What this visualization sounds like</summary><p>{SOUND_LEGEND}</p><p>The percentages above describe image brightness, contrast, and change between sampled frames. Color is supplemented by these written values and requested narration.</p></details>

      <a className="source-link" href={track.source} target="_blank" rel="noreferrer">View source at NASA SVS <span className="sr-only">(opens in a new tab)</span><span aria-hidden>↗</span></a>
      <TrackSearch key={track.id} trackId={track.id} speech={speech} />
    </section>
  );
}
