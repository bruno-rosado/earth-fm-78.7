# Backend: FastAPI server. Run: uvicorn main:app --reload --port 8000
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Support both `uvicorn backend.main:app` and `cd backend && uvicorn main:app`.
if __package__:
    from .routes import router
else:
    from routes import router

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])


app.include_router(router)
