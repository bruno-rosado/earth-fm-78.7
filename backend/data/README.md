# Track data contract

`tracks.json` contains a list of tracks. Each track has a unique `id`, a `title`,
`cover` and `video` URLs, and a `duration` in seconds. There is no description or
music configuration in track metadata. All tracks live in this list; there is no
separate `tracks/` directory.

Each track has one feature file at `features/{id}.json`. The file contains a list
of samples ordered by `t` (seconds from the start of the video), every 2 seconds.
Feature names are:

- `brightness`: average frame brightness, from 0 to 1.
- `motion`: change from the previous sampled frame, from 0 to 1; the first sample
  uses 0.
- `color`: an object with seven proportions: `red`, `yellow`, `green`, `cyan`,
  `blue`, `magenta`, and `neutral`. Each is from 0 to 1, and together they sum to 1.
  The extractor groups colored pixels into hue bins; dark or low-saturation pixels
  count as neutral.
- `contrast`: strength of light/dark differences, from 0 to 1.

## Routes

| Method | URL | Response |
| --- | --- | --- |
| GET | `/api/tracks` | List of tracks |
| GET | `/api/tracks/{track_id}` | One track, or 404 if unknown |
| GET | `/api/tracks/{track_id}/features` | Feature array, or 404 if the track or its feature file is missing |

The current track is `ecco2_sst_flow`, with 34 real samples at 0, 2, ..., 66 seconds.
Its duration is 66.7 seconds, verified from the NASA MP4 movie header. The last
sample time is not the video duration. Its metadata currently points to
NASA-hosted video and cover URLs; downloading local media is deferred. When local
copies are added to `backend/media/`, change `video` and `cover` to their
`/media/<filename>` URLs. The frontend development server forwards `/media`
requests to the backend.

The source visualization is [NASA SVS 3912](https://svs.gsfc.nasa.gov/3912/).

## Extracting another track

From the repository root:

```bash
backend/.venv/bin/python backend/pipeline/extract.py \
  /path/to/ecco2_sst_flow.mp4 \
  backend/data/features/ecco2_sst_flow.json \
  --nasa-id 3912
```

The feature filename determines the track ID. The extractor writes that feature
file and adds or replaces the matching entry in `tracks.json`, preserving other
tracks. It measures duration from the local video rather than from sample times.

The API resolves data paths relative to `backend/routes/tracks.py`, so it works when
started from either the repository root or the backend directory.
