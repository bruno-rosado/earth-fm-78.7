from fastapi import APIRouter, HTTPException

if __package__ == "routes":
    from services.music_config import GenerationRequest, MusicConfig, MusicConfigError, generate_config
else:
    from ..services.music_config import GenerationRequest, MusicConfig, MusicConfigError, generate_config

router = APIRouter(tags=["music config"])


# Vibe change: the UI sends the track, its feature summary, and a prompt. The
# server forwards them to Gemini and returns the new style. Nothing is saved.
@router.post("/music-config", response_model=MusicConfig)
def create_music_config(request: GenerationRequest):
    try:
        return generate_config(request.track.model_dump(), request.summary, request.prompt)
    except MusicConfigError as error:
        raise HTTPException(status_code=error.status_code, detail=str(error)) from None
