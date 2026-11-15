import json
from pathlib import Path

from fastapi import APIRouter

TRACKS_PATH = Path(__file__).resolve().parents[1] / "data" / "tracks.json"

router = APIRouter(prefix="/tracks", tags=["tracks"])


def read_tracks():
    """Every track with everything the player needs: metadata, features, summary, default config."""
    with TRACKS_PATH.open(encoding="utf-8") as file:
        return json.load(file)


@router.get("")
def list_tracks():
    return read_tracks()
