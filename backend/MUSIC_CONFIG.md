# Gemini music configuration

The backend sends the selected track metadata, its complete feature array, a
computed summary, and optional musical preferences to Gemini. The system prompt
is in `backend/prompts/music_config.txt`. Gemini returns JSON matching the
`MusicConfig` schema in `backend/services/music_config.py`.

The backend validates the output before saving it. The frontend interprets this
application-specific contract and creates supported Tone.js instruments and
scheduled notes. Gemini does not generate executable player code.

## Setup

Install the updated backend dependencies:

```bash
backend/.venv/bin/python -m pip install -r backend/requirements.txt
```

Create `backend/.env` using `backend/.env.example` as a reference:

```dotenv
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
```

The backend loads this file on generation. Existing process environment variables
take precedence. Restart the backend after changing an existing key or model.
The key stays on the backend; `.env` files are ignored by Git. The model is
configurable, with `gemini-3.5-flash-lite` as the default.

Run the backend and frontend as described in the project README. In the app,
select the real track, optionally enter a style such as "calm ocean music", click
**Generate music**, then **Play**. **Stop** ends playback. Saved settings are
loaded when the track is selected, so playing again does not call Gemini.
Video starts with audio when the remote video is available; if remote playback
fails, the player reports that and continues with audio. Precise seek/pause sync
and additional playback controls remain future work.

## Endpoints

- `POST /api/tracks/{track_id}/music-config`: generate, validate, and save a config.
  Send `{}` or `{ "prompt": "calm ocean music" }`. Each POST invokes Gemini.
- `GET /api/tracks/{track_id}/music-config`: retrieve a saved config without a
  provider call. Returns 404 when none exists, or 409 when the source data changed.

For example, from another terminal:

```bash
curl -X POST http://localhost:8000/api/tracks/ecco2_sst_flow/music-config \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Calm, flowing ocean music"}'
```

A missing key returns 503, a provider failure or invalid output returns 502/503,
and a timeout returns 504. Unknown tracks return 404. Provider error messages and
keys are not returned to the browser. Failed generation preserves a previous
valid config.

## Output contract

```json
{
  "schema_version": 1,
  "track_id": "ecco2_sst_flow",
  "bpm": 80,
  "instrument": "synth",
  "scale": ["D3", "F3", "G3", "A3", "C4", "D4"],
  "rhythm_grid": "8n",
  "note_duration": "8n",
  "density_range": [0.2, 0.8],
  "velocity_range": [0.25, 0.75]
}
```

Supported instruments are `synth`, `fm_synth`, and `am_synth`. Tempo is 60–140 BPM.
The scale has 3–12 distinct ascending pitches in octaves 2–6. Rhythm and duration
are `4n`, `8n`, or `16n`. Density is 0–1 and velocity is 0.05–0.8, with each pair
ordered minimum to maximum. Unsupported fields, notes, and instruments are rejected.

The player interpolates the two-second samples on a musical beat grid. Brightness
chooses pitch, motion changes note density, contrast changes velocity, and the
seven color proportions control a warm/cool filter blend. Small per-track ranges
are normalized; effectively constant features remain steady. Mapping is deterministic.

Validated configs are saved atomically in
`backend/data/music-config/{track_id}.json` with a source-data hash. The file wraps
the public config in `{ "source_hash": "...", "config": { ... } }`. GET returns
only the config. MongoDB remains planned; no database is required for this version.

## Verification

```bash
backend/.venv/bin/python -m unittest discover -s backend/tests -v
cd frontend
npm test
npm run build
```

Backend tests mock the provider and also exercise the installed Gemini SDK using
an offline HTTP transport. They do not require a real API key. Frontend tests
verify interpolation, deterministic note scheduling, and feature mappings.

Provider references: [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output),
[Gemini models](https://ai.google.dev/gemini-api/docs/models), and
[Tone.js scheduling](https://tonejs.github.io/#scheduling).
