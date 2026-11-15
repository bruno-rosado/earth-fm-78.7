import { useEffect, useState, type RefObject } from "react";
import AudioVisualizer from "./AudioVisualizer";
import type { Track } from "../types";
import type { TrackPlayer } from "../services/tone/useTrackPlayer";

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
          <span className="video-caption">NASA SCIENTIFIC VISUALIZATION</span>
        </div>

        <div className="player-side">
          <div className="visualizer-heading">
            <span>Ocean data field</span>
            <span>Temperature · current speed</span>
          </div>
          <AudioVisualizer features={track.features} getTime={player.getTime} playing={player.playing} />
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
          <p className="playback-note">Sound is generated from the measured data as the video plays.</p>
        </div>
      </div>

      <a className="source-link" href={track.source} target="_blank" rel="noreferrer">View source at NASA SVS ↗</a>
    </section>
  );
}
