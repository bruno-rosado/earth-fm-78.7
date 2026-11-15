# Track data contract

`tracks.json` is the catalog shipped with the repo: a list of tracks with
everything the player needs. `library.json` (ignored by git) holds tracks imported
through the app on this machine, in the same shape. The server reads both;
`GET /api/tracks` skips any track whose local video file is missing. Each track has:

- `id`, `title`, `description`, `cover` and `video` URLs, `duration` in seconds,
  and the NASA SVS `nasa_id` and `source` page it came from.
- `features`: the sonification data (below).
- `summary`: a compact summary of `features`, computed by `build_tracks.py`. The
  frontend derives the music style (key, mode, tempo, instruments) from it.

`features` is a list of samples ordered by `t` (seconds from the start of the video), every 1 second.
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
| GET | `/api/tracks` | Catalog plus imported tracks, each as described above |
| DELETE | `/api/tracks/{track_id}` | Remove an imported track and its media; 404 for catalog tracks |
| GET | `/api/search?q=…&limit=12` | NASA SVS search results that have a downloadable video, with a `track` field when already imported |
| GET | `/api/recommendations` | Cards for the IDs in `recommendations.json` |
| POST | `/api/imports` | `{ "nasa_id": 5665 }` → 202 with a job; the video is downloaded, re-encoded (H.264, at most 1280 px wide, 30 fps, no audio), and analyzed in the background |
| GET | `/api/imports/{job_id}` | Job status: `queued`, `downloading`, `transcoding`, `analyzing`, `done` (with `track`), or `error` |
| GET | `/api/thumbs/{nasa_id}.jpg` | NASA's preview image resized to 640 px and cached in `thumbs/` |

See [`../MUSIC_CONFIG.md`](../MUSIC_CONFIG.md) for the music mapping.

The current track is `ecco2_sst_flow`, with 67 samples at 0, 1, ..., 66 seconds.
Its duration is 66.7 seconds. Its video (a 1280×640 compressed copy of the NASA
movie) and cover are served locally from `backend/media/` at `/media/...`, so the
browser can seek them and use them as a WebGL texture. The NASA-hosted MP4 is
256 MB and does not allow cross-origin use from localhost.

The source visualization is [NASA SVS 3912](https://svs.gsfc.nasa.gov/3912/).

## Adding or updating a track

From the repository root, extract the features into `tracks.json`, then build the
summary:

```bash
backend/.venv/bin/python backend/pipeline/extract.py \
  /path/to/ecco2_sst_flow.mp4 ecco2_sst_flow --nasa-id 3912
backend/.venv/bin/python -m backend.pipeline.build_tracks
```

To recompute only the features from a local copy, keeping the track's metadata,
use `extract.py backend/media/ecco2_sst_flow.mp4 ecco2_sst_flow --features-only`.

`build_tracks.py` recomputes every summary. These pipeline scripts are the
only things that write `tracks.json`. The extractor measures duration from the
local video rather than from sample times.
