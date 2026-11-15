# Curated track data

`tracks.json` is the complete, shipped catalog. There is no runtime import
library or user-upload workflow. Each track stores:

- `id`, `title`, `description`, `cover`, `video`, `duration`, `nasa_id`, and
  `source`.
- `features`: ordered measurements sampled once per second.
- `summary`: compact statistics generated from the measurements.
- `config`: the default music style used by Tone.js.

Each feature sample contains whole-frame measurements:

- `brightness`, `motion`, and `contrast`: normalized values from 0 to 1.
- `color`: proportions for red, yellow, green, cyan, blue, magenta, and neutral;
  each is in `[0, 1]` and the proportions sum to 1.
- `grid`: 8 latitude rows (north first) by 24 longitude columns. Each cell is
  `[presence, temperature, speed, flow]`. Presence, temperature, and speed are
  in `[0, 1]`; flow is in `[-1, 1]` and represents west/east direction.

## API

| Method | URL | Response |
| --- | --- | --- |
| GET | `/api/tracks` | Card metadata for every curated track |
| GET | `/api/tracks/{id}` | Selected track metadata, summary, and default music config |
| GET | `/api/tracks/{id}/features` | The selected track's precomputed feature timeline |
| GET | `/media/{filename}` | Local video and cover assets |

The catalog request deliberately omits video URLs and feature grids. The
frontend fetches track details and features only after a user selects an album.
Videos and covers are served from `backend/media/`. Local NASA assets matching
`svs*` are git-ignored, so machines playing those tracks need the corresponding
files present in that directory.

## Adding or updating a track

Copy the video and cover into `backend/media/`, add its metadata to
`tracks.json`, and extract its measurements:

```bash
backend/.venv/bin/python backend/pipeline/extract.py \
  backend/media/your-video.mp4 your-track-id --nasa-id 1234
backend/.venv/bin/python -m backend.pipeline.build_tracks
```

`extract.py` writes the feature timeline; `build_tracks.py` computes the
summary and fills in a missing or stale default config. To recompute a track's
features without replacing its metadata, use `--features-only`. Optional
Gemini style generation runs during this offline build only. See
[`../MUSIC_CONFIG.md`](../MUSIC_CONFIG.md) for its schema and setup.
