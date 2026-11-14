# Gemini music configuration

The backend sends the selected track metadata, a computed feature summary
(including per-latitude-band averages), and optional musical preferences to
Gemini. The full grid is not sent; it is too large to be useful in a prompt. The system prompt
is in `backend/prompts/music_config.txt`. Gemini returns JSON matching the
`MusicConfig` schema in `backend/services/music_config.py`.

The backend validates the output before saving it. The frontend interprets this
application-specific contract and creates supported Tone.js instruments and
scheduled notes. Gemini does not generate executable player code.

Gemini only picks the *style*. The data-to-sound mapping is fixed, so the music
always reflects the data. Without a saved config (no key, never generated, or
stale data) the player uses `DEFAULT_CONFIG` from
`frontend/src/services/tone/musicMapping.js`.

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
select the track and press play (or Space). It plays with the default style; to
change it, open **Style**, describe a mood, and click **Generate**. If music is
playing, it continues from the same moment with the new style. Saved styles are
loaded when the track is selected, so playing again does not call Gemini.

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
  "schema_version": 2,
  "track_id": "ecco2_sst_flow",
  "bpm": 72,
  "key": "D",
  "mode": "dorian",
  "low_octave": 3,
  "lead_instrument": "fm_synth",
  "pad_instrument": "am_synth",
  "rhythm_grid": "8n",
  "note_duration": "4n",
  "density_range": [0.05, 0.4],
  "velocity_range": [0.15, 0.5],
  "pad_level": 0.5,
  "reverb": 0.4
}
```

Tempo is 50–120 BPM. `key` is a pitch class (`C`, `F#`, `Bb`, ...). `mode` is
`major`, `minor`, `dorian`, `mixolydian`, `lydian`, `pentatonic_major`, or
`pentatonic_minor`. `low_octave` (2–4) is the octave of the southernmost band.
Instruments are `synth`, `fm_synth`, or `am_synth`. Rhythm grid is `4n`/`8n`/`16n`;
note duration adds `2n`. Density, `pad_level` are 0–1, velocity 0.05–0.8, reverb
0–0.8; ranges are ordered minimum to maximum. Other fields and values are rejected.

## How data becomes sound

The player (`frontend/src/services/tone/`) works like NASA's Hearing Hubble: a scan
line sweeps across the image, and what lies under it is played.

- **Scan:** the globe turns westward, one revolution every 40 seconds. The
  longitude facing the viewer is the column being played. The globe's rotation is
  computed from the audio clock, so picture and sound cannot drift apart.
- **Latitude → pitch:** each of the 8 latitude bands is a voice. North is high,
  south is low, across two octaves. Notes snap to the current chord.
- **Current speed → rhythm and loudness:** faster water plays more often
  (`density_range`) and louder (`velocity_range`). Land is silent.
- **Temperature → tone color and harmony:** each band's lowpass filter opens with
  warmer water. The average temperature under the scan line picks the chord
  (colder → darker chords, warmer → brighter), with hysteresis, held across bars.
  A pad and bass play the chord.
- **Flow direction → stereo:** each band voice pans toward its current's
  direction (westward left, eastward right).

The mix runs through a delay, reverb, compressor, and limiter, with soft attacks
and fades so nothing clicks. The Tone.js transport is the master clock: the video
follows it by nudging its playback rate (and seeking if it drifts more than
0.75 s), and the music waits while the video buffers. Mapping is deterministic.

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
verify the scan geometry, grid interpolation, deterministic scheduling, and each
data-to-sound mapping.

Provider references: [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output),
[Gemini models](https://ai.google.dev/gemini-api/docs/models), and
[Tone.js scheduling](https://tonejs.github.io/#scheduling).
