from fastapi import APIRouter, HTTPException

from .tracks import _find_track

if __package__ == "backend.routes":
    from ..services.track_search import SearchUnavailable, search_track
else:
    from services.track_search import SearchUnavailable, search_track

router = APIRouter(prefix="/tracks", tags=["search"])


@router.get("/{track_id}/search")
def get_track_search(track_id: str):
    track = _find_track(track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found")
    try:
        return search_track(track)
    except SearchUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from None
