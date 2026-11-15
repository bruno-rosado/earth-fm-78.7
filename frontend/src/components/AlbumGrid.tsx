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
  return (
    <div className="album-grid">
      {tracks.map((track, index) => (
        <button
          className={`album-card${track.id === selectedId ? " is-selected" : ""}`}
          key={track.id}
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
          <span className="album-play" aria-hidden>↗</span>
        </button>
      ))}
    </div>
  );
}
