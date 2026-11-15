import { useRef, useState } from "react";
import { sampleCell, scanPosition, SCAN_PERIOD } from "../../services/tone/musicMapping";
import { dominantCell, LAYERS, timeForLongitude } from "../../services/tone/listeningTools";
import { downloadMidi } from "../../services/tone/midiExport";
import { bandLatitude, formatLongitude, temperatureColor } from "./format";
import useAnimationFrame from "./useAnimationFrame";
import "../../styles/components/lab.css";

const WIDTH = 576;
const HEIGHT = 240;
const percent = (value) => `${Math.round(value * 100)}%`;

export default function ListeningLab({ track, player, videoRef, onClose }) {
  const [view, setView] = useState("color");
  const [panel, setPanel] = useState("explore");
  const [message, setMessage] = useState("");
  const [mapMessage, setMapMessage] = useState("");
  const canvasRef = useRef(null);
  const longitudeRef = useRef(null);
  const latitudeRef = useRef(null);
  const valueRefs = useRef({});
  const lastFrame = useRef(0);
  const sourceRect = useRef({ x: 0, width: WIDTH });
  const features = player.features;
  const rows = features?.[0]?.grid?.length ?? 8;
  const cols = features?.[0]?.grid?.[0]?.length ?? 24;

  useAnimationFrame((now) => {
    if (panel !== "explore" || !features?.length || now - lastFrame.current < 80) return;
    lastFrame.current = now;
    const time = player.getTime();
    const u = scanPosition(time);
    canvasRef.current.setAttribute("aria-valuenow", (u * 360 - 180).toFixed(1));
    canvasRef.current.setAttribute("aria-valuetext", formatLongitude(u));
    longitudeRef.current.textContent = formatLongitude(u);
    const cells = Array.from({ length: rows }, (_, row) => sampleCell(features, time, u, row));
    const hot = dominantCell(cells);
    latitudeRef.current.textContent = hot.energy >= 0.1 ? `${bandLatitude(hot.row, rows)} · melody voice` : "Quiet region · no melody";
    const [presence, warmth, speed, flow] = hot.cell;
    for (const [id, value] of Object.entries({ presence, warmth, speed, flow })) {
      const element = valueRefs.current[id];
      if (element) {
        element.querySelector("b").textContent = id === "flow" ? `${Math.round(Math.abs(value) * 100)}% ${value < 0 ? "←" : value > 0 ? "→" : "·"}` : percent(value);
        element.style.setProperty("--value", `${Math.abs(value) * 100}%`);
      }
    }

    const context = canvasRef.current.getContext("2d");
    context.fillStyle = "#07101e";
    context.fillRect(0, 0, WIDTH, HEIGHT);
    const video = videoRef.current;
    sourceRect.current = { x: 0, width: WIDTH };
    if (view === "source") {
      if (video?.readyState >= 2 && video.videoWidth) {
        // Reuse the globe's decoded frame: no second download or video clock.
        const scale = Math.min(WIDTH / video.videoWidth, HEIGHT / video.videoHeight);
        const width = video.videoWidth * scale;
        const height = video.videoHeight * scale;
        sourceRect.current = { x: (WIDTH - width) / 2, width };
        context.drawImage(video, sourceRect.current.x, (HEIGHT - height) / 2, width, height);
      } else {
        context.fillStyle = "#93a7c6";
        context.font = "18px system-ui";
        context.textAlign = "center";
        context.fillText("Waiting for a NASA video frame…", WIDTH / 2, HEIGHT / 2);
      }
    } else {
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const [p, w, s] = sampleCell(features, time, (col + 0.5) / cols, row);
          context.fillStyle = view === "motion" ? `rgba(124, 196, 255, ${0.04 + p * s * 0.96})` : temperatureColor(w, 0.06 + p * 0.94);
          context.fillRect(col * WIDTH / cols + 1, row * HEIGHT / rows + 1, WIDTH / cols - 2, HEIGHT / rows - 2);
        }
      }
      if (hot.energy >= 0.1) {
        context.strokeStyle = "#fff";
        context.lineWidth = 2;
        context.strokeRect(Math.floor(u * cols) * WIDTH / cols + 1, hot.row * HEIGHT / rows + 1, WIDTH / cols - 2, HEIGHT / rows - 2);
      }
    }
    context.strokeStyle = "rgba(255,255,255,.9)";
    context.lineWidth = 2;
    context.beginPath();
    const scanX = sourceRect.current.x + u * sourceRect.current.width;
    context.moveTo(scanX, 0);
    context.lineTo(scanX, HEIGHT);
    context.stroke();
  });

  const jump = (u) => {
    const time = timeForLongitude(u, player.getTime(), player.duration, SCAN_PERIOD);
    if (time === null) setMapMessage("That longitude is outside this clip’s scan. Try another region.");
    else { player.seek(time); setMapMessage(""); }
  };

  const exportNotes = () => {
    try {
      downloadMidi({ track, config: player.config, mix: player.mix, solo: player.solo });
      setMessage("MIDI downloaded. Open it in a music app to hear or remix the notes. Synth effects stay in this player.");
    } catch (error) {
      setMessage(`Could not export: ${error.message}`);
    }
  };

  return (
    <aside className="listening-lab" aria-labelledby="lab-title">
      <div className="lab-heading">
        <div><p className="eyebrow">Inside the sound</p><h2 id="lab-title">Listening lab<span>.</span></h2></div>
        <button className="icon-button small" onClick={onClose} aria-label="Close listening lab">×</button>
      </div>
      <p className="lab-intro">Follow a note to its origin. Isolate a layer. Make Earth’s soundtrack your own.</p>

      <div className="lab-tabs lab-main-tabs" role="group" aria-label="Listening lab section">
        <button aria-pressed={panel === "explore"} className={panel === "explore" ? "is-active" : ""} onClick={() => setPanel("explore")}>Explore the data</button>
        <button aria-pressed={panel === "mix"} className={panel === "mix" ? "is-active" : ""} onClick={() => setPanel("mix")}>Mix & export</button>
      </div>

      <div hidden={panel !== "explore"}>
        <div className="lab-tabs" role="group" aria-label="Map view">
          {[["color", "Color"], ["motion", "Motion"], ["source", "NASA video"]].map(([id, label]) => (
            <button key={id} aria-pressed={view === id} className={view === id ? "is-active" : ""} onClick={() => setView(id)}>{label}</button>
          ))}
        </div>
        <div className="lab-map">
          <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} role="slider" tabIndex={0}
            aria-label="Scan longitude. Left and right arrows seek five seconds. Home restarts."
            aria-valuemin={-180} aria-valuemax={180} aria-valuetext="Longitude follows the playback position"
            onClick={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              const x = (event.clientX - bounds.left) / bounds.width * WIDTH;
              jump(Math.max(0, Math.min(0.99999, (x - sourceRect.current.x) / sourceRect.current.width)));
            }}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              event.stopPropagation();
              player.seek(event.key === "Home" ? 0 : event.key === "End" ? player.duration - 0.1 : Math.max(0, Math.min(player.duration - 0.1, player.getTime() + (event.key === "ArrowLeft" ? -5 : 5))));
            }}
          />
          <div className="lab-coordinates"><span>180°W</span><span>0°</span><span>180°E</span></div>
        </div>
        <div className="lab-scan"><span className={`signal-dot ${player.playing ? "is-live" : ""}`} /><strong ref={longitudeRef}>—</strong><span ref={latitudeRef}>Finding a voice…</span></div>
        <p className="lab-map-hint">Click the map to hear a longitude. {view === "source" ? "The line follows what you hear." : "White box = melody origin."}</p>
        {mapMessage && <p className="lab-message" role="status">{mapMessage}</p>}

        <dl className="lab-values">
          {[["warmth", "Color warmth", "tone + chords"], ["speed", "Visual motion", "rhythm + loudness"], ["flow", "Flow direction", "left / right"], ["presence", "Data coverage", "notes / silence"]].map(([id, label, effect]) => (
            <div key={id} ref={(element) => { valueRefs.current[id] = element; }}>
              <dt>{label}<small>{effect}</small></dt><dd><b>—</b><span className={`lab-value-bar is-${id}`} /></dd>
            </div>
          ))}
        </dl>
      </div>

      <div hidden={panel !== "mix"}>
        <div className="lab-section-title"><h3>Your mix</h3><button className="text-button" onClick={player.resetMix}>Reset</button></div>
        <p className="lab-intro">Three layers, one planet. Press S to hear a layer on its own. Your mix stays with you when you change moods.</p>
        <div className="lab-mixer">
          {LAYERS.map(({ id, label, detail }) => (
            <div className={`lab-channel ${player.solo && player.solo !== id ? "is-muted" : ""}`} key={id}>
              <label htmlFor={`mix-${id}`} title={detail}>{label}<small>{detail}</small></label>
              <input id={`mix-${id}`} type="range" min={0} max={1} step={0.01} value={player.mix[id]} onChange={(event) => player.setLayerLevel(id, Number(event.target.value))} aria-label={`${label} level`} />
              <button aria-pressed={player.solo === id} aria-label={`Solo ${label.toLowerCase()}`} onClick={() => player.setSolo(id)} title={`Hear only ${label.toLowerCase()}`}>S</button>
            </div>
          ))}
        </div>
        <button className="lab-export" onClick={exportNotes} disabled={!player.ready}>
          <svg viewBox="0 0 24 24" aria-hidden><path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Export this composition <span>MIDI ↗</span>
        </button>
        {message && <p className="lab-message" role="status">{message}</p>}
        <p className="lab-map-hint">MIDI saves the notes, tempo, and stereo movement. Open the file in a music app to arrange and remix it.</p>
      </div>
      <footer className="lab-footnote">Colors and movement are measured from the visualization and normalized, rather than read as physical °C or m/s.
        {/^https:\/\/svs\.gsfc\.nasa\.gov\//.test(track.source ?? "") && <a href={track.source} target="_blank" rel="noreferrer">View NASA source ↗</a>}
      </footer>
    </aside>
  );
}
