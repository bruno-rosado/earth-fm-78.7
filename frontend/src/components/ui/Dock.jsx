// The now-playing dock: track, play/pause, seek, volume, style, and close.
import { useEffect, useRef, useState } from "react";
import TimelineStrip from "./TimelineStrip";
import { MOODS, describeStyle } from "../../services/tone/musicStyle";
import { sonification } from "../../services/tone/sonificationState";
import useAnimationFrame from "./useAnimationFrame";

const styleLabel = (config) => `${config.key} ${config.mode.replaceAll("_", " ")} · ${config.bpm} BPM`;

export default function Dock({ track, player, onClose }) {
  const { config, mood, ready, starting, playing, volume, error, notice } = player;
  const [styleOpen, setStyleOpen] = useState(false);
  const [muted, setMuted] = useState(null); // volume before muting
  const glowRef = useRef(null);

  // The play button breathes with the music.
  useAnimationFrame(() => {
    const level = playing && sonification.active ? sonification.getLevel() : 0;
    glowRef.current.style.setProperty("--level", level.toFixed(3));
  });

  useEffect(() => {
    setStyleOpen(false);
    setMuted(null);
  }, [track.id]);

  const toggleMute = () => {
    if (muted === null) {
      setMuted(volume);
      player.setVolume(0);
    } else {
      player.setVolume(muted || 0.8);
      setMuted(null);
    }
  };

  return (
    <div className="dock" role="region" aria-label="Player">
      <div className="dock-main">
        <div className="dock-track">
          {track.cover ? <img className="dock-cover" src={track.cover} alt="" /> : <div className="dock-cover" />}
          <div className="dock-meta">
            <div className="dock-title" title={track.title}>{track.title}</div>
            <div className="dock-subtitle">
              {config ? `${styleLabel(config)} · ${config.lead_instrument.replaceAll("_", " ")} · from the data` : "NASA Scientific Visualization Studio"}
            </div>
          </div>
        </div>

        <div className="dock-controls">
          <button className="icon-button" onClick={() => player.seek(0)} disabled={!ready} aria-label="Restart" title="Restart">
            <svg viewBox="0 0 24 24" aria-hidden><path d="M6 5h2v14H6zM9.5 12 18 6v12z" fill="currentColor" /></svg>
          </button>
          <button
            ref={glowRef}
            className={`play-button ${playing ? "is-playing" : ""} ${starting ? "is-starting" : ""}`}
            onClick={player.toggle}
            disabled={!ready || starting}
            aria-label={playing ? "Pause" : "Play"}
            title={playing ? "Pause (Space)" : "Play (Space)"}
          >
            <span className="play-icon" aria-hidden>
              <svg className="icon-play" viewBox="0 0 24 24"><path d="M8 5.2v13.6L19 12z" fill="currentColor" /></svg>
              <svg className="icon-pause" viewBox="0 0 24 24"><path d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z" fill="currentColor" /></svg>
            </span>
            {starting && <span className="play-spinner" aria-hidden />}
          </button>
          <button className="icon-button" onClick={() => player.seek(Math.min(player.duration - 0.2, player.getTime() + 10))} disabled={!ready} aria-label="Skip ahead 10 seconds" title="+10 s">
            <svg viewBox="0 0 24 24" aria-hidden><path d="M12 5V2l5 4-5 4V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z" fill="currentColor" /><text x="12" y="16" fontSize="6.5" textAnchor="middle" fill="currentColor" fontFamily="inherit" fontWeight="700">10</text></svg>
          </button>
        </div>

        <div className="dock-actions">
          <div className="volume">
            <button className="icon-button small" onClick={toggleMute} aria-label={volume === 0 ? "Unmute" : "Mute"}>
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
                {volume === 0
                  ? <path d="m16 9 5 6m0-6-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  : <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity={volume < 0.4 ? 0.35 : 1} />}
              </svg>
            </button>
            <input
              type="range" min={0} max={1} step={0.01} value={volume} aria-label="Volume"
              onChange={(event) => { setMuted(null); player.setVolume(Number(event.target.value)); }}
              style={{ "--progress": `${volume * 100}%` }}
            />
          </div>
          <button className={`chip ${styleOpen ? "is-active" : ""}`} onClick={() => setStyleOpen((open) => !open)} aria-expanded={styleOpen}>
            <svg viewBox="0 0 24 24" aria-hidden><path d="M12 2l2.2 6.3L20 10l-5.8 1.7L12 18l-2.2-6.3L4 10l5.8-1.7z" fill="currentColor" /></svg>
            Mood
          </button>
          <button className="icon-button small" onClick={onClose} aria-label="Back to all tracks" title="All tracks">
            <svg viewBox="0 0 24 24" aria-hidden><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>

      <TimelineStrip features={player.features} duration={player.duration} getTime={player.getTime} onSeek={player.seek} disabled={!ready} />

      {styleOpen && (
        <div className="style-popover">
          <label>Mood changes the instruments and feel. {config && <span className="muted">The {describeStyle(config)}.</span>}</label>
          <div className="style-presets">
            {MOODS.map((preset) => (
              <button type="button" key={preset.id} className={`chip ${mood === preset.id ? "is-active" : ""}`} title={preset.hint} onClick={() => player.setMood(preset.id)}>{preset.label}</button>
            ))}
          </div>
        </div>
      )}

      {(notice || error) && <p className={error ? "dock-message is-error" : "dock-message"} role={error ? "alert" : "status"}>{error || notice}</p>}
    </div>
  );
}
