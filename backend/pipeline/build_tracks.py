"""Build data/tracks.json: recompute each track's summary and drop any stale config.

This is the only step that writes track data; the server just reads the file.
Run from the repository root after extracting a track:
    backend/.venv/bin/python -m backend.pipeline.build_tracks
The frontend derives the music style from each summary, so nothing else is stored.
"""
import json

from backend.routes.tracks import TRACKS_PATH
from backend.services.music_config import MusicConfigError, summarize_features


def build(tracks):
    built = []
    for track in tracks:
        track = {key: value for key, value in track.items() if key != "config"}
        built.append({**track, "summary": summarize_features(track["features"])})
    return built


def main():
    tracks = json.loads(TRACKS_PATH.read_text(encoding="utf-8"))
    try:
        tracks = build(tracks)
    except MusicConfigError as error:
        raise SystemExit(f"Error: {error}")
    TRACKS_PATH.write_text(json.dumps(tracks, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {len(tracks)} tracks to {TRACKS_PATH}")


if __name__ == "__main__":
    main()
