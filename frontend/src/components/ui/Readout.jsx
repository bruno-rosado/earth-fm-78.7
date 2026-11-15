// Live readout: where the scan line is, what it's over, the chord, and a meter
// per latitude band. Updated every frame straight to the DOM.
import { useRef } from "react";
import { scanPosition } from "../../services/tone/musicMapping";
import { sonification } from "../../services/tone/sonificationState";
import { bandLatitude, formatLongitude, regionAt, temperatureColor } from "./format";
import useAnimationFrame from "./useAnimationFrame";

const ROWS = 8;
const MAPPINGS = [
  ["Latitude", "pitch"],
  ["Color warmth", "tone · chords"],
  ["Visual motion", "rhythm · volume"],
  ["Flow direction", "stereo pan"],
];

export default function Readout({ getTime }) {
  const longitudeRef = useRef(null);
  const regionRef = useRef(null);
  const chordRef = useRef(null);
  const barRefs = useRef([]);

  useAnimationFrame(() => {
    const u = scanPosition(getTime());
    longitudeRef.current.textContent = formatLongitude(u);
    const region = regionAt(u);
    if (regionRef.current.textContent !== region) regionRef.current.textContent = region;
    chordRef.current.textContent = sonification.active && sonification.chord ? sonification.chord : "—";
    sonification.bands.forEach((band, row) => {
      const bar = barRefs.current[row];
      if (!bar) return;
      const level = sonification.active ? Math.min(1, band.level * 1.6) : 0;
      bar.style.transform = `scaleX(${Math.max(0.02, level)})`;
      bar.style.background = temperatureColor(band.warmth);
      bar.style.boxShadow = `0 0 ${6 + level * 14}px ${temperatureColor(band.warmth, 0.4 + level * 0.5)}`;
    });
  });

  return (
    <aside className="readout" aria-label="Live data readout">
      <div className="readout-label">Scanning longitude</div>
      <div className="readout-longitude" ref={longitudeRef}>—</div>
      <div className="readout-region" ref={regionRef}>—</div>

      <div className="readout-stats">
        <div>
          <div className="readout-label">Chord</div>
          <div className="readout-chord" ref={chordRef}>—</div>
        </div>
        <div className="readout-scale" aria-hidden>
          <div className="readout-label">Color warmth</div>
          <div className="temperature-ramp"><span>cold</span><span>warm</span></div>
        </div>
      </div>

      <div className="readout-label">Latitude voices</div>
      <ul className="band-meters">
        {Array.from({ length: ROWS }, (_, row) => (
          <li key={row}>
            <span className="band-lat">{bandLatitude(row, ROWS)}</span>
            <span className="band-track"><span className="band-bar" ref={(el) => { barRefs.current[row] = el; }} /></span>
          </li>
        ))}
      </ul>

      <dl className="mapping">
        {MAPPINGS.map(([data, sound]) => (
          <div key={data}><dt>{data}</dt><dd>{sound}</dd></div>
        ))}
      </dl>
    </aside>
  );
}
