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
sets pitch, color warmth sets tone color and chords, visual motion sets rhythm
and loudness, and flow direction sets stereo pan. Select a track and press play
(or Space).

The key, mode, tempo, and instruments are computed from each track's data.
See [backend/MUSIC_CONFIG.md](backend/MUSIC_CONFIG.md) for the mapping and tests.

## Using the app

- **Search** the bar at the top (or press `/`) for any NASA Earth visualization:
  hurricanes, sea ice, wildfire smoke, night lights… Results and recommendations
  come live from NASA's Scientific Visualization Studio.
- **Click a result** to add it: the backend downloads the video, re-encodes it
  (H.264, at most 1280 px wide, 30 fps), analyzes every frame, and the track starts playing as soon as it's ready (10–60 s depending on
  size). Videos over 400 MB or 8 minutes are refused. Imported tracks stay on your
  machine (`backend/data/library.json` and `backend/media/svs*`, both ignored by git).

- **Start listening** (or click a record in the jukebox) opens the track and plays
  it. The camera glides in on the globe.
- **Play/pause:** the big button, the Space bar, or click the globe. Drag the
  timeline to seek; its colors are the sea temperature the scan line will cross,
  and it dims where the scan crosses land.
- **On the globe:** the scan line marks the longitude being played; each note
  ripples out where its data came from; the ring around the planet is the live
  audio spectrum.
- **Readout (right):** scan longitude, ocean region, current chord, and a meter per
  latitude voice colored by water temperature.
- **Mood:** the key, mode, tempo and instruments are computed from the data.
  Presets change the instruments and feel, including tempo for some moods.
  **✕** returns to the track list. Escape closes the browser, then the lab,
  then the track.

- **Listening lab:** opens alongside a track; press **L** to hide or show it.
  Switch between the color grid, motion grid, and original NASA video. The video
  view reuses the globe's decoded frames. Click a longitude to seek to the nearest
  moment the scan crosses it; the white cell marks the most active melody band.
- **Mix:** adjust melody, texture, and harmony separately. **S** solos a layer;
  **Reset** restores the full mix. Mix settings persist across mood changes.
- **Export:** download the actual composition as a multitrack MIDI file, including
  tempo, instruments, panning, and the NASA source. MIDI contains notes and musical
  settings; its sound depends on the app that opens it. Tone.js effects are not included.

The values labeled warmth and motion come from image colors and optical flow.
They are normalized visual measurements, rather than physical °C or m/s. Global
brightness, contrast, and frame-to-frame motion are stored but do not currently
drive the music. Playback with local tracks does not need an AI API or a network
request for generating music; NASA search/import needs internet access.

See [DEMO.md](DEMO.md) for a short presentation walkthrough.

## Tests

Backend tests live in `backend/tests/`. Run them from the repository root:
```
backend/.venv/bin/python -m unittest discover -s backend/tests -t . -v
```
Frontend tests: `cd frontend && npm test`.

## What's here
```
backend/main.py        backend app setup
backend/routes/        API: tracks, NASA search and imports
backend/services/      Feature summary, NASA SVS client, import jobs
backend/data/          tracks.json (shipped) and library.json (imports): every track
                       with features, summary, default style
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
