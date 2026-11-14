# Dev 1: Completed Backend API and Media Serving Work

This records the Dev 1 work completed for Earth Frequencies and the decisions
the team should carry forward. The backend currently serves local JSON files and
media. Gemini music-config generation and Tone.js integration are implemented on
`API/gemini-music-config`; MongoDB remains planned.

## Track data and feature contract

- Use **tracks** as the product term.
- Initially added one demo track, now replaced by the real `ecco2_sst_flow` track
  in `backend/data/tracks.json`, with `id`, `title`, `cover`, `video`, and `duration`
  in seconds. Description is omitted by team decision.
- Removed `key`, `tempo`, and `instrument` from track metadata. Future generated
  music settings belong in a separate music configuration.
- Replaced the demo features with 34 real samples in
  `backend/data/features/ecco2_sst_flow.json`, matching the real track ID.
- Agreed feature names: `brightness`, `motion`, `color`, and `contrast`.
- Samples use `t` in seconds, with an agreed interval of 2 seconds for real data.
  Brightness, motion, and contrast are in the range 0–1. The first motion value is 0.
- The agreed `color` format contains seven proportions: `red`, `yellow`, `green`,
  `cyan`, `blue`, `magenta`, and `neutral`, each 0–1 and together totaling 1.
- Removed the separate `backend/data/tracks/` directory. The extractor now adds
  or updates entries in `tracks.json` and writes features as `{track_id}.json`.
- The extractor measures video duration from frame count and frame rate.
- Verified the existing real track's 66.7-second duration from the NASA MP4 movie
  header using small byte-range requests; no local media was downloaded.
- Documented the contract in `backend/data/README.md`.

## API endpoints and route organization

Moved endpoint definitions out of `backend/main.py` into `backend/routes/`:

| File | Responsibility |
| --- | --- |
| `backend/routes/tracks.py` | Track list, track details, and feature endpoints |
| `backend/routes/hello.py` | Existing hello endpoint |
| `backend/routes/__init__.py` | Combine routers under `/api` |
| `backend/main.py` | FastAPI setup, CORS, router registration, and media mount |

Available endpoints:

| Method | URL | Behavior |
| --- | --- | --- |
| GET | `/api/hello` | Existing backend hello message |
| GET | `/api/tracks` | Return the track list |
| GET | `/api/tracks/{track_id}` | Return a track, or 404 if unknown |
| GET | `/api/tracks/{track_id}/features` | Return its features, or 404 if the track or feature file is missing |

JSON paths resolve relative to the source file, so loading does not depend on
the terminal's working directory. The app supports both root-level
`uvicorn backend.main:app` and `uvicorn main:app` from `backend/`.

## Media serving and frontend connection

- Added `backend/media/.gitkeep` so the media directory exists in a fresh checkout.
- Mounted FastAPI `StaticFiles` at `/media`, using an absolute directory path.
- Videos and cover images placed in `backend/media/` are accessible through
  `/media/<filename>`.
- Added the `/media` proxy to `frontend/vite.config.js`, alongside `/api`, so both
  request types reach the backend at `http://localhost:8000` during development.
- Retained CORS support for the frontend at `http://localhost:5173`.
- Updated the README and data contract with media placement and verification steps.

## Python environment and editor setup

- Created `backend/.venv` and installed `backend/requirements.txt` (`fastapi`,
  `uvicorn`, `numpy`, and `opencv-python-headless`, plus their dependencies).
- Added `.vscode/settings.json` with the backend virtual environment as the default
  interpreter and `backend/` as an additional Python analysis path.
- Verified dependency consistency and application imports from both supported
  startup directories.

From the repository root, run:

```bash
backend/.venv/bin/uvicorn backend.main:app --reload --port 8000
```

Use `http://localhost:8000/docs` to try the endpoints interactively.

## Verification completed

Development checks verified:

- Track list, track details, features, and the hello endpoint return expected data.
- Unknown tracks and missing feature files return 404.
- Frontend CORS preflight succeeds.
- Media GET and HEAD requests work with the expected video/image content types.
- Video byte-range requests return partial content for seeking.
- Media responses include the expected frontend CORS header.
- Missing media and directory traversal requests return 404.
- Data and media paths work from either startup directory.
- Frontend proxy configuration passes JavaScript syntax checking.
- The real track list, details, and 34-feature array return 200 with the agreed
  metadata and feature shapes.
- Extraction of a generated test video produces two-second samples, seven color
  categories, and a measured duration. Registry updates preserve other tracks and
  replace an existing ID without duplication.

The original checks used temporary scripts and media transport fixtures. Gemini
integration now includes repeatable backend and frontend mapping tests. A live
Gemini request produced a validated config and its live GET endpoint returned 200.
Browser automation was unavailable, so actual audio and remote NASA video playback
still need a manual browser check.

## Branches and integration

- `API/track-endpoints`: nine files committed separately; merged in PR #2.
- `API/media-serving`: five files committed separately; merged in PR #3.
- `main` contains both merged changes.
- Real-data integration from `API/real-track-data` is merged in PR #7.
- Gemini integration is on `API/gemini-music-config` and is not yet merged.

## Gemini music-config integration

- Added backend-only environment loading for `GEMINI_API_KEY` and `GEMINI_MODEL`.
- Added an editable system prompt and a strict Pydantic output schema. Gemini
  receives track metadata, all feature samples, a summary, and optional preferences.
- Added GET and POST `/api/tracks/{track_id}/music-config`. Generated configs are
  validated and saved atomically, with a source-data hash to detect stale results.
- Connected the frontend to real tracks and added Generate, Play, and Stop controls.
- Added a Tone.js adapter using supported synths, scale pitches, and note durations.
  Brightness controls pitch, motion density, contrast velocity, and color the filter.
- Shared the video element with the player so Play/Stop control video and audio.
- Added repeatable backend and mapping tests; provider calls are mocked, including
  an offline transport test of the installed SDK. A separate live generation with
  the configured key succeeded and saved an 80 BPM synth config for the real track.
  See `backend/MUSIC_CONFIG.md`.

## Remaining handoff and planned work

- Dev 2's real metadata and features have been received. The current track uses
  external NASA video and cover URLs; adding local media is deferred.
- Keep the seven color categories and two-second samples when integrating playback.
- The track picker, globe, and config-driven music player are connected. Verify
  real video playback and audible output together in a browser; local media files
  and precise seek/pause synchronization remain follow-up work.
- For real-data integration, start from the latest `main` on a new branch, or
  review Dev 2's branch if it already contains the required files.
- Gemini now generates the separate music config used with the original timed
  features. Configs currently use local JSON storage. MongoDB, additional player
  controls, and precise pause/seek synchronization remain future work.
