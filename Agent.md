# Earth Frequencies: current state

Notes for anyone (human or agent) picking up the project. Earlier history is in
git; this file describes only what is true now.

## Data

- One object per track holds metadata, `features`, and `summary`.
  `backend/data/tracks.json` is the shipped catalog;
  `backend/data/library.json` (git-ignored) holds in-app imports in the same shape.
- The runtime loads embedded features and summaries; standalone feature
  artifacts are not loaded by the player. Music style is derived in the browser.
- Contract: `backend/data/README.md`. Style schema: `backend/MUSIC_CONFIG.md`.

## Routes (`backend/routes/`, all under `/api`)

| File | Endpoints |
| --- | --- |
| `tracks.py` | `GET /tracks` (catalog + library), `DELETE /tracks/{id}` (imports only) |
| `search.py` | NASA search, recommendations, imports, thumbnails |

`backend/main.py` sets up CORS and mounts `/media`. Run from the repo root:

```bash
backend/.venv/bin/uvicorn backend.main:app --reload --port 8000
```

## Services

- `services/music_config.py`: feature validation and summary. No LLM calls.
- `services/nasa.py`: SVS search and picking a playable movie and thumbnail.
- `services/imports.py`: background import jobs; writes complete track objects
  to `library.json` and removes their media on delete.

## Pipeline (offline)

- `pipeline/extract.py <video> <id>` writes features into `tracks.json`.
- `pipeline/build_tracks.py` recomputes summaries and removes stale configs.

## Music and listening lab

- `frontend/src/services/tone/musicStyle.js` derives the key, mode, tempo,
  instruments, and effects from the summary. Mood presets adjust the feel.
- `musicMapping.js` creates deterministic melody, texture, and harmony events
  from the timed spatial grids. Brightness, contrast, and whole-frame motion
  remain stored and summarized but are not used to schedule audio.
- `musicGeneration.js` schedules Tone.js synths; its transport drives the video
  and globe. Independent gain buses control the three musical layers.
- `useTrackPlayer.js` owns startup, disposal, mood changes, master volume, mix,
  and solo. Revision checks prevent stale asynchronous startup work from taking
  over a newer playback session.
- `ListeningLab.jsx` shows the grid, optical flow, original decoded video frame,
  live mapping values, and mixer. Map clicks seek the closest matching scan pass.
- `midiExport.js` exports the generated notes as multitrack Standard MIDI with
  tempo, programs, stereo panning, and NASA attribution. It honors mix and solo;
  it does not export the Tone.js synthesizer sound or effects.
- The grid's temperature and speed are normalized color/motion proxies, not
  physical temperatures or current velocities. Keep UI claims accurate for
  non-ocean NASA imports too.

## Verification and demo

- Frontend: `cd frontend && npm test && npm run build`.
- Backend: `backend/.venv/bin/python -m unittest discover -s backend/tests -t . -v`.
- Walkthrough and limitations: `DEMO.md`.

## Not done

- MongoDB persistence (everything is local JSON).
- Physical-unit decoding and support for alternative map projections remain
  future work. The current grid assumes an equirectangular world map.
