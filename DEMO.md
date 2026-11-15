# Earth Frequencies demo

## Three-minute walkthrough

**0:00–0:25 — The idea.**
“Earth science is usually something we look at. We made it something you can
listen to and explore. Earth Frequencies turns NASA visualizations into a
composition you can trace back to its data.”

**0:25–1:00 — Let the planet play.**
Click **Start listening** on the shipped ocean track. Give it a few seconds.
Point to the scan line, latitude pulses, and note ripples. Explain: north is
higher, south is lower; faster visual motion makes the music busier and louder.
Use speakers or headphones so stereo movement can be heard.

**1:00–1:45 — Show cause and effect.**
In the listening lab, choose **NASA video** to show the original frame, then
switch to **Motion** or **Color** to show the extracted grid. Click a longitude.
The timeline, globe, and sound move together. Point to the live motion, warmth,
direction, and coverage values. Solo **Melody**, then **Texture**, then **Harmony**
using the S buttons. Click **Reset** to bring the composition back together.

**1:45–2:15 — Make it yours.**
Open **Mood** and choose Cinematic or Playful. The instruments and feel change
while the underlying mapping remains data-driven. Click **Export this
composition** to download a MIDI file that can be remixed in a music app.
MIDI is the composition, not a recording of the browser's synthesizers.

**2:15–3:00 — Reach and impact.**
Open **My library** and play a second track that is already imported. Show NASA
search if internet is available. Explain potential uses in science education,
multisensory exploration, and creative work. The app's musical style is derived
deterministically; it does not need an LLM call to play a track.

## Prepare once

- Run the backend and frontend using the README commands.
- Open the app and play the shipped track before presenting to confirm local
  media, WebGL, and audio work on the presentation machine.
- Import additional examples ahead of time. Downloading/transcoding/extracting
  a new NASA video can take longer than a live presentation allows.
- Click to start playback: browsers require a user gesture for audio.
- The shipped local track and already-imported tracks work without NASA API
  access. Search, new imports, and external fonts require network access;
  system font fallbacks are included.
- If the library cannot load, use **Retry** after checking the backend.
- **L** toggles the lab. **Space** toggles playback when a text input or button
  does not have focus. Escape closes the browser panel, then the lab, then the track.

## Explain accurately

The current extractor analyzes rendered images, not physical-unit datasets.
“Temperature” is color-derived warmth; “speed” and “direction” come from optical
flow. The spatial mapping assumes an equirectangular world map. Arbitrary NASA
videos can be creatively sonified, but their grid coordinates should not be
presented as calibrated geographic measurements.

Brightness, contrast, and whole-frame motion are stored and summarized but do
not drive the current audio. The spatial grid and color summary do. The same
track, mood, and mix produce the same composition.

Sonification may offer another way to explore visual patterns; the app has not
been validated as a scientific measurement tool or as a replacement for
accessible scientific charts.
