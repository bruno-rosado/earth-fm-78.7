# Backend: current state

Notes for anyone (human or agent) picking up the backend. Earlier history is in
git; this file describes only what is true now.

## Data

- One object per track holds metadata, `features`, `summary`, and default
  `config`. `backend/data/tracks.json` is the shipped catalog;
  `backend/data/library.json` (git-ignored) holds in-app imports in the same shape.
- There are no per-track feature or music-config files.
- Contract: `backend/data/README.md`. Style schema: `backend/MUSIC_CONFIG.md`.

## Routes (`backend/routes/`, all under `/api`)

| File | Endpoints |
| --- | --- |
| `tracks.py` | `GET /tracks` (catalog + library), `DELETE /tracks/{id}` (imports only) |
| `music_config.py` | `POST /music-config`: `{track, summary, prompt}` → Gemini → config, not saved |
| `search.py` | NASA search, recommendations, imports, thumbnails |

`backend/main.py` sets up CORS and mounts `/media`. Run from the repo root:

```bash
backend/.venv/bin/uvicorn backend.main:app --reload --port 8000
```

## Services

- `services/music_config.py`: schema, feature summary, Gemini call.
- `services/nasa.py`: SVS search and picking a playable movie and thumbnail.
- `services/imports.py`: background import jobs; writes complete track objects
  to `library.json` and removes their media on delete.

## Pipeline (offline)

- `pipeline/extract.py <video> <id>` writes features into `tracks.json`.
- `pipeline/build_tracks.py` adds summaries and generates missing default configs.

## Not done

- MongoDB persistence (everything is local JSON).
- An end-to-end import that includes the Gemini default-config step has not
  been run against the live NASA and Gemini APIs.
