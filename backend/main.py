# Backend: FastAPI server. Run: uvicorn main:app --reload --port 8000
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/hello")
def hello():
    return {"message": "Hello from earth-fm backend"}
