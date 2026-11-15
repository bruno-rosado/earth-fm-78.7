# Frontend: album jukebox and 2D player

The UI is React + TypeScript. `App.tsx` loads the album-card metadata once;
selecting a record fetches its details and feature timeline. The selected local
video, Canvas 2D data view, controls, and Tone.js playback are coordinated by
the player hook.

## Main files

- `src/components/AlbumGrid.tsx`: accessible curated album picker.
- `src/components/PlayerPanel.tsx`: selected video and transport controls.
- `src/components/AudioVisualizer.tsx`: 2D view of the current data grid.
- `src/services/api.ts`: typed REST requests.
- `src/services/tone/useTrackPlayer.ts`: playback lifecycle and controls.
- `src/services/tone/musicMapping.js`: deterministic mapping from data to notes.

There is no 3D rendering layer. Keep video playback local and synchronize it to
Tone.js's audio clock. Album browsing should not trigger further API requests.

Run frontend checks from `frontend/`:

```bash
npm test
npm run build
```
