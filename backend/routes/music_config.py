from fastapi import APIRouter, HTTPException

if __package__ == "routes":
    from services.music_config import GenerationRequest, MusicConfig, MusicConfigError, generate_config, read_config
else:
    from ..services.music_config import GenerationRequest, MusicConfig, MusicConfigError, generate_config, read_config
from .tracks import get_track, get_track_features

router = APIRouter(prefix="/tracks", tags=["music config"])


@router.get("/{track_id}/music-config", response_model=MusicConfig)
def get_music_config(track_id: str):
    track = get_track(track_id)
    features = get_track_features(track_id)
    try:
        return read_config(track, features)
    except MusicConfigError as error:
        raise HTTPException(status_code=error.status_code, detail=str(error)) from None


@router.post("/{track_id}/music-config", response_model=MusicConfig)
def create_music_config(track_id: str, request: GenerationRequest):
    track = get_track(track_id)
    features = get_track_features(track_id)
    try:
        return generate_config(track, features, request.prompt)
    except MusicConfigError as error:
        raise HTTPException(status_code=error.status_code, detail=str(error)) from None
