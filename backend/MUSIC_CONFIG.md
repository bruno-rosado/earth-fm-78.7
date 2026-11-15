# Music mapping

## How data becomes sound

The player (`frontend/src/services/tone/`) works like NASA's Hearing Hubble: a scan
line sweeps across the image, and what lies under it is played.

- **Scan:** the globe turns westward, one revolution every 40 seconds. The
  longitude facing the viewer is the column being played. The globe's rotation is
  computed from the audio clock, so picture and sound cannot drift apart.
- **Melody (the main voice):** on every beat the busiest latitude band under
  the line (most water × fastest current) plays one note. Its pitch is that
  band's latitude: south pole low, north pole two octaves up, in the key.
  Faster water plays louder and on every beat; slow water every few beats;
  land plays nothing. Warmer water opens the lowpass filter (bright), colder
  water keeps it dark. Very fast eddies add a grace note a step up. The band
  meter in the readout and a large ripple on the globe show which band it came from.
- **Texture:** each of the 8 bands also shimmers quietly on its own under the
  same rules (speed → how often and how loud, temperature → tone, notes snap
  to the chord). It is mixed about 13 dB under the melody.
- **Harmony:** the average temperature under the scan line picks the chord
  (colder → darker chords, warmer → brighter), with hysteresis, held across
  bars. A pad and bass play it, and both fade to almost nothing over land.
- **Flow direction → stereo:** every voice pans toward its current's direction
  (westward left, eastward right).

The mix runs through a delay, reverb, compressor, and limiter, with soft attacks
and fades so nothing clicks. The Tone.js transport is the master clock: the video
follows it by nudging its playback rate (and seeking if it drifts more than
0.75 s), and the music waits while the video buffers. Mapping is deterministic.

The music style is not stored with the track. It is derived deterministically in the
frontend from each track's `summary`; the same summary always gives the same style.
No network call or API key is involved, and the data-to-sound mapping above is
the same for every style.

## Style derivation

The frontend (`frontend/src/services/tone/musicStyle.js`) turns the track `summary`
(per-latitude-band averages, mean color, brightness, motion and contrast) into the
style: key, mode, tempo, instruments, rhythm grid, note length, density and velocity
ranges, pad level, and reverb:

- key ← the video's dominant hue (circular mean of the color bins; red = C,
  yellow = D, green = E, cyan = F#, blue = Ab, magenta = Bb);
- mode ← average water temperature (warm → lydian/major, cold → dorian/minor);
- tempo ← average current speed (56–120 BPM);
- instruments ← speed and warmth (fast and warm → marimba, slow and cold → bell, …);
- reverb ← how much open ocean there is.

Moods in the player are presets that change instruments and feel over the same
fields; they never change the key or the data mapping. `summary` is computed by `backend/pipeline/build_tracks.py` and, for
imports, by `backend/services/imports.py`; `summarize_features` in
`backend/services/music_config.py` validates the features and builds it.

Tracks are stored in `backend/data/tracks.json` and `library.json`, written only by
the pipeline scripts and the import worker. MongoDB remains planned; no database is
required for this version.

## Verification

```bash
backend/.venv/bin/python -m unittest discover -s backend/tests -v
cd frontend
npm test
npm run build
```

Backend tests cover feature validation and the summary. Frontend tests verify the
scan geometry, grid interpolation, deterministic scheduling, style derivation, and
each data-to-sound mapping.

Reference: [Tone.js scheduling](https://tonejs.github.io/#scheduling).
