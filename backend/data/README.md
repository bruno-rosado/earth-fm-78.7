# Track data contract

`tracks.json` is the catalog shipped with the repo: a list of tracks, each with a
unique `id`, a `title`, `cover` and `video` URLs, a `duration` in seconds, and the
NASA SVS `nasa_id` and `source` page it came from. There is no music configuration
in track metadata.

`library.json` (ignored by git) holds tracks imported through the app on this
machine, in the same shape. `GET /api/tracks` returns both lists, skipping any
track whose local video file is missing. Imported media is named `svs{nasa_id}`
in `../media/` and `features/`, and is ignored by git too.

Each track has one feature file at `features/{id}.json`. The file contains a list
of samples ordered by `t` (seconds from the start of the video), every 1 second.
Each sample has whole-frame features:

- `brightness`: average frame brightness, from 0 to 1.
- `motion`: change from the previous sampled frame, from 0 to 1; the first sample
  uses 0.
- `color`: an object with seven proportions: `red`, `yellow`, `green`, `cyan`,
  `blue`, `magenta`, and `neutral`. Each is from 0 to 1, and together they sum to 1.
  The extractor groups colored pixels into hue bins; dark or low-saturation pixels
  count as neutral.
- `contrast`: strength of light/dark differences, from 0 to 1.

It also has a `grid` of the map: 8 latitude rows (north first) by 24 longitude
columns (180°W first; the video is an equirectangular world map). Each cell is
`[presence, temperature, speed, flow]`:

- `presence` (0–1): share of colored data pixels; land and empty map are near 0.
- `temperature` (0–1): mean position of the cell's colors on the blue → red
  colormap. 0 is cold, 1 is warm; 0 when the cell has no data.
- `speed` (0–1): optical-flow speed of the drawn currents, smoothed over
  neighboring samples and scaled so the busiest 2% of ocean cells reach 1.
- `flow` (−1 to 1): east/west direction of that motion; negative is westward.

The player reads one column at a time (the longitude facing the viewer). See
[`../MUSIC_CONFIG.md`](../MUSIC_CONFIG.md) for how the values become sound.

## Routes

| Method | URL | Response |
| --- | --- | --- |
| GET | `/api/tracks` | List of tracks |
| GET | `/api/tracks/{track_id}` | One track, or 404 if unknown |
| GET | `/api/tracks/{track_id}/features` | Feature array, or 404 if the track or its feature file is missing |
| GET | `/api/tracks/{track_id}/music-config` | Saved validated music settings; 404 if absent, 409 if stale |
| POST | `/api/tracks/{track_id}/music-config` | Generate music settings with Gemini and save the validated result |
| GET | `/api/search?q=…&limit=12` | NASA SVS search results that have a downloadable video, with a `track` field when already imported |
| GET | `/api/recommendations` | Cards for the IDs in `recommendations.json` |
| POST | `/api/imports` | `{ "nasa_id": 5665 }` → 202 with a job; the video is downloaded and analyzed in the background |
| GET | `/api/imports/{job_id}` | Job status: `queued`, `downloading`, `analyzing`, `done` (with `track`), or `error` |
| GET | `/api/thumbs/{nasa_id}.jpg` | NASA's preview image resized to 640 px and cached in `thumbs/` |

Music settings stay separate from track metadata. See
[`../MUSIC_CONFIG.md`](../MUSIC_CONFIG.md) for environment setup and the Tone.js
config contract. Generated records live in `music-config/{track_id}.json`.

The current track is `ecco2_sst_flow`, with 67 samples at 0, 1, ..., 66 seconds.
Its duration is 66.7 seconds. Its video (a 1280×640 compressed copy of the NASA
movie) and cover are served locally from `backend/media/` at `/media/...`, so the
browser can seek them and use them as a WebGL texture. The NASA-hosted MP4 is
256 MB and does not allow cross-origin use from localhost.

The source visualization is [NASA SVS 3912](https://svs.gsfc.nasa.gov/3912/).

## Extracting another track

From the repository root:

```bash
backend/.venv/bin/python backend/pipeline/extract.py \
  /path/to/ecco2_sst_flow.mp4 \
  backend/data/features/ecco2_sst_flow.json \
  --nasa-id 3912
```

To recompute only the features from a local copy, leaving `tracks.json` alone:

```bash
backend/.venv/bin/python backend/pipeline/extract.py \
  backend/media/ecco2_sst_flow.mp4 \
  backend/data/features/ecco2_sst_flow.json \
  --features-only
```

Changing features invalidates saved music configs (GET returns 409); the player
falls back to its default style until a new one is generated.

The feature filename determines the track ID. The extractor writes that feature
file and adds or replaces the matching entry in `tracks.json`, preserving other
tracks. It measures duration from the local video rather than from sample times.

The API resolves data paths relative to `backend/routes/tracks.py`, so it works when
started from either the repository root or the backend directory.
