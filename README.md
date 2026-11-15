# Earth FM 78.7

Earth FM 78.7 is a curated jukebox of NASA visualizations. The backend
serves preprocessed track data and local video assets; a typed React player
renders the video and a 2D data view while Tone.js sonifies the measurements in
the browser. Playback uses a shared local clock, not a WebSocket connection.

## Run it

Start the backend:

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload --port 8000
```

In another terminal, start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The backend API documentation is at
http://localhost:8000/docs.

## Listening

Scroll through the cover flow or use its arrows to browse, choose a curated
record, then press play. The browser loads the selected track's
metadata and feature timeline, plays its local NASA video, and generates music
from the same measurements. The selected image attribute (brightness or color)
maps to pitch, latitude to tone color and harmony, current speed to rhythm and
loudness, and current direction to stereo position. The scanner can sweep
horizontally, rotate clockwise or counterclockwise, or expand and contract
from the center; its path controls both the visual markers and the sonification.
Each scan completes one pass over the track's full duration.
In the player, choose image brightness or image color as the source for pitch.
Both are whole-frame measurements, interpolated over time, rather than values
at the scan position. Pitch is scaled to the track's image-data range when it
varies. Latitude sets each voice's filter tone (north is brighter) and the
presence-weighted mean latitude under the scan selects the chords.
This changes the frontend mapping without changing the stored music configuration.

The collection page fetches only album-card metadata. Full track details and
features are requested when a record is selected; scrolling the collection does
not make additional API calls. Music configurations are built ahead of time,
so no AI provider or API key is needed to run the app.

## Add a curated visualization

Place a local video and cover in `backend/media/`, add its metadata to
`backend/data/tracks.json`, and run the feature extraction and build steps
described in [the track data contract](backend/data/README.md). Optionally set
`GEMINI_API_KEY` in `backend/.env` to generate a default music style during the
offline build. The key is never used by the running player.

## Tests

From the repository root:

```bash
backend/.venv/bin/python -m unittest discover -s backend/tests -t . -v
cd frontend
npm test
npm run build
```

## Project layout

```text
backend/routes/tracks.py          REST catalog, details, and feature timeline
backend/pipeline/                 Offline video analysis and track building
backend/services/music_config.py  Optional offline style generation
backend/data/tracks.json          Curated track catalog
backend/media/                    Locally served video and cover assets
frontend/src/                     TypeScript UI, Canvas 2D visualization, Tone.js player
docs/HOW_IT_WORKS.md              End-to-end data and playback flow
```

For the API and data shape, see [backend/data/README.md](backend/data/README.md).
