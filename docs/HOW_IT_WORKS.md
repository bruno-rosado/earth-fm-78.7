# How it all works

## The big picture
```
 NASA video/image ──► Dev 2 script ──► track.json + features.json
                                            │
                                            ▼
                               Dev 1 backend (FastAPI) serves them
                                            │  /api/tracks
                                            ▼
                    Frontend (React)
                    ├─ Dev 3: album picker + 3D Earth with the NASA video on it
                    └─ Dev 4: play button + music made from the features
```

## The two files everything shares
1. **track.json** describes one album: title, cover image, NASA video file, and music settings (key, tempo, instrument).
2. **features.json** is a list of numbers over time, e.g. `[{ "t": 0, "brightness": 0.4, "motion": 0.1 }, ...]`.
   Every number is 0–1. Higher brightness means higher notes, and more motion means faster rhythm.

**Agree on these two shapes on Day 1** and write one example of each into `backend/data/`.
Then everyone can build at the same time using the fake example.

## What happens when a user plays an album
1. The page loads, and the frontend calls `GET /api/tracks` to get the album list.
2. The user clicks an album. The frontend calls `GET /api/tracks/{id}` and `GET /api/tracks/{id}/features`.
3. Dev 3's Earth wraps the NASA video around the globe.
4. The user presses Play. Dev 4's audio starts, and the video starts at the same moment.
5. Every moment, the audio reads the features at the current time and plays matching notes.
6. Changing the style or instrument changes the sound, while the video keeps going.

## Order of work
| Day | Goal |
|---|---|
| 1 | Hello world runs for everyone. Agree on the JSON shapes. Fake example data is in. |
| 2 | Everyone builds their piece against the fake data. |
| 3 | Swap in the real NASA album. Make it play end to end. |
| 4 | Polish, plus extras like AI-generated music settings and more albums. |

## Who blocks whom (Day 1 first 2 hours = all together)
```
Dev 2 (video choice, feature names) ──► Dev 1 (JSON shape + URLs) ──► Dev 3 (App state, videoRef) ──► Dev 4 (play/sync)
                         └────────────── feature names/ranges ──────────────────────────────────────► Dev 4
```
**Decide together before splitting up:** (1) the NASA video, (2) the JSON shapes and one fake example, (3) the URLs, (4) `selectedTrack` + `videoRef` in App.jsx, with Dev 4 owning play.
