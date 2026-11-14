# Backend: FastAPI server. Run: uvicorn main:app --reload --port 8000
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Support both `uvicorn backend.main:app` and `cd backend && uvicorn main:app`.
if __package__:
    from .routes import router
else:
    from routes import router

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])


app.include_router(router)
app.mount(
    "/media",
    StaticFiles(directory=Path(__file__).resolve().parent / "media"),
    name="media",
)
