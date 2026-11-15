from pathlib import Path

from fastapi import APIRouter, HTTPException

if __package__ == "routes":
    from services.imports import read_tracks, remove
else:
    from ..services.imports import read_tracks, remove

TRACKS_PATH = Path(__file__).resolve().parents[1] / "data" / "tracks.json"

router = APIRouter(prefix="/tracks", tags=["tracks"])


@router.get("")
def list_tracks():
    """Catalog plus imported tracks, each with everything the player needs."""
    return read_tracks()


@router.delete("/{track_id}", status_code=204)
def delete_track(track_id: str):
    if not remove(track_id):
        raise HTTPException(status_code=404, detail="Only imported tracks can be removed")
