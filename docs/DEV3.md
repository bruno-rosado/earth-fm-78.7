# Dev 3: Album picker + 3D Earth (React)
You build what the user sees. You work in `frontend/src/`.

1. **Run the app.** See the README.
2. **Album list.** Create `src/Jukebox.jsx`. Fetch `/api/tracks` and show the cover images in a row. Clicking one calls `onSelect(track)`. Use the fake data until Dev 1's endpoint exists.
   Done when clicking a cover logs the track.
3. **Lift the selected track into `App.jsx`** with `useState`, so Dev 4's player can use it too.
4. **3D Earth.** Run `npm install three @react-three/fiber @react-three/drei`. Create `src/Earth.jsx` with a `<Canvas>`, a sphere, a light and `<OrbitControls>`. Rotate it slowly with `useFrame`.
   Done when a spinning ball is on screen.
5. **Put the NASA video on the globe.** Make a `<video>` element, wrap it in `THREE.VideoTexture` and use it as the sphere's material. Get the URL from the track (`/media/...`).
6. **Sync with play.** Agree with Dev 4 that the player calls `video.play()` and `video.pause()`. Share the video element through App state or a ref.
7. **Polish:** a science info panel, a nice layout, and making it work on mobile.

React Three Fiber intro: https://docs.pmnd.rs/react-three-fiber/getting-started/introduction

---
## Scope
- **You own:** `App.jsx` layout, `Jukebox.jsx`, `Earth.jsx`, the `<video>` element and the page styling.
- **Not yours:** sound and the player controls (Dev 4), backend (Dev 1).

## Who's blocked by whom
- **You're blocked by Dev 1** for the fake JSON and URLs. You can start with a hard-coded track in the meantime.
- **You're blocked by Dev 2** for the real video and its shape (flat map or not).
- **Dev 4 is blocked by you** for the selected-track state in `App.jsx` and access to the video element.

## Most critical to nail down
1. **The `App.jsx` contract with Dev 4:** `selectedTrack` state plus a `videoRef` that you create and pass to `<Player>`.
2. **Who calls `video.play()`.** The plan is Dev 4's player, and only that.
3. **The video URL format** from Dev 1 (`/media/...`), plus CORS and the proxy for `/media`.

---
## Decisions (screen layout)
- **Full page.** One 3D `<Canvas>` fills the screen: the background visual, the globe and the jukebox. The player (Dev 4) is HTML on top.
- **Jukebox:** 3D cards inside the Canvas on a gentle arc below the globe (they curve back toward the edges). Scroll with the mouse wheel or Left/Right arrows, click or Enter to select. A hidden HTML button list is there for screen readers.
- **Nothing selected:** a plain Earth texture on the globe, with the default background.
- **Track selected:** fade to that track's video on the globe and to its background.
- **Background is tied to the track** via `"background": "aurora"` in `track.json` (ask Dev 1). A lookup maps the name to a component and falls back to aurora.

## Folder plan
```
components/
  scene/  Scene.jsx (Canvas, lights, picks background), Globe.jsx (sphere + video),
          Jukebox3D.jsx + AlbumCard3D.jsx (3D cards),
          backgrounds/ (Aurora.jsx, auroraShader.js, index.js lookup)
services/  api.js, fakeData.js
```
