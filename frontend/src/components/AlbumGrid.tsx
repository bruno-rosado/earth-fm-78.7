import { useRef, useState } from "react";
import type { CatalogTrack } from "../types";

interface AlbumGridProps {
  tracks: CatalogTrack[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

export default function AlbumGrid({ tracks, selectedId, onSelect }: AlbumGridProps) {
  const flowRef = useRef<HTMLUListElement>(null);
  const [centeredIndex, setCenteredIndex] = useState(0);

  const updateCenter = () => {
    const flow = flowRef.current;
    if (!flow) return;
    const center = flow.getBoundingClientRect().left + flow.clientWidth / 2;
    let closestIndex = 0;
    let closestDistance = Infinity;
    Array.from(flow.children).forEach((item, index) => {
      const bounds = item.getBoundingClientRect();
      const distance = Math.abs(bounds.left + bounds.width / 2 - center);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    setCenteredIndex(closestIndex);
  };

  const scrollToTrack = (index: number) => {
    const flow = flowRef.current;
    const item = flow?.children[index];
    if (!flow || !item) return;
    const flowBounds = flow.getBoundingClientRect();
    const itemBounds = item.getBoundingClientRect();
    flow.scrollBy({ left: itemBounds.left + itemBounds.width / 2 - (flowBounds.left + flow.clientWidth / 2) });
  };

  return (
    <div className="cover-flow">
      <p className="cover-flow-hint">Scroll to explore · Select a record to listen</p>
      <ul className="cover-flow-list" ref={flowRef} onScroll={updateCenter} aria-label="Track collection">
        {tracks.map((track, index) => (
          <li
            className={`cover-flow-item${index === centeredIndex ? " is-centered" : index < centeredIndex ? " is-before" : " is-after"}`}
            key={track.id}
          >
            <button
              className={`album-card${track.id === selectedId ? " is-selected" : ""}`}
              id={`track-${track.id}`}
              type="button"
              onClick={() => onSelect(track.id)}
              aria-pressed={track.id === selectedId}
              aria-label={`Open ${track.title}, ${formatDuration(track.duration)}`}
            >
              <span className="album-cover">
                {track.cover ? <img src={track.cover} alt="" loading="lazy" /> : <span aria-hidden>EF</span>}
                <span className="album-index">{String(index + 1).padStart(2, "0")}</span>
              </span>
              <span className="album-copy">
                <span className="album-title">{track.title}</span>
                <span className="album-duration">{formatDuration(track.duration)} · NASA SVS</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="cover-flow-controls" aria-label="Browse tracks">
        <button type="button" onClick={() => scrollToTrack(centeredIndex - 1)} disabled={centeredIndex === 0} aria-label="Previous track">←</button>
        <span>{String(centeredIndex + 1).padStart(2, "0")} / {String(tracks.length).padStart(2, "0")}</span>
        <button type="button" onClick={() => scrollToTrack(centeredIndex + 1)} disabled={centeredIndex === tracks.length - 1} aria-label="Next track">→</button>
      </div>
    </div>
  );
}
