# Dev 1: Backend API (Python/FastAPI)
You make the server that hands out album data. You work in `backend/`.

1. **Run the app.** See the README.
   Done when http://localhost:8000/api/tracks returns the track list.
2. **Write the fake data with the team.** Create `backend/data/tracks.json`: a list with one track whose `features` hold about 20 time points. Use the shapes from HOW_IT_WORKS.
   Done when all 4 devs agree on the shapes.
3. **Add `GET /api/tracks`** in `main.py`. Read `data/tracks.json` and return it.
   Done when http://localhost:8000/api/tracks shows the list.
4. **Serve the video and image files.** Add `app.mount("/media", StaticFiles(directory="media"))` and put the files in `backend/media/`.
   Done when a video plays at http://localhost:8000/media/yourfile.mp4.
5. **Tell Devs 3 and 4 the URLs.** Then help Dev 2 drop in the real data on Day 3.
6. **Extra:** use an LLM to pick the music settings (key, tempo, instrument) from the features.

FastAPI tutorial: https://fastapi.tiangolo.com/tutorial/first-steps/

---
## Scope
- **You own:** `backend/main.py`, `backend/data/`, `backend/media/`, `requirements.txt`.
- **Not yours:** the video-to-numbers script (Dev 2) and anything in `frontend/` (Devs 3 and 4).

## Who's blocked by whom
- **You block Devs 3 and 4** until the fake JSON exists and the URLs are agreed. Until `/api/tracks` works, they can read the fake JSON directly.
- **You block Dev 2** until the JSON shape is agreed.
- **You're blocked by Dev 2** only for real data on Day 3. Fake data unblocks everything else.

## Most critical to nail down (first 2 hours)
1. **The exact JSON shape** of a track in `tracks.json`, including its `features`. Commit one example.
2. **The URL list:** `/api/tracks`, `/media/<file>`.
3. **Where files live:** `backend/data/` and `backend/media/`.
