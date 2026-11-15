# Project notes

Earth FM 78.7 is a curated NASA sonification jukebox. Keep the product
focused on the album catalog, selected-track playback, local media, and
precomputed feature data. The frontend is React + TypeScript; playback and the
2D feature visualizer run in the browser. Do not add a 3D globe, runtime NASA
search/import flow, or WebSockets.

## Data and API

- `backend/data/tracks.json` stores each curated track's metadata, features,
  summary, and default config.
- `backend/media/` contains the local video and cover assets served at `/media`.
- `GET /api/tracks` returns card metadata only.
- `GET /api/tracks/{id}` returns selected-track metadata, summary, and config.
- `GET /api/tracks/{id}/features` returns its preprocessed feature timeline.

The route implementation lives in `backend/routes/tracks.py`; the data shape
and offline update steps are in `backend/data/README.md`.

## Services

- `backend/pipeline/extract.py` precomputes video features with OpenCV.
- `backend/pipeline/build_tracks.py` rebuilds summaries and optional default
  music configs.
- `backend/services/music_config.py` validates styles and optionally calls
  Gemini during offline catalog preparation only.
- `frontend/src/services/tone/` maps measurements to scheduled Tone.js events
  and synchronizes playback with the selected video.

Run backend tests from the repository root with
`backend/.venv/bin/python -m unittest discover -s backend/tests -t . -v`.
Run frontend tests and type/build checks from `frontend/` with `npm test` and
`npm run build`.
