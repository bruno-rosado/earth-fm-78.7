from pathlib import Path

from fastapi import APIRouter, HTTPException

if __package__ == "routes":
    from services import imports
else:
    from ..services import imports

TRACKS_PATH = Path(__file__).resolve().parents[1] / "data" / "tracks.json"
CATALOG_FIELDS = ("id", "title", "description", "cover", "duration", "source")
DETAIL_FIELDS = (*CATALOG_FIELDS, "video", "nasa_id", "summary", "config")

router = APIRouter(prefix="/tracks", tags=["tracks"])


def _read_catalog():
    return imports.read_tracks(TRACKS_PATH)


def _find_track(track_id):
    return next((track for track in _read_catalog() if track["id"] == track_id), None)


@router.get("")
def list_tracks():
    """Return display metadata; feature timelines load only when a track is selected."""
    return [
        {key: track[key] for key in CATALOG_FIELDS if key in track}
        for track in _read_catalog()
    ]


@router.get("/{track_id}")
def get_track(track_id: str):
    track = _find_track(track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found")
    return {key: track[key] for key in DETAIL_FIELDS if key in track}


@router.get("/{track_id}/features")
def get_track_features(track_id: str):
    track = _find_track(track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found")
    return track["features"]
