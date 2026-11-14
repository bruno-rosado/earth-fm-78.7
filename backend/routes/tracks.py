import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

router = APIRouter(prefix="/tracks", tags=["tracks"])


def read_tracks():
    with (DATA_DIR / "tracks.json").open(encoding="utf-8") as file:
        return json.load(file)


@router.get("")
def list_tracks():
    return read_tracks()


@router.get("/{track_id}")
def get_track(track_id: str):
    for track in read_tracks():
        if track["id"] == track_id:
            return track
    raise HTTPException(status_code=404, detail="Track not found")


@router.get("/{track_id}/features")
def get_track_features(track_id: str):
    get_track(track_id)
    features_path = DATA_DIR / "features" / f"{track_id}.json"
    try:
        with features_path.open(encoding="utf-8") as file:
            return json.load(file)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Features not found")
