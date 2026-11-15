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

## Accessibility

Use **High contrast** in the header for bright text and stronger outlines. Open
**Accessibility** for standard, large, or extra-large text, reduced visual motion,
reading speed, and independent narration volume. Choices persist on this device;
system contrast/motion preferences are used until you make an explicit choice.

**Read page aloud** and **Explain track description**
prepare a narration clip only after a click. A matching transcript is shown,
and music is temporarily quieter while narration speaks. **Stop reading**, choosing
another track, or closing the player cancels the voice and restores music volume.
If audio is unsupported, blocked, or fails to start, the written transcript remains.
No additional API key is needed. The backend uses the installed macOS system voice
(`say`); Linux servers need `espeak-ng` or `espeak` installed. Other servers retain
the written transcript. Narration is cached in ignored `backend/data/narration/`
(up to 16 clips), with up to four audio responses cached in the browser session.
Restart the backend after adding this endpoint.

Speed and volume update the same audio element's `playbackRate` and `volume`.
They do not stop, recreate, seek, or reload narration. Pitch is preserved when
changing speed. The **Read aloud** view
can be collapsed without stopping speech, and **Stop reading** stays available
while it is collapsed.

Keyboard checks: Tab from the address bar to the skip link, header, collection,
and player; Enter/Space activate buttons, arrows adjust sliders, and Escape closes
settings and returns focus to its button. Selecting a track focuses its heading;
returning to the collection restores focus to its card. Data values and the sound
legend supplement the canvas without continuously interrupting a screen reader.

Before release, verify at 200% zoom and a narrow viewport; test saved preferences
after refresh, speech stop/replacement/failure, and narration while music is playing.
Test with VoiceOver or NVDA on the target device. These improvements have not been
certified as full WCAG conformance. References: [W3C keyboard/focus guidance](https://www.w3.org/WAI/WCAG21/Understanding/focus-visible.html)
and [media playback rate](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/playbackRate).

## Google AI Mode explanations with SerpAPI

Below a selected track's NASA source link, click **Ask Google AI Mode**. The
backend uses SerpAPI's `google_ai_mode` engine to request a short explanation of
the track, grounded in its title and NASA SVS source. The returned AI answer is
displayed as readable paragraphs, with up to five returned references in an
expandable Sources section. It is labeled as AI-generated. Requests happen only
on click; the explanation can be hidden and reopened without another provider call.
Answers render Markdown and LaTeX math, including temperature notation such as
`$20^{\circ}\text{C}$`. The renderer loads only when an answer is shown and also
formats existing cached answers. Math includes an accessible MathML equivalent;
raw HTML, unsafe links, and remote Markdown images are disabled.

Add this to `backend/.env`, then restart the backend:

```dotenv
SERPAPI_API_KEY=your_serpapi_key_here
```

The key stays on the server. `backend/.env.example` includes the variable; never
put the key in a `VITE_` variable. `GET /api/tracks/{id}/search` returns AI explanations
for known tracks only. Normalized answers are cached for seven days in ignored
`backend/data/track_search/` and memory, with up to 64 entries. Metadata changes
invalidate the cache. The cache version and engine distinguish AI answers from
older regular-search results. Missing credentials, absent answers, and provider
failures show a readable retry message. AI Mode requests allow up to 60 seconds.
Tests cover answer parsing, references, missing answers, credentials, and caching.
Integration follows the [SerpAPI Google AI Mode API](https://serpapi.com/google-ai-mode-api).

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
