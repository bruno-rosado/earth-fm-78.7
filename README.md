# earth-fm-78.7

Earth Frequencies: a jukebox where each track is a NASA Earth visualization turned into music, playing over a spinning 3D Earth.

## Run it (two terminals)

Backend (Python):
```
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload --port 8000
```

Frontend (React):
```
cd frontend
npm install
npm run dev
```
Open http://localhost:5173 for the frontend and http://localhost:8000/docs to try the backend API.

## Tests

Put tests in `tests/`. Run the Python tests from the repository root:
```
backend/.venv/bin/python -m unittest discover -s tests -v
```

## What's here
```
backend/main.py        backend app setup
backend/routes/        API endpoints
backend/media/         videos and cover images served at /media
frontend/src/App.jsx   the whole frontend (one file for now)
docs/                  HOW_IT_WORKS.md + one step-by-step guide per dev
```
Start with `docs/HOW_IT_WORKS.md`, then open your `docs/DEVx.md`.
Add new files only when you need them. Each guide says which ones to create.

## Media files

Place videos and cover images in `backend/media/`. For example,
`backend/media/clouds.mp4` is available at
http://localhost:8000/media/clouds.mp4. Use `/media/clouds.mp4` as the video URL
in track metadata; the frontend development server forwards `/media` to the backend.

The real `ecco2_sst_flow` track currently references NASA-hosted video and cover
URLs. Local media downloads are deferred. After adding local files, update the
track URLs and open their `/media/<filename>` URLs to verify they load.
