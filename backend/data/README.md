# Track data contract

`tracks.json` contains a list of tracks. Each track has a unique `id`, a `title`,
a `description`, `cover` and `video` URLs, and a `duration` in seconds.

Each track has one feature file at `features/{id}.json`. The file contains a list
of samples ordered by `t` (seconds from the start of the video), normally every
0.5 seconds. Feature names are:

- `brightness`: average frame brightness, from 0 to 1.
- `motion`: change from the previous sampled frame, from 0 to 1; the first sample
  uses 0.
- `color_distribution`: an object with `red`, `green`, and `blue` proportions,
  each from 0 to 1 and together summing to 1. This is the proposed representation
  for color distribution for Devs 2 and 4 to use.
- `contrast`: strength of light/dark differences, from 0 to 1.

## Routes

| Method | URL | Response |
| --- | --- | --- |
| GET | `/api/tracks` | List of tracks |
| GET | `/api/tracks/{track_id}` | One track, or 404 if unknown |
| GET | `/api/tracks/{track_id}/features` | Feature array, or 404 if the track or its feature file is missing |

`demo` is fake data with one track and one feature sample. Its duration is a
placeholder. The referenced `/media/demo.mp4` and `/media/demo.jpg`
are placeholder URLs; their media files are not bundled. Put videos and cover
images in `backend/media/`; the backend serves them at `/media/<filename>`.
The frontend development server forwards `/media` requests to the backend.
Dev 2 will replace the sample with real measurements and the actual duration.

The API resolves data paths relative to `backend/routes/tracks.py`, so it works when
started from either the repository root or the backend directory.
