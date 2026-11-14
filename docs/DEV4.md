# Dev 4: Player + music (React + Tone.js)
You make the sound. You work in `frontend/src/`.

1. **Run the hello world.** See the README.
2. **Make a sound.** Run `npm install tone`. Create `src/Player.jsx` with a Play button. On click, call `await Tone.start()`, then play one note with `new Tone.Synth().toDestination()`. Browsers block sound until the user clicks.
   Done when clicking plays a beep.
3. **Load the features.** Fetch `/api/tracks/{id}/features` for the selected track (App passes it in). Use the fake data until the endpoint exists.
4. **Turn the numbers into music.** Use `Tone.Transport` and a `Tone.Loop` every eighth note. Find the feature point closest to `Tone.Transport.seconds`.
   - brightness picks the note from a scale, e.g. C major `["C4","D4","E4","G4","A4","C5"]`
   - motion picks how often notes play
   Done when bright or busy parts sound different from dark or calm parts.
5. **Player controls:** play/pause, a time bar, volume. Start and stop the Earth video at the same time as `Tone.Transport` (agree on this with Dev 3).
6. **Style and instrument picker.** Swap the synth type or scale, e.g. calm vs energetic.
7. **Clean up on track change:** call `Transport.stop()`, `Transport.cancel()` and `dispose()` on the synths.

Tone.js docs: https://tonejs.github.io/

---
## Scope
- **You own:** `Player.jsx`, everything Tone.js, the play/pause/seek/volume controls, the style and instrument picker, and keeping video and audio in sync.
- **Not yours:** the Earth, the album list and the layout (Dev 3), backend (Dev 1).

## Who's blocked by whom
- **You're blocked by Dev 1** for the features URL and fake data. You can start with a hard-coded array.
- **You're blocked by Dev 3** for `selectedTrack` and `videoRef` in `App.jsx`.
- **You're blocked by Dev 2** for the real feature names and ranges.

## Most critical to nail down
1. **Feature names and ranges with Dev 2,** e.g. brightness and motion, 0–1.
2. **The play/sync rule with Dev 3:** you own play and pause, and you start `Tone.Transport` and `video.play()` together.
3. **Music settings in `track.json` with Dev 1:** key, tempo, instrument names.
