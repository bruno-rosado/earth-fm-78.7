# earth-fm-78.7

Earth Frequencies: a jukebox where each track is a NASA Earth visualization turned into music, playing over a spinning 3D Earth.

## Run it (two terminals)

Backend (Python):
```
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload --port 8000
```

Frontend (React):
```
cd frontend
npm install
npm run dev
```
Open http://localhost:5173 for the frontend and http://localhost:8000/docs to try the backend API.

## How it sounds

Like NASA's Hearing Hubble, a scan line reads the map as the globe turns: latitude
sets pitch, sea temperature sets tone color and chords, current speed sets rhythm
and loudness, and current direction sets stereo pan. Select a track and press play
(or Space).

Optionally add `GEMINI_API_KEY` to `backend/.env` (see `backend/.env.example`) and
use **Style → Generate** to have Gemini choose the key, mode, tempo, and instruments.
See [backend/MUSIC_CONFIG.md](backend/MUSIC_CONFIG.md) for the mapping, config
format, endpoints, and tests.

## Using the app

- **Start listening** (or click a record) opens the track and plays it. The camera
  glides in on the globe.
- **Play/pause:** the big button, the Space bar, or click the globe. Drag the
  timeline to seek; its colors are the sea temperature the scan line will cross,
  and it dims where the scan crosses land.
- **On the globe:** the scan line marks the longitude being played; each note
  ripples out where its data came from; the ring around the planet is the live
  audio spectrum.
- **Readout (right):** scan longitude, ocean region, current chord, and a meter per
  latitude voice colored by water temperature.
- **Style:** pick a preset or describe a mood for Gemini. **✕** or Escape returns
  to the track list.

## Tests

Backend tests live in `backend/tests/`. Run them from the repository root:
```
backend/.venv/bin/python -m unittest discover -s backend/tests -v
```
Frontend tests: `cd frontend && npm test`.

## What's here
```
backend/main.py        backend app setup
backend/routes/        API endpoints: GET /api/tracks, POST /api/music-config
backend/data/          tracks.json: every track with features, summary, default style
backend/pipeline/      offline scripts that build tracks.json (extract, build_tracks)
backend/media/         videos and cover images served at /media
frontend/src/          React app: 3D scene and Tone.js music engine
docs/                  HOW_IT_WORKS.md + one step-by-step guide per dev
```
Start with `docs/HOW_IT_WORKS.md`, then open your `docs/DEVx.md`.
Add new files only when you need them. Each guide says which ones to create.

## Media files

Place videos and cover images in `backend/media/`. For example,
`backend/media/clouds.mp4` is available at
http://localhost:8000/media/clouds.mp4. Use `/media/clouds.mp4` as the video URL
in track metadata; the frontend development server forwards `/media` to the backend.
Use local copies: the browser needs same-origin video to texture the globe and
range requests to seek.
