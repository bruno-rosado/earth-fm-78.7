# Default music configurations

Each curated track stores a validated `config` alongside its metadata and
preprocessed features. The frontend's Tone.js engine interprets this data; the
provider never generates executable player code.

Gemini is optional and used only when building or regenerating catalog data
with `backend/pipeline/build_tracks.py`. The running application does not call
Gemini and does not require an API key.

## Offline setup

Create `backend/.env` from `backend/.env.example`:

```dotenv
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
```

Then run the offline build from the repository root:

```bash
backend/.venv/bin/python -m backend.pipeline.build_tracks
```

The build fills a missing or stale config. To regenerate a specific style:

```bash
backend/.venv/bin/python -m backend.pipeline.build_tracks \
  --regenerate ecco2_sst_flow --prompt "Calm, flowing ocean music"
```

If no key is configured, a missing config can be filled with the built-in
frontend default. Existing configurations remain available without contacting
Gemini.

## Config shape

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

Tempo is 50–120 BPM. Modes are `major`, `minor`, `dorian`, `mixolydian`,
`lydian`, `pentatonic_major`, and `pentatonic_minor`. The lead and pad use
Tone.js synth instruments listed in `backend/services/music_config.py`.
Density, velocity, pad level, and reverb are range-checked by the backend model.

## Data-to-sound mapping

- The scan moves westward over the equirectangular feature grid.
- Each latitude band is a voice; north maps to higher pitches.
- Current speed controls note density and velocity. Land and empty cells are
  silent.
- Temperature controls the filter tone and selects chords.
- Current direction controls stereo pan.

The audio transport is the playback clock. The video follows that clock, so
audio and imagery remain synchronized without WebSockets or per-note network
requests.

## Verification

```bash
backend/.venv/bin/python -m unittest discover -s backend/tests -v
cd frontend
npm test
npm run build
```
