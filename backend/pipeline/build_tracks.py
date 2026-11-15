"""Build data/tracks.json: every track with its features, summary and default config.

This is the only step that writes track data; the server just reads the file.
Run from the repository root after extracting a track:
    backend/.venv/bin/python -m backend.pipeline.build_tracks [--regenerate ID ...] [--prompt "..."]
It recomputes each summary and optionally asks Gemini for a default config where
one is missing (or for the IDs given to --regenerate).
"""
import argparse
import json

from backend.routes.tracks import TRACKS_PATH
from backend.services.music_config import MusicConfigError, generate_config, summarize_features

METADATA = ("id", "title", "description", "cover", "video", "duration", "nasa_id", "source")


def build(tracks, regenerate=(), prompt=""):
    built = []
    for track in tracks:
        summary = summarize_features(track["features"])
        config = track.get("config")
        if config is None or track["id"] in regenerate or track.get("summary") not in (None, summary):
            metadata = {key: track[key] for key in METADATA if key in track}
            try:
                config = generate_config(metadata, summary, prompt).model_dump()
                print(f"{track['id']}: default config {config['key']} {config['mode']} at {config['bpm']} bpm")
            except MusicConfigError as error:
                if error.status_code != 503:
                    raise
                config = None
                print(f"{track['id']}: {error} Using the built-in player style.")
        built.append({**track, "summary": summary, "config": config})
    return built


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--regenerate", nargs="*", default=[], help="Track IDs whose default config to replace")
    parser.add_argument("--prompt", default="", help="Optional style preferences for new defaults")
    args = parser.parse_args()
    tracks = json.loads(TRACKS_PATH.read_text(encoding="utf-8"))
    try:
        tracks = build(tracks, set(args.regenerate), args.prompt)
    except MusicConfigError as error:
        raise SystemExit(f"Error: {error}")
    TRACKS_PATH.write_text(json.dumps(tracks, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {len(tracks)} tracks to {TRACKS_PATH}")


if __name__ == "__main__":
    main()
