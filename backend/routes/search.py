"""Discover NASA SVS videos and prepare a local sonification library."""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field

if __package__ == "routes":
    from services import imports, nasa
else:
    from ..services import imports, nasa

router = APIRouter(tags=["NASA library"])


class ImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nasa_id: int = Field(gt=0, lt=10_000_000)


@router.get("/search")
def search(q: str = Query("", max_length=120), limit: int = Query(8, ge=1, le=24)):
    try:
        by_nasa_id = {track.get("nasa_id"): track for track in imports.read_tracks()}
        return [
            {**card, "track": (
                {key: track[key] for key in imports.PUBLIC_FIELDS if key in track}
                if (track := by_nasa_id.get(card["nasa_id"])) else None
            )}
            for card in nasa.search(q, limit)
        ]
    except nasa.NasaError as error:
        raise HTTPException(status_code=error.status_code, detail=str(error)) from None


@router.post("/imports", status_code=202)
def create_import(request: ImportRequest):
    try:
        return imports.start(request.nasa_id)
    except imports.ImportFailed as error:
        raise HTTPException(status_code=429, detail=str(error)) from None


@router.get("/imports/{job_id}")
def get_import(job_id: str):
    job = imports.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Import not found. Search for the video to try again.")
    return job


@router.get("/thumbs/{nasa_id}.jpg")
def thumbnail(nasa_id: int):
    if not 0 < nasa_id < 10_000_000:
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    try:
        path = nasa.thumbnail_file(nasa_id)
    except nasa.NasaError as error:
        raise HTTPException(status_code=error.status_code, detail=str(error)) from None
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})
