import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field

if __package__ == "routes":
    from services import imports, nasa
else:
    from ..services import imports, nasa

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
router = APIRouter(tags=["search"])


class ImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nasa_id: int = Field(gt=0, lt=10_000_000)


def _annotate(cards):
    """Mark cards whose visualization is already a track."""
    by_nasa_id = {track.get("nasa_id"): track for track in imports.read_tracks()}
    return [{**card, "track": by_nasa_id.get(card["nasa_id"])} for card in cards]


@router.get("/search")
def search(q: str = Query("", max_length=120), limit: int = Query(12, ge=1, le=24)):
    try:
        return _annotate(nasa.search(q, limit))
    except nasa.NasaError as error:
        raise HTTPException(status_code=error.status_code, detail=str(error)) from None


@router.get("/recommendations")
def recommendations():
    ids = json.loads((DATA_DIR / "recommendations.json").read_text(encoding="utf-8"))
    try:
        found = {card["nasa_id"]: card for card in nasa.cards(ids)}
    except nasa.NasaError as error:
        raise HTTPException(status_code=error.status_code, detail=str(error)) from None
    return _annotate([found[i] for i in ids if i in found])


@router.post("/imports", status_code=202)
def create_import(request: ImportRequest):
    return imports.start(request.nasa_id)


@router.get("/imports/{job_id}")
def get_import(job_id: str):
    job = imports.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Import not found")
    return job


@router.get("/thumbs/{nasa_id}.jpg")
def thumbnail(nasa_id: int):
    try:
        path = nasa.thumbnail_file(nasa_id)
    except nasa.NasaError as error:
        raise HTTPException(status_code=error.status_code, detail=str(error)) from None
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})
