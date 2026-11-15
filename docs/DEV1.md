# Backend: curated track API

The backend serves the catalog and local media. It does not search NASA at
runtime or import videos while the app is running.

## Routes

- `GET /api/tracks`: card metadata for all tracks.
- `GET /api/tracks/{id}`: selected track metadata and default config.
- `GET /api/tracks/{id}/features`: precomputed feature samples.
- `/media/{filename}`: local videos and covers.

Keep the catalog shape in `backend/data/README.md` current. `tracks.json` is the
only runtime catalog. Add and analyze tracks offline using the instructions
there; the server only reads the results.

Run locally from the repository root:

```bash
backend/.venv/bin/uvicorn backend.main:app --reload --port 8000
```

The API docs are available at http://localhost:8000/docs.
