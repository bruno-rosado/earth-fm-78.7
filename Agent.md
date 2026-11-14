# Dev 1: Completed Backend API and Media Serving Work

This records the Dev 1 work completed for Earth Frequencies and the decisions
the team should carry forward. The backend currently serves local JSON files and
media. LLM integration and MongoDB are planned architecture, not implemented code.

## Track data and feature contract

- Use **tracks** as the product term.
- Added one sample track in `backend/data/tracks.json` with `id`, `title`,
  `description`, `cover`, `video`, and `duration` in seconds.
- Removed `key`, `tempo`, and `instrument` from track metadata. Future generated
  music settings belong in a separate music configuration.
- Added one sample in `backend/data/features/demo.json`, matching track ID `demo`.
- Agreed feature names: `brightness`, `motion`, `color_distribution`, and `contrast`.
- Samples use `t` in seconds, with a target interval of 0.5 seconds for real data.
  Brightness, motion, and contrast are in the range 0–1. The first motion value is 0.
- The current proposed color distribution format is an object containing `red`,
  `green`, and `blue` proportions, each 0–1 and together totaling 1. Devs 2 and 4
  still need to confirm that representation.
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

- Created `backend/.venv` and installed `backend/requirements.txt` (`fastapi` and
  `uvicorn`, plus their dependencies).
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

These checks used temporary scripts and media transport fixtures; a permanent
automated test suite was not added, and real NASA video playback has not yet been
verified.

## Branches and integration

- `API/track-endpoints`: nine files committed separately; merged in PR #2.
- `API/media-serving`: five files committed separately; merged in PR #3.
- `main` contains both merged changes.

## Remaining handoff and planned work

- Dev 2 supplies the real NASA video, cover image, track metadata, source and
  attribution information, and `features/{track_id}.json`.
- The current demo contains only one feature sample. Its 60-second duration and
  media URLs are placeholders; the referenced video and cover are not bundled.
- More varied demo samples would help Dev 4 test changing musical behavior before
  real extraction is ready.
- Devs 3 and 4 connect the track picker, globe, music engine, and playback controls.
  Verify real media and features with them after Dev 2's data is integrated.
- For real-data integration, start from the latest `main` on a new branch, or
  review Dev 2's branch if it already contains the required files.
- The planned LLM flow summarizes features, calls Gemini or OpenAI, validates a
  separate music configuration, saves it to MongoDB, and supplies it to Dev 4's
  engine alongside the original timed features. Provider, config schema, and
  config API endpoints remain to be decided. See `docs/HOW_IT_WORKS.md`.
